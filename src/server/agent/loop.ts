// Agent orchestrator: sense → plan → act → verify.
// The LLM performs language understanding (intent, extraction, drafting) via
// structured JSON; every data read/write goes through validated adapter tools.
// Tool-call iterations are bounded by AGENT_MAX_ITERATIONS.

import { z } from 'zod';
import { DemoStoreLike } from '../store';
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
import { phrasesForCategory, segmentImage, SegmentBox } from '../providers/sam';
import { CopilotConfig } from '../config';
import { newId, nowIso } from '../lib/id';
import {
  ApprovalRequest,
  AuditEvent,
  Conversation,
  MaintenanceRequest,
  Property,
  StaffMember,
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
  segments: SegmentBox[];
  /** True when the property was assumed from earlier conversation context. */
  assumedProperty: boolean;
  /** One-tap options for clarification questions (properties or units). */
  clarifyOptions: Array<{ id: string; label: string }> | null;
  /** Contextual follow-up messages (ChatGPT-style suggestion chips). */
  suggestions: string[];
}

interface AgentDeps {
  store: DemoStoreLike;
  adapter: PropertyManagementAdapter;
  primary: AIProvider | null;
  maxIterations: number;
  config: CopilotConfig;
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
- Doors, windows, frames, and hinges are structural; locks, gates, and entry security are security.
- If a photo is attached, mine it: visible damage goes in symptoms, and any unit/door number visible in the photo becomes unitMention.
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

const QUESTION_UNIT_PATTERNS = [
  /\bunit\s+([a-z]?\d{1,3}[a-z]?)\b/i,
  /\bapartment\s+([a-z]?\d{1,3}[a-z]?)\b/i,
  /\bflat\s+([a-z]?\d{1,3}[a-z]?)\b/i,
  /\b([a-z]\d{1,4}[a-z]?)\b/i,
];

/** Best-effort unit mention for drill-down questions (never throws). */
function extractUnitMention(text: string): string | null {
  for (const pattern of QUESTION_UNIT_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].toUpperCase();
  }
  return null;
}

/** Extraction payload: marks photo attachment so the model mines the image. */
export function buildExtractionPayload(content: string, hasImage: boolean): string {
  if (!hasImage) return content;
  return (
    '(A maintenance photo is attached. Describe visible damage in symptoms, ' +
    'and report any unit/door number visible in the photo.)\n---\n' +
    content
  );
}

/**
 * Bounded in-memory photo cache: conversation id → last attached photo.
 * Photos are never written to the JSON store; this lets a clarification
 * follow-up (which rarely re-attaches the photo) reuse the original image
 * for vision analysis and SAM segmentation. Oldest entries evicted first.
 */
const MAX_CACHED_CONVERSATION_IMAGES = 10;
export const conversationImageCache = new Map<string, string>();

export function cacheConversationImage(conversationId: string, imageDataUrl: string): void {
  conversationImageCache.delete(conversationId);
  conversationImageCache.set(conversationId, imageDataUrl);
  while (conversationImageCache.size > MAX_CACHED_CONVERSATION_IMAGES) {
    const oldest = conversationImageCache.keys().next();
    if (oldest.done) break;
    conversationImageCache.delete(oldest.value);
  }
}

/**
 * Merge photo-informed fields from a prior analysis into a fresh text-only
 * one. Location mentions always come from the fresh pass (the slot answer is
 * new information); everything the photo taught us survives.
 */
export function mergeAnalyses(prior: ComplaintAnalysis, fresh: ComplaintAnalysis): ComplaintAnalysis {
  return {
    ...fresh,
    title: prior.title,
    description: prior.description,
    category: prior.category,
    urgency: prior.urgency,
    safetyRisk: prior.safetyRisk ?? fresh.safetyRisk,
    unitMention: fresh.unitMention ?? prior.unitMention,
    propertyMention: fresh.propertyMention ?? prior.propertyMention,
    symptoms: prior.symptoms.length > 0 ? prior.symptoms : fresh.symptoms,
  };
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

    // Cache attached photos (memory only, never persisted) for clarification follow-ups.
    if (imageDataUrl) cacheConversationImage(conversation.id, imageDataUrl);

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

    // Multi-turn slot filling: if the previous turn asked for a missing
    // property/unit, a slot answer continues that complaint instead of
    // starting fresh. Anything else closes the pending state.
    if (conversation.pendingComplaint) {
      const pending = conversation.pendingComplaint;
      const priorAnalysis = conversation.pendingAnalysis ?? null;
      await this.setPending(conversation.id, null);
      if (await this.looksLikeSlotAnswer(ctx, content)) {
        const combined =
          `Original complaint: ${pending}\nAdditional info from manager: ${content}`.slice(0, 2000);
        events.push('Continuing the pending complaint with your answer');
        // The follow-up rarely re-attaches the photo: reuse the cached
        // original for vision + SAM, else merge the stored photo-informed
        // analysis into the fresh text-only pass.
        const effectiveImage = imageDataUrl ?? conversationImageCache.get(conversation.id);
        return await this.handleComplaint(
          ctx, conversation, combined, effectiveImage, runWithFallback, events, getEngineState,
          effectiveImage ? null : priorAnalysis
        );
      }
      events.push('Previous clarification closed; handling as a new message');
    }

    const { intent } = await runWithFallback((p) =>
      completeJson(p, INTENT_SYSTEM, content, intentSchema)
    );
    events.push(`Intent classified: ${intent} (${activeEngine})`);

    if (intent === 'greeting') {
      const text =
        "Hello! I'm the LETRENTS Property Copilot. Describe a maintenance complaint (for example, “There is a leaking pipe in B201”) or ask about your properties, and I'll pull the records and prepare the next steps.";
      await this.appendAssistant(conversation.id, text);
      await this.audit(ctx, conversation.id, 'conversation.greeting', 'Greeting answered');
      return {
        ...this.emptyResult(conversation, text, activeEngine, activeProvider.model, events),
        suggestions: ['Morning briefing', 'Report a maintenance issue'],
      };
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
      segments: [],
      assumedProperty: false,
      clarifyOptions: null,
      suggestions: [],
    };
  }

  /** Routing pre-check: unit mention or property name in a follow-up message. */
  private async looksLikeSlotAnswer(ctx: UserContext, content: string): Promise<boolean> {
    if (extractUnitMention(content)) return true;
    // Direct routing lookup (the resumed flow itself uses registry tools).
    const properties = await this.deps.adapter.searchProperties(ctx, '');
    const lower = content.toLowerCase();
    return properties.some(
      (p) =>
        lower.includes(p.name.toLowerCase()) ||
        lower.includes(p.name.toLowerCase().split(' ')[0])
    );
  }

  private async setPending(
    conversationId: string,
    complaint: string | null,
    analysis: ComplaintAnalysis | null = null
  ): Promise<void> {
    await this.deps.store.update((db) => {
      const convo = db.conversations.find((c) => c.id === conversationId);
      if (convo) {
        convo.pendingComplaint = complaint;
        convo.pendingAnalysis = complaint ? analysis : null;
      }
    });
  }

  private async setLastProperty(conversationId: string, propertyId: string): Promise<void> {
    await this.deps.store.update((db) => {
      const convo = db.conversations.find((c) => c.id === conversationId);
      if (convo) convo.lastPropertyId = propertyId;
    });
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
    getEngineState: () => { engine: 'meta' | 'local'; model: string },
    priorAnalysis: ComplaintAnalysis | null = null
  ): Promise<AgentTurnResult> {
    const stated = (): { engine: 'meta' | 'local'; model: string } => getEngineState();

    const fresh = await runWithFallback((p) =>
      completeJson(
        p,
        EXTRACT_SYSTEM,
        buildExtractionPayload(content, Boolean(imageDataUrl)),
        complaintAnalysisSchema,
        imageDataUrl
      )
    );
    // No photo on this turn but the clarified complaint had one: keep what
    // the photo taught us, take the location answer from the fresh pass.
    const analysis = !imageDataUrl && priorAnalysis ? mergeAnalyses(priorAnalysis, fresh) : fresh;
    if (analysis !== fresh) events.push('Photo-informed analysis from your earlier message preserved');
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
        await this.setPending(conversation.id, content.slice(0, 1000), imageDataUrl ? analysis : null);
        const updated = await this.appendAssistant(conversation.id, text);
        return {
          ...this.emptyResult(updated, text, stated().engine, stated().model, events),
          analysis,
          needsClarification: text,
          safetyGuidance: safety.guidance,
          clarifyOptions: matches.map((p) => ({ id: p.id, label: p.name })),
        };
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
    // When inference already searched every property with zero hits anywhere,
    // the later unit-resolution step must not burn another tool call.
    let unitNowhere = false;
    if (!property && analysis.unitMention) {
      // Try to locate the unit across properties to infer the property.
      unitNowhere = true;
      for (const candidate of allProperties) {
        const units = await this.runTool<Unit[]>(ctx, 'find_units', { propertyId: candidate.id, unitNumberQuery: analysis.unitMention });
        if (units.length === 1) {
          property = candidate;
          unit = units[0];
          events.push(`Unit inferred from message text: ${unit.unitNumber}`);
          break;
        }
        if (units.length > 1) unitNowhere = false;
      }
    }
    // Sticky context: reuse the conversation's last property, stated openly.
    let assumedProperty = false;
    if (!property && conversation.lastPropertyId) {
      try {
        property = await this.runTool<Property>(ctx, 'get_property_details', { propertyId: conversation.lastPropertyId });
        assumedProperty = true;
        events.push(`No property stated — assuming ${property.name} from earlier in this conversation`);
      } catch {
        // Stale reference; fall through to clarification.
      }
    }
    if (!property) {
      const text = `Which property is affected? I manage: ${allProperties.map((p) => p.name).join(', ')}.`;
      await this.setPending(conversation.id, content.slice(0, 1000), imageDataUrl ? analysis : null);
      const updated = await this.appendAssistant(conversation.id, text);
      await this.audit(ctx, conversation.id, 'complaint.clarification', 'Asked for property clarification');
      return {
        ...this.emptyResult(updated, text, stated().engine, stated().model, events),
        analysis,
        needsClarification: text,
        safetyGuidance: safety.guidance,
        clarifyOptions: allProperties.map((p) => ({ id: p.id, label: p.name })),
      };
    }
    events.push(`Property resolved: ${property.name}`);
    await this.setLastProperty(conversation.id, property.id);

    // Resolve unit (optional for common-area issues); reuse the inference hit.
    if (!unit && analysis.unitMention && !unitNowhere) {
      const matches = await this.runTool<Unit[]>(ctx, 'find_units', { propertyId: property.id, unitNumberQuery: analysis.unitMention });
      if (matches.length === 1) {
        unit = matches[0];
        events.push(`Unit resolved: ${unit.unitNumber}`);
      } else if (matches.length > 1) {
        const text = `I found several units matching "${analysis.unitMention}" in ${property.name}. Could you confirm the exact unit number?`;
        await this.setPending(conversation.id, content.slice(0, 1000), imageDataUrl ? analysis : null);
        const updated = await this.appendAssistant(conversation.id, text);
        return {
          ...this.emptyResult(updated, text, stated().engine, stated().model, events),
          analysis,
          property,
          needsClarification: text,
          safetyGuidance: safety.guidance,
          clarifyOptions: matches.map((u) => ({ id: u.id, label: `Unit ${u.unitNumber}` })),
        };
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

    // SAM 3.1 damage segmentation (best-effort, Meta only, photo attached).
    let segments: SegmentBox[] = [];
    if (imageDataUrl && this.deps.primary) {
      const phrases = phrasesForCategory(analysis.category).slice(0, 2);
      if (phrases.length > 0) {
        try {
          const results = await Promise.all(
            phrases.map((phrase) => segmentImage(this.deps.config, imageDataUrl, phrase))
          );
          segments = results.flatMap((r) => r.boxes).slice(0, 10);
          events.push(
            segments.length > 0
              ? `SAM 3.1 located ${segments.length} damage region(s): ${[...new Set(segments.map((s) => s.phrase))].join(', ')}`
              : 'SAM 3.1 found no matching damage regions in the photo'
          );
        } catch (error) {
          events.push(
            `Damage segmentation unavailable (${error instanceof Error ? error.message : 'error'}); continuing without it`
          );
        }
      }
    }

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
    if (assumedProperty) {
      lines.splice(
        1,
        0,
        `Note: you didn't name a property, so I assumed ${property.name} (same as earlier in this chat) — tell me if this issue is elsewhere.`
      );
    }
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
      segments,
      assumedProperty,
      clarifyOptions: null,
      suggestions: ['Show open tickets', 'Report another issue'],
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
    // 1. Reference drill-down: "MNT-1005", "status of MNT-1002?"
    const refMatch = content.match(/\bMNT-(\d{1,6})\b/i);
    if (refMatch) {
      return await this.answerReference(ctx, conversation, refMatch[0].toUpperCase(), events, getEngineState);
    }

    // 2. Unit drill-down: "unit B201", "what is happening in C301?"
    const unitMention = extractUnitMention(content);
    if (unitMention) {
      const located = await this.locateUnit(ctx, unitMention);
      if (located) {
        return await this.answerUnit(ctx, conversation, located.property, located.unit, events, getEngineState);
      }
      const text = `I could not find unit "${unitMention}" in your properties. Check the unit number, or ask for a briefing to see everything open.`;
      const updated = await this.appendAssistant(conversation.id, text);
      const stated = getEngineState();
      return { ...this.emptyResult(updated, text, stated.engine, stated.model, events) };
    }

    // 3. Portfolio briefing.
    return await this.answerBriefing(ctx, conversation, content, events, getEngineState);
  }

  private async answerReference(
    ctx: UserContext,
    conversation: Conversation,
    reference: string,
    events: string[],
    getEngineState: () => { engine: 'meta' | 'local'; model: string }
  ): Promise<AgentTurnResult> {
    const stated = getEngineState();
    let record: MaintenanceRequest;
    try {
      record = await this.runTool<MaintenanceRequest>(ctx, 'get_maintenance_by_reference', { reference });
    } catch (error) {
      if (error instanceof NotFoundError) {
        const text = `I could not find ${reference} in your records. Check the reference, or ask for a briefing to see everything open.`;
        const updated = await this.appendAssistant(conversation.id, text);
        return { ...this.emptyResult(updated, text, stated.engine, stated.model, events) };
      }
      throw error;
    }
    const property = await this.runTool<Property>(ctx, 'get_property_details', { propertyId: record.propertyId });
    const unit = record.unitId
      ? await this.runTool<Unit>(ctx, 'get_unit_details', { unitId: record.unitId })
      : null;
    const tenant = unit ? await this.runTool<Tenant | null>(ctx, 'get_tenant_details', { unitId: unit.id }) : null;
    const staff = record.assignedTo
      ? await this.runTool<StaffMember | null>(ctx, 'get_staff_member', { staffId: record.assignedTo }).catch(() => null)
      : null;
    events.push(`Record retrieved: ${record.reference}`);

    const lines = [
      `${record.reference} — ${record.title}`,
      `Status: ${record.status.replace(/_/g, ' ')} · ${record.category.replace(/_/g, ' ')} · ${record.urgency} urgency`,
      `Location: ${property.name}${unit ? ` · Unit ${unit.unitNumber}` : ' · common area'}${tenant ? ` (${tenant.fullName})` : ''}`,
      `Assigned: ${staff ? `${staff.fullName} (${staff.role})` : 'unassigned'}`,
      `Reported: ${new Date(record.createdAt).toLocaleDateString()}`,
      '',
      `“${record.description}”`,
      '',
      'Paste another reference or unit to drill in, or ask for a briefing.',
    ];
    const text = lines.join('\n');
    const updated = await this.appendAssistant(conversation.id, text);
    await this.audit(ctx, conversation.id, 'question.record_lookup', `Looked up ${record.reference}`);
    return {
      ...this.emptyResult(updated, text, stated.engine, stated.model, events),
      suggestions: ['Morning briefing', 'Report another issue'],
    };
  }

  private async locateUnit(
    ctx: UserContext,
    unitMention: string
  ): Promise<{ property: Property; unit: Unit } | null> {
    const properties = await this.runTool<Property[]>(ctx, 'search_properties', { query: '' });
    for (const property of properties) {
      const units = await this.runTool<Unit[]>(ctx, 'find_units', {
        propertyId: property.id,
        unitNumberQuery: unitMention,
      });
      if (units.length === 1) return { property, unit: units[0] };
    }
    return null;
  }

  private async answerUnit(
    ctx: UserContext,
    conversation: Conversation,
    property: Property,
    unit: Unit,
    events: string[],
    getEngineState: () => { engine: 'meta' | 'local'; model: string }
  ): Promise<AgentTurnResult> {
    const stated = getEngineState();
    const tenant = await this.runTool<Tenant | null>(ctx, 'get_tenant_details', { unitId: unit.id });
    const history = await this.runTool<MaintenanceRequest[]>(ctx, 'get_maintenance_history', {
      propertyId: property.id,
      unitId: unit.id,
      limit: 10,
    });
    const open = history.filter((r) => !['resolved', 'rejected', 'cancelled'].includes(r.status));
    const closed = history.filter((r) => ['resolved', 'rejected', 'cancelled'].includes(r.status));
    events.push(`Unit retrieved: ${unit.unitNumber} (${open.length} open, ${closed.length} closed)`);

    const lines = [
      `Unit ${unit.unitNumber} · ${property.name}${tenant ? ` — ${tenant.fullName}` : ' — vacant'}`,
      '',
      open.length > 0
        ? `Open items (${open.length}):\n${open.map((r) => `• ${r.reference} — ${r.title} · ${r.urgency} · ${r.status.replace(/_/g, ' ')}`).join('\n')}`
        : 'No open items for this unit.',
    ];
    if (closed.length > 0) {
      lines.push('', `Recently closed (${closed.length}):\n${closed.slice(0, 3).map((r) => `• ${r.reference} — ${r.title}`).join('\n')}`);
    }
    lines.push('', 'Paste a reference (e.g. MNT-1002) for full details.');
    const text = lines.join('\n');
    const updated = await this.appendAssistant(conversation.id, text);
    await this.audit(ctx, conversation.id, 'question.unit_lookup', `Looked up unit ${unit.unitNumber}`);
    return {
      ...this.emptyResult(updated, text, stated.engine, stated.model, events),
      suggestions:
        open.length > 0
          ? [open[0].reference, 'Morning briefing']
          : ['Morning briefing', 'Report another issue'],
    };
  }

  private async answerBriefing(
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

    const rank: Record<string, number> = { emergency: 0, high: 1, normal: 2, low: 3 };
    const sections: string[] = [];
    const topRefs: string[] = [];
    let totalOpen = 0;
    let emergencies = 0;
    let highs = 0;
    for (const property of scoped) {
      const pending = await this.runTool<MaintenanceRequest[]>(ctx, 'get_pending_maintenance', { propertyId: property.id });
      const units = await this.runTool<Unit[]>(ctx, 'list_units', { propertyId: property.id });
      const unitName = new Map(units.map((u) => [u.id, u.unitNumber]));
      const occupied = units.filter((u) => u.status === 'occupied').length;
      pending.sort(
        (a, b) =>
          (rank[a.urgency] ?? 9) - (rank[b.urgency] ?? 9) ||
          (a.createdAt < b.createdAt ? 1 : -1)
      );
      totalOpen += pending.length;
      emergencies += pending.filter((r) => r.urgency === 'emergency').length;
      highs += pending.filter((r) => r.urgency === 'high').length;
      if (pending[0] && topRefs.length < 2) topRefs.push(pending[0].reference);
      const top = pending
        .slice(0, 8)
        .map(
          (r) =>
            `• ${r.reference} — ${r.title} · ${r.unitId && unitName.get(r.unitId) ? `Unit ${unitName.get(r.unitId)}` : 'common area'} · ${r.urgency} · ${r.status.replace(/_/g, ' ')}`
        )
        .join('\n');
      sections.push(
        `${property.name} (${occupied}/${units.length} units occupied): ${pending.length} open.\n${top || '• No open items.'}`
      );
    }
    events.push(
      `Briefing prepared: ${totalOpen} open across ${scoped.length} ${scoped.length === 1 ? 'property' : 'properties'}`
    );

    let text: string;
    if (scoped.length === 0) {
      text = 'No properties are available in this demo organization.';
    } else if (totalOpen === 0) {
      text = 'All clear — no open maintenance items in your records.';
    } else {
      const lead =
        emergencies > 0
          ? `${totalOpen} open (${emergencies} emergenc${emergencies === 1 ? 'y' : 'ies'}, ${highs} high). Start with the emergencies below.`
          : `${totalOpen} open (${highs} high). No emergencies — start at the top.`;
      text = `Here is your briefing:\n\n${lead}\n\n${sections.join('\n\n')}\n\nPaste a reference (e.g. MNT-1002) or unit (e.g. B201) to drill into a specific record.`;
    }

    const updated = await this.appendAssistant(conversation.id, text);
    await this.audit(ctx, conversation.id, 'question.answered', `Answered briefing (${totalOpen} open items)`);
    return {
      ...this.emptyResult(updated, text, stated.engine, stated.model, events),
      suggestions: totalOpen > 0 ? [...topRefs.slice(0, 2), 'Report another issue'] : ['Report another issue'],
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
      await this.audit(ctx, approval.conversationId, 'approval.executed', `Approved and created ${finalRecord.reference}${note ? ` — ${note}` : ''}`, 'maintenance_request', finalRecord.id);
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
