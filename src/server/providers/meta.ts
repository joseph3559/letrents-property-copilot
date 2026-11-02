// Meta Model API client over the OpenAI-compatible endpoint.
// Base URL defaults to https://api.meta.ai/v1 (chat completions).
// Uses undici fetch (Node 18+) with an explicit timeout; no SDK dependency.

import { CopilotConfig } from '../config';
import { AIProvider, ChatMessageInput, ProviderError, ProviderResult, StructuredCompletionOptions } from './types';

interface CompatChoice {
  message?: { content?: string | null };
  finish_reason?: string | null;
}

interface CompatResponse {
  choices?: CompatChoice[];
  error?: { message?: string; type?: string };
}

function toCompatMessages(options: StructuredCompletionOptions): ChatMessageInput[] {
  return [
    { role: 'system', content: options.systemPrompt },
    { role: 'user', content: options.userPrompt },
  ];
}

export class MetaProvider implements AIProvider {
  readonly name = 'meta' as const;
  readonly model: string;
  private readonly config: CopilotConfig;

  constructor(config: CopilotConfig) {
    if (!config.metaApiKey) {
      throw new ProviderError('META_API_KEY is not configured', false);
    }
    this.config = config;
    this.model = config.metaModel;
  }

  async complete(options: StructuredCompletionOptions): Promise<ProviderResult> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.metaTimeoutMs);
    try {
      const userContent: unknown = options.imageDataUrl
        ? [
            { type: 'text', text: options.userPrompt },
            { type: 'image_url', image_url: { url: options.imageDataUrl } },
          ]
        : options.userPrompt;
      const body = {
        model: this.config.metaModel,
        messages: [
          { role: 'system', content: options.systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 2000,
        ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      };
      const endpoint = `${this.config.metaBaseUrl.replace(/\/$/, '')}/chat/completions`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.metaApiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const latencyMs = Date.now() - startedAt;
      if (res.status === 429) {
        throw new ProviderError('Meta API rate limit reached. Please wait and try again.', true, 429);
      }
      if (res.status === 401 || res.status === 403) {
        throw new ProviderError('Meta API rejected the API key. Check META_API_KEY.', false, res.status);
      }
      if (!res.ok) {
        const detail = await safeErrorDetail(res);
        throw new ProviderError(
          `Meta API request failed (HTTP ${res.status})${detail ? `: ${detail}` : ''}`,
          res.status >= 500,
          res.status
        );
      }
      const parsed = (await res.json()) as CompatResponse;
      if (parsed.error?.message) {
        throw new ProviderError(`Meta API error: ${parsed.error.message}`, false, res.status);
      }
      const choice = parsed.choices?.[0];
      const text = choice?.message?.content?.trim() ?? '';
      if (!text) {
        const reason = choice?.finish_reason
          ? ` (finish_reason: ${choice.finish_reason})`
          : '';
        throw new ProviderError(`Meta API returned an empty response${reason}`, true, res.status);
      }
      return { text, model: this.config.metaModel, latencyMs };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if ((error as Error)?.name === 'AbortError') {
        throw new ProviderError(
          `Meta API timed out after ${this.config.metaTimeoutMs}ms`,
          true
        );
      }
      throw new ProviderError(
        `Meta API request failed: ${(error as Error)?.message ?? 'network error'}`,
        true
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

async function safeErrorDetail(res: Response): Promise<string | null> {
  try {
    const text = await res.text();
    if (!text) return null;
    try {
      const parsed = JSON.parse(text) as CompatResponse;
      return parsed.error?.message?.slice(0, 300) ?? null;
    } catch {
      return text.slice(0, 300);
    }
  } catch {
    return null;
  }
}

export function buildMetaProviderIfConfigured(config: CopilotConfig): MetaProvider | null {
  if (!config.metaApiKey) return null;
  return new MetaProvider(config);
}

export { toCompatMessages };
