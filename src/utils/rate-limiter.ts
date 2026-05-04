// Token bucket rate limiter: 300 req/min with exponential backoff on 429
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 300;
const timestamps: number[] = [];
let backoffMs = 0;

export async function enforceRateLimit(): Promise<void> {
  const now = Date.now();

  // Apply backoff if we've hit rate limit recently
  if (backoffMs > 0) {
    const elapsed = now - (timestamps[timestamps.length - 1] ?? now);
    if (elapsed < backoffMs) {
      const waitMs = backoffMs - elapsed;
      console.error(
        `[rate-limiter] Backoff active — waiting ${waitMs}ms (backoff: ${backoffMs}ms)`
      );
      await new Promise((r) => setTimeout(r, waitMs));
      backoffMs = 0; // Reset backoff after wait
    }
  }

  // Slide window: remove timestamps older than 1 minute
  while (timestamps.length > 0 && timestamps[0] < now - WINDOW_MS) {
    timestamps.shift();
  }

  // Check if we're at capacity
  if (timestamps.length >= MAX_REQUESTS) {
    const oldestTs = timestamps[0];
    const waitMs = WINDOW_MS - (now - oldestTs) + 50;
    console.error(
      `[rate-limiter] Approaching 300 req/min — waiting ${waitMs}ms`
    );
    await new Promise((r) => setTimeout(r, waitMs));
    // Remove oldest after waiting
    timestamps.shift();
  }

  timestamps.push(Date.now());
}

export function recordRateLimitHit(retryAfterMs?: number): void {
  // Exponential backoff: start at 1s, double each time, max 30s
  backoffMs = Math.min((backoffMs || 1000) * 2, 30_000);
  if (retryAfterMs) {
    backoffMs = Math.min(retryAfterMs, backoffMs);
  }
  console.error(
    `[rate-limiter] 429 Too Many Requests — scheduling ${backoffMs}ms backoff`
  );
}
