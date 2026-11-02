import { NextRequest } from 'next/server';
import { getCopilot, getUserContext } from '@/server/context';
import { approvalDecisionSchema } from '@/server/agent/schemas';
import { NotFoundError } from '@/server/adapters/types';
import { fail, ok, toSafeErrorMessage } from '@/server/lib/response';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const parsed = approvalDecisionSchema.safeParse(body);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? 'Invalid request', 400, 'VALIDATION_ERROR');
    }
    const { agent } = getCopilot();
    const ctx = getUserContext();
    const result = await agent.decideApproval(ctx, id, parsed.data.decision, parsed.data.note);
    return ok(result, parsed.data.decision === 'approve' ? 'Approval executed' : 'Approval rejected');
  } catch (error) {
    if (error instanceof NotFoundError) return fail(error.message, 404, 'NOT_FOUND');
    return fail(toSafeErrorMessage(error, 'Failed to decide approval'), 500, 'APPROVAL_ERROR');
  }
}
