// Agent tool registry: every capability the Copilot can use, with a name,
// description, validated input schema, and an executor bound to the adapter.
// The agent may only touch property data through these tools.

import { z } from 'zod';
import {
  PropertyManagementAdapter,
  CreateMaintenanceInput,
} from '../adapters/types';
import { UserContext } from '../types';
import { categorySchema, urgencySchema } from './schemas';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  execute: (ctx: UserContext, input: any) => Promise<any>;
}

export type ToolRegistry = Record<string, ToolDefinition>;

function define(
  name: string,
  description: string,
  inputSchema: z.ZodTypeAny,
  execute: (ctx: UserContext, input: any) => Promise<any>
): ToolDefinition {
  return { name, description, inputSchema, execute };
}

export function createToolRegistry(adapter: PropertyManagementAdapter): ToolRegistry {
  const tools: Array<ToolDefinition> = [
    define(
      'search_properties',
      'Search properties in the caller organization by name or address.',
      z.object({ query: z.string().max(200) }),
      (ctx, input) => adapter.searchProperties(ctx, (input as { query: string }).query)
    ),
    define(
      'get_property_details',
      'Get a single property by id (same organization only).',
      z.object({ propertyId: z.string().min(1).max(64) }),
      (ctx, input) => adapter.getProperty(ctx, (input as { propertyId: string }).propertyId)
    ),
    define(
      'get_unit_details',
      'Get a single unit by id (same organization only).',
      z.object({ unitId: z.string().min(1).max(64) }),
      (ctx, input) => adapter.getUnit(ctx, (input as { unitId: string }).unitId)
    ),
    define(
      'find_units',
      'Find units within a property by unit-number text (tolerates spacing/case).',
      z.object({ propertyId: z.string().min(1).max(64), unitNumberQuery: z.string().min(1).max(20) }),
      (ctx, input) => {
        const { propertyId, unitNumberQuery } = input as { propertyId: string; unitNumberQuery: string };
        return adapter.findUnits(ctx, propertyId, unitNumberQuery);
      }
    ),
    define(
      'get_tenant_details',
      'Get the tenant occupying a unit, if any (same organization only).',
      z.object({ unitId: z.string().min(1).max(64) }),
      (ctx, input) => adapter.getTenantByUnit(ctx, (input as { unitId: string }).unitId)
    ),
    define(
      'get_maintenance_history',
      'List past maintenance requests, optionally filtered by property/unit.',
      z.object({
        propertyId: z.string().max(64).optional(),
        unitId: z.string().max(64).optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      (ctx, input) =>
        adapter.getMaintenanceHistory(
          ctx,
          input as { propertyId?: string; unitId?: string; limit?: number }
        )
    ),
    define(
      'get_pending_maintenance',
      'List open (pending/approved/in-progress) maintenance requests.',
      z.object({ propertyId: z.string().max(64).optional() }),
      (ctx, input) =>
        adapter.getPendingMaintenance(ctx, (input as { propertyId?: string }).propertyId)
    ),
    define(
      'get_maintenance_request',
      'Get one maintenance request by id (same organization only).',
      z.object({ requestId: z.string().min(1).max(64) }),
      (ctx, input) => adapter.getMaintenanceRequest(ctx, (input as { requestId: string }).requestId)
    ),
    define(
      'check_duplicate_request',
      'Check whether a similar open request already exists (72h window).',
      z.object({
        propertyId: z.string().min(1).max(64),
        unitId: z.string().max(64).nullable().optional(),
        category: categorySchema,
        title: z.string().min(4).max(200),
        description: z.string().min(10).max(4000),
      }),
      (ctx, input) =>
        adapter.findDuplicate(
          ctx,
          input as {
            propertyId: string;
            unitId?: string | null;
            category: (typeof categorySchema)['_type'];
            title: string;
            description: string;
          }
        )
    ),
    define(
      'create_maintenance_request',
      'Create a maintenance request. Validates property/unit, access, and duplicates. Manager role required.',
      z.object({
        propertyId: z.string().min(1).max(64),
        unitId: z.string().max(64).nullable().optional(),
        title: z.string().min(4).max(200),
        description: z.string().min(10).max(4000),
        category: categorySchema,
        urgency: urgencySchema,
        safetyRisk: z.string().max(500).nullable().optional(),
      }),
      (ctx, input) =>
        adapter.createMaintenanceRequest(ctx, input as unknown as CreateMaintenanceInput)
    ),
    define(
      'get_available_staff',
      'List staff assigned to a property.',
      z.object({ propertyId: z.string().min(1).max(64) }),
      (ctx, input) => adapter.getAvailableStaff(ctx, (input as { propertyId: string }).propertyId)
    ),
    define(
      'recommend_staff',
      'Recommend up to 3 staff for a category at a property, ranked by skill match.',
      z.object({ propertyId: z.string().min(1).max(64), category: categorySchema }),
      (ctx, input) => {
        const { propertyId, category } = input as {
          propertyId: string;
          category: (typeof categorySchema)['_type'];
        };
        return adapter.recommendStaff(ctx, propertyId, category);
      }
    ),
    define(
      'get_property_summary',
      'Occupancy + open maintenance overview for one property.',
      z.object({ propertyId: z.string().min(1).max(64) }),
      (ctx, input) => adapter.getPropertySummary(ctx, (input as { propertyId: string }).propertyId)
    ),
  ];
  return Object.fromEntries(tools.map((t) => [t.name, t]));
}
