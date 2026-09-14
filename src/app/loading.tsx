import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function Loading() {
  return (
    <div className="landing-shell min-h-dvh">
      <header className="landing-nav sticky top-0 z-[var(--z-sticky)] border-b border-[rgba(228,225,214,.7)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="دكان - الصفحة الرئيسية">
            <span className="brand-mark">د</span>
            <div className="leading-tight"><span className="kufi block text-[15px] font-extrabold">دكان</span><span className="hidden text-[10px] text-[var(--color-text-muted)] sm:block">تشغيل المطاعم ببساطة</span></div>
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-semibold text-[var(--color-text-secondary)] md:flex" aria-label="التنقل الرئيسي">
            <a href="#features" className="transition-colors hover:text-[var(--color-primary)]">المزايا</a>
            <a href="#workflow" className="transition-colors hover:text-[var(--color-primary)]">كيف يعمل</a>
            <a href="#ready" className="transition-colors hover:text-[var(--color-primary)]">ابدأ الآن</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn btn-ghost btn-sm">دخول</Link>
            <Link href="/register" className="btn btn-primary btn-sm shadow-[0_8px_18px_rgba(15,94,86,.16)]">ابدأ مجاناً <ArrowLeft className="h-3.5 w-3.5" /></Link>
          </div>
        </div>
      </header>
      <main>
        <section className="landing-hero mx-auto max-w-7xl min-h-[calc(100dvh-64px)] flex flex-col lg:flex-row items-center justify-center px-5 py-16 lg:px-8 lg:py-24">
          <div className="landing-hero-copy">
            <div className="eyebrow">
              <Skeleton className="h-3.5 w-3.5" /> مساحة عمل أهدأ للمطاعم
            </div>
            <h1 className="landing-title mt-6 font-extrabold text-[var(--color-ink)]">
              <Skeleton className="h-6 w-36" /><br />
              <span className="landing-title-accent"><Skeleton className="h-4 w-24" /></span>
            </h1>
            <p className="mt-7 max-w-xl text-[16px] leading-8 text-[var(--color-ink-soft)] sm:text-lg">
              <Skeleton className="h-4 w-40" /><br />
              <Skeleton className="h-4 w-60" /><br />
              <Skeleton className="h-4 w-20" />
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/register" className="btn btn-primary btn-lg shadow-[0_14px_28px_rgba(15,94,86,.2)]">
                <Skeleton className="h-4 w-24" /><ArrowLeft className="h-4 w-4" />
              </Link>
              <Link href="/login" className="btn btn-secondary btn-lg">
                <Skeleton className="h-4 w-12" />
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-semibold text-[var(--color-text-muted)]">
              <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--color-success)]" /> بدون بطاقة ائتمانية</span>
              <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--color-gold)]" /> عربي وRTL من البداية</span>
              <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--color-primary)]" /> يعمل على الجوال</span>
            </div>
          </div>
          <div className="landing-visual" aria-label="معاينة لوحة تشغيل دكان">
            <div className="relative overflow-hidden max-h-[640px]">
              <div className="landing-window">
                <div className="landing-window-bar"><span className="font-semibold text-white/85">نظرة اليوم</span><span>الثلاثاء، ٥ سبتمبر</span></div>
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[var(--color-bg)] to-transparent" />
              </div>
              <div className="landing-window-grid">
                <div className="landing-window-panel tall">
                  <div className="flex items-center justify-between text-xs text-white/65"><span>مبيعات اليوم</span><span className="rounded-full bg-white/10 px-2 py-1 text-[var(--color-gold)]">+١٨٪</span></div>
                  <div className="mt-3 text-3xl font-extrabold"><span className="text-sm font-normal text-white/55">د.ب</span>,٢٨٤</div>
                  <div className="mt-7 flex h-24 items-end gap-2">
                    {[32,48,42,70,58,84,64,94,72,100,80,90].map((height, i) => (
                      <span key={i} className="flex-1 rounded-t-md bg-white/15" style={{ height: `${height}%`, opacity: i === 9 ? 1 : .6, background: i === 9 ? 'var(--color-gold)' : undefined }} />
                    ))}
                  </div>
                </div>
                <div className="landing-window-panel tall">
                  <div className="text-xs text-white/65">طلبات قيد التنفيذ</div>
                  <div className="mt-3 text-3xl font-extrabold">١٢</div>
                  <div className="mt-6 space-y-3">
                    {[['طاولة ٠٤', 'طاولة ٠٨', 'طلب سفري'], [2, 3, 4]].map(([label, count], idx) => (
                      <div key={label} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: idx === 0 ? 'var(--color-gold)' : '#80c9ad' }} />{label}</span>
                        <span className="text-white/45">{count} أصناف</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4 landing-window-panel">
                <div className="flex items-center justify-between text-xs"><span className="font-semibold text-white/85">أكثر المنتجات طلباً</span><span className="text-white/45">هذا الأسبوع</span></div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {[90, 72, 54].map((width, idx) => (
                    <div key={idx}>
                      <div className="landing-window-line" style={{ width: `${width}%` }} />
                      <div className="mt-2 text-[10px] text-white/55">{['برجر دكان', 'لاتيه زعفران', 'تشيز كيك'][idx]}</div>
                    >
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}