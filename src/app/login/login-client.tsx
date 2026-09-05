'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Card, CardContent } from '@/components/shadcn/card';
import { Eye, EyeOff } from 'lucide-react';
import { AuthShell } from '@/components/auth/auth-shell';

function RegisteredNotice() {
  const searchParams = useSearchParams();
  if (searchParams.get('registered') !== '1') return null;
  return (
    <p className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-primary-tint)] px-3 py-2 text-center text-xs font-semibold text-[var(--color-primary)]">
      تم إنشاء الحساب. يمكنك تسجيل الدخول الآن.
    </p>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawNext = searchParams.get('next');
  // Open-redirect guard (same rule as auth/callback): only same-origin
  // relative paths survive; http://evil, //evil and backslash variants → null
  const nextParam =
    rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.includes('\\')
      ? rawNext
      : null;

  const [showPass, setShowPass] = useState(false); // FIX-S-007
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});

  const emailErr = touched.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 'الإيميل غير صحيح' : null;
  const passErr = touched.password && password.length < 6 ? 'كلمة المرور أقل من 6 أحرف' : null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError || !data.user) {
      setLoading(false);
      setError('بيانات الدخول غير صحيحة');
      return;
    }

    // Route by account type:
    //   super admin → /super-admin/subscriptions
    //   store owner/staff → /dashboard
    //   no store yet → /onboarding
    // Super admin takes priority over nextParam (a logged-in super admin
    // never needs the guest redirect chain).
    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin');
    let dest = isSuperAdmin
      ? '/super-admin/subscriptions'
      : nextParam || '/dashboard';
    if (!isSuperAdmin && !nextParam) {
      const { data: membership } = await supabase
        .from('staff_members')
        .select('id')
        .eq('user_id', data.user.id)
        .limit(1)
        .maybeSingle();
      dest = membership ? '/dashboard' : '/onboarding';
    }

    setLoading(false);
    router.push(dest);
    router.refresh();
  }

  const blur = (field: 'email' | 'password') => () => setTouched((t) => ({ ...t, [field]: true }));

  return (
    <Card className="surface-card space-y-1 p-6 sm:p-8">
      <form onSubmit={onSubmit} className="space-y-1">
        <div className="field">
          <label className="label" htmlFor="email">البريد الإلكتروني</label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={blur('email')}
            dir="ltr"
            aria-invalid={!!emailErr}
            aria-describedby={emailErr ? 'email-error' : undefined}
          />
          {emailErr && (
            <p id="email-error" className="error-text" role="alert">
              {emailErr}
            </p>
          )}
        </div>
        <div className="field">
          <label className="label" htmlFor="password">كلمة المرور</label>
          <div className="relative">
            <Input
              id="password"
              className="pe-10"
              type={showPass ? 'text' : 'password'}
              autoComplete="current-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={blur('password')}
              dir="ltr"
              aria-invalid={!!passErr}
              aria-describedby={passErr ? 'password-error' : undefined}
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              aria-label={showPass ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              aria-pressed={showPass}
              className="absolute end-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
            >
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {passErr && (
            <p id="password-error" className="error-text" role="alert">
              {passErr}
            </p>
          )}
        </div>
        {error && <p className="error-text mb-3" role="alert">{error}</p>}
        <Button type="submit" className="h-12 w-full rounded-xl text-[15px] font-bold shadow-[0_12px_24px_rgba(15,94,86,0.18)]" disabled={loading || !!emailErr || !!passErr}>
          {loading ? 'جاري الدخول…' : 'دخول'}
        </Button>
        <div className="mt-3 text-center">
          <Link href="/reset-password" className="text-xs font-semibold text-[var(--color-primary)] hover:underline">
            نسيت كلمة المرور؟
          </Link>
        </div>
      </form>
    </Card>
  );
}

export default function LoginClient() {
  return (
    <AuthShell
      title="أهلاً بعودتك"
      subtitle="سجّل الدخول لإدارة الطلبات، المنيو، فريق العمل، وتقارير متجرك."
      footer={(
        <p className="mt-6 text-center text-sm text-[var(--color-text-secondary)]">
          ليس لديك حساب؟{' '}
          <Link href="/register" className="font-bold text-[var(--color-primary)] hover:underline">إنشاء حساب جديد</Link>
        </p>
      )}
    >
      <Suspense fallback={
        <div className="surface-card space-y-4 p-6 animate-pulse">
          <div className="h-11 w-full rounded-xl bg-[var(--color-surface-sunken)]" />
          <div className="h-11 w-full rounded-xl bg-[var(--color-surface-sunken)]" />
          <div className="h-12 w-full rounded-xl bg-[var(--color-surface-sunken)]" />
        </div>
      }>
        <LoginForm />
        <RegisteredNotice />
      </Suspense>
    </AuthShell>
  );
}
