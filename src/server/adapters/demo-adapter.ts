// Public DemoAdapter backed by synthetic data + JSON persistence.
// Enforces organization isolation on every read/write: records outside the
// caller's org are invisible (NotFoundError, never a leak).

import {
  demoProperties,
  demoStaff,
  demoTenants,
  demoUnits,
} from '../demo-data';
import { DemoStore } from '../store';
import { newId, nowIso } from '../lib/id';
import {
  MaintenanceCategory,
  MaintenanceRequest,
  Property,
  StaffMember,
  Tenant,
  Unit,
  UserContext,
} from '../types';
import {
  AuthorizationError,
  CreateMaintenanceInput,
  DuplicateRequestError,
  NotFoundError,
  PropertyManagementAdapter,
  PropertySummary,
  StaffRecommendation,
  ValidationError,
} from './types';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'in', 'on', 'of', 'is', 'are', 'was', 'were', 'it', 'its',
  'and', 'or', 'to', 'for', 'with', 'by', 'at', 'from', 'that', 'this', 'there',
  'has', 'have', 'had', 'be', 'been', 'not', 'no', 'my', 'our', 'we', 'they',
]);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP_WORDS.has(t))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function normalizeUnitNumber(raw: string): string {
  return raw.toLowerCase().replace(/[\s\-#.]/g, '');
}

export class DemoAdapter implements PropertyManagementAdapter {
  constructor(private readonly store: DemoStore) {}

  private assertOrg(ctx: UserContext, recordOrgId: string): void {
    if (ctx.orgId !== recordOrgId) {
      // Deliberately generic: callers map this to 404 semantics.
      throw new NotFoundError('Record not found');
    }
  }

  private requireManager(ctx: UserContext): void {
    if (!['manager', 'admin', 'agency_admin', 'super_admin', 'demo_manager'].includes(ctx.role)) {
      throw new AuthorizationError('Only property managers can perform this action');
    }
  }

  async searchProperties(ctx: UserContext, query: string): Promise<Property[]> {
    const q = query.trim().toLowerCase();
    return demoProperties.filter(
      (p) =>
        p.orgId === ctx.orgId &&
        (q.length === 0 || p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q))
    );
  }

  async getProperty(ctx: UserContext, propertyId: string): Promise<Property> {
    const property = demoProperties.find((p) => p.id === propertyId);
    if (!property) throw new NotFoundError('Property not found');
    this.assertOrg(ctx, property.orgId);
    return property;
  }

  async getUnit(ctx: UserContext, unitId: string): Promise<Unit> {
    const unit = demoUnits.find((u) => u.id === unitId);
    if (!unit) throw new NotFoundError('Unit not found');
    this.assertOrg(ctx, unit.orgId);
    return unit;
  }

  async findUnits(ctx: UserContext, propertyId: string, unitNumberQuery: string): Promise<Unit[]> {
    const property = await this.getProperty(ctx, propertyId);
    const needle = normalizeUnitNumber(unitNumberQuery);
    if (!needle) return [];
    return demoUnits.filter(
      (u) =>
        u.propertyId === property.id &&
        u.orgId === ctx.orgId &&
        (normalizeUnitNumber(u.unitNumber).includes(needle) ||
          needle.includes(normalizeUnitNumber(u.unitNumber)))
    );
  }

  async getTenantByUnit(ctx: UserContext, unitId: string): Promise<Tenant | null> {
    const unit = await this.getUnit(ctx, unitId);
    const tenant = demoTenants.find((t) => t.unitId === unit.id);
    if (!tenant) return null;
    this.assertOrg(ctx, tenant.orgId);
    return tenant;
  }

  async getMaintenanceHistory(
    ctx: UserContext,
    filters: { propertyId?: string; unitId?: string; limit?: number }
  ): Promise<MaintenanceRequest[]> {
    const db = await this.store.load();
    let rows = db.maintenanceRequests.filter((r) => r.orgId === ctx.orgId);
    if (filters.propertyId) rows = rows.filter((r) => r.propertyId === filters.propertyId);
    if (filters.unitId) rows = rows.filter((r) => r.unitId === filters.unitId);
    rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return rows.slice(0, Math.min(filters.limit ?? 20, 50));
  }

  async getPendingMaintenance(ctx: UserContext, propertyId?: string): Promise<MaintenanceRequest[]> {
    const db = await this.store.load();
    return db.maintenanceRequests
      .filter(
        (r) =>
          r.orgId === ctx.orgId &&
          (r.status === 'pending' || r.status === 'approved' || r.status === 'in_progress') &&
          (!propertyId || r.propertyId === propertyId)
      )
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async getMaintenanceRequest(ctx: UserContext, requestId: string): Promise<MaintenanceRequest> {
    const db = await this.store.load();
    const row = db.maintenanceRequests.find((r) => r.id === requestId);
    if (!row) throw new NotFoundError('Maintenance request not found');
    this.assertOrg(ctx, row.orgId);
    return row;
  }

  async findDuplicate(
    ctx: UserContext,
    candidate: {
      propertyId: string;
      unitId?: string | null;
      category: MaintenanceCategory;
      title: string;
      description: string;
    }
  ): Promise<MaintenanceRequest | null> {
    const db = await this.store.load();
    const candidateTokens = tokens(`${candidate.title} ${candidate.description}`);
    const windowStart = Date.now() - 72 * 60 * 60 * 1000;
    const open = db.maintenanceRequests.filter(
      (r) =>
        r.orgId === ctx.orgId &&
        r.propertyId === candidate.propertyId &&
        (r.unitId ?? null) === (candidate.unitId ?? null) &&
        r.status !== 'rejected' &&
        r.status !== 'cancelled' &&
        Date.parse(r.createdAt) >= windowStart
    );
    let best: { row: MaintenanceRequest; score: number } | null = null;
    for (const row of open) {
      const score = jaccard(candidateTokens, tokens(`${row.title} ${row.description}`));
      const categoryBoost = row.category === candidate.category ? 0.15 : -0.2;
      const total = score + categoryBoost;
      if (total >= 0.45 && (!best || total > best.score)) {
        best = { row, score: total };
      }
    }
    return best?.row ?? null;
  }

  async createMaintenanceRequest(
    ctx: UserContext,
    input: CreateMaintenanceInput
  ): Promise<MaintenanceRequest> {
    this.requireManager(ctx);
    const property = await this.getProperty(ctx, input.propertyId);
    let unit: Unit | null = null;
    if (input.unitId) {
      unit = await this.getUnit(ctx, input.unitId);
      if (unit.propertyId !== property.id) {
        throw new ValidationError('Unit does not belong to the selected property');
      }
    }
    const title = input.title.trim();
    const description = input.description.trim();
    if (title.length < 4) throw new ValidationError('Title must be at least 4 characters');
    if (description.length < 10) throw new ValidationError('Description must be at least 10 characters');

    const duplicate = await this.findDuplicate(ctx, {
      propertyId: property.id,
      unitId: unit?.id ?? null,
      category: input.category,
      title,
      description,
    });
    if (duplicate) {
      throw new DuplicateRequestError(
        `A similar ${duplicate.status} request (${duplicate.reference}) already exists for this ${unit ? 'unit' : 'property'}`,
        duplicate.id
      );
    }

    const created = await this.store.update((db) => {
      db.referenceCounter += 1;
      const row: MaintenanceRequest = {
        id: newId('mnt'),
        orgId: ctx.orgId,
        reference: `MNT-${db.referenceCounter}`,
        propertyId: property.id,
        unitId: unit?.id ?? null,
        title: title.slice(0, 200),
        description: description.slice(0, 4000),
        category: input.category,
        urgency: input.urgency,
        status: 'pending',
        requestedBy: ctx.userId,
        assignedTo: null,
        safetyRisk: input.safetyRisk?.slice(0, 500) ?? null,
        duplicateOfId: null,
        source: 'copilot',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      db.maintenanceRequests.push(row);
      return row;
    });
    return created;
  }

  async updateMaintenanceRequest(
    ctx: UserContext,
    requestId: string,
    patch: Partial<Pick<MaintenanceRequest, 'status' | 'assignedTo' | 'urgency'>>
  ): Promise<MaintenanceRequest> {
    this.requireManager(ctx);
    if (patch.assignedTo) {
      const staff = demoStaff.find((s) => s.id === patch.assignedTo);
      if (!staff || staff.orgId !== ctx.orgId) throw new ValidationError('Unknown staff member');
    }
    const updated = await this.store.update((db) => {
      const row = db.maintenanceRequests.find((r) => r.id === requestId);
      if (!row || row.orgId !== ctx.orgId) throw new NotFoundError('Maintenance request not found');
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.assignedTo !== undefined) row.assignedTo = patch.assignedTo;
      if (patch.urgency !== undefined) row.urgency = patch.urgency;
      row.updatedAt = nowIso();
      return { ...row };
    });
    return updated;
  }

  async getAvailableStaff(ctx: UserContext, propertyId: string): Promise<StaffMember[]> {
    await this.getProperty(ctx, propertyId);
    return demoStaff.filter((s) => s.orgId === ctx.orgId && s.propertyIds.includes(propertyId));
  }

  async recommendStaff(
    ctx: UserContext,
    propertyId: string,
    category: MaintenanceCategory
  ): Promise<StaffRecommendation[]> {
    const staff = await this.getAvailableStaff(ctx, propertyId);
    const ranked = staff.map((member) => {
      let score = 0;
      const reasons: string[] = [];
      if (member.skills.includes(category)) {
        score += 50;
        reasons.push(`skilled in ${category.replace(/_/g, ' ')}`);
      }
      if (member.available) {
        score += 20;
        reasons.push('currently available');
      } else {
        score -= 10;
        reasons.push('currently unavailable');
      }
      if (member.role === 'Property Manager') {
        score += 5;
        reasons.push('can coordinate the job');
      }
      return {
        staff: member,
        score,
        reason: reasons.length > 0 ? reasons.join('; ') : 'assigned to this property',
      };
    });
    ranked.sort((a, b) => b.score - a.score);
    return ranked.slice(0, 3);
  }

  async getPropertySummary(ctx: UserContext, propertyId: string): Promise<PropertySummary> {
    const property = await this.getProperty(ctx, propertyId);
    const units = demoUnits.filter((u) => u.propertyId === property.id && u.orgId === ctx.orgId);
    const db = await this.store.load();
    const open = db.maintenanceRequests.filter(
      (r) =>
        r.orgId === ctx.orgId &&
        r.propertyId === property.id &&
        ['pending', 'approved', 'in_progress'].includes(r.status)
    );
    const byCategory: Record<string, number> = {};
    for (const row of open) {
      byCategory[row.category] = (byCategory[row.category] ?? 0) + 1;
    }
    return {
      property,
      totalUnits: units.length,
      occupiedUnits: units.filter((u) => u.status === 'occupied').length,
      pendingMaintenance: open.filter((r) => r.status === 'pending').length,
      inProgressMaintenance: open.filter((r) => r.status === 'in_progress' || r.status === 'approved').length,
      byCategory,
    };
  }
}
