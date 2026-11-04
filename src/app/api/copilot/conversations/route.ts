import { loadConfig } from '@/server/config';
import { getUserContext } from '@/server/context';
import { getStore } from '@/server/store';
import { MAX_CONVERSATIONS } from '@/server/agent/loop';
import { fail, ok, toSafeErrorMessage } from '@/server/lib/response';

export async function GET() {
  try {
    const config = loadConfig();
    const ctx = getUserContext();
    const store = getStore(config.demoDataDir);
    const db = await store.load();
    const conversations = db.conversations
      .filter((c) => c.orgId === ctx.orgId)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .slice(0, MAX_CONVERSATIONS)
      .map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt,
        messageCount: c.messages.length,
      }));
    return ok(conversations, 'Conversations retrieved');
  } catch (error) {
    return fail(toSafeErrorMessage(error, 'Failed to load conversations'), 500, 'LOAD_ERROR');
  }
}
