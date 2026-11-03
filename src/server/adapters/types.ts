// Adapter interface between the AI agent and property-management data.
// The agent operates ONLY against this interface; switching from the demo
// environment to LETRENTS production services means providing a different
// implementation, not redesigning the agent.

import {
  MaintenanceCategory,
  MaintenanceRequest,
  Property,
  StaffMember,
  Tenant,
  Unit,
  Urgency,
  UserContext,
} from '../types';

export class AuthorizationError extends Error {
  constructor(message = 'Access denied') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Record not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class DuplicateRequestError extends Error {
  duplicateOfId: string;
  constructor(message: string, duplicateOfId: string) {
    super(message);
    this.name = 'DuplicateRequestError';
    this.duplicateOfId = duplicateOfId;
  }
}

export interface CreateMaintenanceInput {
  propertyId: string;
  unitId?: string | null;
  title: string;
  description: string;
  category: MaintenanceCategory;
  urgency: Urgency;
  safetyRisk?: string | null;
  idempotencyKey?: string;
}

export interface PropertySummary {
  property: Property;
  totalUnits: number;
  occupiedUnits: number;
  pendingMaintenance: number;
  inProgressMaintenance: number;
  byCategory: Record<string, number>;
}

export interface StaffRecommendation {
  staff: StaffMember;
  reason: string;
  score: number;
}

export interface PropertyManagementAdapter {
  searchProperties(ctx: UserContext, query: string): Promise<Property[]>;
  getProperty(ctx: UserContext, propertyId: string): Promise<Property>;
  listUnits(ctx: UserContext, propertyId: string): Promise<Unit[]>;
  listTenants(ctx: UserContext, propertyId: string): Promise<Tenant[]>;
  getUnit(ctx: UserContext, unitId: string): Promise<Unit>;
  findUnits(ctx: UserContext, propertyId: string, unitNumberQuery: string): Promise<Unit[]>;
  getTenantByUnit(ctx: UserContext, unitId: string): Promise<Tenant | null>;
  getMaintenanceHistory(
    ctx: UserContext,
    filters: { propertyId?: string; unitId?: string; limit?: number }
  ): Promise<MaintenanceRequest[]>;
  getPendingMaintenance(ctx: UserContext, propertyId?: string): Promise<MaintenanceRequest[]>;
  getMaintenanceRequest(ctx: UserContext, requestId: string): Promise<MaintenanceRequest>;
  getMaintenanceByReference(ctx: UserContext, reference: string): Promise<MaintenanceRequest>;
  getStaffMember(ctx: UserContext, staffId: string): Promise<StaffMember>;
  createMaintenanceRequest(
    ctx: UserContext,
    input: CreateMaintenanceInput
  ): Promise<MaintenanceRequest>;
  updateMaintenanceRequest(
    ctx: UserContext,
    requestId: string,
    patch: Partial<Pick<MaintenanceRequest, 'status' | 'assignedTo' | 'urgency'>>
  ): Promise<MaintenanceRequest>;
  getAvailableStaff(ctx: UserContext, propertyId: string): Promise<StaffMember[]>;
  recommendStaff(
    ctx: UserContext,
    propertyId: string,
    category: MaintenanceCategory
  ): Promise<StaffRecommendation[]>;
  getPropertySummary(ctx: UserContext, propertyId: string): Promise<PropertySummary>;
  findDuplicate(
    ctx: UserContext,
    candidate: { propertyId: string; unitId?: string | null; category: MaintenanceCategory; title: string; description: string }
  ): Promise<MaintenanceRequest | null>;
}
