import { NextRequest } from 'next/server';
import { getCopilot, getUserContext } from '@/server/context';
import { MAX_RETURNED_MESSAGES } from '@/server/agent/loop';
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
    // Window the thread (see conversations/[id]): the client animates every
    // message, so an unbounded history would freeze the page.
    result.conversation = {
      ...result.conversation,
      messages: result.conversation.messages.slice(-MAX_RETURNED_MESSAGES),
    };
    return ok(result, 'Message processed');
  } catch (error) {
    return fail(toSafeErrorMessage(error, 'Failed to process message'), 500, 'AGENT_ERROR');
  }
}
