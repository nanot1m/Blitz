export type CollaborationIdentity = {
  peerId: string;
  publicKey: JsonWebKey;
  sign(payload: unknown): Promise<string>;
  verify(publicKey: JsonWebKey, payload: unknown, signature: string): Promise<boolean>;
};

const DATABASE_NAME = "blitz.collaboration-identity.v1";
const STORE_NAME = "keys";
const KEY_ID = "default";

type StoredIdentity = {
  id: string;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicJwk: JsonWebKey;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.addEventListener("upgradeneeded", () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

async function readStoredIdentity(): Promise<StoredIdentity | undefined> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(KEY_ID);
    request.addEventListener("success", () => resolve(request.result as StoredIdentity | undefined));
    request.addEventListener("error", () => reject(request.error));
  });
}

async function writeStoredIdentity(identity: StoredIdentity): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(identity);
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("error", () => reject(transaction.error));
  });
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

async function peerIdFor(publicJwk: JsonWebKey): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJson(publicJwk)),
  );
  return base64Url(new Uint8Array(digest)).slice(0, 22);
}

async function generateIdentity(): Promise<StoredIdentity> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  return {
    id: KEY_ID,
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    publicJwk,
  };
}

async function importPublicKey(publicJwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    publicJwk,
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    false,
    ["verify"],
  );
}

export async function getOrCreateCollaborationIdentity(): Promise<CollaborationIdentity> {
  let stored = await readStoredIdentity();
  if (!stored) {
    stored = await generateIdentity();
    await writeStoredIdentity(stored);
  }

  return {
    peerId: await peerIdFor(stored.publicJwk),
    publicKey: stored.publicJwk,
    async sign(payload) {
      const signature = await crypto.subtle.sign(
        {
          name: "ECDSA",
          hash: "SHA-256",
        },
        stored.privateKey,
        new TextEncoder().encode(canonicalJson(payload)),
      );
      return base64Url(new Uint8Array(signature));
    },
    async verify(publicKey, payload, signature) {
      const imported = await importPublicKey(publicKey);
      const padding = "=".repeat((4 - (signature.length % 4)) % 4);
      const binary = atob(`${signature.replaceAll("-", "+").replaceAll("_", "/")}${padding}`);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return crypto.subtle.verify(
        {
          name: "ECDSA",
          hash: "SHA-256",
        },
        imported,
        bytes,
        new TextEncoder().encode(canonicalJson(payload)),
      );
    },
  };
}
