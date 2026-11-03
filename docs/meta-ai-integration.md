# Meta AI Integration

Primary provider: **Meta Model API** (`https://api.meta.ai/v1`,
OpenAI-compatible). Without a key the app runs on a deterministic local
fallback engine so the UI and workflows stay demonstrable; the header and
sidebar always show which engine served each turn.

## Models and endpoints

| Capability | Model / endpoint | Use |
|---|---|---|
| Chat + reasoning | `muse-spark-1.3` · `POST {base}/chat/completions` | Intent, complaint extraction, drafts |
| Vision | `muse-spark-1.3` (image input) | Damage description, symptoms, visible unit numbers |
| Segmentation | `sam-3.1` · `POST {base}/responses` | Damage-region boxes overlaid on the photo |
| Voice | Meta ASR · `POST {base}/asr/transcribe` | Voice notes → complaint text (4 MB cap) |

Configuration (`src/server/config.ts`, see `.env.example`):

- `META_API_KEY` (secret, server-side only), `META_API_BASE_URL`,
  `META_MODEL`, `META_TIMEOUT_MS` (90s — vision + reasoning calls are slow),
  `AGENT_MAX_ITERATIONS`.

## How vision works

1. The manager attaches a photo (JPEG/PNG/WebP, ≤ 4 MB) with the complaint.
2. Extraction marks the attachment (`buildExtractionPayload`) so Spark mines
   the image for visible damage, symptoms, and door/unit numbers.
3. If clarification is needed (missing property), the photo is cached
   server-side (memory-only, never persisted) and the photo-informed analysis
   is stored with the pending complaint — the follow-up answer never goes
   blind.
4. SAM 3.1 grounds simple category nouns (e.g. `pipe`) to bounding boxes;
   matches render as an overlay, misses are reported honestly in the agent
   trail ("found no matching damage regions").

The model assists human inspection; it never makes definitive structural
diagnoses, and the deterministic safety layer (`safety.ts`) can only escalate,
never downgrade, hazard urgency.

## Fallback behavior

- Any Meta call may fail over to the local engine mid-turn (event recorded in
  the agent trail); the turn completes instead of erroring.
- With no `META_API_KEY` at all, every turn runs locally end to end.

## Verification

- `npm run verify:meta` (`scripts/verify-meta.mjs`) exercises text + vision
  against the live API (~3s) and reports the model, latency, and engine.
- `tests/sam.test.ts` pins SAM response parsing; `tests/agent.test.ts` covers
  the photo-clarification round trip (cache hit, cache miss merge, and
  no-photo behavior).
- The public demo at `https://copilot.letrents.com` runs engine `meta`
  (`/api/copilot/status`).
