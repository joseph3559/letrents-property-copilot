import { getCopilot, getUserContext } from '@/server/context';
import { fail, ok, toSafeErrorMessage } from '@/server/lib/response';

export async function GET() {
  try {
    const { adapter } = getCopilot();
    const ctx = getUserContext();
    const properties = await adapter.searchProperties(ctx, '');
    const portfolio = await Promise.all(
      properties.map(async (property) => {
        const [summary, units, tenants] = await Promise.all([
          adapter.getPropertySummary(ctx, property.id),
          adapter.listUnits(ctx, property.id),
          adapter.listTenants(ctx, property.id),
        ]);
        const tenantByUnit = Object.fromEntries(tenants.map((t) => [t.unitId, t]));
        return {
          property,
          totalUnits: summary.totalUnits,
          occupiedUnits: summary.occupiedUnits,
          pendingMaintenance: summary.pendingMaintenance,
          inProgressMaintenance: summary.inProgressMaintenance,
          units: units.map((u) => ({ ...u, tenant: tenantByUnit[u.id] ?? null })),
        };
      })
    );
    return ok(portfolio, 'Portfolio retrieved');
  } catch (error) {
    return fail(toSafeErrorMessage(error, 'Failed to load portfolio'), 500, 'LOAD_ERROR');
  }
}
