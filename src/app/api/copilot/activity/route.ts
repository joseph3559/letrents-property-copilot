import { NextRequest } from 'next/server';
import { loadConfig } from '@/server/config';
import { getUserContext } from '@/server/context';
import { getStore } from '@/server/store';
import { fail, ok, toSafeErrorMessage } from '@/server/lib/response';

export async function GET(req: NextRequest) {
  try {
    const config = loadConfig();
    const ctx = getUserContext();
    const store = getStore(config.demoDataDir);
    const db = await store.load();
    const conversationId = req.nextUrl.searchParams.get('conversationId');
    const events = db.auditEvents
      .filter(
        (e) =>
          e.orgId === ctx.orgId && (!conversationId || e.conversationId === conversationId)
      )
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 50);
    return ok(events, 'Activity retrieved');
  } catch (error) {
    return fail(toSafeErrorMessage(error, 'Failed to load activity'), 500, 'LOAD_ERROR');
  }
}
