import { describe, expect, it, vi } from 'vitest';
import {
  createSecureOrder,
  isIdempotencyKeyValid,
  type CreateOrderResult,
} from '@/lib/order-pricing';
import { currencyDecimals, money } from '@/lib/utils';

/* ============================================================================
 * Money & currency helpers (audit: zero test coverage before this file).
 * ========================================================================== */

describe('money()', () => {
  it('rounds BHD to 3 decimals (half-up)', () => {
    expect(money(1.2344, 3)).toBe(1.234);
    expect(money(1.2345, 3)).toBe(1.235);
    expect(money(0.0005, 3)).toBe(0.001);
  });

  it('rounds SAR/AED/QAR to 2 decimals', () => {
    expect(money(9.994, 2)).toBe(9.99);
    expect(money(9.995, 2)).toBe(10);
    expect(money(0.005, 2)).toBe(0.01);
  });

  it('returns 0 for non-finite input', () => {
    expect(money(Number.NaN, 3)).toBe(0);
    expect(money(Number.POSITIVE_INFINITY, 3)).toBe(0);
    expect(money(Number.NEGATIVE_INFINITY, 3)).toBe(0);
  });
});

describe('currencyDecimals()', () => {
  it('uses 3 decimals for BHD/KWD and 2 for SAR/AED/QAR', () => {
    expect(currencyDecimals('BHD')).toBe(3);
    expect(currencyDecimals('KWD')).toBe(3);
    expect(currencyDecimals('SAR')).toBe(2);
    expect(currencyDecimals('AED')).toBe(2);
    expect(currencyDecimals('QAR')).toBe(2);
  });

  it('defaults to 2 decimals for unknown currencies', () => {
    expect(currencyDecimals('USD')).toBe(2);
    expect(currencyDecimals('usd')).toBe(2); // case-insensitive
  });
});

describe('isIdempotencyKeyValid()', () => {
  it('accepts uuids and url-safe keys of 8–128 chars', () => {
    expect(isIdempotencyKeyValid('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(isIdempotencyKeyValid('a'.repeat(8))).toBe(true);
    expect(isIdempotencyKeyValid('a'.repeat(128))).toBe(true);
  });

  it('rejects too-short, too-long, and non-string values', () => {
    expect(isIdempotencyKeyValid('a'.repeat(7))).toBe(false);
    expect(isIdempotencyKeyValid('a'.repeat(129))).toBe(false);
    expect(isIdempotencyKeyValid(42)).toBe(false);
    expect(isIdempotencyKeyValid(null)).toBe(false);
    expect(isIdempotencyKeyValid(undefined)).toBe(false);
  });

  it('rejects unsafe characters', () => {
    expect(isIdempotencyKeyValid('abc def')).toBe(false);
    expect(isIdempotencyKeyValid('abc/def')).toBe(false);
    expect(isIdempotencyKeyValid('abc?def')).toBe(false);
  });
});

/* ============================================================================
 * createSecureOrder — the financial engine (server-side totals).
 * A minimal fake client stands in for Supabase; RPC calls are recorded.
 * ========================================================================== */

type FakeOptions = {
  products?: Array<{ id: string; name: string; price: number; is_available: boolean; project_id: string }>;
  addons?: Array<{ id: string; name: string; price: number; is_available: boolean; product_id: string }>;
  orderNumber?: number;
};

function fakeClient(opts: FakeOptions = {}) {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  // The builder chain is intentionally loosely typed — PostgREST builders are
  // thenables; we only emulate the subset the pricing engine touches.
  const admin = {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const self = chain;
      chain.select = () => self;
      chain.in = () => self;
      chain.eq = () => self;
      chain.maybeSingle = async () => ({ data: null });
      chain.then = (onFulfilled: (v: unknown) => unknown) => {
        const data = table === 'products' ? (opts.products ?? []) : opts.addons ?? [];
        return Promise.resolve(onFulfilled({ data }));
      };
      return chain as never;
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === 'next_order_number') return { data: opts.orderNumber ?? 1 };
      if (fn === 'create_order_transactional') {
        return {
          data: {
            id: '00000000-0000-0000-0000-0000000000aa',
            status: 'pending',
            total_amount: args.p_total_amount,
            order_number: args.p_order_number,
          },
        };
      }
      return { data: null };
    },
  } as never;
  return { admin, rpcCalls };
}

const PROJECT = '11111111-1111-1111-1111-111111111111';

function makeProduct(overrides: Partial<NonNullable<FakeOptions['products']>[number]> = {}) {
  return {
    id: 'prod-11111111-1111-1111-1111-111111111111',
    name: 'قهوة',
    price: 1.5,
    is_available: true,
    project_id: PROJECT,
    ...overrides,
  };
}

function makeAddon(overrides: Partial<NonNullable<FakeOptions['addons']>[number]> = {}) {
  return {
    id: 'add-11111111-1111-1111-1111-111111111111',
    name: 'حليب',
    price: 0.5,
    is_available: true,
    product_id: 'prod-11111111-1111-1111-1111-111111111111',
    ...overrides,
  };
}

async function run(
  admin: never, // the fake Supabase client (admin) — typed never, used loosely
  items: Array<Record<string, unknown>>,
  extra: Partial<Parameters<typeof createSecureOrder>[1]> = {}
): Promise<CreateOrderResult> {
  return createSecureOrder(admin, {
    projectId: PROJECT,
    currency: 'BHD',
    tableId: null,
    type: 'dinein',
    items: items as never,
    ...extra,
  });
}

describe('createSecureOrder — pricing engine', () => {
  it('computes server-side totals: price + addons × quantity (BHD)', async () => {
    const { admin, rpcCalls } = fakeClient({
      products: [makeProduct()],
      addons: [makeAddon()],
    });
    const res = await run(admin, [
      { productId: makeProduct().id, quantity: 2, addonIds: [makeAddon().id] },
    ]);
    expect(res.ok).toBe(true);
    const createCall = rpcCalls.find((c) => c.fn === 'create_order_transactional');
    expect(createCall?.args.p_total_amount).toBe(4); // (1.5 + 0.5) × 2
    const line = (createCall?.args.p_items as Array<Record<string, unknown>>)[0];
    expect(line.unit_price).toBe(2);
    expect(line.quantity).toBe(2);
  });

  it('rounds per SAR (2 decimals) instead of hardcoded 3', async () => {
    const { admin, rpcCalls } = fakeClient({
      products: [makeProduct({ price: 9.995 })],
    });
    const res = await run(
      admin,
      [{ productId: makeProduct().id, quantity: 1, addonIds: [] }],
      { currency: 'SAR' }
    );
    expect(res.ok).toBe(true);
    const createCall = rpcCalls.find((c) => c.fn === 'create_order_transactional');
    expect(createCall?.args.p_total_amount).toBe(10); // 9.995 → 10.00 (2 decimals)
  });

  it('rejects a boolean quantity (Number(true) === 1 must not pass)', async () => {
    const { admin } = fakeClient({ products: [makeProduct()] });
    const res = await run(admin, [{ productId: makeProduct().id, quantity: true }]);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.error).toContain('صنف غير صالحة');
    }
  });

  it('rejects fractional / zero / oversized quantities', async () => {
    const { admin } = fakeClient({ products: [makeProduct()] });
    for (const q of [1.5, 0, -2, 100]) {
      const res = await run(admin, [{ productId: makeProduct().id, quantity: q }]);
      expect(res.ok).toBe(false);
    }
    // 99 is the documented cap (accepted)
    const ok99 = await run(admin, [{ productId: makeProduct().id, quantity: 99 }]);
    expect(ok99.ok).toBe(true);
  });

  it('rejects a negative product price with a clean 400 (not a DB 500)', async () => {
    const { admin } = fakeClient({ products: [makeProduct({ price: -5 })] });
    const res = await run(admin, [{ productId: makeProduct().id, quantity: 1 }]);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.error).toContain('سعر الصنف');
    }
  });

  it('accepts a zero-price product (falsy price is not a bug)', async () => {
    const { admin } = fakeClient({ products: [makeProduct({ price: 0 })] });
    const res = await run(admin, [{ productId: makeProduct().id, quantity: 1 }]);
    expect(res.ok).toBe(true);
  });

  it('rejects an addon that does not belong to the product', async () => {
    const { admin } = fakeClient({
      products: [makeProduct()],
      addons: [
        makeAddon({
          id: 'add-99999999-9999-9999-9999-999999999999',
          product_id: 'prod-99999999-9999-9999-9999-999999999999', // other product
        }),
      ],
    });
    const res = await run(admin, [
      { productId: makeProduct().id, quantity: 1, addonIds: ['add-99999999-9999-9999-9999-999999999999'] },
    ]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('إضافة غير صالحة');
  });

  it('rejects an unavailable product', async () => {
    const { admin } = fakeClient({ products: [makeProduct({ is_available: false })] });
    const res = await run(admin, [{ productId: makeProduct().id, quantity: 1 }]);
    expect(res.ok).toBe(false);
  });

  it('rejects empty baskets and oversized orders', async () => {
    const { admin } = fakeClient({ products: [makeProduct()] });
    const empty = await run(admin, []);
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error).toContain('فارغة');

    const many = Array.from({ length: 51 }, () => ({ productId: makeProduct().id, quantity: 1 }));
    const big = await run(admin, many);
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.error).toContain('كبير جداً');
  });

  it('rejects oversized order / item notes', async () => {
    const { admin } = fakeClient({ products: [makeProduct()] });
    const orderNotes = await run(
      admin,
      [{ productId: makeProduct().id, quantity: 1 }],
      { notes: 'x'.repeat(501) }
    );
    expect(orderNotes.ok).toBe(false);

    const itemNotes = await run(admin, [
      { productId: makeProduct().id, quantity: 1, notes: 'x'.repeat(201) },
    ]);
    expect(itemNotes.ok).toBe(false);
  });

  it('passes the idempotency key through to the transactional RPC', async () => {
    const { admin, rpcCalls } = fakeClient({ products: [makeProduct()] });
    const res = await run(
      admin,
      [{ productId: makeProduct().id, quantity: 1 }],
      { idempotencyKey: '123e4567-e89b-12d3-a456-426614174000' }
    );
    expect(res.ok).toBe(true);
    const createCall = rpcCalls.find((c) => c.fn === 'create_order_transactional');
    expect(createCall?.args.p_idempotency_key).toBe('123e4567-e89b-12d3-a456-426614174000');
  });
});