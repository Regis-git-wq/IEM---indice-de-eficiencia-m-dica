import {
  emitDataChange,
  getMeta,
  getRecord,
  listDirty,
  putRaw,
  removeRaw,
  setMeta,
  type AnyRecord,
  type Material,
  type Recording,
  type Store,
} from "./db";

export class AuthExpiredError extends Error {}

export interface SyncStatus {
  state: "idle" | "syncing" | "error" | "offline";
  lastSyncedAt: number | null;
  pending: number;
  message?: string;
}

// --- Estado observável (consumido via useSyncExternalStore) ---

let status: SyncStatus = { state: "idle", lastSyncedAt: null, pending: 0 };
const statusListeners = new Set<() => void>();
const setStatus = (patch: Partial<SyncStatus>) => {
  status = { ...status, ...patch };
  statusListeners.forEach((fn) => fn());
};
export const getSyncStatus = () => status;
export function subscribeSyncStatus(fn: () => void) {
  statusListeners.add(fn);
  return () => void statusListeners.delete(fn);
}

// --- Comunicação com o servidor ---

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 401) throw new AuthExpiredError("Sessão expirada.");
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Erro ${res.status}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

interface Change {
  store: Store;
  id: string;
  updatedAt: number;
  deleted?: boolean;
  data?: Record<string, unknown>;
}

function toChange(store: Store, record: AnyRecord): Change {
  if (record.deleted) return { store, id: record.id, updatedAt: record.updatedAt, deleted: true };
  const { blob: _b, blobSynced: _s, dirty: _d, deleted: _x, updatedAt: _u, ...data } = record as Material;
  return { store, id: record.id, updatedAt: record.updatedAt, data };
}

const hasPendingBlob = (r: AnyRecord): r is Material | Recording =>
  !r.deleted && "blob" in r && !!r.blob && !r.blobSynced;

async function push() {
  const dirty = await listDirty();
  const ready: { store: Store; record: AnyRecord }[] = [];
  let failures = 0;

  for (const item of dirty) {
    if (hasPendingBlob(item.record)) {
      try {
        const blob = item.record.blob!;
        await api(`/api/blobs/${item.record.id}`, {
          method: "PUT",
          headers: { "Content-Type": blob.type || item.record.mimeType || "application/octet-stream" },
          body: blob,
        });
        const current = await getRecord(item.store, item.record.id);
        if (current) await putRaw(item.store, { ...current, blobSynced: true } as AnyRecord);
      } catch (err) {
        if (err instanceof AuthExpiredError) throw err;
        // Sem o arquivo no servidor, não adianta enviar os metadados; tenta de novo na próxima rodada.
        failures++;
        continue;
      }
    }
    ready.push(item);
  }

  for (let i = 0; i < ready.length; i += 100) {
    const batch = ready.slice(i, i + 100);
    await api("/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changes: batch.map((b) => toChange(b.store, b.record)) }),
    });
    for (const { store, record } of batch) {
      const current = await getRecord(store, record.id);
      // Se o item mudou durante o envio, continua pendente para a próxima rodada.
      if (!current || current.updatedAt !== record.updatedAt) continue;
      if (current.deleted) await removeRaw(store, record.id);
      else await putRaw(store, { ...current, dirty: false });
    }
  }
  return failures;
}

async function pull() {
  let cursor = (await getMeta<number>("cursor")) ?? 0;
  let changed = false;
  for (;;) {
    const page = await api<{ changes: Change[]; cursor: number; more: boolean }>(`/api/sync/pull?since=${cursor}`);
    for (const c of page.changes) {
      const local = await getRecord(c.store, c.id);
      if (local?.dirty && local.updatedAt > c.updatedAt) continue; // a edição local é mais nova
      if (c.deleted) {
        if (local) await removeRaw(c.store, c.id);
      } else {
        const blob = local && "blob" in local ? local.blob : undefined;
        await putRaw(c.store, {
          ...(c.data as object),
          id: c.id,
          updatedAt: c.updatedAt,
          dirty: false,
          deleted: false,
          ...(c.store === "materials" || c.store === "recordings" ? { blob, blobSynced: true } : {}),
        } as AnyRecord);
      }
      changed = true;
    }
    cursor = page.cursor;
    await setMeta("cursor", cursor);
    if (!page.more) break;
  }
  if (changed) emitDataChange({ remote: true });
}

// --- Orquestração ---

let running: Promise<void> | null = null;
let again = false;

/** Envia as alterações locais e baixa as do servidor. Chamadas simultâneas são agrupadas. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      if (!navigator.onLine) {
        setStatus({ state: "offline", pending: (await listDirty()).length });
        return;
      }
      setStatus({ state: "syncing", message: undefined });
      try {
        const failures = await push();
        await pull();
        const pending = (await listDirty()).length;
        setStatus(
          failures > 0
            ? { state: "error", pending, message: `${failures} arquivo(s) não puderam ser enviados.` }
            : { state: "idle", pending, lastSyncedAt: Date.now() },
        );
      } catch (err) {
        setStatus({
          state: "error",
          pending: (await listDirty()).length,
          message: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

export async function refreshPending() {
  setStatus({ pending: (await listDirty()).length });
}

/** Retorna o arquivo do material/gravação, baixando do servidor se ainda não estiver neste aparelho. */
export async function getBlob(store: "materials" | "recordings", record: Material | Recording): Promise<Blob> {
  if (record.blob) return record.blob;
  const res = await fetch(`/api/blobs/${record.id}`);
  if (!res.ok) throw new Error("Não foi possível baixar o arquivo. Verifique sua conexão.");
  const blob = await res.blob();
  const current = await getRecord(store, record.id);
  if (current) await putRaw(store, { ...current, blob } as AnyRecord);
  return blob;
}
