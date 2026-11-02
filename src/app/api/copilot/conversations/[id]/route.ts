import { NextRequest } from 'next/server';
import { loadConfig } from '@/server/config';
import { getUserContext } from '@/server/context';
import { getStore } from '@/server/store';
import { fail, ok, toSafeErrorMessage } from '@/server/lib/response';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const config = loadConfig();
    const ctx = getUserContext();
    const store = getStore(config.demoDataDir);
    const db = await store.load();
    const conversation = db.conversations.find((c) => c.id === id && c.orgId === ctx.orgId);
    if (!conversation) return fail('Conversation not found', 404, 'NOT_FOUND');
    const approvals = db.approvals
      .filter((a) => a.orgId === ctx.orgId && a.conversationId === id)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return ok({ conversation, approvals }, 'Conversation retrieved');
  } catch (error) {
    return fail(toSafeErrorMessage(error, 'Failed to load conversation'), 500, 'LOAD_ERROR');
  }
}
