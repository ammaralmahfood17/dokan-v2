'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Card } from '@/components/shadcn/card';
import { AuthShell } from '@/components/auth/auth-shell';

export default function RegisterClient() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
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

    try {
      const apiRes = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          fullName: fullName.trim(),
        }),
      });

      const apiJson = await apiRes.json();

      if (!apiRes.ok) {
        const fullErr = JSON.stringify(apiJson, null, 2);
        setError(fullErr || apiJson?.error || 'فشل إنشاء الحساب');
        setLoading(false);
        return;
      }

      // Server created the user. Now sign in client-side to get session
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      setLoading(false);

      if (signInErr) {
        setError('تم إنشاء الحساب بنجاح، لكن فشل تسجيل الدخول التلقائي. جرب تسجيل الدخول يدوياً.');
        router.push('/login');
        return;
      }

      router.push('/onboarding');
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'حدث خطأ غير متوقع أثناء إنشاء الحساب.';
      setError(message);
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="ابدأ ببناء متجرك"
      subtitle="أنشئ حسابك، اختر هوية متجرك، وابدأ استقبال أول طلب خلال دقائق."
      footer={(
        <p className="mt-6 text-center text-sm text-[var(--color-text-secondary)]">
          لديك حساب؟{' '}
          <Link href="/login" className="font-bold text-[var(--color-primary)] hover:underline">تسجيل الدخول</Link>
        </p>
      )}
    >
      <Card className="surface-card space-y-1 p-6 sm:p-8">
        <form onSubmit={onSubmit} className="space-y-1">
          <div className="field">
            <label className="label" htmlFor="fullName">
              الاسم
            </label>
            <Input
              id="fullName"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="email">
              البريد الإلكتروني
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              dir="ltr"
              aria-invalid={!!emailErr}
            />
            {emailErr && <p className="error-text">{emailErr}</p>}
          </div>
          <div className="field">
            <label className="label" htmlFor="password">
              كلمة المرور
            </label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              dir="ltr"
              aria-invalid={!!passErr}
            />
            {passErr && <p className="error-text">{passErr}</p>}
            {!passErr && <p className="hint">6 أحرف على الأقل</p>}
          </div>
          {error && <p className="error-text mb-3" role="alert">{error}</p>}
          <Button type="submit" className="h-12 w-full rounded-xl text-[15px] font-bold shadow-[0_12px_24px_rgba(15,94,86,0.18)]" disabled={loading || !!emailErr || !!passErr}>
            {loading ? 'جاري الإنشاء…' : 'إنشاء الحساب'}
          </Button>
        </form>
      </Card>
    </AuthShell>
  );
}
