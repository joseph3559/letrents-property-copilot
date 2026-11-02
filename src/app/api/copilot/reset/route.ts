import { loadConfig } from '@/server/config';
import { getUserContext } from '@/server/context';
import { getStore } from '@/server/store';
import { fail, ok, toSafeErrorMessage } from '@/server/lib/response';

/**
 * Demo-only reset: restores the synthetic dataset (clears conversations,
 * approvals, audit, and copilot-created records). The demo dataset is
 * synthetic, so there is no production data at risk.
 */
export async function POST() {
  try {
    const config = loadConfig();
    getUserContext();
    const store = getStore(config.demoDataDir);
    await store.reset();
    return ok({ reset: true }, 'Demo data reset to seed state');
  } catch (error) {
    return fail(toSafeErrorMessage(error, 'Failed to reset demo data'), 500, 'RESET_ERROR');
  }
}
