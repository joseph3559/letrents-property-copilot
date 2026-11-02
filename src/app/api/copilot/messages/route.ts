import { NextRequest } from 'next/server';
import { getCopilot, getUserContext } from '@/server/context';
import { sendMessageSchema } from '@/server/agent/schemas';
import { fail, ok, toSafeErrorMessage } from '@/server/lib/response';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = sendMessageSchema.safeParse(body);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? 'Invalid request', 400, 'VALIDATION_ERROR');
    }
    const { agent } = getCopilot();
    const ctx = getUserContext();
    const result = await agent.handleMessage(
      ctx,
      parsed.data.content,
      parsed.data.conversationId,
      parsed.data.imageDataUrl
    );
    return ok(result, 'Message processed');
  } catch (error) {
    return fail(toSafeErrorMessage(error, 'Failed to process message'), 500, 'AGENT_ERROR');
  }
}
