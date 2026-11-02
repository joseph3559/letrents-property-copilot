// SAM 3.1 damage segmentation over the Meta Model API Responses endpoint.
// Unary image requests with short noun-phrase concepts; boxes are parsed
// from the output_text lane. Best-effort: failures never break the turn.

import { CopilotConfig } from '../config';
import { ProviderError } from './types';

export interface SegmentBox {
  phrase: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
  confidence: number | null;
}

export interface SegmentResult {
  phrase: string;
  boxes: SegmentBox[];
  model: string;
  latencyMs: number;
}

interface ResponsesOutput {
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string } | null;
}

/** Parse <|box;...|> tokens (fields in any order) from SAM output text. */
export function parseSegmentBoxes(outputText: string, phrase: string): SegmentBox[] {
  const boxes: SegmentBox[] = [];
  const tokenPattern = /<\|box;([^|]*)\|>/g;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(outputText)) !== null) {
    const fields: Record<string, string> = {};
    for (const part of match[1].split(';')) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      fields[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    }
    const nums = ['x1', 'y1', 'x2', 'y2', 'w', 'h'].map((k) => Number.parseInt(fields[k] ?? '', 10));
    if (nums.some((n) => !Number.isFinite(n))) continue;
    const [x1, y1, x2, y2, w, h] = nums;
    if (w <= 0 || h <= 0) continue;
    const confidence = fields.c !== undefined && fields.c !== '' ? Number.parseFloat(fields.c) : NaN;
    boxes.push({
      phrase,
      x1, y1, x2, y2,
      width: w,
      height: h,
      confidence: Number.isFinite(confidence) ? confidence : null,
    });
  }
  return boxes;
}

const SAM_TIMEOUT_MS = 60000;

export async function segmentImage(
  config: CopilotConfig,
  imageDataUrl: string,
  phrase: string
): Promise<SegmentResult> {
  if (!config.metaApiKey) {
    throw new ProviderError('META_API_KEY is not configured', false);
  }
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SAM_TIMEOUT_MS);
  try {
    const endpoint = `${config.metaBaseUrl.replace(/\/$/, '')}/responses`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.metaApiKey}`,
      },
      body: JSON.stringify({
        model: 'sam-3.1',
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: phrase },
              { type: 'input_image', image_url: imageDataUrl },
            ],
          },
        ],
        stream: false,
        metadata: { include_confidence: 'true' },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new ProviderError(
        `SAM request failed (HTTP ${res.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`,
        res.status >= 500 || res.status === 429,
        res.status
      );
    }
    const parsed = (await res.json()) as ResponsesOutput;
    if (parsed.error?.message) {
      throw new ProviderError(`SAM error: ${parsed.error.message}`, false, res.status);
    }
    const text =
      parsed.output
        ?.find((o) => o.type === 'message')
        ?.content?.find((c) => c.type === 'output_text')?.text ?? '';
    return {
      phrase,
      boxes: parseSegmentBoxes(text, phrase),
      model: 'sam-3.1',
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if ((error as Error)?.name === 'AbortError') {
      throw new ProviderError(`SAM request timed out after ${SAM_TIMEOUT_MS}ms`, true);
    }
    throw new ProviderError(
      `SAM request failed: ${(error as Error)?.message ?? 'network error'}`,
      true
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Short noun-phrase concepts per maintenance category (max 2, simple nouns). */
export function phrasesForCategory(category: string): string[] {
  switch (category) {
    case 'plumbing':
      return ['pipe', 'water stain'];
    case 'electrical':
      return ['electrical panel', 'light fixture'];
    case 'security':
      return ['door lock'];
    case 'structural':
      return ['wall crack', 'ceiling stain'];
    case 'water_supply':
      return ['water pump', 'water tank'];
    case 'cleaning':
      return ['garbage pile'];
    case 'hvac':
      return ['air vent'];
    default:
      return [];
  }
}
