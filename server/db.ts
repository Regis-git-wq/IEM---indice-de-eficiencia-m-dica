import fs from "node:fs";
import path from "node:path";
import Database, { type Database as DB } from "better-sqlite3";

export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? "data");
export const BLOB_DIR = path.join(DATA_DIR, "blobs");
fs.mkdirSync(BLOB_DIR, { recursive: true });

export const db: DB = new Database(path.join(DATA_DIR, "resumi.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  -- Cada disciplina/material/resumo/gravação é guardado como JSON opaco.
  -- "seq" cresce a cada escrita e serve de cursor para o pull incremental.
  CREATE TABLE IF NOT EXISTS records (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    store      TEXT NOT NULL,
    id         TEXT NOT NULL,
    data       TEXT,
    updated_at INTEGER NOT NULL,
    deleted    INTEGER NOT NULL DEFAULT 0,
    seq        INTEGER NOT NULL,
    PRIMARY KEY (user_id, store, id)
  );
  CREATE INDEX IF NOT EXISTS records_by_seq ON records (user_id, seq);

  CREATE TABLE IF NOT EXISTS blobs (
    user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id        TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size      INTEGER NOT NULL,
    PRIMARY KEY (user_id, id)
  );
`);
