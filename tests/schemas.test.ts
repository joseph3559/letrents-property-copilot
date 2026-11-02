import { describe, expect, it } from 'vitest';
import {
  complaintAnalysisSchema,
  extractJsonObject,
  sendMessageSchema,
} from '../src/server/agent/schemas';

describe('schemas', () => {
  it('extracts JSON from fenced model output', () => {
    const raw = 'Here is the analysis:\n```json\n{"intent":"complaint"}\n```';
    expect(extractJsonObject(raw)).toEqual({ intent: 'complaint' });
  });

  it('rejects non-JSON model output', () => {
    expect(() => extractJsonObject('no json here')).toThrow(/valid JSON/);
  });

  it('validates complaint analysis strictly', () => {
    const good = {
      isComplaint: true,
      title: 'Leaking pipe',
      description: 'A pipe under the sink is leaking steadily.',
      category: 'plumbing',
      urgency: 'high',
      safetyRisk: null,
      unitMention: 'B201',
      propertyMention: null,
    };
    const parsed = complaintAnalysisSchema.parse(good);
    expect(parsed.category).toBe('plumbing');
    expect(parsed.symptoms).toEqual([]);
    expect(() => complaintAnalysisSchema.parse({ ...good, category: 'aliens' })).toThrow();
    expect(() => complaintAnalysisSchema.parse({ ...good, urgency: 'critical' })).toThrow();
  });

  it('validates message input and image data URLs', () => {
    expect(sendMessageSchema.safeParse({ content: '  hello  ' }).success).toBe(true);
    expect(sendMessageSchema.safeParse({ content: '   ' }).success).toBe(false);
    expect(
      sendMessageSchema.safeParse({ content: 'x', imageDataUrl: 'https://evil/x.png' }).success
    ).toBe(false);
    expect(
      sendMessageSchema.safeParse({
        content: 'leak',
        imageDataUrl: 'data:image/jpeg;base64,/9j/abc',
      }).success
    ).toBe(true);
  });
});
