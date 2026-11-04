import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, READ_TIMEOUT_MS, SEND_TIMEOUT_MS } from '../src/components/api';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.useRealTimers();
});

/** A fetch stub that hangs until its signal aborts, like a stalled network. */
function hangUntilAbort(): typeof fetch {
  return (async (_input: unknown, init?: { signal?: AbortSignal | null }) => {
    await new Promise<never>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
    });
    throw new Error('unreachable');
  }) as unknown as typeof fetch;
}

describe('client api hang guards', () => {
  it('aborts a hung read after the read timeout', async () => {
    vi.useFakeTimers();
    globalThis.fetch = hangUntilAbort();
    const pending = api.status();
    const assertion = expect(pending).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS + 1000);
    await assertion;
  });

  it('gives sends a longer budget than reads, then aborts', async () => {
    vi.useFakeTimers();
    globalThis.fetch = hangUntilAbort();
    expect(SEND_TIMEOUT_MS).toBeGreaterThan(READ_TIMEOUT_MS);
    let settled = false;
    let failure: unknown = null;
    const pending = api.send('hello').then(
      () => {
        settled = true;
      },
      (e: unknown) => {
        settled = true;
        failure = e;
      }
    );
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS + 1000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS);
    await pending;
    expect(settled).toBe(true);
    expect(String((failure as Error)?.message ?? failure)).toMatch(/timed out/i);
  });

  it('still resolves healthy responses', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ success: true, message: 'ok', data: { ping: 1 } }))) as unknown as typeof fetch;
    await expect(api.status()).resolves.toEqual({ ping: 1 });
  });
});
