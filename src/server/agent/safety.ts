// Deterministic safety layer. The model's urgency assessment is advisory;
// these rules override it whenever danger signals are present.

import { Urgency } from '../types';

const ELECTRICAL_DANGER = ['spark', 'sparks', 'electric shock', 'shock from', 'burning smell from socket', 'exposed wire', 'live wire'];
const FIRE_SIGNS = ['fire', 'smoke', 'flames', 'burning smell'];
const FLOOD_SIGNS = ['flooding', 'flooded', 'water spreading', 'burst pipe', 'gushing water', 'sewage overflow'];
const STRUCTURAL_SIGNS = ['collapse', 'collapsed', 'collapsing', 'ceiling falling', 'wall cracked through'];
const GAS_SIGNS = ['gas smell', 'smell of gas', 'gas leak'];
const SECURITY_SIGNS = ['intruder', 'break-in', 'break in', 'cannot lock', 'cannot secure'];

export interface SafetyAssessment {
  urgency: Urgency;
  safetyRisk: string | null;
  escalate: boolean;
  /** Human-readable emergency guidance shown in the UI. */
  guidance: string | null;
}

export function assessSafety(text: string, modelUrgency: Urgency, modelRisk: string | null): SafetyAssessment {
  const lower = text.toLowerCase();
  const has = (words: string[]) => words.some((w) => lower.includes(w));

  if (has(ELECTRICAL_DANGER) || (has(FIRE_SIGNS) && lower.includes('electric'))) {
    return {
      urgency: 'emergency',
      safetyRisk: 'Electrical hazard — possible shock or fire risk.',
      escalate: true,
      guidance:
        'Treat as an emergency: advise occupants to keep clear, switch off power at the mains only if safe, and contact emergency services if there is fire or injury. Dispatch a qualified electrician immediately.',
    };
  }
  if (has(FIRE_SIGNS)) {
    return {
      urgency: 'emergency',
      safetyRisk: 'Fire/smoke reported.',
      escalate: true,
      guidance:
        'Treat as an emergency: advise evacuation of the affected area and call fire emergency services. Do not let occupants re-enter until cleared.',
    };
  }
  if (has(FLOOD_SIGNS)) {
    return {
      urgency: 'emergency',
      safetyRisk: 'Active flooding or sewage exposure risk.',
      escalate: true,
      guidance:
        'Escalate urgently: advise occupants to avoid the affected area, shut off the water supply if safe, and dispatch a plumber immediately.',
    };
  }
  if (has(GAS_SIGNS)) {
    return {
      urgency: 'emergency',
      safetyRisk: 'Possible gas leak.',
      escalate: true,
      guidance:
        'Treat as an emergency: advise ventilation, no open flames or switches, evacuate if the smell is strong, and call the gas emergency line.',
    };
  }
  if (has(STRUCTURAL_SIGNS)) {
    return {
      urgency: 'emergency',
      safetyRisk: 'Structural danger reported.',
      escalate: true,
      guidance:
        'Escalate urgently: advise occupants to leave the affected area and dispatch a structural assessment before any repair work.',
    };
  }
  if (has(SECURITY_SIGNS)) {
    const urgency: Urgency = modelUrgency === 'emergency' ? 'emergency' : 'high';
    return {
      urgency,
      safetyRisk: modelRisk ?? 'Building security may be compromised.',
      escalate: true,
      guidance:
        'Escalate to security personnel or the caretaker promptly; residents cannot secure the building.',
    };
  }
  return { urgency: modelUrgency, safetyRisk: modelRisk, escalate: false, guidance: null };
}
