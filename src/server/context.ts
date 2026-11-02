// Shared server singletons for API routes: config, store, adapter, agent.
// Demo auth: the public demo runs as a single demo manager. Production
// replaces getUserContext() with JWT-derived context — the agent and adapter
// already enforce org isolation on the context they receive.

import { loadConfig } from './config';
import { getStore } from './store';
import { DemoAdapter } from './adapters/demo-adapter';
import { CopilotAgent } from './agent/loop';
import { buildMetaProviderIfConfigured } from './providers/meta';
import { UserContext } from './types';

let cached:
  | {
      agent: CopilotAgent;
      adapter: DemoAdapter;
      metaConfigured: boolean;
      model: string;
      baseUrl: string;
    }
  | null = null;

export function getCopilot() {
  if (!cached) {
    const config = loadConfig();
    const store = getStore(config.demoDataDir);
    const adapter = new DemoAdapter(store);
    const primary = buildMetaProviderIfConfigured(config);
    const agent = new CopilotAgent({
      store,
      adapter,
      primary,
      maxIterations: config.agentMaxIterations,
    });
    cached = {
      agent,
      adapter,
      metaConfigured: primary !== null,
      model: config.metaModel,
      baseUrl: config.metaBaseUrl,
    };
  }
  return cached;
}

export function getUserContext(): UserContext {
  const config = loadConfig();
  return { userId: config.demoUserId, orgId: config.demoOrgId, role: 'demo_manager' };
}
