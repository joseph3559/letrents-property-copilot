# Architecture

LETRENTS Property Copilot is a Next.js application: React frontend + API routes
backed by an AI agent loop. The agent reasons with Meta AI and acts through a
narrow, validated tool registry. Every consequential action waits for human
approval; every execution is audited.

```
Browser (manager workspace: sidebar · chat · inspector)
  │  /api/copilot/* (Next.js route handlers, zod-validated)
  ▼
CopilotAgent (src/server/agent/loop.ts)
  │  classify → analyze → resolve → propose → approve → execute → audit
  ├─► Meta provider (Spark chat/vision) with local fallback
  ├─► SAM 3.1 segmentation (photo damage regions, best-effort)
  ├─► Voice transcription (Meta ASR)
  └─► Tool registry (15 tools) ─► Adapter ─► records
```

## Request flow

1. `POST /api/copilot/messages` validates `{ content, conversationId?, imageDataUrl? }`.
2. The agent classifies intent (`complaint` | `question` | `greeting`).
3. Complaints: structured extraction (category, urgency, unit/property
   mentions, symptoms) → property/unit resolution → history + duplicate check →
   staff recommendation + tenant draft → **pending approval**.
4. Slot answers ("Sunrise Apartments", "B201") continue a pending complaint
   instead of starting fresh; clarification reuses the cached photo and the
   stored photo-informed analysis.
5. Questions: briefing, reference drill-down (`MNT-1002`), unit drill-down,
   portfolio queries — all answered from retrieved records, never invented.
6. `POST /api/copilot/approvals/[id]` executes (`approve`) or blocks (`reject`)
   with an optional operator note; both paths write audit events.

## Agent loop and tools

- Bounded tool iterations (`AGENT_MAX_ITERATIONS`, default 12) with a hard
  error when exceeded — the agent cannot loop forever.
- Tools derive organization and permissions from the server-side session
  context, never from model-supplied arguments.
- All tool arguments and all model outputs are validated with zod schemas
  (`src/server/agent/schemas.ts`); model JSON is never trusted raw.
- Duplicate detection blocks second tickets for the same issue at the same
  location.

## Adapter seam (public demo vs production)

The agent talks to records only through an adapter interface:

- `DemoAdapter` (public, this repo): synthetic Nairobi dataset
  (Sunrise Apartments, Acacia Heights), JSON-file persistence in `DEMO_DATA_DIR`.
- `PropertyManagementAdapter` (private): the same interface over real LETRENTS
  services. Production code stays private; only patterns are shared.

One Copilot, two data sources. Judges run the demo adapter with their own
`META_API_KEY` — no LETRENTS access needed.

## Deterministic safety layer

`src/server/agent/safety.ts` overrides the model on safety-critical signals:
electrical, fire, flood, gas, structural, and security hazards escalate
urgency and attach human-escalation guidance regardless of what the model
said. Tests in `tests/safety.test.ts` pin this behavior.

## Persistence

- Conversations, maintenance requests, approvals, audit events, and the
  reference counter live behind a tiny store interface
  (`load`/`update`/`reset`), with two backends:
  - `DemoStore`: small JSON files (atomic tmp-write + rename, serialized
    write chain). Local development default.
  - `KvStore`: Vercel KV (Redis), one key per collection, no local cache so
    every serverless instance sees one shared truth. Selected automatically
    when `KV_REST_API_URL` + `KV_REST_API_TOKEN` are set (Vercel injects them
    when a KV database is connected in the dashboard).
- Without KV on a read-only serverless filesystem, the file store degrades to
  memory-only mode instead of crashing — but state stays per-instance, so
  production must connect KV to avoid cross-request 404s.
- Photos are never persisted: attached images live in request scope plus a
  bounded in-memory cache (10 entries) so clarification follow-ups keep
  vision context.

## Frontend

- `src/components/CopilotApp.tsx`: three-panel workspace (sidebar, thread,
  inspector), theme toggle, voice input, photo attach with thumbnails.
- `src/components/ResultCards.tsx`: analysis, history, staff, tenant draft,
  approval cards, clarification chips, follow-up suggestions.
- `src/components/ConfirmDialog.tsx`: reusable animated confirmation modal
  (approvals, rejections, demo reset).
- All secrets stay server-side; the browser only sees validated view models.
