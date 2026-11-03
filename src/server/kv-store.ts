// Vercel KV (Redis) backing for the demo database. Used in production so every
// serverless instance shares one state — file-backed storage is per-instance
// on Vercel and causes cross-request 404s (approvals, conversations).
// Local dev without KV env vars keeps using the file-backed DemoStore.

import { kv as defaultKv } from '@vercel/kv';
import { DemoDatabase, DemoStoreLike, defaultDatabase } from './store';

/** Minimal KV surface KvStore needs — injectable for tests. */
export interface KvClient {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<unknown>;
}

const KEY_PREFIX = 'copilot:db:';
const KEYS: Array<keyof DemoDatabase> = [
  'conversations',
  'maintenanceRequests',
  'approvals',
  'auditEvents',
  'referenceCounter',
];

export class KvStore implements DemoStoreLike {
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly client: KvClient = defaultKv) {}

  private async readAll(): Promise<DemoDatabase> {
    // No in-memory cache: every read hits KV so all instances see one truth.
    const db: DemoDatabase = { ...defaultDatabase() };
    for (const key of KEYS) {
      const stored = await this.client.get<DemoDatabase[typeof key]>(`${KEY_PREFIX}${key}`);
      if (stored !== null && stored !== undefined) {
        (db as unknown as Record<string, unknown>)[key] = stored;
      }
    }
    return db;
  }

  async load(): Promise<DemoDatabase> {
    return this.readAll();
  }

  async update<T>(mutator: (db: DemoDatabase) => T): Promise<T> {
    let result: T;
    const run = async () => {
      const db = await this.readAll();
      result = mutator(db);
      for (const key of KEYS) {
        await this.client.set(`${KEY_PREFIX}${key}`, db[key]);
      }
    };
    this.writeChain = this.writeChain.then(run, run);
    await this.writeChain;
    return result!;
  }

  async reset(): Promise<void> {
    await this.update((db) => {
      const fresh = defaultDatabase();
      db.conversations = fresh.conversations;
      db.maintenanceRequests = fresh.maintenanceRequests;
      db.approvals = fresh.approvals;
      db.auditEvents = fresh.auditEvents;
      db.referenceCounter = fresh.referenceCounter;
    });
  }
}
