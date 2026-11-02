import { describe, expect, it } from 'vitest';
import { assessSafety } from '../src/server/agent/safety';

describe('safety overrides', () => {
  it('escalates electrical sparks to emergency regardless of model urgency', () => {
    const result = assessSafety(
      'There are sparks coming from the electrical panel in C301.',
      'normal',
      null
    );
    expect(result.urgency).toBe('emergency');
    expect(result.escalate).toBe(true);
    expect(result.guidance).toMatch(/electrician/i);
  });

  it('escalates active flooding to emergency', () => {
    const result = assessSafety('Water is spreading across the kitchen from a burst pipe.', 'high', null);
    expect(result.urgency).toBe('emergency');
    expect(result.escalate).toBe(true);
  });

  it('escalates gas smell to emergency', () => {
    const result = assessSafety('Strong gas smell near the meter room.', 'normal', null);
    expect(result.urgency).toBe('emergency');
    expect(result.safetyRisk).toMatch(/gas/i);
  });

  it('escalates structural collapse risk', () => {
    const result = assessSafety('Part of the ceiling is collapsing in the lobby.', 'normal', null);
    expect(result.urgency).toBe('emergency');
    expect(result.escalate).toBe(true);
  });

  it('raises broken building security to high with escalation', () => {
    const result = assessSafety(
      'The main entrance lock is broken and residents cannot secure the building.',
      'normal',
      null
    );
    expect(result.urgency).toBe('high');
    expect(result.escalate).toBe(true);
  });

  it('leaves ordinary complaints at model urgency', () => {
    const result = assessSafety('The corridor lights are flickering.', 'normal', null);
    expect(result.urgency).toBe('normal');
    expect(result.escalate).toBe(false);
  });
});
