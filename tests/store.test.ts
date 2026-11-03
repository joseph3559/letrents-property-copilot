import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DemoStore } from '../src/server/store';
import { KvStore, KvClient } from '../src/server/kv-store';
import { loadConfig } from '../src/server/config';

function fakeKvClient(): KvClient & { size: () => number } {
  const map = new Map<string, unknown>();
  return {
    get: async <T>(key: string): Promise<T | null> =>
      (map.has(key) ? (map.get(key) as T) : null),
    set: async (key: string, value: unknown): Promise<string> => {
      map.set(key, value);
      return 'OK';
    },
    size: () => map.size,
  };
}

describe('DemoStore', () => {
  it('persists records to disk when the directory is writable', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'copilot-store-'));
    const store = new DemoStore(dir);
    const id = await store.update((db) => {
      db.conversations.push({
        id: 'convo-test',
        orgId: 'org-test',
        userId: 'user-test',
        title: 'test',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return 'convo-test';
    });
    expect(id).toBe('convo-test');
    // A fresh instance over the same directory sees the persisted record.
    const reopened = new DemoStore(dir);
    const db = await reopened.load();
    expect(db.conversations.some((c) => c.id === 'convo-test')).toBe(true);
  });

  it('falls back to memory-only mode when the disk is not writable', async () => {
    // A data dir nested under a regular file can never be created (ENOTDIR),
    // simulating a read-only serverless filesystem.
    const dir = mkdtempSync(join(tmpdir(), 'copilot-store-ro-'));
    const blocker = join(dir, 'blocker');
    writeFileSync(blocker, 'not a directory');
    const store = new DemoStore(join(blocker, 'data'));
    const db = await store.load();
    expect(db.maintenanceRequests.length).toBeGreaterThan(0);
    const id = await store.update((inner) => {
      inner.conversations.push({
        id: 'convo-mem',
        orgId: 'org-test',
        userId: 'user-test',
        title: 'memory only',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return 'convo-mem';
    });
    expect(id).toBe('convo-mem');
    const again = await store.load();
    expect(again.conversations.some((c) => c.id === 'convo-mem')).toBe(true);
  });
});

describe('KvStore', () => {
  it('seeds defaults on first load and round-trips mutations', async () => {
    const store = new KvStore(fakeKvClient());
    const db = await store.load();
    expect(db.maintenanceRequests.length).toBeGreaterThan(0);
    expect(db.conversations).toEqual([]);
    await store.update((inner) => {
      inner.conversations.push({
        id: 'convo-kv',
        orgId: 'org-test',
        userId: 'user-test',
        title: 'kv test',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });
    const again = await store.load();
    expect(again.conversations.some((c) => c.id === 'convo-kv')).toBe(true);
  });

  it('shares state across instances over the same client', async () => {
    const client = fakeKvClient();
    const a = new KvStore(client);
    const b = new KvStore(client);
    await a.update((db) => {
      db.referenceCounter = 1234;
    });
    const fromB = await b.load();
    expect(fromB.referenceCounter).toBe(1234);
  });

  it('reset restores seed state', async () => {
    const store = new KvStore(fakeKvClient());
    await store.update((db) => {
      db.approvals.push({
        id: 'apr-x',
        orgId: 'org-test',
        conversationId: 'convo-kv',
        type: 'maintenance_request',
        status: 'pending',
        title: 't',
        summary: 's',
        payload: {},
        decidedBy: null,
        decidedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });
    await store.reset();
    const db = await store.load();
    expect(db.approvals).toEqual([]);
    expect(db.conversations).toEqual([]);
  });
});

describe('loadConfig data directory', () => {
  it('uses the OS temp dir on Vercel, .data locally', () => {
    const prev = process.env.VERCEL;
    const prevDir = process.env.DEMO_DATA_DIR;
    try {
      delete process.env.DEMO_DATA_DIR;
      delete process.env.VERCEL;
      expect(loadConfig().demoDataDir).toBe('.data');
      process.env.VERCEL = '1';
      expect(loadConfig().demoDataDir).toContain('letrents-copilot-data');
      expect(loadConfig().demoDataDir).not.toBe('.data');
      process.env.DEMO_DATA_DIR = '/custom/dir';
      expect(loadConfig().demoDataDir).toBe('/custom/dir');
    } finally {
      if (prev === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = prev;
      if (prevDir === undefined) delete process.env.DEMO_DATA_DIR;
      else process.env.DEMO_DATA_DIR = prevDir;
    }
  });
});
