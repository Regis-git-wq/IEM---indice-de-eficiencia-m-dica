import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import express from "express";
import { BLOB_DIR, db } from "./db.js";

const STORES = new Set(["subjects", "materials", "summaries", "recordings"]);
const ID_RE = /^[0-9a-f-]{36}$/i;
const MAX_BLOB_BYTES = 500 * 1024 * 1024;
const PULL_PAGE = 500;

interface Change {
  store: string;
  id: string;
  updatedAt: number;
  deleted?: boolean;
  data?: unknown;
}

interface RecordRow {
  store: string;
  id: string;
  data: string | null;
  updated_at: number;
  deleted: number;
  seq: number;
}

const blobPath = (userId: string, id: string) => path.join(BLOB_DIR, userId, id);

function removeBlob(userId: string, id: string) {
  db.prepare("DELETE FROM blobs WHERE user_id = ? AND id = ?").run(userId, id);
  fs.rm(blobPath(userId, id), { force: true }, () => {});
}

const selectRecord = db.prepare("SELECT updated_at FROM records WHERE user_id = ? AND store = ? AND id = ?");
const nextSeq = db.prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM records WHERE user_id = ?");
const upsertRecord = db.prepare(`
  INSERT INTO records (user_id, store, id, data, updated_at, deleted, seq)
  VALUES (@userId, @store, @id, @data, @updatedAt, @deleted, @seq)
  ON CONFLICT (user_id, store, id) DO UPDATE SET
    data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted, seq = excluded.seq
`);

/** Aplica as mudanças do cliente. Em conflito vence a edição mais recente (last-write-wins). */
const applyChanges = db.transaction((userId: string, changes: Change[]) => {
  const deletedIds: string[] = [];
  for (const c of changes) {
    const existing = selectRecord.get(userId, c.store, c.id) as { updated_at: number } | undefined;
    if (existing && existing.updated_at > c.updatedAt) continue;
    const { seq } = nextSeq.get(userId) as { seq: number };
    upsertRecord.run({
      userId,
      store: c.store,
      id: c.id,
      data: c.deleted ? null : JSON.stringify(c.data ?? {}),
      updatedAt: c.updatedAt,
      deleted: c.deleted ? 1 : 0,
      seq,
    });
    if (c.deleted) deletedIds.push(c.id);
  }
  return deletedIds;
});

export const syncRouter = express.Router();

syncRouter.post("/sync/push", express.json({ limit: "10mb" }), (req, res) => {
  const changes = req.body?.changes as Change[] | undefined;
  if (!Array.isArray(changes)) return void res.status(400).json({ error: "Formato inválido." });
  for (const c of changes) {
    if (!STORES.has(c?.store) || !ID_RE.test(c?.id) || typeof c.updatedAt !== "number") {
      return void res.status(400).json({ error: "Mudança inválida." });
    }
  }
  const userId = req.user!.id;
  for (const id of applyChanges(userId, changes)) removeBlob(userId, id);
  res.json({ ok: true });
});

syncRouter.get("/sync/pull", (req, res) => {
  const since = Number(req.query.since ?? 0) || 0;
  const rows = db
    .prepare(
      `SELECT store, id, data, updated_at, deleted, seq FROM records
       WHERE user_id = ? AND seq > ? ORDER BY seq LIMIT ?`,
    )
    .all(req.user!.id, since, PULL_PAGE + 1) as RecordRow[];
  const page = rows.slice(0, PULL_PAGE);
  res.json({
    changes: page.map((r) => ({
      store: r.store,
      id: r.id,
      updatedAt: r.updated_at,
      deleted: r.deleted === 1,
      data: r.data ? JSON.parse(r.data) : undefined,
    })),
    cursor: page.at(-1)?.seq ?? since,
    more: rows.length > PULL_PAGE,
  });
});

syncRouter.put("/blobs/:id", async (req, res) => {
  const { id } = req.params;
  if (!ID_RE.test(id)) return void res.status(400).json({ error: "ID inválido." });
  const size = Number(req.headers["content-length"] ?? 0);
  if (size > MAX_BLOB_BYTES) return void res.status(413).json({ error: "Arquivo grande demais (máx. 500 MB)." });

  const userId = req.user!.id;
  const finalPath = blobPath(userId, id);
  const tmpPath = `${finalPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.mkdir(path.dirname(finalPath), { recursive: true });
  try {
    await pipeline(req, fs.createWriteStream(tmpPath));
    const { size: written } = await fs.promises.stat(tmpPath);
    if (written > MAX_BLOB_BYTES) throw new Error("too large");
    await fs.promises.rename(tmpPath, finalPath);
    db.prepare(
      `INSERT INTO blobs (user_id, id, mime_type, size) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, id) DO UPDATE SET mime_type = excluded.mime_type, size = excluded.size`,
    ).run(userId, id, req.headers["content-type"] || "application/octet-stream", written);
    res.status(204).end();
  } catch {
    await fs.promises.rm(tmpPath, { force: true });
    if (!res.headersSent) res.status(500).json({ error: "Falha ao salvar o arquivo." });
  }
});

syncRouter.get("/blobs/:id", (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const row = ID_RE.test(id)
    ? (db.prepare("SELECT mime_type FROM blobs WHERE user_id = ? AND id = ?").get(userId, id) as
        | { mime_type: string }
        | undefined)
    : undefined;
  if (!row) return void res.status(404).json({ error: "Arquivo não encontrado." });
  // sendFile atende requisições Range, necessárias para avançar o áudio no Safari/iOS.
  res.sendFile(blobPath(userId, id), { headers: { "Content-Type": row.mime_type, "Cache-Control": "private, max-age=31536000, immutable" } });
});
