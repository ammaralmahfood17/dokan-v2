'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/shadcn/button';
import { Lock, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  // FIX-S-007: إظهار/إخفاء كلمة المرور
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Recovery flow lands here with the session in the URL FRAGMENT
    // (#access_token=...). createBrowserClient (PKCE/cookie storage) does
    // NOT auto-parse that fragment for recovery links, so parse it manually:
    // setSession writes the cookies via the ssr client, then proceed.
    const supabase = createClient();
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');

    if (accessToken) {
      supabase.auth
        .setSession({
          access_token: accessToken,
          refresh_token: params.get('refresh_token') ?? '',
        })
        .then(({ data, error }) => {
          if (error || !data.session) {
            router.replace('/login');
            return;
          }
          // Clear the fragment so the tokens don't linger in the address bar.
          window.history.replaceState(null, '', '/update-password');
          setChecking(false);
        });
      return;
    }

    // Normal path: user already has a session cookie (e.g. direct visit).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace('/login');
        return;
      }
      setChecking(false);
    });
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    if (password !== confirm) {
      setError('كلمة المرور غير متطابقة');
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    setLoading(false);

    if (updateError) {
      setError(updateError.message || 'فشل تحديث كلمة المرور');
      return;
    }

    setDone(true);
    setTimeout(() => router.push('/dashboard'), 3000);
  }

  if (checking) {
    return (
      <main className="auth-shell flex min-h-dvh items-center justify-center text-sm text-[var(--color-text-secondary)]">
        جاري التحميل…
      </main>
    );
  }

  if (done) {
    return (
      <AuthShell
        title="تم تحديث كلمة المرور"
        subtitle="جارِ تحويلك إلى لوحة التحكم…"
        footer={<Link href="/dashboard" className="mt-6 block text-center text-sm font-bold text-[var(--color-primary)]">الانتقال الآن</Link>}
      >
        <div className="surface-card p-8 text-center"><CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-[var(--color-success)]" /><p className="text-sm text-[var(--color-text-secondary)]">تم حفظ كلمة المرور الجديدة بنجاح.</p></div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="أمّن حسابك من جديد"
      subtitle="اختر كلمة مرور قوية وسهلة التذكر لحماية مساحة عملك."
      footer={<Link href="/login" className="mt-6 block text-center text-sm font-bold text-[var(--color-primary)]">العودة لتسجيل الدخول</Link>}
    >
      <form onSubmit={onSubmit} className="surface-card space-y-4 p-6 sm:p-8">
          {error && (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-danger)]/20 bg-[var(--color-danger-tint)] px-3 py-2 text-xs text-[var(--color-danger)]">
              {error}
            </div>
          )}

          <div className="field">
            <label className="label" htmlFor="password">كلمة المرور الجديدة</label>
            <div className="relative">
              <input
                id="password"
                className="input pe-10"
                type={showPass ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                dir="ltr"
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
            <p className="hint">6 أحرف على الأقل</p>
          </div>

          <div className="field">
            <label className="label" htmlFor="confirm">تأكيد كلمة المرور</label>
            <input
              id="confirm"
              className="input"
              type={showPass ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              dir="ltr"
            />
          </div>
          <Button className="h-12 w-full rounded-xl text-[15px] font-bold" disabled={loading}>
            {loading ? 'جاري الحفظ…' : 'حفظ كلمة المرور الجديدة'}
          </Button>

          <div className="text-center">
            <Link href="/login" className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]">
              العودة لتسجيل الدخول
            </Link>
          </div>
      </form>
    </AuthShell>
  );
}
