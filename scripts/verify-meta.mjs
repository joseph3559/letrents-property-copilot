// Smallest possible Meta API check. Run: npm run verify:meta
// Self-contained (no TS/build step) so judges can run it directly.
// Exits 0 with the model reply on success; exits 2 with a diagnosis otherwise.
// Never prints the API key.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loader (no dependency).
function loadDotEnv() {
  for (const name of ['.env', '.env.local']) {
    const path = join(root, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const key = trimmed.slice(0, trimmed.indexOf('=')).trim();
      let value = trimmed.slice(trimmed.indexOf('=') + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

async function main() {
  loadDotEnv();
  const apiKey = (process.env.META_API_KEY || '').trim();
  const baseUrl = (process.env.META_API_BASE_URL || 'https://api.meta.ai/v1').trim();
  const model = (process.env.META_MODEL || 'muse-spark-1.3').trim();
  const timeoutMs = Number.parseInt(process.env.META_TIMEOUT_MS || '30000', 10) || 30000;

  if (!apiKey) {
    console.error('META_API_KEY is not set. Copy .env.example to .env and add a Llama API key.');
    console.error('Without a key the app runs on the labeled local fallback engine.');
    process.exit(2);
  }
  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Model:    ${model}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: '[TASK: HEALTH_CHECK] Reply with exactly: {"ok": true}' },
          { role: 'user', content: 'ping' },
        ],
        temperature: 0,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    if (res.status === 401 || res.status === 403) {
      console.error('FAILED: Meta API rejected the API key. Check META_API_KEY.');
      process.exit(2);
    }
    if (res.status === 429) {
      console.error('FAILED: Meta API rate limit reached. Wait and retry.');
      process.exit(2);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`FAILED: HTTP ${res.status} ${text.slice(0, 300)}`);
      process.exit(2);
    }
    const parsed = await res.json();
    const text = parsed?.choices?.[0]?.message?.content?.trim() || '';
    if (!text) {
      console.error('FAILED: Meta API returned an empty response.');
      process.exit(2);
    }
    console.log(`OK in ${Date.now() - started}ms. Model replied:`);
    console.log(text);
  } catch (error) {
    if (error?.name === 'AbortError') {
      console.error(`FAILED: timed out after ${timeoutMs}ms.`);
    } else {
      console.error(`FAILED: ${error?.message || 'network error'}`);
    }
    process.exit(2);
  } finally {
    clearTimeout(timer);
  }
}

await main();
