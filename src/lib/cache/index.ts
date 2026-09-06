/**
 * Cache provider abstraction — Dokan.
 *
 * Rate limiting needs a shared hash-store across serverless instances.
 * Vercel KV (Redis-compatible) is the current provider; Upstash Redis is a
 * drop-in replacement when/if we leave Vercel. Switching providers = touching
 * getCacheProvider() only (add the new provider class + flip the env var).
 */
export interface CacheProvider {
  hGetAll<T extends Record<string, unknown>>(key: string): Promise<T | null>;
  hSet(key: string, fields: Record<string, unknown>): Promise<void>;
  hIncrBy(key: string, field: string, by: number): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
}

/**
 * Vercel KV provider (Redis protocol). Loaded lazily so the package is only
 * imported when actually configured (KV_URL set).
 */
class VercelKVProvider implements CacheProvider {
  private kvPromise: Promise<typeof import('@vercel/kv')> | null = null;

  private async kv() {
    if (!this.kvPromise) this.kvPromise = import('@vercel/kv');
    return this.kvPromise;
  }

  async hGetAll<T extends Record<string, unknown>>(key: string): Promise<T | null> {
    const { kv } = await this.kv();
    return kv.hgetall<T>(key);
  }

  async hSet(key: string, fields: Record<string, unknown>): Promise<void> {
    const { kv } = await this.kv();
    await kv.hset(key, fields);
  }

  async hIncrBy(key: string, field: string, by: number): Promise<number> {
    const { kv } = await this.kv();
    return kv.hincrby(key, field, by);
  }

  async expire(key: string, seconds: number): Promise<void> {
    const { kv } = await this.kv();
    await kv.expire(key, seconds);
  }
}

/**
 * Upstash Redis provider (REST protocol). Loaded lazily so the package is
 * only imported when actually configured (KV_URL set with Upstash REST URL).
 */
class UpstashRedisProvider implements CacheProvider {
  private redisPromise: Promise<import('@upstash/redis').Redis> | null = null;

  private async redis() {
    if (!this.redisPromise) {
      if (!process.env.KV_URL || !process.env.KV_REST_API_TOKEN) {
        throw new Error('KV_REST_API_URL and KV_REST_API_TOKEN are required for the Upstash cache provider');
      }
      const { Redis } = await import('@upstash/redis');
      this.redisPromise = Promise.resolve(Redis.fromEnv());
    }
    return this.redisPromise;
  }

  async hGetAll<T extends Record<string, unknown>>(key: string): Promise<T | null> {
    const redis = await this.redis();
    return redis.hgetall<T>(key);
  }

  async hSet(key: string, fields: Record<string, unknown>): Promise<void> {
    const redis = await this.redis();
    await redis.hset(key, fields);
  }

  async hIncrBy(key: string, field: string, by: number): Promise<number> {
    const redis = await this.redis();
    return redis.hincrby(key, field, by);
  }

  async expire(key: string, seconds: number): Promise<void> {
    const redis = await this.redis();
    await redis.expire(key, seconds);
  }
}

let cacheProvider: CacheProvider | null = null;

/**
 * Resolve the active cache provider.
 *  - CACHE_PROVIDER=upstash → UpstashRedisProvider (KV_URL = Upstash REST URL)
 *  - default → VercelKVProvider
 */
export function getCacheProvider(): CacheProvider {
  if (!cacheProvider) {
    if (process.env.CACHE_PROVIDER === 'upstash') {
      cacheProvider = new UpstashRedisProvider();
    } else {
      cacheProvider = new VercelKVProvider();
    }
  }
  return cacheProvider;
}
