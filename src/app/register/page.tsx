'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Card } from '@/components/shadcn/card';

export default function RegisterPage() {
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
    } catch (err: any) {
      setError('حدث خطأ غير متوقع أثناء إنشاء الحساب.');
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--color-bg)] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white font-bold">
            د
          </div>
          <h1 className="text-xl font-bold">إنشاء حساب</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            ابدأ متجرك في دقائق
          </p>
        </div>

        <Card className="space-y-1 px-6">
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
          {error && <p className="error-text mb-3">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading || !!emailErr || !!passErr}>
            {loading ? 'جاري الإنشاء…' : 'إنشاء الحساب'}
          </Button>
        </form>
      </Card>

        <p className="mt-4 text-center text-sm text-[var(--color-text-secondary)]">
          لديك حساب؟{' '}
          <Link href="/login" className="font-semibold text-[var(--color-primary)]">
            دخول
          </Link>
        </p>
      </div>
    </div>
  );
}
