// In-memory FileStore (server/lib/files.ts) for tests: records what was put,
// removed and signed, and can be told to fail.
import type { Backend, FileStore } from "../../server/lib/files.js";

export type MemoryStore = FileStore & {
  objects: Map<string, Uint8Array>;
  removed: string[];
  failRemove: boolean;
};

export function memoryStore(backend: Backend, keys: string[] = []): MemoryStore {
  const store: MemoryStore = {
    backend,
    objects: new Map(keys.map((k) => [k, new Uint8Array([1])])),
    removed: [],
    failRemove: false,
    async put(key, body) {
      store.objects.set(key, body);
    },
    async remove(keys) {
      if (store.failRemove) throw new Error("storage is down");
      for (const key of keys) {
        store.removed.push(key);
        store.objects.delete(key);
      }
    },
    async signedUrl(key, ttl) {
      return `https://signed.example/${backend}/${key}?expires=${ttl}`;
    },
    async list(prefix) {
      return Array.from(store.objects.keys()).filter((k) => k.startsWith(prefix));
    },
    async get(key) {
      const body = store.objects.get(key);
      if (!body) throw new Error(`missing ${key}`);
      return body;
    },
  };
  return store;
}
