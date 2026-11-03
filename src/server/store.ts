// File-backed JSON store for the public demo. Records created through the
// Copilot (conversations, maintenance requests, approvals, audit events) are
// persisted under DEMO_DATA_DIR so the demo survives restarts and is repeatable.
// Static portfolio data (properties/units/tenants/staff) lives in demo-data.ts.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { demoMaintenanceSeed } from './demo-data';
import {
  ApprovalRequest,
  AuditEvent,
  Conversation,
  MaintenanceRequest,
} from './types';

export interface DemoDatabase {
  conversations: Conversation[];
  maintenanceRequests: MaintenanceRequest[];
  approvals: ApprovalRequest[];
  auditEvents: AuditEvent[];
  referenceCounter: number;
}

const FILE_NAMES: Record<keyof DemoDatabase, string> = {
  conversations: 'conversations.json',
  maintenanceRequests: 'maintenance.json',
  approvals: 'approvals.json',
  auditEvents: 'audit.json',
  referenceCounter: 'counter.json',
};

export function defaultDatabase(): DemoDatabase {
  return {
    conversations: [],
    maintenanceRequests: structuredClone(demoMaintenanceSeed),
    approvals: [],
    auditEvents: [],
    referenceCounter: 1100,
  };
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

/** Storage contract shared by the file-backed and KV-backed demo stores. */
export interface DemoStoreLike {
  load(): Promise<DemoDatabase>;
  update<T>(mutator: (db: DemoDatabase) => T): Promise<T>;
  reset(): Promise<void>;
}

export class DemoStore implements DemoStoreLike {
  private dataDir: string;
  private cache: DemoDatabase | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  /** False once the disk proves unwritable (read-only serverless FS): memory-only mode. */
  private diskWritable: boolean | null = null;
  private warnedMemoryMode = false;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  private filePath(key: keyof DemoDatabase): string {
    return path.join(this.dataDir, FILE_NAMES[key]);
  }

  private warnMemoryMode(reason: string): void {
    if (this.warnedMemoryMode) return;
    this.warnedMemoryMode = true;
    console.warn(`[demo-store] ${reason}; continuing in memory-only mode`);
  }

  private async persist(key: keyof DemoDatabase, value: unknown): Promise<void> {
    if (this.diskWritable === false) return;
    try {
      await writeJsonFile(this.filePath(key), value);
      this.diskWritable = true;
    } catch {
      this.warnMemoryMode(`disk at ${this.dataDir} is not writable`);
      this.diskWritable = false;
    }
  }

  async load(): Promise<DemoDatabase> {
    if (this.cache) return this.cache;
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch {
      this.warnMemoryMode(`cannot create ${this.dataDir}`);
      this.diskWritable = false;
      this.cache = defaultDatabase();
      return this.cache;
    }
    const fresh = defaultDatabase();
    const db: DemoDatabase = { ...fresh };
    for (const key of Object.keys(FILE_NAMES) as Array<keyof DemoDatabase>) {
      const stored = await readJsonFile<DemoDatabase[typeof key]>(this.filePath(key));
      if (stored !== null && stored !== undefined) {
        (db as unknown as Record<string, unknown>)[key] = stored;
      } else {
        await this.persist(key, db[key]);
      }
    }
    this.cache = db;
    return db;
  }

  /** Mutate the database atomically (in-memory + write-through, serialized). */
  async update<T>(mutator: (db: DemoDatabase) => T): Promise<T> {
    let result: T;
    const run = async () => {
      const db = await this.load();
      result = mutator(db);
      for (const key of Object.keys(FILE_NAMES) as Array<keyof DemoDatabase>) {
        await this.persist(key, db[key]);
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

let sharedStore: DemoStoreLike | null = null;
let sharedDataDir: string | null = null;
let sharedKvStore: DemoStoreLike | null = null;

export function getStore(dataDir: string): DemoStoreLike {
  // Vercel KV env vars are auto-injected when a KV database is connected in
  // the dashboard. Shared state across instances; files stay for local dev.
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    if (!sharedKvStore) {
      // Lazy import: kv-store pulls @vercel/kv, only needed with KV configured.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { KvStore } = require('./kv-store') as typeof import('./kv-store');
      sharedKvStore = new KvStore();
    }
    return sharedKvStore;
  }
  if (!sharedStore || sharedDataDir !== dataDir) {
    sharedStore = new DemoStore(dataDir);
    sharedDataDir = dataDir;
  }
  return sharedStore;
}
