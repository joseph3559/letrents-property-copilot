import { getCopilot, getUserContext } from '@/server/context';
import { loadConfig } from '@/server/config';
import { getStore } from '@/server/store';
import { ok } from '@/server/lib/response';

export async function GET() {
  const { metaConfigured, model, baseUrl } = getCopilot();
  const config = loadConfig();
  const ctx = getUserContext();
  const store = getStore(config.demoDataDir);
  const db = await store.load();
  const pendingApprovals = db.approvals.filter(
    (a) => a.orgId === ctx.orgId && a.status === 'pending'
  ).length;
  // Never expose the API key — only whether one is configured.
  return ok(
    {
      engine: metaConfigured ? 'meta' : 'local',
      model: metaConfigured ? model : 'local-fallback-v1',
      metaBaseUrl: baseUrl,
      metaConfigured,
      orgId: ctx.orgId,
      pendingApprovals,
    },
    'Status retrieved'
  );
}
