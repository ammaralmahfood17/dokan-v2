'use client';

import Link from 'next/link';
import { ArrowUpLeft, Check, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="auth-shell min-h-dvh">
      <div className="auth-orb auth-orb-one" aria-hidden="true" />
      <div className="auth-orb auth-orb-two" aria-hidden="true" />
      <div className="auth-grid mx-auto grid min-h-dvh max-w-[1500px] lg:grid-cols-[0.95fr_1.05fr]">
        <section className="auth-story relative hidden overflow-hidden p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
          <div className="relative z-10">
            <Link href="/" className="inline-flex items-center gap-3" aria-label="دكان - الصفحة الرئيسية">
              <span className="brand-mark brand-mark-light">د</span>
              <span className="kufi text-lg font-extrabold">دكان</span>
            </Link>
            <div className="mt-24 max-w-lg">
              <div className="eyebrow eyebrow-light"><Sparkles className="h-3.5 w-3.5" /> تشغيل أهدأ، نمو أسرع</div>
              <h2 className="mt-6 text-4xl font-extrabold leading-[1.35] xl:text-5xl">
                كل تفاصيل مطعمك،<br />في مكان واحد.
              </h2>
              <p className="mt-6 max-w-md text-base leading-8 text-white/70">
                من أول طلب عبر QR إلى شاشة المطبخ والتقارير اليومية. دكان يرتّب يومك التشغيلي بدون تعقيد.
              </p>
              <div className="mt-10 grid gap-4 text-sm text-white/80">
                {['منيو QR جاهز خلال دقائق', 'طلبات لحظية للمطبخ ونقطة البيع', 'تقارير واضحة تساعدك تكبر'].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[var(--color-gold)]"><Check className="h-3.5 w-3.5" /></span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="relative z-10 flex items-center justify-between text-xs text-white/45">
            <span>منصة تشغيل المطاعم والمقاهي</span>
            <span>دكان © 2026</span>
          </div>
          <div className="auth-story-art" aria-hidden="true">
            <div className="auth-art-card auth-art-card-main"><div className="h-2 w-20 rounded-full bg-white/20" /><div className="mt-6 h-24 rounded-2xl bg-white/10" /><div className="mt-5 grid grid-cols-3 gap-2"><span /><span /><span /></div></div>
            <div className="auth-art-card auth-art-card-float"><span className="h-2 w-10 rounded-full bg-[var(--color-gold)]" /><span className="mt-3 h-2 w-16 rounded-full bg-white/25" /><span className="mt-5 h-8 w-8 rounded-full bg-white/10" /></div>
          </div>
        </section>
        <section className="relative flex min-h-dvh items-center justify-center px-5 py-10 sm:px-8 lg:px-14">
          <Link href="/" className="absolute start-5 top-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-primary)] lg:start-10 lg:top-8">
            <ArrowUpLeft className="h-4 w-4" /> العودة للموقع
          </Link>
          <div className="w-full max-w-[430px]">
            <div className="mb-8 lg:hidden">
              <Link href="/" className="inline-flex items-center gap-2"><span className="brand-mark">د</span><span className="kufi font-extrabold">دكان</span></Link>
            </div>
            <div className="mb-8">
              <div className="eyebrow">مساحة العمل</div>
              <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-[var(--color-text)] sm:text-4xl">{title}</h1>
              <p className="mt-3 text-sm leading-7 text-[var(--color-text-secondary)]">{subtitle}</p>
            </div>
            {children}
            {footer}
          </div>
        </section>
      </div>
    </main>
  );
}
