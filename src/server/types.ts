// Shared domain types for the Copilot demo. Field names intentionally mirror
// the LETRENTS production shapes (properties, units, maintenance_requests)
// so the demo adapter can be swapped for a production adapter later.

export type Urgency = 'low' | 'normal' | 'high' | 'emergency';
export type MaintenanceCategory =
  | 'plumbing'
  | 'electrical'
  | 'security'
  | 'structural'
  | 'water_supply'
  | 'cleaning'
  | 'hvac'
  | 'general'
  | 'other';
export type MaintenanceStatus =
  | 'pending'
  | 'approved'
  | 'in_progress'
  | 'resolved'
  | 'rejected'
  | 'cancelled';

export interface Property {
  id: string;
  orgId: string;
  name: string;
  address: string;
  city: string;
  unitCount: number;
  /** Synthetic landlord/owner name (demo dataset). */
  landlord: string;
}

export interface Unit {
  id: string;
  orgId: string;
  propertyId: string;
  unitNumber: string;
  floor?: string;
  bedrooms?: number;
  status: 'occupied' | 'vacant';
}

export interface Tenant {
  id: string;
  orgId: string;
  propertyId: string;
  unitId: string;
  fullName: string;
  phone: string;
}

export interface StaffMember {
  id: string;
  orgId: string;
  fullName: string;
  role: string;
  phone: string;
  propertyIds: string[];
  skills: MaintenanceCategory[];
  available: boolean;
}

export interface MaintenanceRequest {
  id: string;
  orgId: string;
  reference: string;
  propertyId: string;
  unitId: string | null;
  title: string;
  description: string;
  category: MaintenanceCategory;
  urgency: Urgency;
  status: MaintenanceStatus;
  requestedBy: string;
  assignedTo: string | null;
  safetyRisk: string | null;
  duplicateOfId: string | null;
  source: 'copilot' | 'manual';
  createdAt: string;
  updatedAt: string;
}

export type ConversationRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ConversationRole;
  content: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  orgId: string;
  userId: string;
  title: string;
  messages: ChatMessage[];
  /** Original complaint text awaiting a slot answer (property/unit), if any. */
  pendingComplaint?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ApprovalType = 'maintenance_request' | 'staff_assignment' | 'tenant_message';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';

export interface ApprovalRequest {
  id: string;
  orgId: string;
  conversationId: string;
  type: ApprovalType;
  status: ApprovalStatus;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  orgId: string;
  conversationId: string | null;
  actor: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  detail: string;
  createdAt: string;
}

/** Trusted server-side caller. In the public demo this is the demo manager;
 *  in production it is derived from the authenticated JWT session. */
export interface UserContext {
  userId: string;
  orgId: string;
  role: string;
}
