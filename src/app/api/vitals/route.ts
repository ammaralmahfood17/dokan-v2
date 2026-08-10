import { NextResponse } from 'next/server';

/**
 * Collects Core Web Vitals beacons (see src/components/web-vitals.tsx).
 * No sensitive data — metric id/name/value/delta/path only.
 * Visible in Vercel function logs: "web-vitals LCP 1842ms /dashboard"
 */
export async function POST(request: Request) {
  try {
    const body = await request.text();
    let parsed: Record<string, unknown> | null = null;
    try { parsed = JSON.parse(body); } catch { /* ignore malformed */ }

    if (parsed?.name && typeof parsed.value === 'number') {
      // JSON-serialize the attacker-controlled fields (CRLF-safe): a raw
      // interpolated `name`/`path` could inject fake lines into Vercel logs.
      console.log(
        `web-vitals ${JSON.stringify(parsed.name)} ${parsed.value}ms path=${JSON.stringify(parsed.path ?? '/')}`
      );
    }
  } catch {
    // never block the page on a metrics beacon
  }

  return NextResponse.json({ ok: true });
}
