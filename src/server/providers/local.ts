// Rule-based local fallback. Used ONLY when Meta is unconfigured or fails,
// so the demo remains runnable offline. Every response from this engine is
// labeled `local` and the UI shows a "Local fallback" badge — it must never
// be presented as Meta output.

import { AIProvider, ProviderResult, StructuredCompletionOptions } from './types';
import { MaintenanceCategory, Urgency } from '../types';

const CATEGORY_KEYWORDS: Array<{ category: MaintenanceCategory; words: string[] }> = [
  { category: 'plumbing', words: ['leak', 'pipe', 'tap', 'faucet', 'drain', 'toilet', 'sink', 'sewage', 'blockage', 'dripping'] },
  { category: 'electrical', words: ['light', 'lights', 'power', 'socket', 'switch', 'spark', 'electric', 'wiring', 'breaker', 'bulb'] },
  { category: 'security', words: ['lock', 'gate', 'security', 'break', 'broken door', 'burglar', 'intruder', 'fence', 'guard'] },
  { category: 'structural', words: ['roof', 'ceiling', 'wall', 'crack', 'floor', 'collapse', 'plaster', 'paint', 'door frame', 'window'] },
  { category: 'water_supply', words: ['water pressure', 'pump', 'borehole', 'tank', 'no water', 'shortage', 'supply'] },
  { category: 'cleaning', words: ['garbage', 'clean', 'waste', 'rubbish', 'corridor dirt', 'staircase'] },
  { category: 'hvac', words: ['heater', 'aircon', 'air-con', 'ventilation', 'fan', 'cooling', 'heating'] },
  { category: 'general', words: ['repair', 'maintenance', 'fix', 'service'] },
];

const EMERGENCY_PATTERNS = [
  'spark', 'fire', 'smoke', 'shock', 'flood', 'flooding', 'burst pipe', 'gas smell',
  'gas leak', 'collapse', 'collapsed', 'no water at all', 'sewage overflow',
];
const HIGH_PATTERNS = [
  'cannot secure', "can't lock", 'not working', 'stopped working', 'broken', 'leaking',
  'spreading', 'urgent', 'immediately', 'danger', 'unsafe',
];

const UNIT_PATTERNS = [
  /\bunit\s+([a-z]?\d{1,3}[a-z]?)\b/i,
  /\bapartment\s+([a-z]?\d{1,3}[a-z]?)\b/i,
  /\bhouse\s+([a-z]?\d{1,3}[a-z]?)\b/i,
  /\bflat\s+([a-z]?\d{1,3}[a-z]?)\b/i,
  /\b([a-z]\d{1,4}[a-z]?)\b/i,
];

function detectCategory(text: string): MaintenanceCategory {
  const lower = text.toLowerCase();
  let best: MaintenanceCategory = 'other';
  let bestHits = 0;
  for (const entry of CATEGORY_KEYWORDS) {
    const hits = entry.words.filter((w) => lower.includes(w)).length;
    if (hits > bestHits) {
      bestHits = hits;
      best = entry.category;
    }
  }
  return best;
}

function detectUrgency(text: string): { urgency: Urgency; safetyRisk: string | null } {
  const lower = text.toLowerCase();
  for (const pattern of EMERGENCY_PATTERNS) {
    if (lower.includes(pattern)) {
      if (/(spark|fire|smoke|shock|electric)/.test(lower)) {
        return { urgency: 'emergency', safetyRisk: 'Possible electrical/fire hazard. Escalate to a human immediately and advise occupants to keep clear and cut power if safe to do so.' };
      }
      if (/(flood|burst pipe|sewage)/.test(lower)) {
        return { urgency: 'emergency', safetyRisk: 'Active water ingress or sewage exposure risk. Escalate urgently and advise occupants to avoid the affected area.' };
      }
      if (/(gas)/.test(lower)) {
        return { urgency: 'emergency', safetyRisk: 'Possible gas leak. Escalate immediately; advise ventilation, no open flames, and evacuation if the smell is strong.' };
      }
      return { urgency: 'emergency', safetyRisk: 'Potential safety risk detected. Escalate to a human immediately.' };
    }
  }
  for (const pattern of HIGH_PATTERNS) {
    if (lower.includes(pattern)) return { urgency: 'high', safetyRisk: null };
  }
  return { urgency: 'normal', safetyRisk: null };
}

function extractUnitMention(text: string): string | null {
  for (const pattern of UNIT_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].toUpperCase();
  }
  return null;
}

function titleCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function extractComplaint(complaint: string): Record<string, unknown> {
  const category = detectCategory(complaint);
  const { urgency, safetyRisk } = detectUrgency(complaint);
  const unitMention = extractUnitMention(complaint);
  const short = complaint.trim().slice(0, 90);
  return {
    isComplaint: true,
    title: titleCase(short.length >= 4 ? short : `${category.replace(/_/g, ' ')} issue`),
    description: complaint.trim().slice(0, 1000),
    category,
    urgency,
    safetyRisk,
    unitMention,
    propertyMention: null,
    symptoms: [],
    missingInfo: unitMention ? [] : ['unit number'],
  };
}

function classifyIntent(message: string): Record<string, unknown> {
  const lower = message.toLowerCase().trim();
  if (/^(hi|hello|hey|good\s+(morning|afternoon|evening)|thanks|thank you|bye)\b/.test(lower) && lower.length < 60) {
    return { intent: 'greeting' };
  }
  if (/(summar|how many|show me|list|which|pending|unresolved|priorit|report|overview|status)/.test(lower)) {
    return { intent: 'question' };
  }
  const complaintSignals = [
    'leak', 'broken', 'not working', 'stopped', 'repair', 'fix', 'complaint',
    'problem', 'issue', 'damage', 'fault', 'blocked', 'no water', 'no power', 'spark',
    'drip', 'tap', 'drain', 'smell', 'stain', 'crack', 'noise', 'flicker', 'jam',
    'stuck', 'burst', 'overflow', 'tripping', 'outage', 'mold', 'pest',
  ];
  if (complaintSignals.some((s) => lower.includes(s))) return { intent: 'complaint' };
  return { intent: 'question' };
}

export class LocalProvider implements AIProvider {
  readonly name = 'local' as const;
  readonly model = 'local-fallback-v1';

  async complete(options: StructuredCompletionOptions): Promise<ProviderResult> {
    const startedAt = Date.now();
    const task = options.systemPrompt.match(/\[TASK:\s*([A-Z_]+)\]/)?.[1] ?? 'UNKNOWN';
    // The complaint/message is embedded after the last "---" separator by the agent.
    const payload = options.userPrompt.split('\n---\n').pop()?.trim() ?? options.userPrompt;
    let text: string;
    if (task === 'EXTRACT_COMPLAINT') {
      text = JSON.stringify(extractComplaint(payload));
    } else if (task === 'CLASSIFY_INTENT') {
      text = JSON.stringify(classifyIntent(payload));
    } else if (task === 'DRAFT_TENANT_RESPONSE') {
      text = JSON.stringify({
        message:
          'Hello, thank you for reporting this issue. Your maintenance request has been recorded and our team is reviewing it. We will keep you updated on the next steps.',
      });
    } else {
      text = JSON.stringify({ message: 'Request received. See the structured details in the Copilot workspace.' });
    }
    return { text, model: this.model, latencyMs: Date.now() - startedAt };
  }
}
