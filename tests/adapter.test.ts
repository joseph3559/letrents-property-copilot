import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DemoStore } from '../src/server/store';
import { DemoAdapter } from '../src/server/adapters/demo-adapter';
import {
  AuthorizationError,
  DuplicateRequestError,
  NotFoundError,
  ValidationError,
} from '../src/server/adapters/types';
import { UserContext } from '../src/server/types';

const ctx: UserContext = { userId: 'user-demo-manager', orgId: 'org-sunrise-demo', role: 'demo_manager' };
const foreignCtx: UserContext = { userId: 'user-other', orgId: 'org-other', role: 'demo_manager' };
const tenantCtx: UserContext = { userId: 'user-tenant', orgId: 'org-sunrise-demo', role: 'tenant' };

function makeAdapter() {
  const dir = mkdtempSync(join(tmpdir(), 'copilot-adapter-'));
  return new DemoAdapter(new DemoStore(dir));
}

describe('DemoAdapter', () => {
  it('finds properties and is scoped to the caller org', async () => {
    const adapter = makeAdapter();
    const found = await adapter.searchProperties(ctx, 'sunrise');
    expect(found.length).toBe(1);
    expect(found[0].name).toBe('Sunrise Apartments');
    const foreign = await adapter.searchProperties(foreignCtx, 'sunrise');
    expect(foreign.length).toBe(0);
  });

  it('hides foreign-org records as not-found', async () => {
    const adapter = makeAdapter();
    await expect(adapter.getProperty(foreignCtx, 'prop-sunrise')).rejects.toBeInstanceOf(NotFoundError);
    await expect(adapter.getUnit(foreignCtx, 'unit-a101')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('finds units tolerating case and spacing', async () => {
    const adapter = makeAdapter();
    const units = await adapter.findUnits(ctx, 'prop-sunrise', 'b201');
    expect(units.map((u) => u.unitNumber)).toEqual(['B201']);
  });

  it('resolves tenant by unit', async () => {
    const adapter = makeAdapter();
    const tenant = await adapter.getTenantByUnit(ctx, 'unit-a101');
    expect(tenant?.fullName).toBe('Brian Otieno');
  });

  it('lists units and tenants per property with landlord attribution', async () => {
    const adapter = makeAdapter();
    const property = await adapter.getProperty(ctx, 'prop-sunrise');
    expect(property.landlord).toBe('Margaret Wambui');
    const units = await adapter.listUnits(ctx, 'prop-sunrise');
    expect(units.map((u) => u.unitNumber)).toEqual(['A101', 'A102', 'B201', 'B202', 'C301']);
    const tenants = await adapter.listTenants(ctx, 'prop-sunrise');
    expect(tenants.length).toBe(4);
    await expect(adapter.listUnits(foreignCtx, 'prop-sunrise')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects maintenance creation from non-managers', async () => {
    const adapter = makeAdapter();
    await expect(
      adapter.createMaintenanceRequest(tenantCtx, {
        propertyId: 'prop-sunrise',
        title: 'Leaking tap in kitchen',
        description: 'Kitchen tap drips constantly day and night.',
        category: 'plumbing',
        urgency: 'normal',
      })
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('validates property/unit relationship', async () => {
    const adapter = makeAdapter();
    await expect(
      adapter.createMaintenanceRequest(ctx, {
        propertyId: 'prop-acacia',
        unitId: 'unit-a101',
        title: 'Leaking tap in kitchen',
        description: 'Kitchen tap drips constantly day and night.',
        category: 'plumbing',
        urgency: 'normal',
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('blocks duplicate requests within 72h', async () => {
    const adapter = makeAdapter();
    const first = await adapter.createMaintenanceRequest(ctx, {
      propertyId: 'prop-sunrise',
      unitId: 'unit-b202',
      title: 'Blocked bathroom drain',
      description: 'The bathroom drain in the vacant unit is fully blocked and smells.',
      category: 'plumbing',
      urgency: 'normal',
    });
    expect(first.reference).toMatch(/^MNT-/);
    await expect(
      adapter.createMaintenanceRequest(ctx, {
        propertyId: 'prop-sunrise',
        unitId: 'unit-b202',
        title: 'Blocked bathroom drain again',
        description: 'The bathroom drain in the vacant unit is fully blocked and smells bad.',
        category: 'plumbing',
        urgency: 'normal',
      })
    ).rejects.toBeInstanceOf(DuplicateRequestError);
  });

  it('looks up records by reference and staff by id', async () => {
    const adapter = makeAdapter();
    const record = await adapter.getMaintenanceByReference(ctx, 'mnt-1002');
    expect(record.title).toBe('Broken main entrance lock');
    await expect(adapter.getMaintenanceByReference(ctx, 'MNT-9999')).rejects.toBeInstanceOf(NotFoundError);
    const member = await adapter.getStaffMember(ctx, 'staff-plumber');
    expect(member.fullName).toBe('Peter Omondi');
    await expect(adapter.getStaffMember(ctx, 'staff-ghost')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('recommends skilled staff first', async () => {
    const adapter = makeAdapter();
    const recs = await adapter.recommendStaff(ctx, 'prop-sunrise', 'plumbing');
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].staff.role).toBe('Plumber');
  });

  it('summarizes property occupancy and open work', async () => {
    const adapter = makeAdapter();
    const summary = await adapter.getPropertySummary(ctx, 'prop-sunrise');
    expect(summary.totalUnits).toBe(5);
    expect(summary.pendingMaintenance + summary.inProgressMaintenance).toBeGreaterThan(0);
  });
});
