// Supabase Edge Function: invite-staff
// Deploy with: supabase functions deploy invite-staff
// Requires SERVICE_ROLE_KEY to be set as a function secret (Supabase forbids
// (never exposed to the browser — this function runs server-side only).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// Supabase forbids secret names starting with SUPABASE_, so the service-role
// key is stored under SERVICE_ROLE_KEY in the function's secrets.
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!;
const SITE_URL = Deno.env.get('SITE_URL') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': SITE_URL || '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { headers: corsHeaders, status: 405 });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'UNAUTHENTICATED' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { email, fullName, role, businessId } = body;

    if (!email || !fullName || !['manager', 'staff'].includes(role) || !businessId) {
      return new Response(JSON.stringify({ error: 'INVALID_INPUT' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Client scoped to the caller's own JWT — used only to verify their role,
    // RLS on staff_members does the actual authorization check.
    const callerClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: 'UNAUTHENTICATED' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: callerStaffRow } = await callerClient
      .from('staff_members')
      .select('role')
      .eq('user_id', caller.id)
      .eq('business_id', businessId)
      .eq('is_active', true)
      .maybeSingle();

    if (!callerStaffRow || !['owner', 'manager'].includes(callerStaffRow.role)) {
      return new Response(JSON.stringify({ error: 'FORBIDDEN' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Admin client — service_role bypasses RLS.
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${SITE_URL}/login`,
    });

    if (inviteError || !invited.user) {
      return new Response(JSON.stringify({ error: inviteError?.message ?? 'INVITE_FAILED' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = invited.user.id;
    await adminClient.from('users').upsert({ id: userId, full_name: fullName });

    const { error: staffError } = await adminClient.from('staff_members').insert({
      user_id: userId,
      business_id: businessId,
      role,
    });

    if (staffError) {
      return new Response(JSON.stringify({ error: 'STAFF_LINK_FAILED' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, userId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[invite-staff] unhandled error:', err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ error: 'INTERNAL_ERROR' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
