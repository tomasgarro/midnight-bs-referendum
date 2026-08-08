import type { PrivateStateProvider } from "@midnight-ntwrk/midnight-js-types";
import type { ContractAddress, SigningKey } from "@midnight-ntwrk/compact-runtime";

const PRIVATE_STATE_DB = "midnight-referendum-private-state";
const PRIVATE_STATE_DB_VERSION = 2;
const STATE_STORE = "states";
const SIGNING_KEY_STORE = "signing-keys";
const META_STORE = "meta";

type EncryptedRecord = {
  iv: number[];
  ciphertext: number[];
};

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function serializePrivateStateForStorage(value: unknown): string {
  return JSON.stringify(value, (_key, current: unknown): JsonValue => {
    if (typeof current === "bigint") return { $bigint: current.toString() };
    if (current instanceof Uint8Array) {
      return { $bytes: bytesToBase64(current) };
    }
    return current as JsonValue;
  });
}

export function deserializePrivateStateFromStorage<T>(value: string): T {
  return JSON.parse(value, (_key, current: unknown) => {
    if (!current || typeof current !== "object") return current;
    const candidate = current as Record<string, unknown>;
    if (typeof candidate.$bigint === "string") return BigInt(candidate.$bigint);
    if (typeof candidate.$bytes === "string") return base64ToBytes(candidate.$bytes);
    return current;
  }) as T;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PRIVATE_STATE_DB, PRIVATE_STATE_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STATE_STORE)) database.createObjectStore(STATE_STORE);
      if (!database.objectStoreNames.contains(SIGNING_KEY_STORE)) database.createObjectStore(SIGNING_KEY_STORE);
      if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open private state storage"));
  });
}

async function readRecord<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error ?? new Error("Could not read private state storage"));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not read private state storage"));
  });
}

async function writeRecord(storeName: string, key: IDBValidKey, value: unknown): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value, key);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not write private state storage"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Private state storage write was aborted"));
  });
}

async function clearStore(storeName: string): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).clear();
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not clear private state storage"));
  });
}

async function encryptionKey(): Promise<CryptoKey> {
  const existing = await readRecord<CryptoKey>(META_STORE, "encryption-key");
  if (existing) return existing;

  const created = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  await writeRecord(META_STORE, "encryption-key", created);
  return created;
}

async function seal(value: unknown): Promise<EncryptedRecord> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(serializePrivateStateForStorage(value)),
  );
  return {
    iv: [...iv],
    ciphertext: [...new Uint8Array(ciphertext)],
  };
}

async function unseal<T>(record: EncryptedRecord): Promise<T> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(record.iv) },
    await encryptionKey(),
    new Uint8Array(record.ciphertext),
  );
  return deserializePrivateStateFromStorage<T>(new TextDecoder().decode(plaintext));
}

/**
 * Session-scoped, in-memory fallback implementation of the full
 * PrivateStateProvider interface. It is used by tests, SSR, and browsers
 * without IndexedDB/WebCrypto support.
 *
 * This implements the complete 13-method PrivateStateProvider<PSI, PS>
 * contract. The export/import methods are not meaningful for an ephemeral
 * in-memory store, so they reject â€” swap in an encrypting persistent provider
 * (e.g. IndexedDB) if you need cross-session private state or real exports.
 */
export function inMemoryPrivateStateProvider<
  PSI extends string,
  PS,
>(): PrivateStateProvider<PSI, PS> {
  const states = new Map<PSI, PS>();
  const signingKeys = new Map<ContractAddress, SigningKey>();

  return {
    // Contract-address scoping is a no-op for this flat in-memory store; the
    // private state IDs are already unique within a single browser session.
    setContractAddress: (_address: ContractAddress) => {},

    set: async (id: PSI, state: PS) => {
      states.set(id, state);
    },
    get: async (id: PSI) => states.get(id) ?? null,
    remove: async (id: PSI) => {
      states.delete(id);
    },
    clear: async () => {
      states.clear();
    },

    setSigningKey: async (address: ContractAddress, signingKey: SigningKey) => {
      signingKeys.set(address, signingKey);
    },
    getSigningKey: async (address: ContractAddress) =>
      signingKeys.get(address) ?? null,
    removeSigningKey: async (address: ContractAddress) => {
      signingKeys.delete(address);
    },
    clearSigningKeys: async () => {
      signingKeys.clear();
    },

    exportPrivateStates: async () => {
      throw new Error(
        "inMemoryPrivateStateProvider does not support exportPrivateStates; " +
          "use a persistent encrypting provider for exports.",
      );
    },
    importPrivateStates: async () => {
      throw new Error(
        "inMemoryPrivateStateProvider does not support importPrivateStates; " +
          "use a persistent encrypting provider for imports.",
      );
    },
    exportSigningKeys: async () => {
      throw new Error(
        "inMemoryPrivateStateProvider does not support exportSigningKeys; " +
          "use a persistent encrypting provider for exports.",
      );
    },
    importSigningKeys: async () => {
      throw new Error(
        "inMemoryPrivateStateProvider does not support importSigningKeys; " +
          "use a persistent encrypting provider for imports.",
      );
    },
  };
}

/**
 * Browser provider for contract private state. Values are encrypted with a
 * non-extractable WebCrypto key and stored in IndexedDB, so voter secrets and
 * salts survive refresh without being written to localStorage. Signing keys
 * use the same encrypted store; exports remain deliberately disabled until a
 * user-controlled recovery flow is designed.
 */
export function browserPrivateStateProvider<
  PSI extends string,
  PS,
>(): PrivateStateProvider<PSI, PS> {
  const memory = inMemoryPrivateStateProvider<PSI, PS>();
  const usable =
    typeof indexedDB !== "undefined" &&
    typeof crypto !== "undefined" &&
    typeof crypto.subtle !== "undefined";

  if (!usable) return memory;

  const stateKey = (id: PSI) => `state:${id}`;
  const signingKeyKey = (address: ContractAddress) => `signing-key:${String(address)}`;

  return {
    setContractAddress: () => {},
    set: async (id, state) => writeRecord(STATE_STORE, stateKey(id), await seal(state)),
    get: async (id) => {
      const record = await readRecord<EncryptedRecord>(STATE_STORE, stateKey(id));
      return record ? unseal<PS>(record) : null;
    },
    remove: async (id) => {
      const database = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STATE_STORE, "readwrite");
        transaction.objectStore(STATE_STORE).delete(stateKey(id));
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error ?? new Error("Could not remove private state"));
      });
    },
    clear: async () => clearStore(STATE_STORE),
    setSigningKey: async (address, signingKey) =>
      writeRecord(SIGNING_KEY_STORE, signingKeyKey(address), await seal(signingKey)),
    getSigningKey: async (address) => {
      const record = await readRecord<EncryptedRecord>(SIGNING_KEY_STORE, signingKeyKey(address));
      return record ? unseal<SigningKey>(record) : null;
    },
    removeSigningKey: async (address) => {
      const database = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(SIGNING_KEY_STORE, "readwrite");
        transaction.objectStore(SIGNING_KEY_STORE).delete(signingKeyKey(address));
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error ?? new Error("Could not remove signing key"));
      });
    },
    clearSigningKeys: async () => clearStore(SIGNING_KEY_STORE),
    exportPrivateStates: async () => {
      throw new Error("Private state export is not enabled in the browser yet");
    },
    importPrivateStates: async () => {
      throw new Error("Private state import is not enabled in the browser yet");
    },
    exportSigningKeys: async () => {
      throw new Error("Signing key export is not enabled in the browser yet");
    },
    importSigningKeys: async () => {
      throw new Error("Signing key import is not enabled in the browser yet");
    },
  };
}
