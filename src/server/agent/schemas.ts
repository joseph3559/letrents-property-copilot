// Zod schemas for every agent input/output boundary. Model output is never
// trusted without validation.

import { z } from 'zod';

export const urgencySchema = z.enum(['low', 'normal', 'high', 'emergency']);
export const categorySchema = z.enum([
  'plumbing',
  'electrical',
  'security',
  'structural',
  'water_supply',
  'cleaning',
  'hvac',
  'general',
  'other',
]);

export const complaintAnalysisSchema = z.object({
  isComplaint: z.boolean(),
  title: z.string().min(4).max(200),
  description: z.string().min(10).max(4000),
  category: categorySchema,
  urgency: urgencySchema,
  safetyRisk: z.string().max(500).nullable(),
  unitMention: z.string().max(20).nullable(),
  propertyMention: z.string().max(120).nullable(),
  symptoms: z.array(z.string().max(200)).max(10).default([]),
  missingInfo: z.array(z.string().max(200)).max(10).default([]),
});

export type ComplaintAnalysis = z.infer<typeof complaintAnalysisSchema>;

export const intentSchema = z.object({
  intent: z.enum(['complaint', 'question', 'greeting']),
});

export type Intent = z.infer<typeof intentSchema>;

export const tenantDraftSchema = z.object({
  message: z.string().min(10).max(2000),
});

export const sendMessageSchema = z.object({
  conversationId: z.string().max(64).optional(),
  content: z.string().trim().min(1, 'Message content is required').max(4000),
  imageDataUrl: z
    .string()
    .max(6 * 1024 * 1024, 'Image is too large (max ~4MB)')
    .regex(/^data:image\/(jpeg|png|webp);base64,/, 'Image must be a jpeg/png/webp data URL')
    .optional(),
});

export const approvalDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().max(500).optional(),
});

/** Extract the first JSON object from model text (tolerates fences/prose). */
export function extractJsonObject(text: string): unknown {
  const direct = tryParse(text);
  if (direct !== undefined) return direct;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const parsed = tryParse(fenced[1]);
    if (parsed !== undefined) return parsed;
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    const parsed = tryParse(text.slice(start, end + 1));
    if (parsed !== undefined) return parsed;
  }
  throw new Error('Model did not return valid JSON');
}

function tryParse(text: string): unknown | undefined {
  try {
    return JSON.parse(text.trim()) as unknown;
  } catch {
    return undefined;
  }
}
