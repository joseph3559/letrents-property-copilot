// Muse Voice Transcribe over the Meta Model API file endpoint.
// Accepts mono 16-bit WAV (16 or 24 kHz); the server does not transcode,
// so the browser recorder encodes WAV directly.

import { CopilotConfig } from '../config';
import { ProviderError } from './types';

export interface Transcription {
  transcript: string;
  audioDurationMs: number;
  sessionId: string | null;
}

interface TranscribeResponse {
  transcript?: string;
  audioDurationMs?: number;
  sessionId?: string;
  error?: { message?: string } | string | null;
}

const TRANSCRIBE_TIMEOUT_MS = 120000;
export const MAX_VOICE_BYTES = 4 * 1024 * 1024;

export async function transcribeAudio(
  config: CopilotConfig,
  wavBytes: Buffer,
  keywords: string[] = []
): Promise<Transcription> {
  if (!config.metaApiKey) {
    throw new ProviderError('META_API_KEY is not configured', false);
  }
  if (wavBytes.length === 0 || wavBytes.length > MAX_VOICE_BYTES) {
    throw new ProviderError('Voice note must be between 1 byte and 4 MB', false);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);
  try {
    const endpoint = `${config.metaBaseUrl.replace(/\/$/, '')}/asr/transcribe`;
    const form = new FormData();
    form.append(
      'request',
      new Blob(
        [
          JSON.stringify({
            mode: 'PUSH_TO_TALK',
            model: 'muse-voice-transcribe-1.0',
            audioEncoding: 'WAV',
            keywords,
            languageBias: ['English'],
          }),
        ],
        { type: 'application/json' }
      )
    );
    form.append('audio', new Blob([new Uint8Array(wavBytes)], { type: 'audio/wav' }), 'voice-note.wav');
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.metaApiKey}` },
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new ProviderError(
        `Transcription failed (HTTP ${res.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`,
        res.status >= 500 || res.status === 429,
        res.status
      );
    }
    const parsed = (await res.json()) as TranscribeResponse;
    if (parsed.error) {
      const message = typeof parsed.error === 'string' ? parsed.error : parsed.error.message;
      throw new ProviderError(`Transcription failed: ${message ?? 'unknown error'}`, false, res.status);
    }
    return {
      transcript: (parsed.transcript ?? '').trim(),
      audioDurationMs: parsed.audioDurationMs ?? 0,
      sessionId: parsed.sessionId ?? null,
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if ((error as Error)?.name === 'AbortError') {
      throw new ProviderError(`Transcription timed out after ${TRANSCRIBE_TIMEOUT_MS}ms`, true);
    }
    throw new ProviderError(
      `Transcription failed: ${(error as Error)?.message ?? 'network error'}`,
      true
    );
  } finally {
    clearTimeout(timer);
  }
}
