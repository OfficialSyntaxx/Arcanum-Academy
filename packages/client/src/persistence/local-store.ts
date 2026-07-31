import {
  createMigrationRunner,
  failure,
  FailureCode,
  err,
  ok,
  type Failure,
  type Migration,
  type Result,
  type VersionedDocument,
} from '@arcanum/shared';

/**
 * Local persistence.
 *
 * IndexedDB rather than localStorage: localStorage is synchronous (it stutters
 * the frame), string-only, and around 5 MB. A card collection with thousands of
 * instances needs structured storage and headroom.
 *
 * The local store is a cache and an offline buffer, never the source of truth -
 * the server owns the account. That framing is deliberate: it means a corrupted
 * or cleared local database costs a reload, not a player's collection.
 */

export const LOCAL_SCHEMA_VERSION = 1;
export const MINIMUM_SUPPORTED_SCHEMA_VERSION = 1;

/** Registered oldest-first. Each migration reads `from` and produces `from + 1`. */
export const LOCAL_MIGRATIONS: readonly Migration[] = [];

export interface KeyValueStore {
  get<T>(key: string): Promise<Result<T | null, Failure>>;
  set(key: string, value: unknown): Promise<Result<true, Failure>>;
  delete(key: string): Promise<Result<true, Failure>>;
  keys(): Promise<Result<string[], Failure>>;
  close(): void;
}

const DB_NAME = 'arcanum-academy';
const STORE_NAME = 'documents';

function toFailure(reason: string, error: unknown): Failure {
  return failure(FailureCode.Storage, reason, {
    detail: error instanceof Error ? error.message : String(error),
  });
}

function request<T>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error);
  });
}

export class IndexedDbStore implements KeyValueStore {
  private db: IDBDatabase | null = null;

  private constructor(db: IDBDatabase) {
    this.db = db;
  }

  static async open(factory: IDBFactory = indexedDB): Promise<Result<IndexedDbStore, Failure>> {
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = factory.open(DB_NAME, 1);
        open.onupgradeneeded = () => {
          if (!open.result.objectStoreNames.contains(STORE_NAME)) {
            open.result.createObjectStore(STORE_NAME);
          }
        };
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
        open.onblocked = () =>
          reject(new Error('another tab is holding an older database version'));
      });
      return ok(new IndexedDbStore(db));
    } catch (error) {
      // Private browsing and storage-pressure eviction both land here. The caller
      // degrades to an in-memory store rather than refusing to start.
      return err(toFailure('storage.open_failed', error));
    }
  }

  private transaction(mode: IDBTransactionMode): IDBObjectStore {
    if (!this.db) throw new Error('store is closed');
    return this.db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
  }

  async get<T>(key: string): Promise<Result<T | null, Failure>> {
    try {
      const value = await request<T | undefined>(this.transaction('readonly').get(key));
      return ok(value ?? null);
    } catch (error) {
      return err(toFailure('storage.read_failed', error));
    }
  }

  async set(key: string, value: unknown): Promise<Result<true, Failure>> {
    try {
      await request(this.transaction('readwrite').put(value, key));
      return ok(true);
    } catch (error) {
      return err(toFailure('storage.write_failed', error));
    }
  }

  async delete(key: string): Promise<Result<true, Failure>> {
    try {
      await request(this.transaction('readwrite').delete(key));
      return ok(true);
    } catch (error) {
      return err(toFailure('storage.delete_failed', error));
    }
  }

  async keys(): Promise<Result<string[], Failure>> {
    try {
      const keys = await request(this.transaction('readonly').getAllKeys());
      return ok(keys.map(String));
    } catch (error) {
      return err(toFailure('storage.list_failed', error));
    }
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }
}

/** Fallback used when IndexedDB is unavailable, and by tests. */
export class MemoryStore implements KeyValueStore {
  private readonly map = new Map<string, unknown>();

  async get<T>(key: string): Promise<Result<T | null, Failure>> {
    return ok((this.map.get(key) as T | undefined) ?? null);
  }

  async set(key: string, value: unknown): Promise<Result<true, Failure>> {
    this.map.set(key, value);
    return ok(true);
  }

  async delete(key: string): Promise<Result<true, Failure>> {
    this.map.delete(key);
    return ok(true);
  }

  async keys(): Promise<Result<string[], Failure>> {
    return ok([...this.map.keys()]);
  }

  close(): void {
    this.map.clear();
  }
}

/**
 * Reads a document and brings it up to the current schema version, writing the
 * migrated form back so the cost is paid once.
 */
export async function readDocument(
  store: KeyValueStore,
  key: string,
): Promise<Result<VersionedDocument | null, Failure>> {
  const runner = createMigrationRunner([...LOCAL_MIGRATIONS], LOCAL_SCHEMA_VERSION);
  const chain = runner.validateChain(MINIMUM_SUPPORTED_SCHEMA_VERSION);
  if (!chain.ok) return err(chain.error);

  const loaded = await store.get<VersionedDocument>(key);
  if (!loaded.ok) return loaded;
  if (loaded.value === null) return ok(null);

  const migrated = runner.run(loaded.value);
  if (!migrated.ok) return err(migrated.error);
  if (migrated.value.applied.length > 0) {
    const written = await store.set(key, migrated.value.document);
    if (!written.ok) return written;
  }
  return ok(migrated.value.document);
}

/** Writes a document, stamping it with the current schema version. */
export async function writeDocument(
  store: KeyValueStore,
  key: string,
  data: Record<string, unknown>,
): Promise<Result<true, Failure>> {
  return store.set(key, { ...data, schemaVersion: LOCAL_SCHEMA_VERSION });
}
