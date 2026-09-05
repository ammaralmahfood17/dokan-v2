'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/shadcn/button';
import { AuthShell } from '@/components/auth/auth-shell';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || 'فشل إرسال رابط إعادة التعيين');
      } else {
        setDone(true);
      }
    } catch {
      setError('تعذّر الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="استرجع دخولك"
      subtitle="أدخل بريدك الإلكتروني وسنرسل لك رابطاً آمناً لإعادة تعيين كلمة المرور."
      footer={(
        <p className="mt-6 text-center text-sm text-[var(--color-text-secondary)]">
          تذكرت كلمة المرور؟{' '}
          <Link href="/login" className="font-bold text-[var(--color-primary)] hover:underline">العودة للدخول</Link>
        </p>
      )}
    >
        {done ? (
          <div className="surface-card p-6 text-center sm:p-8">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-[var(--color-success)]" />
            <h2 className="text-base font-bold">تم الإرسال</h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              إذا كان البريد الإلكتروني مسجلاً لدينا، ستتلقى رابط إعادة تعيين كلمة المرور.
            </p>
            <Link
              href="/login"
              className="btn btn-primary mt-4 inline-flex"
            >
              العودة لتسجيل الدخول
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="surface-card space-y-4 p-6 sm:p-8">
            {error && (
              <div className="rounded-[var(--radius-md)] border border-[var(--color-danger)]/20 bg-[var(--color-danger-tint)] px-3 py-2 text-xs text-[var(--color-danger)]">
                {error}
              </div>
            )}
            <div className="field">
              <label className="label" htmlFor="email">البريد الإلكتروني</label>
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                dir="ltr"
                placeholder="name@example.com"
              />
            </div>
            <Button className="h-12 w-full rounded-xl text-[15px] font-bold" disabled={loading}>
              {loading ? 'جاري الإرسال…' : 'إرسال رابط إعادة التعيين'}
            </Button>
            <div className="text-center">
              <Link
                href="/login"
                className="text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
              >
                <ArrowLeft className="inline h-3 w-3 align-middle" /> العودة لتسجيل الدخول
              </Link>
            </div>
          </form>
        )}
    </AuthShell>
  );
}
