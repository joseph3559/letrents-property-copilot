// Agent orchestrator: sense → plan → act → verify.
// The LLM performs language understanding (intent, extraction, drafting) via
// structured JSON; every data read/write goes through validated adapter tools.
// Tool-call iterations are bounded by AGENT_MAX_ITERATIONS.

import { z } from 'zod';
import { DemoStore } from '../store';
import { AIProvider, ProviderError } from '../providers/types';
import { LocalProvider } from '../providers/local';
import { PropertyManagementAdapter, NotFoundError } from '../adapters/types';
import {
  complaintAnalysisSchema,
  ComplaintAnalysis,
  extractJsonObject,
  intentSchema,
  tenantDraftSchema,
} from './schemas';
import { assessSafety } from './safety';
import { createToolRegistry, ToolRegistry } from './tools';
import { newId, nowIso } from '../lib/id';
import {
  ApprovalRequest,
  AuditEvent,
  Conversation,
  MaintenanceRequest,
  Property,
  Tenant,
  Unit,
  UserContext,
} from '../types';
import { StaffRecommendation } from '../adapters/types';

export interface AgentTurnResult {
  conversation: Conversation;
  assistantText: string;
  engine: 'meta' | 'local';
  model: string;
  events: string[];
  analysis: ComplaintAnalysis | null;
  property: Property | null;
  unit: Unit | null;
  tenant: Tenant | null;
  history: MaintenanceRequest[];
  duplicateOf: MaintenanceRequest | null;
  approval: ApprovalRequest | null;
  recommendations: StaffRecommendation[];
  tenantDraft: string | null;
  needsClarification: string | null;
  safetyGuidance: string | null;
}

interface AgentDeps {
  store: DemoStore;
  adapter: PropertyManagementAdapter;
  primary: AIProvider | null;
  maxIterations: number;
}

const EXTRACT_SYSTEM = `[TASK: EXTRACT_COMPLAINT]
You are a property-maintenance intake assistant for LETRENTS, a Kenyan property management platform.
Read the tenant/manager complaint and return ONLY a JSON object with this exact shape:
{
  "isComplaint": boolean,
  "title": "short title, 4-200 chars",
  "description": "faithful restatement, 10-4000 chars",
  "category": one of plumbing|electrical|security|structural|water_supply|cleaning|hvac|general|other,
  "urgency": one of low|normal|high|emergency,
  "safetyRisk": "risk description or null",
  "unitMention": "unit/apartment number mentioned (e.g. B201) or null",
  "propertyMention": "property name mentioned or null",
  "symptoms": ["observed symptom", ...],
  "missingInfo": ["what is missing, e.g. unit number", ...]
}
Rules:
- Never invent property names, unit numbers, or tenant names. Use null when not stated.
- "emergency" only for fire, sparks/electrical danger, gas, flooding, sewage overflow, or structural collapse risk.
- Base urgency on the reported facts, not worst-case speculation.`;

const INTENT_SYSTEM = `[TASK: CLASSIFY_INTENT]
Classify the user message. Return ONLY JSON: {"intent": "complaint"|"question"|"greeting"}.
- complaint: reports a fault, damage, outage, leak, breakage, or asks to log/fix something.
- question: asks about properties, units, tenants, maintenance status, summaries, counts.
- greeting: hello/thanks/goodbye with no operational content.`;

const TENANT_DRAFT_SYSTEM = `[TASK: DRAFT_TENANT_RESPONSE]
You draft a short, professional tenant update for a Kenyan property manager.
Return ONLY JSON: {"message": "..."}.
Rules: warm greeting, reference the unit + issue, state the true status provided, no promises about dates, no invented names.`;

async function completeJson<T>(
  provider: AIProvider,
  systemPrompt: string,
  payload: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  imageDataUrl?: string
): Promise<T> {
  const result = await provider.complete({
    systemPrompt,
    userPrompt: `Context and instructions above.\n---\n${payload}`,
    jsonMode: true,
    maxTokens: 4000,
    temperature: 0.2,
    imageDataUrl,
  });
  const raw = extractJsonObject(result.text);
  return schema.parse(raw);
}

export class CopilotAgent {
  private readonly local = new LocalProvider();
  private readonly tools: ToolRegistry;
  private toolIterations = 0;

  constructor(private readonly deps: AgentDeps) {
    this.tools = createToolRegistry(deps.adapter);
  }

  /** Execute a registry tool with validated input and a bounded iteration budget. */
  private async runTool<T>(ctx: UserContext, name: string, input: unknown): Promise<T> {
    const tool = this.tools[name];
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    this.toolIterations += 1;
    if (this.toolIterations > this.deps.maxIterations) {
      throw new Error('Agent tool-iteration budget exceeded for this turn');
    }
    const parsed = tool.inputSchema.parse(input);
    return (await tool.execute(ctx, parsed)) as T;
  }

  private engine(): { provider: AIProvider; engine: 'meta' | 'local' } {
    if (this.deps.primary) return { provider: this.deps.primary, engine: 'meta' };
    return { provider: this.local, engine: 'local' };
  }

  private async audit(
    ctx: UserContext,
    conversationId: string | null,
    action: string,
    detail: string,
    entityType: string | null = null,
    entityId: string | null = null
  ): Promise<void> {
    const event: AuditEvent = {
      id: newId('audit'),
      orgId: ctx.orgId,
      conversationId,
      actor: ctx.userId,
      action,
      entityType,
      entityId,
      detail: detail.slice(0, 1000),
      createdAt: nowIso(),
    };
    await this.deps.store.update((db) => {
      db.auditEvents.push(event);
    });
  }

  async handleMessage(
    ctx: UserContext,
    content: string,
    conversationId: string | undefined,
    imageDataUrl?: string
  ): Promise<AgentTurnResult> {
    const { provider, engine } = this.engine();
    const events: string[] = [];
    this.toolIterations = 0;

    // 1. Load or create conversation.
    const conversation = await this.deps.store.update((db) => {
      let convo = conversationId
        ? db.conversations.find((c) => c.id === conversationId && c.orgId === ctx.orgId) ?? null
        : null;
      if (!convo) {
        convo = {
          id: newId('convo'),
          orgId: ctx.orgId,
          userId: ctx.userId,
          title: content.slice(0, 60),
          messages: [],
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        db.conversations.push(convo);
      }
      convo.messages.push({ id: newId('msg'), role: 'user', content, createdAt: nowIso() });
      convo.updatedAt = nowIso();
      return convo;
    });

    // 2. Classify intent (with local fallback if Meta fails mid-turn).
    let activeProvider = provider;
    let activeEngine = engine;
    const getEngineState = (): { engine: 'meta' | 'local'; model: string } => ({
      engine: activeEngine,
      model: activeProvider.model,
    });
    const runWithFallback = async <T>(fn: (p: AIProvider) => Promise<T>): Promise<T> => {
      try {
        return await fn(activeProvider);
      } catch (error) {
        if (activeProvider !== this.local) {
          activeProvider = this.local;
          activeEngine = 'local';
          events.push(
            `Meta provider unavailable (${error instanceof ProviderError ? error.message : 'error'}); continued with local fallback`
          );
          return await fn(activeProvider);
        }
        throw error;
      }
    };

    const { intent } = await runWithFallback((p) =>
      completeJson(p, INTENT_SYSTEM, content, intentSchema)
    );
    events.push(`Intent classified: ${intent} (${activeEngine})`);

    if (intent === 'greeting') {
      const text =
        "Hello! I'm the LETRENTS Property Copilot. Describe a maintenance complaint (for example, “There is a leaking pipe in B201”) or ask about your properties, and I'll pull the records and prepare the next steps.";
      await this.appendAssistant(conversation.id, text);
      await this.audit(ctx, conversation.id, 'conversation.greeting', 'Greeting answered');
      return this.emptyResult(conversation, text, activeEngine, activeProvider.model, events);
    }

    if (intent === 'question') {
      return await this.answerQuestion(ctx, conversation, content, events, getEngineState);
    }

    return await this.handleComplaint(
      ctx, conversation, content, imageDataUrl, runWithFallback, events, getEngineState
    );
  }

  private emptyResult(
    conversation: Conversation,
    assistantText: string,
    engine: 'meta' | 'local',
    model: string,
    events: string[]
  ): AgentTurnResult {
    return {
      conversation,
      assistantText,
      engine,
      model,
      events,
      analysis: null,
      property: null,
      unit: null,
      tenant: null,
      history: [],
      duplicateOf: null,
      approval: null,
      recommendations: [],
      tenantDraft: null,
      needsClarification: null,
      safetyGuidance: null,
    };
  }

  private async appendAssistant(conversationId: string, text: string): Promise<Conversation> {
    return await this.deps.store.update((db) => {
      const convo = db.conversations.find((c) => c.id === conversationId);
      if (!convo) throw new Error('Conversation missing');
      convo.messages.push({ id: newId('msg'), role: 'assistant', content: text, createdAt: nowIso() });
      convo.updatedAt = nowIso();
      return convo;
    });
  }

  // ---- Complaint workflow ----

  private async handleComplaint(
    ctx: UserContext,
    conversation: Conversation,
    content: string,
    imageDataUrl: string | undefined,
    runWithFallback: <T>(fn: (p: AIProvider) => Promise<T>) => Promise<T>,
    events: string[],
    getEngineState: () => { engine: 'meta' | 'local'; model: string }
  ): Promise<AgentTurnResult> {
    const stated = (): { engine: 'meta' | 'local'; model: string } => getEngineState();

    const analysis = await runWithFallback((p) =>
      completeJson(p, EXTRACT_SYSTEM, content, complaintAnalysisSchema, imageDataUrl)
    );
    events.push(`Complaint analyzed: ${analysis.category} / ${analysis.urgency}`);

    if (!analysis.isComplaint) {
      const text = 'I could not identify a maintenance issue in that message. Could you describe the problem, the property, and the unit number?';
      const updated = await this.appendAssistant(conversation.id, text);
      return {
        ...this.emptyResult(updated, text, stated().engine, stated().model, events),
        analysis,
        needsClarification: text,
      };
    }

    // Safety override (deterministic, always applied).
    const safety = assessSafety(content, analysis.urgency, analysis.safetyRisk);
    analysis.urgency = safety.urgency;
    if (safety.safetyRisk) analysis.safetyRisk = safety.safetyRisk;
    if (safety.escalate) events.push(`Safety escalation: ${safety.safetyRisk}`);

    // Resolve property with a single portfolio lookup, then narrow in memory:
    // explicit mention → message-text inference → single-property default →
    // unit inference → clarify.
    const allProperties = await this.runTool<Property[]>(ctx, 'search_properties', { query: '' });
    let property: Property | null = null;
    let unit: Unit | null = null;
    if (analysis.propertyMention) {
      const needle = analysis.propertyMention.toLowerCase();
      const matches = allProperties.filter(
        (p) => p.name.toLowerCase().includes(needle) || p.address.toLowerCase().includes(needle)
      );
      if (matches.length === 1) property = matches[0];
      else if (matches.length > 1) {
        const text = `I found several properties matching "${analysis.propertyMention}": ${matches.map((m) => m.name).join(', ')}. Which one is affected?`;
        const updated = await this.appendAssistant(conversation.id, text);
        return { ...this.emptyResult(updated, text, stated().engine, stated().model, events), analysis, needsClarification: text, safetyGuidance: safety.guidance };
      }
    }
    if (!property) {
      const lowerContent = content.toLowerCase();
      const direct = allProperties.filter(
        (c) =>
          lowerContent.includes(c.name.toLowerCase()) ||
          lowerContent.includes(c.name.toLowerCase().split(' ')[0])
      );
      if (direct.length === 1) {
        property = direct[0];
        events.push(`Property inferred from message text: ${property.name}`);
      }
    }
    if (!property && allProperties.length === 1) property = allProperties[0];
    if (!property && analysis.unitMention) {
      // Try to locate the unit across properties to infer the property.
      for (const candidate of allProperties) {
        const units = await this.runTool<Unit[]>(ctx, 'find_units', { propertyId: candidate.id, unitNumberQuery: analysis.unitMention });
        if (units.length === 1) {
          property = candidate;
          unit = units[0];
          events.push(`Unit inferred from message text: ${unit.unitNumber}`);
          break;
        }
      }
    }
    if (!property) {
      const text = `Which property is affected? I manage: ${allProperties.map((p) => p.name).join(', ')}.`;
      const updated = await this.appendAssistant(conversation.id, text);
      await this.audit(ctx, conversation.id, 'complaint.clarification', 'Asked for property clarification');
      return { ...this.emptyResult(updated, text, stated().engine, stated().model, events), analysis, needsClarification: text, safetyGuidance: safety.guidance };
    }
    events.push(`Property resolved: ${property.name}`);

    // Resolve unit (optional for common-area issues); reuse the inference hit.
    if (!unit && analysis.unitMention) {
      const matches = await this.runTool<Unit[]>(ctx, 'find_units', { propertyId: property.id, unitNumberQuery: analysis.unitMention });
      if (matches.length === 1) {
        unit = matches[0];
        events.push(`Unit resolved: ${unit.unitNumber}`);
      } else if (matches.length > 1) {
        const text = `I found several units matching "${analysis.unitMention}" in ${property.name}. Could you confirm the exact unit number?`;
        const updated = await this.appendAssistant(conversation.id, text);
        return { ...this.emptyResult(updated, text, stated().engine, stated().model, events), analysis, property, needsClarification: text, safetyGuidance: safety.guidance };
      } else {
        events.push(`Unit mention "${analysis.unitMention}" did not match any unit in ${property.name}`);
      }
    }

    const tenant = unit ? await this.runTool<Tenant | null>(ctx, 'get_tenant_details', { unitId: unit.id }) : null;

    // Maintenance history.
    const history = await this.runTool<MaintenanceRequest[]>(ctx, 'get_maintenance_history', {
      propertyId: property.id,
      unitId: unit?.id,
      limit: 10,
    });
    events.push(`Maintenance history retrieved: ${history.length} record(s)`);

    // Duplicate check.
    const duplicateOf = await this.runTool<MaintenanceRequest | null>(ctx, 'check_duplicate_request', {
      propertyId: property.id,
      unitId: unit?.id ?? null,
      category: analysis.category,
      title: analysis.title,
      description: analysis.description,
    });
    if (duplicateOf) {
      const text = `This looks like a duplicate of ${duplicateOf.reference} (“${duplicateOf.title}”, status: ${duplicateOf.status}). I have not created a new request. You can still create one from the dashboard if this is a separate issue.`;
      const updated = await this.appendAssistant(conversation.id, text);
      await this.audit(ctx, conversation.id, 'maintenance.duplicate_blocked', `Duplicate of ${duplicateOf.reference} blocked`, 'maintenance_request', duplicateOf.id);
      events.push(`Duplicate detected: ${duplicateOf.reference}`);
      return {
        ...this.emptyResult(updated, text, stated().engine, stated().model, events),
        analysis, property, unit, tenant, history, duplicateOf, safetyGuidance: safety.guidance,
      };
    }

    // Staff recommendations.
    const recommendations = await this.runTool<StaffRecommendation[]>(ctx, 'recommend_staff', { propertyId: property.id, category: analysis.category });
    events.push(`Staff recommendations prepared: ${recommendations.length}`);

    // Tenant response draft.
    const draft = await runWithFallback((p) =>
      completeJson(
        p,
        TENANT_DRAFT_SYSTEM,
        `Issue: ${analysis.title}. Unit: ${unit ? `${unit.unitNumber} (${property.name})` : `common area (${property.name})`}. Status: maintenance request prepared, awaiting manager approval. Urgency: ${analysis.urgency}.`,
        tenantDraftSchema
      )
    );

    // Create approval-gated proposal (NOT the maintenance record itself).
    const approval = await this.deps.store.update((db) => {
      const item: ApprovalRequest = {
        id: newId('apr'),
        orgId: ctx.orgId,
        conversationId: conversation.id,
        type: 'maintenance_request',
        status: 'pending',
        title: `Create maintenance request: ${analysis.title}`,
        summary: `${analysis.category.replace(/_/g, ' ')} · ${analysis.urgency} · ${property.name}${unit ? ` · Unit ${unit.unitNumber}` : ' · common area'}`,
        payload: {
          propertyId: property.id,
          unitId: unit?.id ?? null,
          title: analysis.title,
          description: analysis.description,
          category: analysis.category,
          urgency: analysis.urgency,
          safetyRisk: analysis.safetyRisk,
          recommendedStaffId: recommendations[0]?.staff.id ?? null,
          tenantDraft: draft.message,
        },
        decidedBy: null,
        decidedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      db.approvals.push(item);
      return item;
    });
    await this.audit(ctx, conversation.id, 'maintenance.proposed', `Proposed "${analysis.title}" for ${property.name}`, 'approval', approval.id);
    events.push(`Approval requested: ${approval.id}`);

    const lines = [
      `I've analyzed the complaint as a ${analysis.category.replace(/_/g, ' ')} issue (${analysis.urgency} urgency) at ${property.name}${unit ? `, Unit ${unit.unitNumber}` : ''}.`,
      history.length > 0
        ? `I found ${history.length} related past record(s), latest: “${history[0].title}” (${history[0].status}).`
        : 'No prior maintenance history found for this location.',
    ];
    if (safety.guidance) lines.push(`Safety notice: ${safety.guidance}`);
    if (recommendations[0]) {
      lines.push(`Recommended: ${recommendations[0].staff.fullName} (${recommendations[0].staff.role}) — ${recommendations[0].reason}.`);
    }
    lines.push('I prepared the maintenance request and tenant reply below. Review and approve to create the record.');
    const text = lines.join('\n\n');
    const updated = await this.appendAssistant(conversation.id, text);

    return {
      conversation: updated,
      assistantText: text,
      engine: stated().engine,
      model: stated().model,
      events,
      analysis,
      property,
      unit,
      tenant,
      history,
      duplicateOf: null,
      approval,
      recommendations,
      tenantDraft: draft.message,
      needsClarification: null,
      safetyGuidance: safety.guidance,
    };
  }

  // ---- Property intelligence questions ----

  private async answerQuestion(
    ctx: UserContext,
    conversation: Conversation,
    content: string,
    events: string[],
    getEngineState: () => { engine: 'meta' | 'local'; model: string }
  ): Promise<AgentTurnResult> {
    const stated = getEngineState();
    const lower = content.toLowerCase();
    const properties = await this.runTool<Property[]>(ctx, 'search_properties', { query: '' });
    // Narrow to a mentioned property when possible.
    let scoped = properties;
    const mentioned = properties.filter((p) => lower.includes(p.name.toLowerCase().split(' ')[0]));
    if (mentioned.length === 1) scoped = mentioned;

    const sections: string[] = [];
    let totalOpen = 0;
    for (const property of scoped) {
      const pending = await this.runTool<MaintenanceRequest[]>(ctx, 'get_pending_maintenance', { propertyId: property.id });
      totalOpen += pending.length;
      const summary = await this.runTool<{ occupiedUnits: number; totalUnits: number }>(ctx, 'get_property_summary', { propertyId: property.id });
      const top = pending.slice(0, 8).map((r) => `• ${r.reference} — ${r.title} [${r.category}/${r.urgency}/${r.status}]${r.unitId ? '' : ' (common area)'}`).join('\n');
      sections.push(
        `${property.name} (${summary.occupiedUnits}/${summary.totalUnits} units occupied): ${pending.length} open maintenance item(s).\n${top || '• No open items.'}`
      );
    }
    events.push(`Property data retrieved for ${scoped.length} propertie(s); ${totalOpen} open item(s)`);

    const text =
      scoped.length === 0
        ? 'No properties are available in this demo organization.'
        : `Here is what I found in your records:\n\n${sections.join('\n\n')}\n\nPrioritize emergencies first, then high-urgency items. Tell me a unit or reference (e.g. MNT-1002) to drill into a specific record.`;

    const updated = await this.appendAssistant(conversation.id, text);
    await this.audit(ctx, conversation.id, 'question.answered', `Answered property question (${totalOpen} open items)`);
    return {
      ...this.emptyResult(updated, text, stated.engine, stated.model, events),
    };
  }

  // ---- Approval execution ----

  async decideApproval(
    ctx: UserContext,
    approvalId: string,
    decision: 'approve' | 'reject',
    note?: string
  ): Promise<{ approval: ApprovalRequest; created: MaintenanceRequest | null }> {
    const db = await this.deps.store.load();
    const approval = db.approvals.find((a) => a.id === approvalId && a.orgId === ctx.orgId);
    if (!approval) throw new NotFoundError('Approval request not found');
    if (approval.status !== 'pending') {
      throw new Error(`This request was already ${approval.status}`);
    }

    if (decision === 'reject') {
      const updated = await this.deps.store.update((store) => {
        const item = store.approvals.find((a) => a.id === approvalId);
        if (!item) throw new NotFoundError('Approval request not found');
        item.status = 'rejected';
        item.decidedBy = ctx.userId;
        item.decidedAt = nowIso();
        item.updatedAt = nowIso();
        return { ...item };
      });
      await this.audit(ctx, approval.conversationId, 'approval.rejected', `Rejected: ${approval.title}${note ? ` — ${note}` : ''}`, 'approval', approval.id);
      return { approval: updated, created: null };
    }

    // Approve → revalidate payload → execute through the adapter → record result.
    const payload = approval.payload as {
      propertyId: string; unitId: string | null; title: string; description: string;
      category: 'plumbing' | 'electrical' | 'security' | 'structural' | 'water_supply' | 'cleaning' | 'hvac' | 'general' | 'other';
      urgency: 'low' | 'normal' | 'high' | 'emergency'; safetyRisk: string | null;
      recommendedStaffId: string | null;
    };
    try {
      const created = await this.deps.adapter.createMaintenanceRequest(ctx, {
        propertyId: String(payload.propertyId),
        unitId: payload.unitId,
        title: String(payload.title),
        description: String(payload.description),
        category: payload.category,
        urgency: payload.urgency,
        safetyRisk: payload.safetyRisk ?? null,
      });
      let finalRecord = created;
      if (payload.recommendedStaffId) {
        try {
          finalRecord = await this.deps.adapter.updateMaintenanceRequest(ctx, created.id, {
            assignedTo: payload.recommendedStaffId,
            status: created.urgency === 'emergency' ? 'in_progress' : 'approved',
          });
        } catch {
          // Assignment is best-effort; the request itself is created.
        }
      } else if (created.urgency === 'emergency') {
        finalRecord = await this.deps.adapter.updateMaintenanceRequest(ctx, created.id, { status: 'approved' });
      }
      const updated = await this.deps.store.update((store) => {
        const item = store.approvals.find((a) => a.id === approvalId);
        if (!item) throw new NotFoundError('Approval request not found');
        item.status = 'executed';
        item.decidedBy = ctx.userId;
        item.decidedAt = nowIso();
        item.updatedAt = nowIso();
        item.payload = { ...item.payload, createdRequestId: finalRecord.id, createdReference: finalRecord.reference };
        return { ...item };
      });
      await this.audit(ctx, approval.conversationId, 'approval.executed', `Approved and created ${finalRecord.reference}`, 'maintenance_request', finalRecord.id);
      return { approval: updated, created: finalRecord };
    } catch (error) {
      await this.deps.store.update((store) => {
        const item = store.approvals.find((a) => a.id === approvalId);
        if (item) {
          item.status = 'failed';
          item.decidedBy = ctx.userId;
          item.decidedAt = nowIso();
          item.updatedAt = nowIso();
        }
      });
      await this.audit(ctx, approval.conversationId, 'approval.failed', `Approval execution failed: ${(error as Error)?.message ?? 'unknown'}`, 'approval', approval.id);
      throw error;
    }
  }
}
