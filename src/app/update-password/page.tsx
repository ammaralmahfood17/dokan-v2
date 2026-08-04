'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Lock, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Verify user has a valid session (redirected from password reset callback).
    // The recovery flow lands here with the session in the URL FRAGMENT
    // (#access_token=...). createBrowserClient parses the fragment inside
    // initialize(), which is ASYNC — so we must await it BEFORE getSession(),
    // otherwise getSession races ahead and finds nothing → bounce to /login
    // with the token lost.
    const supabase = createClient();
    supabase.auth.initialize().then(() => {
      return supabase.auth.getSession();
    }).then(({ data: { session } }) => {
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
      <div className="flex min-h-dvh items-center justify-center text-sm text-[var(--color-text-secondary)]">
        جاري التحميل…
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--color-bg)] px-4 py-10">
        <div className="w-full max-w-sm text-center">
          <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-[var(--color-success)]" />
          <h1 className="text-xl font-bold">تم تحديث كلمة المرور</h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            جارِ تحويلك إلى لوحة التحكم…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--color-bg)] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-[8px] bg-[var(--color-primary)] text-base font-bold text-white">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-bold">تعيين كلمة مرور جديدة</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            أدخل كلمة المرور الجديدة
          </p>
        </div>

        <form onSubmit={onSubmit} className="card card-body space-y-4">
          {error && (
            <div className="rounded-[8px] border border-[var(--color-danger)]/20 bg-[var(--color-danger-tint)] px-3 py-2 text-xs text-[var(--color-danger)]">
              {error}
            </div>
          )}

          <div className="field">
            <label className="label" htmlFor="password">كلمة المرور الجديدة</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              dir="ltr"
            />
            <p className="hint">6 أحرف على الأقل</p>
          </div>

          <div className="field">
            <label className="label" htmlFor="confirm">تأكيد كلمة المرور</label>
            <input
              id="confirm"
              className="input"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              dir="ltr"
            />
          </div>

          <Button type="submit" block disabled={loading || password.length < 6 || password !== confirm}>
            {loading ? 'جاري الحفظ…' : 'حفظ كلمة المرور الجديدة'}
          </Button>

          <div className="text-center">
            <Link href="/login" className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]">
              العودة لتسجيل الدخول
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
