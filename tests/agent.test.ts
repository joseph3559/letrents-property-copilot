import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DemoStore } from '../src/server/store';
import { DemoAdapter } from '../src/server/adapters/demo-adapter';
import {
  cacheConversationImage,
  conversationImageCache,
  CopilotAgent,
  buildExtractionPayload,
  mergeAnalyses,
  MAX_AUDIT_EVENTS,
  MAX_CONVERSATIONS,
} from '../src/server/agent/loop';
import { AuditEvent, Conversation, UserContext } from '../src/server/types';

const ctx: UserContext = { userId: 'user-demo-manager', orgId: 'org-sunrise-demo', role: 'demo_manager' };

function testConfig() {
  return {
    metaApiKey: null,
    metaBaseUrl: 'https://api.meta.ai/v1',
    metaModel: 'muse-spark-1.3',
    metaTimeoutMs: 5000,
    agentMaxIterations: 8,
    demoDataDir: '/tmp/copilot-test',
    demoOrgId: 'org-sunrise-demo',
    demoUserId: 'user-demo-manager',
    nodeEnv: 'test',
  };
}

function makeAgent() {
  const dir = mkdtempSync(join(tmpdir(), 'copilot-agent-'));
  const store = new DemoStore(dir);
  const adapter = new DemoAdapter(store);
  // primary: null → deterministic local engine for tests.
  const agent = new CopilotAgent({ store, adapter, primary: null, maxIterations: 8, config: testConfig() });
  return { agent, store, adapter };
}

describe('CopilotAgent end-to-end (local engine)', () => {
  it('Scenario 1: leaking pipe → analysis → approval → created record', async () => {
    const { agent, adapter } = makeAgent();
    const turn = await agent.handleMessage(
      ctx,
      'There is a leaking pipe in B201. Water is spreading across the kitchen floor.',
      undefined
    );
    expect(turn.analysis).not.toBeNull();
    expect(turn.analysis?.category).toBe('plumbing');
    expect(turn.property?.name).toBe('Sunrise Apartments');
    expect(turn.unit?.unitNumber).toBe('B201');
    expect(turn.approval?.status).toBe('pending');
    expect(turn.recommendations[0]?.staff.role).toBe('Plumber');
    expect(turn.tenantDraft).toMatch(/maintenance request/i);

    // Nothing persisted before approval.
    const before = await adapter.getPendingMaintenance(ctx, 'prop-sunrise');
    const beforeCount = before.length;

    const { approval, created } = await agent.decideApproval(ctx, turn.approval!.id, 'approve');
    expect(approval.status).toBe('executed');
    expect(created).not.toBeNull();
    expect(created?.reference).toMatch(/^MNT-/);
    expect(created?.unitId).toBe('unit-b201');

    const after = await adapter.getPendingMaintenance(ctx, 'prop-sunrise');
    expect(after.length).toBe(beforeCount + 1);
  });

  it('Scenario 3: electrical hazard escalates to emergency', async () => {
    const { agent } = makeAgent();
    const turn = await agent.handleMessage(
      ctx,
      'There are sparks coming from the electrical panel in C301.',
      undefined
    );
    expect(turn.analysis?.urgency).toBe('emergency');
    expect(turn.safetyGuidance).toMatch(/electrician/i);
    expect(turn.unit?.unitNumber).toBe('C301');
  });

  it('Scenario 4: duplicate complaint does not create a second approval', async () => {
    const { agent } = makeAgent();
    const complaint = 'Parking gate in Acacia is broken and stuck open.';
    const first = await agent.handleMessage(ctx, complaint, undefined);
    expect(first.approval?.status).toBe('pending');
    await agent.decideApproval(ctx, first.approval!.id, 'approve');
    const second = await agent.handleMessage(ctx, complaint, undefined);
    expect(second.duplicateOf).not.toBeNull();
    expect(second.approval).toBeNull();
  });

  it('Scenario 5: ambiguous pump complaint asks for clarification, never invents', async () => {
    const { agent } = makeAgent();
    const turn = await agent.handleMessage(ctx, 'The water pump is not working.', undefined);
    // Two properties exist and no unit/property was named → must clarify.
    expect(turn.needsClarification).not.toBeNull();
    expect(turn.property).toBeNull();
    expect(turn.approval).toBeNull();
  });

  it('Multi-turn: property answer continues the pending complaint', async () => {
    const { agent } = makeAgent();
    const first = await agent.handleMessage(ctx, 'The water pump is not working.', undefined);
    expect(first.needsClarification).not.toBeNull();
    const second = await agent.handleMessage(ctx, 'Acacia', first.conversation.id);
    expect(second.needsClarification).toBeNull();
    expect(second.property?.name).toBe('Acacia Heights');
    expect(second.analysis?.category).toBe('water_supply');
    expect(second.approval?.status).toBe('pending');
  });

  it('Multi-turn: unit answer resolves property by inference', async () => {
    const { agent } = makeAgent();
    const first = await agent.handleMessage(ctx, 'The water pump is not working.', undefined);
    expect(first.needsClarification).not.toBeNull();
    const second = await agent.handleMessage(ctx, 'K1', first.conversation.id);
    expect(second.needsClarification).toBeNull();
    expect(second.property?.name).toBe('Acacia Heights');
    expect(second.unit?.unitNumber).toBe('K1');
    expect(second.approval?.status).toBe('pending');
  });

  it('Sticky context: follow-up complaint reuses the conversation property', async () => {
    const { agent } = makeAgent();
    const first = await agent.handleMessage(ctx, 'There is a leaking pipe in B201.', undefined);
    expect(first.property?.name).toBe('Sunrise Apartments');
    const second = await agent.handleMessage(
      ctx,
      'The corridor lights are broken and need repair.',
      first.conversation.id
    );
    expect(second.needsClarification).toBeNull();
    expect(second.property?.name).toBe('Sunrise Apartments');
    expect(second.assumedProperty).toBe(true);
    expect(second.approval?.status).toBe('pending');
  });

  it('Clarification offers one-tap property options', async () => {
    const { agent } = makeAgent();
    const turn = await agent.handleMessage(ctx, 'The water pump is not working.', undefined);
    expect(turn.needsClarification).not.toBeNull();
    expect(turn.clarifyOptions).toMatchObject([
      { id: 'prop-sunrise', label: 'Sunrise Apartments' },
      { id: 'prop-acacia', label: 'Acacia Heights' },
    ]);
  });

  it('Photo complaint reuses the cached photo on clarification follow-up', async () => {
    const { agent, store } = makeAgent();
    const fakeImage = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    const first = await agent.handleMessage(ctx, 'The water pump is not working.', undefined, fakeImage);
    expect(first.needsClarification).not.toBeNull();
    // Photo-informed analysis persisted with the pending complaint.
    const db = await store.load();
    const convo = db.conversations.find((c) => c.id === first.conversation.id);
    expect(convo?.pendingComplaint).toMatch(/water pump/);
    expect(convo?.pendingAnalysis?.category).toBe(first.analysis?.category);
    // Follow-up without re-attaching the photo still completes the complaint.
    const second = await agent.handleMessage(ctx, 'Acacia', first.conversation.id);
    expect(second.needsClarification).toBeNull();
    expect(second.property?.name).toBe('Acacia Heights');
    expect(second.analysis?.category).toBe(first.analysis?.category);
    expect(second.approval?.status).toBe('pending');
    expect(second.events).not.toContain('Photo-informed analysis from your earlier message preserved');
    // Pending state fully cleared.
    const db2 = await store.load();
    const convo2 = db2.conversations.find((c) => c.id === first.conversation.id);
    expect(convo2?.pendingComplaint).toBeNull();
    expect(convo2?.pendingAnalysis).toBeNull();
  });

  it('Clarification follow-up merges stored photo analysis when the image cache misses', async () => {
    const { agent } = makeAgent();
    const fakeImage = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    const first = await agent.handleMessage(ctx, 'The water pump is not working.', undefined, fakeImage);
    expect(first.needsClarification).not.toBeNull();
    conversationImageCache.delete(first.conversation.id); // simulate restart/eviction
    const second = await agent.handleMessage(ctx, 'Acacia', first.conversation.id);
    expect(second.needsClarification).toBeNull();
    expect(second.approval?.status).toBe('pending');
    expect(second.events).toContain('Photo-informed analysis from your earlier message preserved');
    expect(second.analysis?.category).toBe(first.analysis?.category);
  });

  it('Text-only clarification stores no prior analysis', async () => {
    const { agent, store } = makeAgent();
    const first = await agent.handleMessage(ctx, 'The water pump is not working.', undefined);
    expect(first.needsClarification).not.toBeNull();
    const db = await store.load();
    const convo = db.conversations.find((c) => c.id === first.conversation.id);
    expect(convo?.pendingComplaint).toMatch(/water pump/);
    expect(convo?.pendingAnalysis ?? null).toBeNull();
  });

  it('mergeAnalyses keeps photo findings and takes the slot-answer location', () => {
    const merged = mergeAnalyses(
      {
        isComplaint: true,
        title: 'Ceiling water leak',
        description: 'Photo shows water streaming from a cracked ceiling.',
        category: 'plumbing',
        urgency: 'high',
        safetyRisk: null,
        unitMention: null,
        propertyMention: null,
        symptoms: ['water streaming from ceiling'],
        missingInfo: ['property name'],
      },
      {
        isComplaint: true,
        title: 'Unspecified issue',
        description: 'Manager named a property.',
        category: 'general',
        urgency: 'normal',
        safetyRisk: null,
        unitMention: null,
        propertyMention: 'Sunrise',
        symptoms: [],
        missingInfo: [],
      }
    );
    expect(merged.category).toBe('plumbing');
    expect(merged.urgency).toBe('high');
    expect(merged.title).toBe('Ceiling water leak');
    expect(merged.description).toMatch(/streaming/);
    expect(merged.symptoms).toEqual(['water streaming from ceiling']);
    expect(merged.propertyMention).toBe('Sunrise');
  });

  it('Conversation image cache evicts oldest entries past capacity', () => {
    for (let i = 0; i < 12; i++) cacheConversationImage(`cap-${i}`, `data:image/jpeg;base64,${i}`);
    expect(conversationImageCache.size).toBe(10);
    expect(conversationImageCache.has('cap-0')).toBe(false);
    expect(conversationImageCache.has('cap-11')).toBe(true);
    for (let i = 0; i < 12; i++) conversationImageCache.delete(`cap-${i}`);
  });

  it('Multi-turn: unrelated follow-up clears pending state instead of hijacking', async () => {
    const { agent } = makeAgent();
    const first = await agent.handleMessage(ctx, 'The water pump is not working.', undefined);
    expect(first.needsClarification).not.toBeNull();
    const second = await agent.handleMessage(ctx, 'never mind, thanks', first.conversation.id);
    expect(second.needsClarification).toBeNull();
    expect(second.approval).toBeNull();
  });

  it('Scenario 6: property intelligence uses real records', async () => {
    const { agent } = makeAgent();
    const turn = await agent.handleMessage(
      ctx,
      'Summarize all unresolved maintenance issues in Sunrise Apartments.',
      undefined
    );
    expect(turn.assistantText).toMatch(/Sunrise Apartments/);
    expect(turn.assistantText).toMatch(/MNT-1002/);
  });

  it('Reference drill-down answers the specific record, not the portfolio dump', async () => {
    const { agent } = makeAgent();
    const turn = await agent.handleMessage(ctx, 'MNT-1005', undefined);
    expect(turn.assistantText).toMatch(/Roof leak above bedroom/);
    expect(turn.assistantText).toMatch(/C301/);
    expect(turn.assistantText).not.toMatch(/MNT-1003/);
    expect(turn.assistantText).not.toMatch(/MNT-1006/);
  });

  it('Unit drill-down focuses on that unit', async () => {
    const { agent } = makeAgent();
    const turn = await agent.handleMessage(ctx, 'What is happening in unit B201?', undefined);
    expect(turn.assistantText).toMatch(/B201/);
    expect(turn.assistantText).not.toMatch(/MNT-1006/);
  });

  it('Briefing orders urgent items first and names unit locations', async () => {
    const { agent } = makeAgent();
    const turn = await agent.handleMessage(
      ctx,
      'Give me my morning briefing: what is open and urgent?',
      undefined
    );
    const highPos = turn.assistantText.indexOf('MNT-1002');
    const normalPos = turn.assistantText.indexOf('MNT-1003');
    expect(highPos).toBeGreaterThanOrEqual(0);
    expect(normalPos).toBeGreaterThanOrEqual(0);
    expect(highPos).toBeLessThan(normalPos);
    expect(turn.assistantText).toMatch(/Unit C301/);
  });

  it('Approval note is written to the audit trail', async () => {
    const { agent, store } = makeAgent();
    const turn = await agent.handleMessage(ctx, 'The tap in A102 is dripping all day and night.', undefined);
    expect(turn.approval?.status).toBe('pending');
    const { approval } = await agent.decideApproval(ctx, turn.approval!.id, 'approve', 'Notify tenant by SMS.');
    expect(approval.status).toBe('executed');
    const db = await store.load();
    const event = db.auditEvents.find((e) => e.action === 'approval.executed');
    expect(event?.detail).toMatch(/Notify tenant by SMS/);
  });

  it('Scenario 8: rejection blocks execution and is recorded', async () => {
    const { agent, store } = makeAgent();
    const turn = await agent.handleMessage(ctx, 'The tap in A102 is dripping all day and night.', undefined);
    expect(turn.approval?.status).toBe('pending');
    const { approval, created } = await agent.decideApproval(ctx, turn.approval!.id, 'reject');
    expect(approval.status).toBe('rejected');
    expect(created).toBeNull();
    const db = await store.load();
    expect(db.auditEvents.some((e) => e.action === 'approval.rejected')).toBe(true);
    expect(db.maintenanceRequests.some((r) => r.title === turn.analysis!.title && r.source === 'copilot')).toBe(false);
  });

  it('resolves bare single-digit units (K2) via unit inference', async () => {
    const { agent } = makeAgent();
    const turn = await agent.handleMessage(ctx, 'Bathroom tap in K2 keeps dripping day and night.', undefined);
    expect(turn.property?.name).toBe('Acacia Heights');
    expect(turn.unit?.unitNumber).toBe('K2');
    expect(turn.approval?.status).toBe('pending');
  });

  it('greeting does not create proposals', async () => {
    const { agent } = makeAgent();
    const turn = await agent.handleMessage(ctx, 'Hello!', undefined);
    expect(turn.approval).toBeNull();
    expect(turn.assistantText).toMatch(/Copilot/);
  });

  it('extraction payload marks photo attachment for the model', () => {
    expect(buildExtractionPayload('leak here', false)).toBe('leak here');
    const marked = buildExtractionPayload('leak here', true);
    expect(marked).toMatch(/photo is attached/);
    expect(marked).toMatch(/leak here/);
  });

  it('Briefing offers reference follow-up suggestions', async () => {
    const { agent } = makeAgent();
    const turn = await agent.handleMessage(
      ctx,
      'Give me my morning briefing: what is open and urgent?',
      undefined
    );
    expect(turn.suggestions.length).toBeGreaterThan(0);
    expect(turn.suggestions.some((s) => /^MNT-\d+$/.test(s))).toBe(true);
  });

  it('Complaint success offers follow-up suggestions', async () => {
    const { agent } = makeAgent();
    const turn = await agent.handleMessage(
      ctx,
      'There is a leaking pipe in B201. Water is spreading across the kitchen floor.',
      undefined
    );
    expect(turn.approval?.status).toBe('pending');
    expect(turn.suggestions.length).toBeGreaterThan(0);
  });

  it('Greeting offers starter suggestions', async () => {
    const { agent } = makeAgent();
    const turn = await agent.handleMessage(ctx, 'Hello!', undefined);
    expect(turn.suggestions.length).toBeGreaterThan(0);
  });

  it('iteration budget is enforced', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'copilot-budget-'));
    const store = new DemoStore(dir);
    const adapter = new DemoAdapter(store);
    const agent = new CopilotAgent({ store, adapter, primary: null, maxIterations: 1, config: testConfig() });
    await expect(
      agent.handleMessage(ctx, 'Leaking pipe in B201, water everywhere.', undefined)
    ).rejects.toThrow(/iteration budget/);
  });
});

describe('CopilotAgent retention guards', () => {
  function seedConversation(i: number): Conversation {
    const stamp = new Date(Date.now() - (i + 1) * 60000).toISOString();
    return {
      id: `convo-seed-${i}`,
      orgId: ctx.orgId,
      userId: ctx.userId,
      title: `Seeded conversation ${i}`,
      messages: [],
      createdAt: stamp,
      updatedAt: stamp,
    };
  }

  function seedAudit(i: number): AuditEvent {
    return {
      id: `audit-seed-${i}`,
      orgId: ctx.orgId,
      conversationId: null,
      actor: ctx.userId,
      action: 'seeded.event',
      entityType: null,
      entityId: null,
      detail: `Seeded audit event ${i}`,
      createdAt: new Date(Date.now() - (i + 1) * 1000).toISOString(),
    };
  }

  it('trims conversations to the most recent MAX_CONVERSATIONS', async () => {
    const { agent, store } = makeAgent();
    await store.update((db) => {
      for (let i = 0; i < MAX_CONVERSATIONS + 20; i++) db.conversations.push(seedConversation(i));
    });
    const turn = await agent.handleMessage(ctx, 'Hello!', undefined);
    const db = await store.load();
    expect(db.conversations.length).toBeLessThanOrEqual(MAX_CONVERSATIONS);
    // The conversation just written to must survive trimming.
    expect(db.conversations.some((c) => c.id === turn.conversation.id)).toBe(true);
  });

  it('trims audit events to the most recent MAX_AUDIT_EVENTS', async () => {
    const { agent, store } = makeAgent();
    await store.update((db) => {
      for (let i = 0; i < MAX_AUDIT_EVENTS + 50; i++) db.auditEvents.push(seedAudit(i));
    });
    await agent.handleMessage(ctx, 'Hello!', undefined);
    const db = await store.load();
    expect(db.auditEvents.length).toBeLessThanOrEqual(MAX_AUDIT_EVENTS);
  });
});
