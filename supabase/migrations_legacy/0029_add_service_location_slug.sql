-- ============================================================================
-- Phase 1: Add slug column to service_locations for friendly table URLs
-- This enables the routing pattern: /{projectSlug}/menu/{tableSlug}
-- ============================================================================

-- Add the slug column (friendly identifier like "table-1", "car-2")
ALTER TABLE public.service_locations
ADD COLUMN IF NOT EXISTS slug TEXT;

-- Backfill existing rows with a safe default slug per branch
-- Format: table-1, table-2... (or preserve friendly label when possible)
WITH ranked AS (
  SELECT 
    id,
    'table-' || ROW_NUMBER() OVER (PARTITION BY branch_id ORDER BY created_at) AS new_slug
  FROM public.service_locations
  WHERE slug IS NULL
)
UPDATE public.service_locations sl
SET slug = ranked.new_slug
FROM ranked
WHERE sl.id = ranked.id;

-- Make slug required
ALTER TABLE public.service_locations
ALTER COLUMN slug SET NOT NULL;

-- Unique per branch (we can relax to per-business later if needed)
CREATE UNIQUE INDEX IF NOT EXISTS service_locations_branch_slug_unique 
ON public.service_locations (branch_id, slug);

-- Optional: index for fast lookup by slug in public routes
CREATE INDEX IF NOT EXISTS idx_service_locations_slug 
ON public.service_locations (slug);

COMMENT ON COLUMN public.service_locations.slug IS 'Friendly slug for public URLs (e.g. table-1). Used in /{businessSlug}/menu/{tableSlug}';