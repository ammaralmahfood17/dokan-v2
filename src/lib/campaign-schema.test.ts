import { describe, expect, it } from 'vitest';
import {
  AudienceFilterSchema,
  customerMatchesAudience,
  describeAudience,
} from '@/lib/campaign-schema';
import type { Customer } from '@/lib/types';

const base: Customer = {
  id: 'c1',
  project_id: 'p1',
  phone: '39712345',
  name: null,
  name_en: null,
  email: null,
  loyalty_points: 50,
  total_spent: 20,
  visit_count: 3,
  last_visit_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  is_opted_in: true,
  notes: null,
  created_at: new Date().toISOString(),
};

describe('customerMatchesAudience()', () => {
  it('matches everyone when the filter is empty', () => {
    expect(customerMatchesAudience(base, {})).toBe(true);
  });

  it('filters by min loyalty points', () => {
    expect(customerMatchesAudience(base, { minLoyalty: 50 })).toBe(true);
    expect(customerMatchesAudience(base, { minLoyalty: 51 })).toBe(false);
  });

  it('filters by min visits', () => {
    expect(customerMatchesAudience(base, { minVisits: 3 })).toBe(true);
    expect(customerMatchesAudience(base, { minVisits: 4 })).toBe(false);
  });

  it('filters by min spend', () => {
    expect(customerMatchesAudience(base, { minSpent: 20 })).toBe(true);
    expect(customerMatchesAudience(base, { minSpent: 20.001 })).toBe(false);
  });

  it('filters by last visit within N days', () => {
    expect(customerMatchesAudience(base, { lastVisitWithinDays: 3 })).toBe(true);
    expect(customerMatchesAudience(base, { lastVisitWithinDays: 1 })).toBe(false);
    const never = { ...base, last_visit_at: null };
    expect(customerMatchesAudience(never, { lastVisitWithinDays: 30 })).toBe(false);
  });

  it('combines every condition with AND', () => {
    expect(
      customerMatchesAudience(base, { minLoyalty: 50, minVisits: 3, minSpent: 20, lastVisitWithinDays: 3 })
    ).toBe(true);
    expect(
      customerMatchesAudience(base, { minLoyalty: 50, minVisits: 3, minSpent: 999 })
    ).toBe(false);
  });
});

describe('AudienceFilterSchema', () => {
  it('rejects negative and non-integer lastVisitWithinDays', () => {
    expect(AudienceFilterSchema.safeParse({ lastVisitWithinDays: 0 }).success).toBe(false);
    expect(AudienceFilterSchema.safeParse({ minLoyalty: -1 }).success).toBe(false);
    expect(AudienceFilterSchema.safeParse({ lastVisitWithinDays: 3.5 }).success).toBe(false);
    expect(AudienceFilterSchema.safeParse({ minVisits: 2 }).success).toBe(true);
  });

  it('strips unknown keys', () => {
    const r = AudienceFilterSchema.safeParse({ minLoyalty: 10, tags: ['x'] });
    expect(r.success).toBe(true);
    if (r.success) expect('tags' in r.data).toBe(false);
  });
});

describe('describeAudience()', () => {
  it('falls back to everyone when empty', () => {
    expect(describeAudience({})).toEqual(['جميع العملاء المشتركين']);
  });

  it('renders each active condition', () => {
    const parts = describeAudience({ minLoyalty: 100, lastVisitWithinDays: 7 });
    expect(parts).toContain('نقاط ولاء ≥ 100');
    expect(parts).toContain('آخر زيارة ≤ 7 يوم');
  });
});