import type { Metadata } from 'next';
import { Suspense } from 'react';
import LoginClient from './login-client';

export const metadata: Metadata = {
  title: { absolute: 'تسجيل الدخول — دكان' },
  description: 'دخول إلى لوحة تحكم دكان — منصة إدارة المطاعم والمقاهي في الخليج',
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-dvh items-center justify-center bg-[var(--color-bg)] px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white font-bold">د</div>
            <h1 className="text-xl font-bold">تسجيل الدخول</h1>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">مرحباً بك في دكان</p>
          </div>
          <div className="space-y-4 animate-pulse">
            <div className="h-10 w-full rounded-md bg-muted" />
            <div className="h-10 w-full rounded-md bg-muted" />
            <div className="h-10 w-full rounded-md bg-muted" />
            <div className="h-12 w-full rounded-md bg-muted/60" />
          </div>
        </div>
      </main>
    }>
      <LoginClient />
    </Suspense>
  );
}
