export type PersistedSceneFileHandle = {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: Uint8Array): Promise<void>;
    close(): Promise<void>;
  }>;
  isSameEntry?(other: PersistedSceneFileHandle): Promise<boolean>;
  queryPermission?(options: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission?(options: { mode: "read" | "readwrite" }): Promise<PermissionState>;
};

export type RecentSceneFile = {
  id: string;
  name: string;
  handle: PersistedSceneFileHandle;
  lastUsedAt: number;
};

const DATABASE_NAME = "blitz-local-files";
const DATABASE_VERSION = 1;
const STORE_NAME = "recent-scenes";
const MAX_RECENT_FILES = 10;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error), { once: true });
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener(
      "upgradeneeded",
      () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      },
      { once: true },
    );
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

export async function listRecentSceneFiles(): Promise<RecentSceneFile[]> {
  if (!("indexedDB" in globalThis)) {
    return [];
  }
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const records = await requestResult(
      transaction.objectStore(STORE_NAME).getAll() as IDBRequest<RecentSceneFile[]>,
    );
    await transactionComplete(transaction);
    return records.sort((left, right) => right.lastUsedAt - left.lastUsedAt);
  } finally {
    database.close();
  }
}

async function sameHandle(
  left: PersistedSceneFileHandle,
  right: PersistedSceneFileHandle,
): Promise<boolean> {
  if (left.isSameEntry) {
    try {
      return await left.isSameEntry(right);
    } catch {
      // Fall back to the file name when a stored handle can no longer be compared.
    }
  }
  return left.name === right.name;
}

export async function rememberSceneFile(
  handle: PersistedSceneFileHandle,
): Promise<RecentSceneFile[]> {
  const records = await listRecentSceneFiles();
  const duplicates: RecentSceneFile[] = [];
  for (const record of records) {
    if (await sameHandle(record.handle, handle)) {
      duplicates.push(record);
    }
  }

  const record: RecentSceneFile = {
    id: duplicates[0]?.id ?? crypto.randomUUID(),
    name: handle.name,
    handle,
    lastUsedAt: Date.now(),
  };
  const nextRecords = [
    record,
    ...records.filter((candidate) => !duplicates.some(({ id }) => id === candidate.id)),
  ].slice(0, MAX_RECENT_FILES);

  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.clear();
    for (const candidate of nextRecords) {
      store.put(candidate);
    }
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
  return nextRecords;
}

export async function removeRecentSceneFile(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function ensureSceneFilePermission(
  handle: PersistedSceneFileHandle,
  mode: "read" | "readwrite",
): Promise<boolean> {
  if (!handle.queryPermission || !handle.requestPermission) {
    return true;
  }
  if ((await handle.queryPermission({ mode })) === "granted") {
    return true;
  }
  return (await handle.requestPermission({ mode })) === "granted";
}
