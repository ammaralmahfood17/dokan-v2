/**
 * Rate limiter for Dokan API routes.
 * Priority: Vercel KV (Redis) → Supabase Postgres (production default) → in-memory Map (dev/test only).
 *
 * Vercel KV: shared across serverless instances when KV_URL is configured.
 * Supabase: atomic counter via SECURITY DEFINER RPC (rate_limit_check) — works on
 *   serverless without extra services. This is the production path.
 * In-memory: local development/test only (per-instance, resets on cold starts).
 *
 * FAIL-CLOSED: if the configured backend errors, the request is DENIED (429, short
 * window) and the failure is logged loudly — rate limiting must never silently
 * degrade to a per-instance map that a serverless attacker can rotate around.
 * The in-memory map is only used when no backend is configured at all AND the
 * process is NOT production (dev/test).
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
  /** Optional tenant context forwarded to the DB guard on the
   * rate_limit_check RPC (defense-in-depth when the route knows the caller). */
  projectId?: string;
  callerUserId?: string;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number;
}

/** Fail-closed result used when a configured backend errors. */
function failClosed(extraMs = 10_000): RateLimitResult {
  return { allowed: false, remaining: 0, resetIn: extraMs };
}

/** Local in-memory rate limiting (dev/test only) — bounded, opportunistically evicted. */
function memoryRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const record = store.get(key);

  if (!record || now > record.resetAt) {
    if (store.size > 10_000) {
      for (const [k, v] of store) {
        if (now > v.resetAt) store.delete(k);
      }
    }
    store.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, remaining: options.limit - 1, resetIn: options.windowMs };
  }

  if (record.count >= options.limit) {
    return { allowed: false, remaining: 0, resetIn: record.resetAt - now };
  }

  record.count += 1;
  return { allowed: true, remaining: options.limit - record.count, resetIn: record.resetAt - now };
}

/**
 * Try using Vercel KV if configured. Returns null when KV is NOT configured
 * (fall through to the next backend); on a configured-backend error it fails
 * CLOSED so the limiter never silently degrades.
 */
async function kvRateLimit(
  key: string,
  options: RateLimitOptions
): Promise<RateLimitResult | null> {
  if (!process.env.KV_URL) return null; // KV not configured
  try {
    const cache = (await import('@/lib/cache')).getCacheProvider();
    const now = Date.now();
    const windowSeconds = Math.ceil(options.windowMs / 1000);
    const result = await cache.hGetAll<{ count: number; resetAt: number }>(key);

    if (!result || now > result.resetAt) {
      await cache.hSet(key, { count: 1, resetAt: now + options.windowMs });
      await cache.expire(key, windowSeconds);
      return { allowed: true, remaining: options.limit - 1, resetIn: options.windowMs };
    }

    if (result.count >= options.limit) {
      return { allowed: false, remaining: 0, resetIn: result.resetAt - now };
    }

    await cache.hIncrBy(key, 'count', 1);
    return { allowed: true, remaining: options.limit - result.count - 1, resetIn: result.resetAt - now };
  } catch (err) {
    console.error(`[rate-limit] KV backend failed (failing closed for ${key}):`, err);
    return failClosed();
  }
}

/**
 * Supabase Postgres rate limiter — atomic counter via SECURITY DEFINER RPC.
 * Works on serverless (shared DB, no per-instance state). Fails CLOSED on error.
 */
async function supabaseRateLimit(
  key: string,
  options: RateLimitOptions
): Promise<RateLimitResult | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null; // not configured
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('rate_limit_check', {
      p_key: key,
      p_limit: options.limit,
      p_window_ms: options.windowMs,
      ...(options.projectId ? { p_project_id: options.projectId } : {}),
      ...(options.callerUserId ? { p_caller_user_id: options.callerUserId } : {}),
    });
    if (error) {
      console.error(`[rate-limit] Postgres backend failed (failing closed for ${key}):`, error);
      return failClosed();
    }
    const result = data as unknown as {
      allowed: boolean;
      remaining: number;
      reset_in: number;
    } | null;
    if (!result) return failClosed();
    return {
      allowed: result.allowed,
      remaining: result.remaining,
      resetIn: Math.round(result.reset_in),
    };
  } catch (err) {
    console.error(`[rate-limit] Postgres backend threw (failing closed for ${key}):`, err);
    return failClosed();
  }
}

export async function rateLimit(
  identifier: string,
  options: RateLimitOptions = { limit: 10, windowMs: 60 * 1000 }
): Promise<RateLimitResult> {
  const key = options.keyPrefix ? `${options.keyPrefix}:${identifier}` : identifier;

  // 1. Vercel KV if configured
  const kvResult = await kvRateLimit(key, options);
  if (kvResult) return kvResult;

  // 2. Supabase Postgres (production path)
  const supabaseResult = await supabaseRateLimit(key, options);
  if (supabaseResult) return supabaseResult;

  // 3. No backend configured at all — in-memory map for dev/test only.
  if (process.env.NODE_ENV !== 'production') {
    return memoryRateLimit(key, options);
  }

  // Production without any limiter backend is a misconfiguration — never run
  // unprotected. Fail closed for a short window and surface loudly.
  console.error(`[rate-limit] NO backend configured (KV_URL unset, no service role key) — request denied for ${key}`);
  return failClosed(30_000);
}

export function createRateLimitResponse(resetIn: number): { error: string; status: number } {
  const seconds = Math.ceil(resetIn / 1000);
  return {
    error: `طلبات كثيرة. حاول مرة أخرى بعد ${seconds} ثوانٍ.`,
    status: 429,
  };
}