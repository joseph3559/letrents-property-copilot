import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DemoStore } from '../src/server/store';
import { loadConfig } from '../src/server/config';

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
