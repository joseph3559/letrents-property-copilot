// Server configuration. All secrets stay server-side; never import this in client code.

export interface CopilotConfig {
  metaApiKey: string | null;
  metaBaseUrl: string;
  metaModel: string;
  metaTimeoutMs: number;
  agentMaxIterations: number;
  demoDataDir: string;
  demoOrgId: string;
  demoUserId: string;
  nodeEnv: string;
}

function readEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function loadConfig(): CopilotConfig {
  const timeoutRaw = readEnv('META_TIMEOUT_MS');
  const iterationsRaw = readEnv('AGENT_MAX_ITERATIONS');
  return {
    metaApiKey: readEnv('META_API_KEY') ?? null,
    metaBaseUrl: readEnv('META_API_BASE_URL') ?? 'https://api.meta.ai/v1',
    metaModel: readEnv('META_MODEL') ?? 'muse-spark-1.3',
    metaTimeoutMs: timeoutRaw ? Number.parseInt(timeoutRaw, 10) || 30000 : 30000,
    agentMaxIterations: iterationsRaw
      ? Math.min(Math.max(Number.parseInt(iterationsRaw, 10) || 8, 1), 20)
      : 8,
    demoDataDir: readEnv('DEMO_DATA_DIR') ?? '.data',
    demoOrgId: readEnv('DEMO_ORG_ID') ?? 'org-sunrise-demo',
    demoUserId: readEnv('DEMO_USER_ID') ?? 'user-demo-manager',
    nodeEnv: readEnv('NODE_ENV') ?? 'development',
  };
}

export function isMetaConfigured(config: CopilotConfig): boolean {
  return config.metaApiKey !== null;
}
