const DB_NAME = "snap_insight_pending";
const STORE = "pending_upload";
const KEY = "file";

export async function storePendingUpload(file: File): Promise<void> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return;
  const buffer = await file.arrayBuffer();
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
  });
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.put({ buffer, name: file.name, type: file.type }, KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function consumePendingUpload(): Promise<File | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return null;
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
  });
  const stored = await new Promise<{ buffer: ArrayBuffer; name: string; type: string } | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => tx.objectStore(STORE).delete(KEY);
  });
  db.close();
  if (!stored) return null;
  return new File([stored.buffer], stored.name, { type: stored.type });
}
