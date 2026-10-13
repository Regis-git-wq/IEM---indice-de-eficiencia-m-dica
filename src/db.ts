import { openDB, type DBSchema } from "idb";

export interface Subject {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

export interface Material {
  id: string;
  subjectId: string;
  name: string;
  mimeType: string;
  size: number;
  blob: Blob;
  createdAt: number;
}

export type SummaryStyle = "pratico" | "topicos" | "flashcards" | "revisao";

export interface Summary {
  id: string;
  subjectId: string;
  title: string;
  style: SummaryStyle;
  content: string;
  materialIds: string[];
  createdAt: number;
}

export interface Recording {
  id: string;
  subjectId: string;
  title: string;
  blob: Blob;
  mimeType: string;
  durationSec: number;
  notes: string;
  createdAt: number;
}

interface ResumiDB extends DBSchema {
  subjects: { key: string; value: Subject };
  materials: { key: string; value: Material; indexes: { bySubject: string } };
  summaries: { key: string; value: Summary; indexes: { bySubject: string } };
  recordings: { key: string; value: Recording; indexes: { bySubject: string } };
}

const dbPromise = openDB<ResumiDB>("resumi", 1, {
  upgrade(db) {
    db.createObjectStore("subjects", { keyPath: "id" });
    for (const store of ["materials", "summaries", "recordings"] as const) {
      db.createObjectStore(store, { keyPath: "id" }).createIndex("bySubject", "subjectId");
    }
  },
});

type ItemStore = "materials" | "summaries" | "recordings";

const newest = <T extends { createdAt: number }>(items: T[]) =>
  items.sort((a, b) => b.createdAt - a.createdAt);

export const newId = () => crypto.randomUUID();

export async function listSubjects() {
  return (await (await dbPromise).getAll("subjects")).sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveSubject(subject: Subject) {
  await (await dbPromise).put("subjects", subject);
}

export async function deleteSubject(id: string) {
  const db = await dbPromise;
  const tx = db.transaction(["subjects", "materials", "summaries", "recordings"], "readwrite");
  for (const store of ["materials", "summaries", "recordings"] as const) {
    const keys = await tx.objectStore(store).index("bySubject").getAllKeys(id);
    await Promise.all(keys.map((key) => tx.objectStore(store).delete(key)));
  }
  await tx.objectStore("subjects").delete(id);
  await tx.done;
}

export async function listBySubject<S extends ItemStore>(store: S, subjectId: string) {
  const items = await (await dbPromise).getAllFromIndex(store as ItemStore, "bySubject", subjectId);
  return newest(items) as ResumiDB[S]["value"][];
}

export async function saveItem<S extends ItemStore>(store: S, item: ResumiDB[S]["value"]) {
  await (await dbPromise).put(store, item);
}

export async function deleteItem(store: ItemStore, id: string) {
  await (await dbPromise).delete(store, id);
}
