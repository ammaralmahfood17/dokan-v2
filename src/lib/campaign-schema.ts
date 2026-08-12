import { z } from 'zod';

/**
 * Audience filter schema for marketing campaigns.
 * Validates the JSONB structure of campaign targets.
 */
export const AudienceFilterSchema = z.object({
  minVisits: z.number().min(0).optional(),
  minSpent: z.number().min(0).optional(),
  lastVisitWithinDays: z.number().min(1).optional(),
  tags: z.array(z.string()).optional(),
});

export type AudienceFilter = z.infer<typeof AudienceFilterSchema>;
