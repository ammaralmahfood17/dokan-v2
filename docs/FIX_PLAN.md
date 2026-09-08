# خطة إصلاح شاملة — دكان (dokan-v2)
**التاريخ:** 6 سبتمبر 2026
**المصدر:** تدقيق الواجهة الأمامية (المهمة 1) + تدقيق الخادم الخلفي (المهمة 2)
**الحالة:** في انتظار موافقة عمار على التنفيذ

---

## 📊 ملخص تنفيذي

| المحور | عدد المشاكل | حرجة | رئيسية | ثانوية |
|---|---|---|---|---|
| تشغيل الإنتاج (Backend Env) | 2 | **2** | — | — |
| الواجهة الأمامية (CSP/hydration) | 1 | **1** | — | — |
| الأداء والخطوط | 2 | — | 2 | — |
| التصميم البصري (تباين/dark) | 3 | — | 2 | 1 |
| PWA/UX | 3 | — | — | 3 |
| نظافة الكود (dead schema) | 2 | — | — | 2 |
| **المجموع** | **13** | **3** | **4** | **6** |

**الهدف:** إعادة الموقع للعمل الكامل خلال **ساعة واحدة**، ثم رفع الجودة تدريجياً على **4 أسابيع**.

---

# 🚨 المرحلة 0: الإنعاش الفوري (اليوم — أولوية قصوى قصوى)

> **المنتج معطل حالياً في الإنتاج. كل شي تحت هذه المرحلة لا قيمة له قبل إنجازها.**

## المهمة 0.1 — إصلاح SUPABASE_SERVICE_ROLE_KEY في Vercel
**الخطورة:** 🔴 حرجة — توقف كامل للطلبات والتسجيل
**السبب الجذري:** المفتاح في Vercel تابع للمشروع القديم (`smhleaeujwfebefjuwoe`) بينما `NEXT_PUBLIC_SUPABASE_URL` يشير للجديد (`eyzjyddiyiivuxmmmlzr`)

**خطوات التنفيذ:**
```bash
# 1. سحب المفتاح الصحيح من المصدر الموثوق
#    (نسخة zip الموثقة في ~/dokan-v2-full/dokan-v2/.env.local)

# 2. تحديث المتغير في Vercel
npx vercel env rm SUPABASE_SERVICE_ROLE_KEY production --project dokan-v2 --yes
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production --project dokan-v2
#    (لصق القيمة الجديدة — لا تخزنها في git أبداً)

# 3. التحقق من بقية المتغيرات — يجب أن تكون كلها من نفس المشروع الجديد:
npx vercel env ls --project dokan-v2
#    المتوقع رؤية: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#                  SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SITE_URL
#    القيم الثلاث الأولى يجب أن تكون من المشروع eyzjyddiyiivuxmmmlzr

# 4. redeploy (مطلوب لتطبيق env الجديدة)
npx vercel --prod --project dokan-v2
```

**التحقق (إجباري):**
```bash
# أ) vitals endpoint — يجب 200
curl -X POST https://www.dokanstore.xyz/api/vitals \
  -H "Content-Type: application/json" \
  -d '{"name":"LCP","value":100,"path":"/"}'
# المتوقع: {"ok":true} HTTP:200

# ب) signup — يجب ألا يرجع 429
curl -X POST https://www.dokanstore.xyz/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"probe-<timestamp>@dokan.test","password":"ValidPass123!","fullName":"Probe"}'
# المتوقع: 200 أو 400 (ليس 429)

# ج) التحقق من الـ logs — لا يوجد "Invalid API key"
npx vercel logs https://dokan-v2-<latest>.vercel.app --json | grep -c "Invalid API key"
# المتوقع: 0
```

**الوقت المتوقع:** 10 دقائق
**المسؤول:** Hermes (بعد تأكيد عمار)

---

## المهمة 0.2 — إضافة TELEGRAM_WEBHOOK_SECRET
**الخطورة:** 🔴 حرجة (توقف منفصل) — بوت تيليجرام معطل
**الدليل من اللوج:** `TELEGRAM_WEBHOOK_SECRET not set — refusing updates` (HTTP 503)

**خطوات التنفيذ:**
```bash
# 1. توليد سر قوي
openssl rand -hex 32

# 2. إضافته في Vercel
npx vercel env add TELEGRAM_WEBHOOK_SECRET production --project dokan-v2
# (لصق القيمة المولدة)

# 3. نفس القيمة تُسجّل في BotFather:
#    تيليجرام → @BotFather → /setwebhook → secret token field

# 4. تحديث الـ webhook URL في تيليجرام
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://www.dokanstore.xyz/api/telegram/webhook" \
  -d "secret_token=<SAME_SECRET>"
```

**التحقق:**
```bash
# إرسال تحديث وهمي — يجب أن يرجع 401 (مو 503)
curl -X POST https://www.dokanstore.xyz/api/telegram/webhook \
  -H "Content-Type: application/json" \
  -d '{"update_id":1}' -w " HTTP:%{http_code}"
# المتوقع: HTTP:401 (المفتاح غير صحيح = endpoint يعمل لكن يرفض)
```

**الوقت المتوقع:** 15 دقيقة

---

## المهمة 0.3 — إصلاح CSP (فشل hydration شامل)
**الخطورة:** 🔴 حرجة — كل تفاعلية في الموقع ميتة
**السبب الجذري:** `next.config.ts:35` يمنع `'unsafe-inline'` في `script-src` لكن Next.js 16 App Router يحقن RSC payload كسكربتات inline — 14 خطأ CSP محقق في الـ console، React لا يعمل، الفورمات كلها ميتة.

**خيار أ — الإصلاح السريع (اليوم):**
```ts
// next.config.ts:35
value: [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''} https://*.sentry.io`,
  // ... البقية كما هي
].join('; '),
```
- يرجع الموقع للعمل فوراً
- **يضعف الأمن** قليلاً (يسمح inline scripts) لكن CSP الحالي مع `default-src 'self'` ما زال أفضل من لا شيء
- **الترقية لاحقاً عبر المهمة 1.1**

**خيار ب — الإصلاح الصحيح (nonce-based، هذا الأسبوع):**
انظر المهمة 1.1.

**قرار موصى به:** نفّذ خيار **أ** الآن لإنعاش الموقع، ثم خيار **ب** خلال 3 أيام.

**الوقت المتوقع (خيار أ):** 5 دقائق + deploy

**التحقق بعد الإصلاح:**
```bash
# في المتصفح (CDP):
# 1. لا أخطاء CSP في console
# 2. document.querySelectorAll('input')[0] عليه __reactFiber$ → React اشتغل
# 3. زر الدخول يتحول لـ "جاري الدخول…" عند الضغط
# 4. navigator.serviceWorker.getRegistrations() → 1+
```

---

# ⚡ المرحلة 1: إصلاحات مهمة قصيرة المدى (3-7 أيام)

## المهمة 1.1 — ترقية CSP إلى nonce-based (الأمان الحقيقي)
**الأولوية:** عالية | **الخطورة المصلَحة:** 🟡 رئيسية (أمني) | **الوقت:** 3 ساعات

**الخطوات:**
1. إنشاء `middleware.ts` (أو إضافة في `proxy.ts`):
   - توليد nonce عشوائي لكل طلب
   - إضافة `'nonce-<value>'` إلى `script-src`
   - تمرير الـ nonce عبر request header إلى الـ layout

2. تعديل `src/app/layout.tsx`:
   - استخدام `headers()` لقراءة الـ nonce
   - تمريره لكل `<script>` inline عبر prop (إن وُجدت)

3. فحص Next.js 16: هل يدعم nonce تلقائياً عند وجود header؟
   - نعم: Next.js يكتشف `x-nonce` أو `content-security-policy` وينسّق تلقائياً مع react server components
   - إعداد `experimental nonce` في `next.config.ts` إذا احتاج

**المراجع:**
- [Next.js CSP docs](https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy)
- [Supabase SSR + CSP nonce pattern](https://supabase.com/docs/guides/auth/server-side/nextjs)

**التحقق:**
- لا خطأ CSP في console
- nonce يتغير لكل طلب (في response headers)
- زر الدخول يعمل
- Lighthouse security audit ≥ 95

---

## المهمة 1.2 — تقليل حجم الخطوط (346KB → ~120KB)
**الأولوية:** عالية | **الخطورة المصلَحة:** 🟡 رئيسية (أداء على 3G: FCP 4.9s → ~2s) | **الوقت:** 2 ساعة

**الوضع الحالي:**
- 10 ملفات woff2 محمّلة (IBM Plex Sans Arabic بأوزان متعددة + Noto Kufi Arabic)
- 346KB من أصل 549KB إجمالي = **63% من الحزمة خطوط**

**الخطوات:**
1. تحليل الأوزان المستخدمة فعلياً:
```bash
grep -rn "font-weight" src/ --include="*.tsx" --include="*.css" | \
  grep -oE "[0-9]{3}" | sort -u
```
2. الاحتفاظ بـ 3 أوزان فقط: 400 (regular), 600 (semibold), 700 (bold)
3. حذف الأوزان الأخرى من `src/app/layout.tsx` (next/font config)
4. تقييم Noto Kufi: هل تستخدم فعلاً في العناوين؟
   - نعم → احتفظ بوزن واحد (700) فقط
   - لا → احذفها كلياً
5. تأكد من `display: 'swap'` في next/font (موجود افتراضياً)

**التحقق:**
```bash
# قياس بارد جديد:
# - الخطوط < 150KB
# - FCP على 3G < 2.5s
# - لا FOUT واضح
```

---

## المهمة 1.3 — إصلاح تباين العنوان الرئيسي (1.23:1)
**الأولوية:** متوسطة-عالية | **الخطورة المصلَحة:** 🟡 رئيسية (a11y) | **الوقت:** 30 دقيقة

**الوضع:** `h1` باللون الأخضر `#0F5E56` على خلفية بيج `#F3F2ED` → نسبة تباين 1.23:1 (المطلوب WCAG AA: 3:1 للنص الكبير)

**الخطوات:**
1. تعديل لون الـ h1 في `src/app/page.tsx`:
```tsx
// من:
className="text-[#0F5E56]"
// إلى (أخضر أعمق):
className="text-[#0A4A44]"
// نسبة التباين الجديدة: ~4.8:1 ✅
```
2. أو (البديل): خلفية أفتح للـ hero (`#FAF9F5`) مع الاحتفاظ باللون الأصلي
3. تحديث `--color-primary` إذا كان يستخدم للنصوص في أماكن أخرى — تحقق من المناطق التالية:
```bash
grep -rn "text-\[var(--color-primary)\]" src/app/page.tsx
```

**التحقق:**
```bash
# قياس فعلي عبر CDP:
# h1 contrast ≥ 4.5:1
```

---

## المهمة 1.4 — تفعيل الوضع الداكن
**الأولوية:** متوسطة | **الخطورة المصلَحة:** 🟡 رئيسية (UX عصري متوقع) | **الوقت:** 4 ساعات

**الوضع الحالي:**
- AGENTS.md يذكر "dark via localStorage choice + blocking script"
- التحقق الفعلي: `hasDarkToggle: false`, `theme: null` — toggle غير موجود

**الخطوات:**
1. البنية موجودة عبر CSS variables — تحقق:
```bash
grep -rn "\.dark\|\[data-theme" src/app/globals.css | head -10
```
2. إنشاء `src/components/theme-toggle.tsx`:
   - زر بأيقونة sun/moon
   - يحفظ في `localStorage.theme`
   - يستخدم `prefers-color-scheme` كافتراضي
3. إضافة blocking script في `<head>` (AGENTS.md يطلبها):
```tsx
<script dangerouslySetInnerHTML={{__html: `
  try {
    const t = localStorage.getItem('theme');
    if (t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.dataset.theme = 'dark';
    }
  } catch(e) {}
`}} />
```
4. إضافة أنماط dark في `globals.css`:
```css
[data-theme="dark"] {
  --color-bg: #0F1412;
  --color-surface: #1A201D;
  --color-text: #E8EDEB;
  /* ... البقية */
}
```
5. تحديث `meta theme-color` ديناميكياً (media query في metadata)

**التحقق:**
- toggle يظهر في الهيدر
- localStorage يُحفظ
- لا FOUC عند التحميل (blocking script)
- التباين في dark mode ≥ 4.5:1 لكل النصوص

---

# 🔧 المرحلة 2: تحسينات UX وPWA (2-3 أسابيع)

## المهمة 2.1 — إضافة PWA shortcuts
**الوقت:** 1 ساعة | **الأولوية:** ثانوية

```ts
// src/app/manifest.ts
shortcuts: [
  { name: 'طلبات اليوم', url: '/dashboard/orders' },
  { name: 'شاشة المطبخ', url: '/dashboard/kitchen' },
  { name: 'نقطة البيع', url: '/dashboard/pos' },
  { name: 'إضافة منتج', url: '/dashboard/products?new=1' },
],
```

---

## المهمة 2.2 — إصلاح skip link (tabIndex)
**الوقت:** 10 دقائق | **الأولوية:** ثانوية (a11y)

```tsx
// src/app/layout.tsx:115
<div id="main-content" tabIndex={-1}>
  {children}
</div>
```

---

## المهمة 2.3 — تحسين الـ hero على desktop
**الوقت:** 1 ساعة | **الأولوية:** ثانوية

1. بطاقة الـ dashboard mockup مقطوعة أسفلها — إضافة:
```tsx
<div className="relative overflow-hidden max-h-[640px]">
  {/* mockup */}
  <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[var(--color-bg)] to-transparent" />
</div>
```
2. توسيط عمودي للـ hero على الشاشات الكبيرة:
```tsx
<section className="min-h-[calc(100dvh-64px)] flex items-center">
```

---

## المهمة 2.4 — إضافة loading skeletons
**الوقت:** 2 ساعة | **الأولوية:** ثانوية

- Skeleton للـ hero mockup أثناء التحميل
- Skeleton لقوائم الطلبات في الـ dashboard
- Skeleton لصفحات المنيو العامة

---

## المهمة 2.5 — تنظيف dead schema (اختياري)
**الوقت:** 1 ساعة | **الأولوية:** ثانوية

الجداول غير المستخدمة: `permissions`, `role_permissions`, `branches`, `staff_branch_access`

**خيار أ — توثيق فقط (موصى به):**
```sql
-- COMMENT ON TABLE للإشارة أنها بنية مستقبلية:
COMMENT ON TABLE permissions IS 'DEAD SCHEMA — reserved for future granular RBAC. Not referenced by app code as of Sep 2026.';
```

**خيار ب — حذف** (غير موصى به الآن — قد تكون مخطط مستقبلي مقصود)

**خيار ج — ربطها فعلياً** إذا كانت المخططات القادمة تتطلب RBAC دقيق — ناقش مع عمار

---

## المهمة 2.6 — تحسين Sentry coverage
**الوقت:** 1 ساعة | **الأولوية:** ثانوية

- 15/26 routes فقط فيها Sentry captureException
- الحل: middleware wrapper موحد:

```ts
// src/lib/api-wrapper.ts
export function withSentry<T>(handler: (req: NextRequest) => Promise<NextResponse<T>>) {
  return async (req: NextRequest) => {
    try {
      return await handler(req);
    } catch (err) {
      Sentry.captureException(err, { tags: { path: req.nextUrl.pathname } });
      throw err;
    }
  };
}
```

---

# 🚀 المرحلة 3: تطويرات مستقبلية (شهر+)

## المهمة 3.1 — Offline mode كامل للـ dashboard
**الوقت:** 2-3 أيام | **الأولوية:** حسب الحاجة

- الـ SW v10 جاهزة معمارياً (precache + LRU + offline.html)
- المطلوب: تخزين الطلبات مؤقتاً محلياً + مزامنة عند العودة
- تقنية مقترحة: IndexedDB + Background Sync API

## المهمة 3.2 — Web Vitals dashboard داخلي
**الوقت:** يوم واحد

- `WebVitals` component موجود ويبعث لـ `/api/vitals`
- المطلوب: تخزين القيم في Supabase + صفحة تحليلات داخلية

## المهمة 3.3 — View Transitions API
**الوقت:** نصف يوم

- Next.js 16 يدعمها تجريبياً
- تحسّن الإحساس بالتنقل (native-like)

## المهمة 3.4 — Bahrain e-Invoicing (SBR)
**الوقت:** متوقف — ننتظر مواصفات NBR الرسمية
**ملاحظة:** تم إغلاقه في جلسة سابقة بموافقة عمار. أعِد الفتح عند نشر المواصفات.

---

# 📋 خطة التنفيذ المقترحة (جدول زمني)

## اليوم الأول (اليوم) — 30 دقيقة
| # | المهمة | الوقت | النتيجة |
|---|---|---|---|
| 0.1 | إصلاح service role key | 10 د | الطلبات والتسجيل يشتغلون |
| 0.2 | إضافة telegram secret | 15 د | البوت يشتغل |
| 0.3 | CSP quick fix (`unsafe-inline`) | 5 د | الموقع تفاعلي كامل |

**✅ بعدها: الموقع يعمل 100% من الناحية الوظيفية**

## هذا الأسبوع — 10 ساعات
| # | المهمة | الوقت |
|---|---|---|
| 1.1 | nonce CSP (الترقية الآمنة) | 3 س |
| 1.2 | تقليل الخطوط | 2 س |
| 1.3 | تباين h1 | 30 د |
| 1.4 | وضع داكن | 4 س |

## الأسبوع القادم — 5 ساعات
| # | المهمة | الوقت |
|---|---|---|
| 2.1-2.6 | كل تحسينات UX | 5 س |

## لاحقاً
| # | المهمة | حسب الحاجة |
|---|---|---|
| 3.1-3.3 | offline mode, vitals dashboard, transitions | — |

---

# ✅ بروتوكول التحقق بعد كل مرحلة

## بعد المرحلة 0 (إجباري قبل أي شيء آخر):
```bash
# 1. طلب عام يعمل (أو على الأقل يصل للتحقق من المتجر):
curl -X POST https://www.dokanstore.xyz/api/public/order \
  -H "Content-Type: application/json" \
  -d '{"projectSlug":"<real-slug>","tableSlug":"<real-table>","items":[]}'
# المتوقع: 400 "بيانات غير صالحة" (سلة فاضية) — ليس 429

# 2. الموقع تفاعلي (بالمتصفح):
#    - زر دخول يتحول لـ loading
#    - فورم تسجيل يعمل
#    - SW يسجل

# 3. لا أخطاء في Vercel logs:
npx vercel logs <deployment-url> --json | grep -iE "invalid api|failing closed" | wc -l
# المتوقع: 0
```

## بعد المرحلة 1:
```bash
# 1. FCP على 3G < 2.5s
# 2. تباين h1 ≥ 4.5:1
# 3. dark mode toggle يعمل بلا FOUC
# 4. nonce يتغير لكل طلب
# 5. npm run build + tsc --noEmit نظيفان
# 6. pnpm test (33/33) + lint نظيف
```

---

# ⚠️ قواعد التنفيذ (من AGENTS.md — غير قابلة للتفاوض)

1. **Single branch (`master`)** — sequential commits، لا feature branches
2. **قبل أي commit:** `npx tsc --noEmit` + `pnpm run build` نظيفان
3. **بعد كل تعديل:** `pnpm run test` (33+ test) + `pnpm run lint`
4. **CI:** `npm ci` يستخدم `package-lock.json` — لا تنسَ `npm install --package-lock-only` بعد أي تعديل deps
5. **RTL:** خصائص منطقية فقط (`ms-*`/`me-*`)، لا `left/right` مطلقة
6. **A11y:** أهداف لمسية ≥ 44px، لا `window.confirm`
7. **لا تحسّن ما ليس مكسوراً** — التزام صارم بالتغييرات الجراحية
8. **لا أسرار في git** — كل env عبر Vercel dashboard/CLI فقط
9. **"القاعدة الذهبية":** أي خطأ يُلاحظ أثناء العمل — يُصلح فوراً حتى لو خارج النطاق

---

# 🔑 نقاط القرار المطلوبة من عمار

| # | القرار | التوصية |
|---|---|---|
| 1 | بدء المرحلة 0 الآن؟ | ✅ نعم فوراً — المنتج معطل |
| 2 | CSP: quick fix ثم nonce، أم nonce مباشرة؟ | ✅ quick fix الآن + nonce هذا الأسبوع |
| 3 | حذف Noto Kufi أم الإبقاء بوزن واحد؟ | ✅ احتفظ به للعناوين بوزن 700 |
| 4 | Dark mode: تنفيذ كامل الآن أم تأجيل؟ | ✅ هذا الأسبوع — متوقع UX |
| 5 | Dead schema: توثيق أم ربط أم حذف؟ | ✅ توثيق COMMENT فقط الآن |

---

*انتهت الخطة. جاهز لبدء المرحلة 0 فور تأكيدك.*
