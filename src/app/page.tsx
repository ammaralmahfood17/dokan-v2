import Link from 'next/link';
import {
  ArrowLeft,
  BarChart3,
  ChefHat,
  ClipboardList,
  Layers3,
  QrCode,
  Sparkles,
  Store,
  Zap,
} from 'lucide-react';

const COPYRIGHT_YEAR = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  timeZone: 'Asia/Bahrain',
}).format(new Date());

const FEATURES = [
  { icon: QrCode, title: 'منيو QR أنيق', desc: 'كل طاولة لها تجربة طلب واضحة وسريعة، بدون تطبيق أو انتظار.' },
  { icon: ClipboardList, title: 'الطلب في مساره الصحيح', desc: 'من الطاولة إلى المطبخ إلى التسليم، كل حالة تظهر في وقتها.' },
  { icon: ChefHat, title: 'مطبخ أكثر هدوءاً', desc: 'شاشة تشغيل عالية التباين تساعد الفريق يعرف ماذا يجهز الآن.' },
  { icon: BarChart3, title: 'قرارات مبنية على أرقام', desc: 'مبيعات اليوم، أكثر المنتجات، وساعات الذروة في لوحة واحدة.' },
  { icon: Store, title: 'فروع تحت السيطرة', desc: 'إدارة المنتجات والطاولات والفرق من مساحة عمل واحدة.' },
  { icon: Layers3, title: 'يكبر معك', desc: 'PWA سريع، عربي من البداية، ومهيأ للعمل اليومي على الجوال والتابلت.' },
] as const;

export default function LandingPage() {
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
        <section className="landing-hero mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-24">
          <div className="landing-hero-copy">
            <div className="eyebrow"><Sparkles className="h-3.5 w-3.5" /> مساحة عمل أهدأ للمطاعم</div>
            <h1 className="landing-title mt-6 font-extrabold text-[var(--color-ink)]">
              شغّل يومك،<br /><span className="landing-title-accent">مو بس طلباتك.</span>
            </h1>
            <p className="mt-7 max-w-xl text-[16px] leading-8 text-[var(--color-ink-soft)] sm:text-lg">
              دكان يجمع المنيو، الطلبات، شاشة المطبخ، نقطة البيع، والتقارير في تجربة عربية واحدة — من التسجيل إلى أول طلب خلال دقائق.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/register" className="btn btn-primary btn-lg shadow-[0_14px_28px_rgba(15,94,86,.2)]">أنشئ متجرك مجاناً <ArrowLeft className="h-4 w-4" /></Link>
              <Link href="/login" className="btn btn-secondary btn-lg">لدي حساب</Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-semibold text-[var(--color-text-muted)]">
              <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--color-success)]" /> بدون بطاقة ائتمانية</span>
              <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--color-gold)]" /> عربي وRTL من البداية</span>
              <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--color-primary)]" /> يعمل على الجوال</span>
            </div>
          </div>
          <div className="landing-visual" aria-label="معاينة لوحة تشغيل دكان">
            <div className="landing-window">
              <div className="landing-window-bar"><span className="font-semibold text-white/85">نظرة اليوم</span><span>الثلاثاء، ٥ سبتمبر</span></div>
              <div className="landing-window-grid">
                <div className="landing-window-panel tall"><div className="flex items-center justify-between text-xs text-white/65"><span>مبيعات اليوم</span><span className="rounded-full bg-white/10 px-2 py-1 text-[var(--color-gold)]">+١٨٪</span></div><div className="mt-3 text-3xl font-extrabold">١,٢٨٤ <span className="text-sm font-normal text-white/55">د.ب</span></div><div className="mt-7 flex h-24 items-end gap-2">{[32,48,42,70,58,84,64,94,72,100,80,90].map((height, i) => <span key={i} className="flex-1 rounded-t-md bg-white/15" style={{ height: `${height}%`, opacity: i === 9 ? 1 : .6, background: i === 9 ? 'var(--color-gold)' : undefined }} />)}</div></div>
                <div className="landing-window-panel tall"><div className="text-xs text-white/65">طلبات قيد التنفيذ</div><div className="mt-3 text-3xl font-extrabold">١٢</div><div className="mt-6 space-y-3">{['طاولة ٠٤', 'طاولة ٠٨', 'طلب سفري'].map((label, i) => <div key={label} className="flex items-center justify-between text-xs"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: i === 0 ? 'var(--color-gold)' : '#80c9ad' }} />{label}</span><span className="text-white/45">{i + 2} أصناف</span></div>)}</div></div>
              </div>
              <div className="mt-4 landing-window-panel"><div className="flex items-center justify-between text-xs"><span className="font-semibold text-white/85">أكثر المنتجات طلباً</span><span className="text-white/45">هذا الأسبوع</span></div><div className="mt-4 grid gap-3 sm:grid-cols-3">{['برجر دكان', 'لاتيه زعفران', 'تشيز كيك'].map((item, i) => <div key={item}><div className="landing-window-line" style={{ width: `${90 - i * 18}%` }} /><div className="mt-2 text-[10px] text-white/55">{item}</div></div>)}</div></div>
            </div>
          </div>
        </section>

        <section id="workflow" className="border-y border-[var(--color-border)] bg-white/65">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-[.72fr_1.28fr] lg:px-8 lg:py-20">
            <div><div className="eyebrow">من أول يوم</div><h2 className="mt-4 max-w-md text-3xl font-extrabold leading-tight sm:text-4xl">كل خطوة واضحة للفريق، وكل لحظة محسوبة لك.</h2><p className="mt-5 max-w-md text-sm leading-8 text-[var(--color-text-secondary)]">لا تحتاج دورة تدريب طويلة أو فريق تقني. ابدأ بالأساسيات، ودع دكان يرتب التفاصيل معك.</p></div>
            <div className="grid gap-4 sm:grid-cols-3">{[['01', 'أنشئ متجرك', 'هوية، عملة، وفروعك الأساسية.'], ['02', 'أضف المنيو', 'منتجات، إضافات، وأسعار واضحة.'], ['03', 'استقبل طلبك', 'QR، مطبخ، POS، وتقارير.']].map(([num, title, desc]) => <div key={num} className="surface-card p-5"><span className="text-sm font-extrabold text-[var(--color-gold)]">{num}</span><h3 className="mt-7 text-base font-extrabold">{title}</h3><p className="mt-2 text-sm leading-7 text-[var(--color-text-secondary)]">{desc}</p></div>)}</div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
          <div className="max-w-2xl"><div className="eyebrow">كل ما يحتاجه التشغيل</div><h2 className="mt-4 text-3xl font-extrabold leading-tight sm:text-4xl">أدوات صغيرة،<br />فرق كبير في يومك.</h2></div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{FEATURES.map((feature) => { const Icon = feature.icon; return <div key={feature.title} className="landing-feature"><div className="landing-feature-icon"><Icon className="h-5 w-5" /></div><h3 className="mt-6 text-base font-extrabold">{feature.title}</h3><p className="mt-2 text-sm leading-7 text-[var(--color-text-secondary)]">{feature.desc}</p></div>; })}</div>
        </section>

        <section id="ready" className="mx-5 mb-16 overflow-hidden rounded-[28px] bg-[var(--color-teal-deep)] px-6 py-14 text-center text-white sm:px-10 lg:mx-auto lg:max-w-7xl lg:py-20">
          <div className="mx-auto max-w-2xl"><div className="eyebrow eyebrow-light justify-center">جاهز للخطوة التالية؟</div><h2 className="mt-5 text-3xl font-extrabold leading-tight sm:text-4xl">خلّ أول طلب يوصل لك<br />بهدوء وثقة.</h2><p className="mt-5 text-sm leading-7 text-white/65">ابدأ مجاناً، جهّز متجرك، وشاهد كيف تتغير طريقة عمل فريقك.</p><Link href="/register" className="btn btn-gold btn-lg mt-8">ابدأ الآن <Zap className="h-4 w-4" /></Link></div>
        </section>
      </main>

      <footer className="border-t border-[var(--color-border)] px-5 py-8 lg:px-8"><div className="mx-auto flex max-w-7xl flex-col gap-3 text-xs text-[var(--color-text-muted)] sm:flex-row sm:items-center sm:justify-between"><span>© {COPYRIGHT_YEAR} دكان — تشغيل المطاعم والمقاهي ببساطة</span><span>صُمم للفرق التي تريد خدمة أفضل، لا ضغطاً أكثر.</span></div></footer>
    </div>
  );
}
