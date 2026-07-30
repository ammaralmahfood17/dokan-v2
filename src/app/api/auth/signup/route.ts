import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit';

/**
 * Server-side signup endpoint.
 * 
 * BEST PRACTICE (chosen architecture):
 * - Signup ONLY creates the auth user (via service role for reliability).
 * - No auto-creation of project/store here.
 * - The user is immediately sent to /onboarding where they explicitly create
 *   their first project (name, slug, currency, theme).
 * 
 * Why this is the best option:
 * - Matches the actual product onboarding UX.
 * - Avoids ugly auto-generated slugs.
 * - Separates auth identity from business entity creation.
 * - Avoids schema conflicts (old trigger was trying to create legacy 'profiles'/'stores').
 * - Easier to evolve onboarding in the future.
 */

export async function POST(request: Request) {
  console.log('[API /auth/signup] === SIGNUP REQUEST RECEIVED ===');

  try {
    const body = await request.json();
    const { email, password, fullName } = body;

    console.log('[API /auth/signup] Input:', { 
      email, 
      fullName: fullName?.substring(0, 30), 
      hasPassword: !!password 
    });

    if (!email || !password) {
      return NextResponse.json({ 
        error: 'البريد الإلكتروني وكلمة المرور مطلوبان' 
      }, { status: 400 });
    }

    // Rate limit: 3 signups per email per minute
    const rateKey = `signup:${email.trim().toLowerCase()}`;
    const limitResult = await rateLimit(rateKey, { limit: 3, windowMs: 60 * 1000, keyPrefix: 'auth-signup' });
    if (!limitResult.allowed) {
      const res = createRateLimitResponse(limitResult.resetIn);
      return NextResponse.json({ error: res.error }, { status: res.status });
    }

    const admin = createAdminClient();

    // Create user using admin client (reliable, works with email_confirm disabled)
    const { data: createData, error: createError } = await admin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true, // confirmation is disabled in this project
      user_metadata: {
        full_name: fullName?.trim() || '',
        from_api: 'true',       // safety trigger skips users from the main API
      },
    });

    console.log('[API /auth/signup] createUser result:');
    console.log('  user id:', createData?.user?.id);
    console.log('  error:', createError ? JSON.stringify(createError, Object.getOwnPropertyNames(createError), 2) : null);

    if (createError) {
      console.error('[API /auth/signup] Supabase createUser ERROR:', createError);
      return NextResponse.json({
        error: createError.message || 'فشل إنشاء الحساب',
        code: createError.code,
        status: createError.status,
      }, { status: 400 });
    }

    const userId = createData.user?.id;

    if (!userId) {
      return NextResponse.json({ 
        error: 'لم يتم إنشاء المستخدم بشكل صحيح' 
      }, { status: 500 });
    }

    console.log('[API /auth/signup] SUCCESS - auth user created:', userId);

    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        email: createData.user?.email,
      },
      message: 'تم إنشاء الحساب بنجاح',
    });
  } catch (err: any) {
    console.error('[API /auth/signup] UNEXPECTED EXCEPTION:', err);
    return NextResponse.json({
      error: 'خطأ داخلي في الخادم',
      details: err?.message,
    }, { status: 500 });
  }
}
