/**
 * Rate limiter for Dokan API routes.
 * Uses Vercel KV (Redis) when available, falls back to in-memory Map.
 *
 * Vercel KV: production-grade, shared across serverless instances.
 * In-memory fallback: local development only (resets on cold starts).
 */

type RateLimitRecord = {
  count: number;
  resetAt: number;
};

const store = new Map<string, RateLimitRecord>();

interface RateLimitOptions {
  limit: number;      // max requests
  windowMs: number;   // time window in ms
  keyPrefix?: string;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number;
}

/**
 * Try using Vercel KV if configured, otherwise use in-memory Map.
 */
async function kvRateLimit(
  key: string,
  options: RateLimitOptions
): Promise<RateLimitResult | null> {
  try {
    const { kv } = await import('@vercel/kv');
    if (!process.env.KV_URL) return null; // KV not configured

    const now = Date.now();
    const windowSeconds = Math.ceil(options.windowMs / 1000);
    const result = await kv.hgetall<{ count: number; resetAt: number }>(key);

    if (!result || now > result.resetAt) {
      await kv.hset(key, { count: 1, resetAt: now + options.windowMs });
      await kv.expire(key, windowSeconds);
      return { allowed: true, remaining: options.limit - 1, resetIn: options.windowMs };
    }

    if (result.count >= options.limit) {
      return { allowed: false, remaining: 0, resetIn: result.resetAt - now };
    }

    await kv.hincrby(key, 'count', 1);
    return { allowed: true, remaining: options.limit - result.count - 1, resetIn: result.resetAt - now };
  } catch {
    return null; // Fall through to in-memory
  }
}

export async function rateLimit(
  identifier: string,
  options: RateLimitOptions = { limit: 10, windowMs: 60 * 1000 }
): Promise<RateLimitResult> {
  const key = options.keyPrefix ? `${options.keyPrefix}:${identifier}` : identifier;

  // Try Vercel KV first
  const kvResult = await kvRateLimit(key, options);
  if (kvResult) return kvResult;

  // Fallback: in-memory Map
  const now = Date.now();
  const record = store.get(key);

  if (!record || now > record.resetAt) {
    store.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, remaining: options.limit - 1, resetIn: options.windowMs };
  }

  if (record.count >= options.limit) {
    return { allowed: false, remaining: 0, resetIn: record.resetAt - now };
  }

  record.count += 1;
  return { allowed: true, remaining: options.limit - record.count, resetIn: record.resetAt - now };
}

export function createRateLimitResponse(resetIn: number): { error: string; status: number } {
  const seconds = Math.ceil(resetIn / 1000);
  return {
    error: `طلبات كثيرة. حاول مرة أخرى بعد ${seconds} ثوانٍ.`,
    status: 429,
  };
}
