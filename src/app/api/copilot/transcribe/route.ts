import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getCopilot, getUserContext } from '@/server/context';
import { transcribeAudio, MAX_VOICE_BYTES } from '@/server/providers/voice';
import { loadConfig } from '@/server/config';
import { fail, ok, toSafeErrorMessage } from '@/server/lib/response';

const transcribeSchema = z.object({
  audioDataUrl: z
    .string()
    .max(MAX_VOICE_BYTES * 1.4, 'Voice note is too large (max ~4MB audio)')
    .regex(/^data:audio\/(wav|wave|x-wav);base64,/, 'Audio must be a WAV data URL'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = transcribeSchema.safeParse(body);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? 'Invalid request', 400, 'VALIDATION_ERROR');
    }
    const config = loadConfig();
    if (!config.metaApiKey) {
      return fail('Voice transcription needs META_API_KEY (no local fallback for audio)', 503, 'PROVIDER_UNAVAILABLE');
    }
    const base64 = parsed.data.audioDataUrl.slice(parsed.data.audioDataUrl.indexOf(',') + 1);
    const wavBytes = Buffer.from(base64, 'base64');
    // Bias recognition toward our portfolio vocabulary.
    const { adapter } = getCopilot();
    const ctx = getUserContext();
    const properties = await adapter.searchProperties(ctx, '');
    const keywords = [
      ...properties.map((p) => p.name),
      'maintenance',
      'leaking',
      'plumber',
      'electrician',
      'caretaker',
      'tenant',
    ];
    const result = await transcribeAudio(config, wavBytes, keywords);
    if (!result.transcript) {
      return fail('No speech detected in the recording. Please try again.', 422, 'EMPTY_TRANSCRIPT');
    }
    return ok(result, 'Transcription complete');
  } catch (error) {
    return fail(toSafeErrorMessage(error, 'Failed to transcribe audio'), 500, 'TRANSCRIBE_ERROR');
  }
}
