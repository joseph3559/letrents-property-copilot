# Demo script — LETRENTS Property Copilot (3 minutes)

## Before the demo

```bash
rm -rf .data          # fresh deterministic state
npm run dev           # open http://localhost:3100
```

Check the engine badge (top right): green “Meta AI · …” with a key configured,
amber “Local fallback” without one.

## Opening — 20 seconds

“Property managers receive maintenance complaints every day. LETRENTS Property
Copilot turns those complaints into intelligent, actionable maintenance
workflows — with a human approving every consequential step.”

## Core flow — 90 seconds

1. Click demo scenario 1 (leaking pipe in B201) or paste:
   `There is a leaking pipe in B201. Water is spreading across the kitchen floor.`
2. Point out: category + urgency card, Sunrise Apartments / Unit B201 / tenant
   resolution, maintenance history, plumber recommendation, tenant draft.
3. Click “Approve & create” → Confirm.
4. Show the new `MNT-1101` record in the Maintenance panel and the audit events
   in the Activity tab.

## Intelligence — 40 seconds

Ask: `Summarize all unresolved maintenance issues in Sunrise Apartments.`

Show the grounded list with real references (MNT-1002, MNT-1003, MNT-1005…).

## Safety — 30 seconds

Ask: `There are sparks coming from the electrical panel in C301.`

Show the emergency escalation banner and guidance. Note: the safety override is
deterministic code, not a model suggestion.

## Close

“AI reasoning, real property records, authorized tools, and human approval —
that is the Copilot.”

## Backup scenarios (if asked)

- Duplicate: submit the B201 leak twice → second is blocked as a duplicate.
- Ambiguous: `The water pump is not working.` → asks which property, never guesses.
- Security: `The main entrance lock is broken…` → high urgency + escalation.
- Rejection: propose any complaint, click Reject → nothing is created, audit kept.
