import { describe, expect, it } from 'vitest';
import { parseSegmentBoxes, phrasesForCategory } from '../src/server/providers/sam';

describe('SAM box parsing', () => {
  it('parses boxes with confidence in any field order', () => {
    const text =
      '<0f>0<|box;x1=92;y1=0;x2=611;y2=126;w=1920;h=1280;c=0.69|><|mask;x=0;y=0;data=1,1,~x|>';
    const boxes = parseSegmentBoxes(text, 'pipe');
    expect(boxes.length).toBe(1);
    expect(boxes[0]).toMatchObject({
      phrase: 'pipe', x1: 92, y1: 0, x2: 611, y2: 126, width: 1920, height: 1280,
    });
    expect(boxes[0].confidence).toBeCloseTo(0.69, 5);
  });

  it('handles missing confidence and multiple objects', () => {
    const text =
      '<0f>0<|box;w=100;h=100;x1=1;y1=2;x2=10;y2=20|>,1<|box;x1=30;y1=40;x2=50;y2=60;w=100;h=100;c=0.5|>';
    const boxes = parseSegmentBoxes(text, 'stain');
    expect(boxes.length).toBe(2);
    expect(boxes[0].confidence).toBeNull();
    expect(boxes[1].confidence).toBe(0.5);
  });

  it('ignores malformed tokens', () => {
    expect(parseSegmentBoxes('no detections here', 'pipe')).toEqual([]);
    expect(parseSegmentBoxes('<0f>0<|box;x1=1;y1=2|>', 'pipe')).toEqual([]);
  });

  it('maps categories to short noun phrases', () => {
    expect(phrasesForCategory('plumbing')).toEqual(['pipe', 'water stain']);
    expect(phrasesForCategory('electrical')).toContain('electrical panel');
    expect(phrasesForCategory('other')).toEqual([]);
  });
});
