import type { MetadataRoute } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Dynamic sitemap generation for Dokan v2.
 * Fetches all active tables (with their project slug) so every real public
 * menu URL is indexed — '/' is not a valid tableSlug, so we never guess.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createAdminClient();

  const { data: tables, error } = await supabase
    .from('tables')
    .select('slug, projects!inner(slug)')
    .eq('is_active', true)
    .eq('projects.is_active', true);

  if (error || !tables) {
    console.error('Sitemap fetch error:', error);
    return [
      {
        url: 'https://www.dokanstore.xyz',
        lastModified: new Date(),
        changeFrequency: 'monthly',
        priority: 1,
      },
    ];
  }

  const menuUrls = tables.map((t) => {
    const projectSlug = (t.projects as unknown as { slug: string }).slug;
    return {
      url: `https://www.dokanstore.xyz/${projectSlug}/menu/${t.slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    };
  });

  const staticUrls = [
    {
      url: 'https://www.dokanstore.xyz',
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 1,
    },
    {
      url: 'https://www.dokanstore.xyz/login',
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    },
    {
      url: 'https://www.dokanstore.xyz/register',
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    },
  ];

  return [...staticUrls, ...menuUrls];
}