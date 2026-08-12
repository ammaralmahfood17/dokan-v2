import { z } from 'zod';
import type { Customer } from './types';

/**
 * Audience filter schema for marketing campaigns.
 * Validates the JSONB structure of campaign.audience_filter and provides a
 * pure matcher so the admin panel can preview reach before sending.
 */
export const AudienceFilterSchema = z.object({
  minLoyalty: z.number().min(0).optional(),
  minVisits: z.number().min(0).optional(),
  minSpent: z.number().min(0).optional(),
  lastVisitWithinDays: z.number().min(1).int().optional(),
});

export type AudienceFilter = z.infer<typeof AudienceFilterSchema>;

/** True when the customer satisfies every field present in the filter. */
export function customerMatchesAudience(c: Customer, f: AudienceFilter): boolean {
  if (f.minLoyalty != null && c.loyalty_points < f.minLoyalty) return false;
  if (f.minVisits != null && c.visit_count < f.minVisits) return false;
  if (f.minSpent != null && c.total_spent < f.minSpent) return false;
  if (f.lastVisitWithinDays != null) {
    if (!c.last_visit_at) return false;
    const cutoff = Date.now() - f.lastVisitWithinDays * 86_400_000;
    if (new Date(c.last_visit_at).getTime() < cutoff) return false;
  }
  return true;
}

/** Human-readable Arabic summary of an audience filter, e.g. "نقاط ≥ 100". */
export function describeAudience(f: AudienceFilter): string[] {
  const parts: string[] = [];
  if (f.minLoyalty != null) parts.push(`نقاط ولاء ≥ ${f.minLoyalty}`);
  if (f.minVisits != null) parts.push(`زيارات ≥ ${f.minVisits}`);
  if (f.minSpent != null) parts.push(`إنفاق ≥ ${f.minSpent}`);
  if (f.lastVisitWithinDays != null) parts.push(`آخر زيارة ≤ ${f.lastVisitWithinDays} يوم`);
  if (parts.length === 0) parts.push('جميع العملاء المشتركين');
  return parts;
}
