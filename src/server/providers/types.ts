// AI provider abstraction. Meta (Llama API) is the primary implementation.
// The local fallback is used ONLY when Meta is unconfigured or unreachable,
// and the UI always labels which engine produced an answer.

export interface ChatMessageInput {
  role: 'system' | 'user';
  content: string;
}

export interface StructuredCompletionOptions {
  systemPrompt: string;
  userPrompt: string;
  /** When true, request JSON-only output from the model. */
  jsonMode: boolean;
  maxTokens?: number;
  temperature?: number;
  /** Optional image as data URL (jpeg/png). Ignored by providers without vision. */
  imageDataUrl?: string;
}

export interface ProviderResult {
  text: string;
  model: string;
  /** Milliseconds the provider call took. */
  latencyMs: number;
}

export class ProviderError extends Error {
  retryable: boolean;
  status?: number;
  constructor(message: string, retryable = false, status?: number) {
    super(message);
    this.name = 'ProviderError';
    this.retryable = retryable;
    this.status = status;
  }
}

export interface AIProvider {
  readonly name: 'meta' | 'local';
  readonly model: string;
  complete(options: StructuredCompletionOptions): Promise<ProviderResult>;
}
