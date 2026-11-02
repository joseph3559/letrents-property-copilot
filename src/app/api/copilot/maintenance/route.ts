import { getCopilot, getUserContext } from '@/server/context';
import { fail, ok, toSafeErrorMessage } from '@/server/lib/response';

export async function GET() {
  try {
    const { adapter } = getCopilot();
    const ctx = getUserContext();
    const requests = await adapter.getMaintenanceHistory(ctx, { limit: 50 });
    return ok(requests, 'Maintenance requests retrieved');
  } catch (error) {
    return fail(toSafeErrorMessage(error, 'Failed to load maintenance requests'), 500, 'LOAD_ERROR');
  }
}
