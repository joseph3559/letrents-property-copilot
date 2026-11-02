import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DemoStore } from '../src/server/store';
import { DemoAdapter } from '../src/server/adapters/demo-adapter';
import { CopilotAgent } from '../src/server/agent/loop';
import { UserContext } from '../src/server/types';

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
