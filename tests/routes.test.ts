import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Isolate route handlers from the real .data dir and force the deterministic
// local engine. Route modules only read env inside handlers, so setting these
// at module scope (before any test runs) is safe.
process.env.DEMO_DATA_DIR = mkdtempSync(join(tmpdir(), 'copilot-routes-'));
process.env.META_API_KEY = '';

import { describe, expect, it } from 'vitest';
import { GET as listConversations } from '../src/app/api/copilot/conversations/route';
import { GET as getConversation } from '../src/app/api/copilot/conversations/[id]/route';
import { POST as sendMessage } from '../src/app/api/copilot/messages/route';
import { MAX_CONVERSATIONS, MAX_RETURNED_MESSAGES } from '../src/server/agent/loop';
import { getStore } from '../src/server/store';
import { getUserContext } from '../src/server/context';
import { ChatMessage, Conversation } from '../src/server/types';

function seedConversation(i: number, messageCount: number): Conversation {
  const stamp = new Date(Date.now() - (i + 1) * 60000).toISOString();
  const messages: ChatMessage[] = Array.from({ length: messageCount }, (_, m) => ({
    id: `msg-seed-${i}-${m}`,
    role: m % 2 === 0 ? 'user' : 'assistant',
    content: `Seeded message ${m}`,
    createdAt: stamp,
  }));
  return {
    id: `convo-route-${i}`,
    orgId: getUserContext().orgId,
    userId: getUserContext().userId,
    title: `Seeded conversation ${i}`,
    messages,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

describe('copilot route list limits', () => {
  it('caps the conversation list at MAX_CONVERSATIONS', async () => {
    const store = getStore(process.env.DEMO_DATA_DIR!);
    await store.update((db) => {
      db.conversations = [];
      for (let i = 0; i < MAX_CONVERSATIONS + 20; i++) db.conversations.push(seedConversation(i, 2));
    });
    const res = await listConversations();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(MAX_CONVERSATIONS);
  });

  it('windows a long thread on conversation detail', async () => {
    const store = getStore(process.env.DEMO_DATA_DIR!);
    await store.update((db) => {
      db.conversations = [seedConversation(0, MAX_RETURNED_MESSAGES + 50)];
    });
    const res = await getConversation({} as never, { params: Promise.resolve({ id: 'convo-route-0' }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.conversation.messages.length).toBe(MAX_RETURNED_MESSAGES);
    // Newest messages survive (oldest trimmed).
    const last = body.data.conversation.messages.at(-1);
    expect(last.id).toBe(`msg-seed-0-${MAX_RETURNED_MESSAGES + 49}`);
  });

  it('windows the returned thread on send, keeping the full store thread', async () => {
    const store = getStore(process.env.DEMO_DATA_DIR!);
    await store.update((db) => {
      db.conversations = [seedConversation(0, MAX_RETURNED_MESSAGES + 50)];
    });
    const req = { json: async () => ({ content: 'Hello!', conversationId: 'convo-route-0' }) } as never;
    const res = await sendMessage(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.conversation.messages.length).toBe(MAX_RETURNED_MESSAGES);
    const db = await store.load();
    const stored = db.conversations.find((c) => c.id === 'convo-route-0')!;
    expect(stored.messages.length).toBe(MAX_RETURNED_MESSAGES + 52);
  });

  it('rejects empty messages without touching the provider', async () => {
    const req = { json: async () => ({ content: '   ' }) } as never;
    const res = await sendMessage(req);
    expect(res.status).toBe(400);
  });
});
