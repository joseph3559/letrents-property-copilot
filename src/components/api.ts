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
  landlord?: string;
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

export interface SegmentView {
  phrase: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
  confidence: number | null;
}

export interface PortfolioUnitView extends UnitView {
  tenant: TenantView | null;
}

export interface PortfolioEntry {
  property: PropertyView & { landlord: string };
  totalUnits: number;
  occupiedUnits: number;
  pendingMaintenance: number;
  inProgressMaintenance: number;
  units: PortfolioUnitView[];
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
  segments: SegmentView[];
  assumedProperty: boolean;
  clarifyOptions: Array<{ id: string; label: string }> | null;
  suggestions: string[];
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

/**
 * Client-side request budgets. Every request aborts at its budget so a
 * stalled network or provider surfaces an error instead of spinning forever.
 */
export const READ_TIMEOUT_MS = 25000;
/** Sends may wait out one Meta timeout (90s) plus fallback/SAM work. */
export const SEND_TIMEOUT_MS = 150000;
/** Voice uploads + server-side transcription (60s) + headroom. */
export const TRANSCRIBE_TIMEOUT_MS = 90000;

/** AbortSignal that fires after `ms`, with a cancel for the timer. */
export function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

async function request<T>(path: string, init?: RequestInit, timeoutMs: number = READ_TIMEOUT_MS): Promise<T> {
  const { signal, cancel } = withTimeout(timeoutMs);
  try {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
      signal,
    });
    const body = (await res.json().catch(() => ({}))) as Envelope<T> & { message: string };
    if (!res.ok || body.success === false) {
      throw new Error(body.message || `Request failed (${res.status})`);
    }
    return body.data;
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(
        `Request timed out after ${Math.round(timeoutMs / 1000)}s — please check your connection and retry.`
      );
    }
    throw error;
  } finally {
    cancel();
  }
}

export const api = {
  status: () => request<StatusView>('/api/copilot/status'),
  conversations: () => request<ConversationSummary[]>('/api/copilot/conversations'),
  conversation: (id: string) =>
    request<{ conversation: ConversationView; approvals: ApprovalView[] }>(
      `/api/copilot/conversations/${id}`
    ),
  send: (content: string, conversationId?: string, imageDataUrl?: string) =>
    request<TurnResult>(
      '/api/copilot/messages',
      {
        method: 'POST',
        body: JSON.stringify({ content, conversationId, imageDataUrl }),
      },
      SEND_TIMEOUT_MS
    ),
  decide: (approvalId: string, decision: 'approve' | 'reject', note?: string) =>
    request<{ approval: ApprovalView; created: MaintenanceView | null }>(
      `/api/copilot/approvals/${approvalId}`,
      { method: 'POST', body: JSON.stringify({ decision, ...(note ? { note } : {}) }) }
    ),
  maintenance: () => request<MaintenanceView[]>('/api/copilot/maintenance'),
  portfolio: () => request<PortfolioEntry[]>('/api/copilot/portfolio'),
  reset: () => request<{ reset: boolean }>('/api/copilot/reset', { method: 'POST' }),
  activity: (conversationId?: string) =>
    request<AuditView[]>(
      `/api/copilot/activity${conversationId ? `?conversationId=${conversationId}` : ''}`
    ),
};

export interface DemoScenario {
  /** Short label shown on the card. */
  label: string;
  /** Full message sent to the Copilot. */
  text: string;
  /** Optional bundled photo (public path) attached with the message. */
  image?: string;
}

export const DEMO_PROMPTS: DemoScenario[] = [
  {
    label: 'Leaking pipe · B201',
    text: 'There is a leaking pipe in B201. Water is spreading across the kitchen floor.',
  },
  {
    label: 'Tenant message · C301',
    text: 'Hi, kuna leakage kwa kitchen sink C301, maji inasambaa kwa floor. Tafadhali saidia!',
  },
  {
    label: 'Broken entrance lock',
    text: 'The main entrance lock is broken and residents cannot secure the building.',
  },
  {
    label: 'Electrical emergency · C301',
    text: 'There are sparks coming from the electrical panel in C301.',
  },
  {
    label: 'Damage photo + SAM 3.1',
    text: 'Tenant in C301 sent this photo of the pipe under their kitchen sink. It started dripping last night.',
    image: '/demo/leak-c301.jpg',
  },
  {
    label: 'Morning briefing',
    text: 'Give me my morning briefing: what is open and urgent across my properties?',
  },
];
