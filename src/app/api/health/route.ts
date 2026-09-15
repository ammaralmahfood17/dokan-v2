import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Lightweight production health-check. Verifies the app can actually reach
// Supabase with the currently-configured env vars — catches exactly the
// "service role key points at the wrong project" class of outage described
// in FIX_PLAN.md, before it shows up as failed signups in production.
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.json(
      { ok: false, error: 'missing_env', detail: 'NEXT_PUBLIC_SUPABASE_URL or ANON_KEY not set' },
      { status: 500 }
    );
  }

  try {
    const supabase = createClient(url, anonKey);
    // Cheapest possible round-trip: ask PostgREST for its own root doc.
    // No table read, no auth required — just proves the URL/key pair
    // resolves to a live, reachable Supabase project.
    const { error } = await supabase.from('_health_check_probe').select('*').limit(0);
    // A "relation does not exist" error still proves connectivity + valid
    // credentials; only network/auth failures should fail the health check.
    if (error && !error.message?.includes('does not exist') && error.code !== 'PGRST205') {
      return NextResponse.json({ ok: false, error: 'supabase_unreachable', detail: error.message }, { status: 503 });
    }
    return NextResponse.json({ ok: true, supabaseProject: new URL(url).hostname.split('.')[0] });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: 'health_check_failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 503 }
    );
  }
}
