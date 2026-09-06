import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('getCacheProvider', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('defaults to VercelKVProvider (no throw)', async () => {
    const { getCacheProvider } = await import('@/lib/cache');
    expect(() => getCacheProvider()).not.toThrow();
  });

  it('CACHE_PROVIDER=upstash returns a provider implementing the interface', async () => {
    vi.stubEnv('CACHE_PROVIDER', 'upstash');
    vi.stubEnv('KV_REST_API_URL', 'https://example.upstash.io');
    vi.stubEnv('KV_REST_API_TOKEN', 'test-token');
    const { getCacheProvider } = await import('@/lib/cache');
    const p = getCacheProvider();
    expect(typeof p.hGetAll).toBe('function');
    expect(typeof p.hSet).toBe('function');
    expect(typeof p.hIncrBy).toBe('function');
    expect(typeof p.expire).toBe('function');
  });

  it('same instance returned (singleton)', async () => {
    const { getCacheProvider } = await import('@/lib/cache');
    expect(getCacheProvider()).toBe(getCacheProvider());
  });

  it('upstash without KV_REST_API_URL throws at call time, not import time', async () => {
    vi.stubEnv('CACHE_PROVIDER', 'upstash');
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    const { getCacheProvider } = await import('@/lib/cache');
    const p = getCacheProvider();
    await expect(p.hGetAll('k')).rejects.toThrow(/KV_REST_API/);
  });
});
