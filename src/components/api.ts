// Client-side API client + shared view types (mirrors server shapes).

export interface ChatMessageView {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export interface ConversationView {
  id: string;
  title: string;
  messages: ChatMessageView[];
  updatedAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

export interface AnalysisView {
  title: string;
  description: string;
  category: string;
  urgency: 'low' | 'normal' | 'high' | 'emergency';
  safetyRisk: string | null;
  unitMention: string | null;
  propertyMention: string | null;
  symptoms: string[];
  missingInfo: string[];
}

export interface PropertyView {
  id: string;
  name: string;
  address: string;
  city: string;
}

export interface UnitView {
  id: string;
  unitNumber: string;
  status: string;
}

export interface TenantView {
  fullName: string;
  phone: string;
}

export interface MaintenanceView {
  id: string;
  reference: string;
  propertyId: string;
  unitId: string | null;
  title: string;
  description: string;
  category: string;
  urgency: string;
  status: string;
  assignedTo: string | null;
  createdAt: string;
}

export interface ApprovalView {
  id: string;
  type: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface StaffRecView {
  staff: { id: string; fullName: string; role: string; phone: string; available: boolean };
  reason: string;
  score: number;
}

export interface TurnResult {
  conversation: ConversationView;
  assistantText: string;
  engine: 'meta' | 'local';
  model: string;
  events: string[];
  analysis: AnalysisView | null;
  property: PropertyView | null;
  unit: UnitView | null;
  tenant: TenantView | null;
  history: MaintenanceView[];
  duplicateOf: MaintenanceView | null;
  approval: ApprovalView | null;
  recommendations: StaffRecView[];
  tenantDraft: string | null;
  needsClarification: string | null;
  safetyGuidance: string | null;
}

export interface StatusView {
  engine: 'meta' | 'local';
  model: string;
  metaConfigured: boolean;
  orgId: string;
  pendingApprovals: number;
}

export interface AuditView {
  id: string;
  action: string;
  detail: string;
  createdAt: string;
}

interface Envelope<T> {
  success: boolean;
  message: string;
  data: T;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = (await res.json().catch(() => ({}))) as Envelope<T> & { message: string };
  if (!res.ok || body.success === false) {
    throw new Error(body.message || `Request failed (${res.status})`);
  }
  return body.data;
}

export const api = {
  status: () => request<StatusView>('/api/copilot/status'),
  conversations: () => request<ConversationSummary[]>('/api/copilot/conversations'),
  conversation: (id: string) =>
    request<{ conversation: ConversationView; approvals: ApprovalView[] }>(
      `/api/copilot/conversations/${id}`
    ),
  send: (content: string, conversationId?: string, imageDataUrl?: string) =>
    request<TurnResult>('/api/copilot/messages', {
      method: 'POST',
      body: JSON.stringify({ content, conversationId, imageDataUrl }),
    }),
  decide: (approvalId: string, decision: 'approve' | 'reject') =>
    request<{ approval: ApprovalView; created: MaintenanceView | null }>(
      `/api/copilot/approvals/${approvalId}`,
      { method: 'POST', body: JSON.stringify({ decision }) }
    ),
  maintenance: () => request<MaintenanceView[]>('/api/copilot/maintenance'),
  activity: (conversationId?: string) =>
    request<AuditView[]>(
      `/api/copilot/activity${conversationId ? `?conversationId=${conversationId}` : ''}`
    ),
};

export const DEMO_PROMPTS = [
  'There is a leaking pipe in B201. Water is spreading across the kitchen floor.',
  'The main entrance lock is broken and residents cannot secure the building.',
  'There are sparks coming from the electrical panel in C301.',
  'Summarize all unresolved maintenance issues in Sunrise Apartments.',
  'The water pump is not working.',
];
