import { openDB, type DBSchema } from "idb";

/** Campos de controle de sincronização presentes em todo registro. */
interface Syncable {
  id: string;
  createdAt: number;
  updatedAt: number;
  /** Alterado localmente e ainda não enviado ao servidor. */
  dirty?: boolean;
  /** Excluído; o registro fica como "lápide" até a exclusão chegar ao servidor. */
  deleted?: boolean;
}

/** Registros com arquivo. O blob pode faltar se o item veio de outro aparelho e ainda não foi baixado. */
interface WithBlob {
  blob?: Blob;
  blobSynced?: boolean;
}

export interface Subject extends Syncable {
  name: string;
  color: string;
}

export interface Material extends Syncable, WithBlob {
  subjectId: string;
  name: string;
  mimeType: string;
  size: number;
}

export type SummaryStyle = "pratico" | "topicos" | "flashcards" | "revisao";

export interface Summary extends Syncable {
  subjectId: string;
  title: string;
  style: SummaryStyle;
  content: string;
  materialIds: string[];
}

export interface Recording extends Syncable, WithBlob {
  subjectId: string;
  title: string;
  mimeType: string;
  durationSec: number;
  notes: string;
}

interface ResumiDB extends DBSchema {
  subjects: { key: string; value: Subject };
  materials: { key: string; value: Material; indexes: { bySubject: string } };
  summaries: { key: string; value: Summary; indexes: { bySubject: string } };
  recordings: { key: string; value: Recording; indexes: { bySubject: string } };
  meta: { key: string; value: unknown };
}

export type Store = "subjects" | "materials" | "summaries" | "recordings";
type ItemStore = Exclude<Store, "subjects">;
export type AnyRecord = Subject | Material | Summary | Recording;
export const STORES: Store[] = ["subjects", "materials", "summaries", "recordings"];
const ITEM_STORES: ItemStore[] = ["materials", "summaries", "recordings"];

const dbPromise = openDB<ResumiDB>("resumi", 2, {
  async upgrade(db, oldVersion, _newVersion, tx) {
    if (oldVersion < 1) {
      db.createObjectStore("subjects", { keyPath: "id" });
      for (const store of ITEM_STORES) {
        db.createObjectStore(store, { keyPath: "id" }).createIndex("bySubject", "subjectId");
      }
    }
    if (oldVersion < 2) {
      db.createObjectStore("meta");
      // Dados criados antes do login passam a ser pendentes de envio.
      for (const store of STORES) {
        let cursor = await tx.objectStore(store).openCursor();
        while (cursor) {
          await cursor.update({ ...cursor.value, updatedAt: cursor.value.createdAt, dirty: true });
          cursor = await cursor.continue();
        }
      }
    }
  },
});

// --- Notificação de mudanças (UI recarrega quando algo muda localmente ou chega do servidor) ---

export interface DataChange {
  /** true quando a mudança veio do servidor (não precisa ser enviada de volta). */
  remote: boolean;
}

const listeners = new Set<(change: DataChange) => void>();
export function onDataChange(fn: (change: DataChange) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
export function emitDataChange(change: DataChange = { remote: false }) {
  listeners.forEach((fn) => fn(change));
}

// --- API usada pela interface ---

export const newId = () => crypto.randomUUID();

const alive = <T extends Syncable>(items: T[]) => items.filter((i) => !i.deleted);
const newest = <T extends Syncable>(items: T[]) => items.sort((a, b) => b.createdAt - a.createdAt);
const touched = <T extends Syncable>(item: T): T => ({ ...item, updatedAt: Date.now(), dirty: true });
const tombstone = <T extends Syncable & WithBlob>(item: T): T => ({ ...touched(item), deleted: true, blob: undefined });

export async function listSubjects() {
  return alive(await (await dbPromise).getAll("subjects")).sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveSubject(subject: Omit<Subject, "updatedAt"> & { updatedAt?: number }) {
  await (await dbPromise).put("subjects", touched(subject as Subject));
  emitDataChange();
}

export async function deleteSubject(id: string) {
  const db = await dbPromise;
  const tx = db.transaction(STORES, "readwrite");
  for (const store of ITEM_STORES) {
    const items = await tx.objectStore(store).index("bySubject").getAll(id);
    await Promise.all(items.filter((i) => !i.deleted).map((i) => tx.objectStore(store).put(tombstone(i))));
  }
  const subject = await tx.objectStore("subjects").get(id);
  if (subject) await tx.objectStore("subjects").put(tombstone(subject));
  await tx.done;
  emitDataChange();
}

export async function listBySubject<S extends ItemStore>(store: S, subjectId: string) {
  const items = await (await dbPromise).getAllFromIndex(store as ItemStore, "bySubject", subjectId);
  return newest(alive(items)) as ResumiDB[S]["value"][];
}

type NewOrExisting<T> = Omit<T, "updatedAt"> & { updatedAt?: number };

export async function saveItem<S extends ItemStore>(store: S, item: NewOrExisting<ResumiDB[S]["value"]>) {
  await (await dbPromise).put(store, touched(item as ResumiDB[S]["value"]));
  emitDataChange();
}

export async function deleteItem(store: ItemStore, id: string) {
  const db = await dbPromise;
  const item = await db.get(store, id);
  if (item) await db.put(store, tombstone(item));
  emitDataChange();
}

// --- Operações internas usadas pela sincronização (não marcam o registro como alterado) ---

export async function getRecord(store: Store, id: string) {
  return (await dbPromise).get(store, id);
}

export async function listDirty() {
  const db = await dbPromise;
  const result: { store: Store; record: AnyRecord }[] = [];
  for (const store of STORES) {
    for (const record of await db.getAll(store)) if (record.dirty) result.push({ store, record });
  }
  return result;
}

/** Grava sem alterar updatedAt/dirty (ex.: blob baixado, marca de enviado). */
export async function putRaw(store: Store, record: AnyRecord) {
  await (await dbPromise).put(store, record as never);
}

export async function removeRaw(store: Store, id: string) {
  await (await dbPromise).delete(store, id);
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await (await dbPromise).get("meta", key)) as T | undefined;
}

export async function setMeta(key: string, value: unknown) {
  await (await dbPromise).put("meta", value, key);
}

export async function clearAll() {
  const db = await dbPromise;
  const tx = db.transaction([...STORES, "meta"], "readwrite");
  await Promise.all([...STORES, "meta" as const].map((s) => tx.objectStore(s).clear()));
  await tx.done;
  emitDataChange({ remote: true });
}
