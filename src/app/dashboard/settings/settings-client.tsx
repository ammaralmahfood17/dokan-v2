'use client';

import { FormEvent, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CURRENCIES, DEFAULT_PRIMARY_COLOR, type Project } from '@/lib/types';
import { Button } from '@/components/shadcn/button';
import { Switch } from '@/components/shadcn/switch';
import { PushNotificationManager } from '@/components/push-notification-manager';
import { TelegramManager } from '@/components/telegram-manager';
import { NotificationPrefs } from '@/components/notification-prefs';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import type { Module } from '@/lib/types';

type FieldErrors = {
  name?: string;
  color?: string;
};

function validateSettings(name: string, color: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!name.trim()) {
    errors.name = 'اسم المتجر مطلوب';
  } else if (name.trim().length < 2) {
    errors.name = 'الاسم يجب أن يكون حرفين على الأقل';
  }
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
    errors.color = 'اللون غير صالح — اختر لوناً من المنتقي';
  }
  return errors;
}

const expiryFmt = new Intl.DateTimeFormat('ar', {
  numberingSystem: 'latn',
  timeZone: 'Asia/Bahrain',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

function SubscriptionCard({
  project,
  isOwner,
  expiryDaysLeft,
}: {
  project: Project;
  isOwner: boolean;
  expiryDaysLeft: number | null;
}) {
  const [renewing, setRenewing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const expiry = project.subscription_expires_at
    ? new Date(project.subscription_expires_at)
    : null;
  const daysLeft = expiryDaysLeft ?? Infinity;

  async function renew() {
    setRenewing(true);
    try {
      const res = await fetch('/api/admin/renew-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, days: 30 }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'فشل التجديد');
        return;
      }
      toast.success('تم تجديد الاشتراك');
      window.location.reload();
    } catch {
      toast.error('ما قدرت نجدد — حاول مرة ثانية');
    } finally {
      setRenewing(false);
    }
  }

  return (
    <div className="card card-body mb-4 max-w-lg">
      <h2 className="mb-1 text-sm font-bold">الاشتراك</h2>
      {expiry ? (
        <p className="mb-1 text-sm text-[var(--color-text-secondary)]">
          ينتهي الاشتراك في{' '}
          <span className="font-semibold text-[var(--color-text)]">
            {expiryFmt.format(expiry)}
          </span>
          {daysLeft <= 7 && (
            <span className="mt-1 block text-xs font-medium text-[var(--color-danger)]">
              {daysLeft <= 0 ? 'الاشتراك منتهٍ' : daysLeft === 1 ? 'ينتهي غدًا' : `متبقي ${daysLeft} أيام`}
            </span>
          )}
        </p>
      ) : (
        <p className="mb-1 text-sm text-[var(--color-text-secondary)]">اشتراك دائم (بدون تاريخ انتهاء)</p>
      )}

      {isOwner && (
        <Button
          variant="secondary"
          className="mt-3"
          disabled={renewing}
          onClick={() => setConfirming(true)}
        >
          {renewing ? 'جاري التجديد…' : 'تسجيل تجديد 30 يوم'}
        </Button>
      )}
      {!isOwner && (
        <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
          التجديد متاح لمالك المتجر فقط.
        </p>
      )}

      {confirming && (
        <div
          className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="تأكيد التجديد"
          onClick={() => setConfirming(false)}
        >
          <div
            className="w-full max-w-xs rounded-xl bg-[var(--color-surface)] p-5 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-primary-tint)]">
              <span className="text-lg font-bold text-[var(--color-primary)]">$</span>
            </div>
            <p className="mb-1 text-sm font-bold">تأكيد التجديد</p>
            <p className="mb-5 text-xs text-[var(--color-text-secondary)]">
              تأكد من تحصيل القيمة النقدية قبل تسجيل تجديد الاشتراك 30 يوم.
            </p>
            <div className="flex gap-2">
              <Button
                className="w-full"
                disabled={renewing}
                onClick={renew}
              >
                {renewing ? 'جاري…' : 'تأكيد التجديد'}
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                رجوع
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function SettingsClient({
  project,
  projectId,
  isOwner,
  expiryDaysLeft,
}: {
  project: Project;
  projectId: string;
  isOwner: boolean;
  expiryDaysLeft: number | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [currency, setCurrency] = useState(project.currency);
  const [primaryColor, setPrimaryColor] = useState(
    project.primary_color || DEFAULT_PRIMARY_COLOR
  );
  const [isActive, setIsActive] = useState(project.is_active);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [modules, setModules] = useState<Module[]>([]);
  const [modulesLoading, setModulesLoading] = useState(true);
  // Guards the store-disable toggle — turning the store off instantly closes
  // the customer menu (menu route filters is_active = true), so confirm first.
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  // Load available modules
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/project/modules');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.modules) {
          setModules(data.modules);
        }
      } catch {
        // Silently fail - modules section will just be empty
      } finally {
        if (!cancelled) {
          setModulesLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    // Owner-only (audit HIGH fix): RLS (projects_update_owner) enforces this
    // server-side; the client gate just avoids the failed request + keeps
    // the form read-only for staff.
    if (!isOwner) {
      toast.error('فقط مالك المتجر يقدر يعدّل الإعدادات');
      return;
    }
    const errs = validateSettings(name, primaryColor);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from('projects')
        .update({
          name: name.trim(),
          currency,
          primary_color: primaryColor,
          is_active: isActive,
        })
        .eq('id', project.id);
      if (error) {
        toast.error('ما قدرت نحفظ الإعدادات — حاول مرة ثانية');
        return;
      }
      toast.success('تم الحفظ');
      router.refresh();
    } catch {
      toast.error('ما قدرت نحفظ الإعدادات — حاول مرة ثانية');
    } finally {
      setLoading(false);
    }
  }

  async function toggleModule(moduleId: string, currentEnabled: boolean) {
    if (!isOwner) {
      toast.error('فقط مالك المتجر يقدر يعدّل الوحدات');
      return;
    }

    try {
      const res = await fetch('/api/project/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module_id: moduleId,
          is_enabled: !currentEnabled,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'فشل تحديث الوحدة');
        return;
      }

      // Update local state
      setModules((prev) =>
        prev.map((mod) =>
          mod.id === moduleId ? { ...mod, is_enabled: !currentEnabled } : mod
        )
      );
      toast.success('تم تحديث الوحدة');
    } catch {
      toast.error('ما قدرت نحدّث الوحدة — حاول مرة ثانية');
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-kicker"><span>الإدارة · Settings</span></div>
          <h1>الإعدادات</h1>
          <p>اسم المتجر، العملة، الهوية، والإشعارات</p>
        </div>
      </div>

      {/* Push Notification Settings */}
      <div className="mb-4 max-w-lg">
        <PushNotificationManager projectId={projectId} />
      </div>

      {/* Telegram Alert Settings */}
      <div className="mb-4 max-w-lg">
        <TelegramManager projectId={projectId} />
      </div>

      {/* Per-staff notification channel prefs */}
      <div className="mb-4 max-w-lg">
        <NotificationPrefs projectId={projectId} />
      </div>

      {/* Modules Management */}
      <div className="card card-body mb-4 max-w-lg">
        <h2 className="mb-1 text-sm font-bold">الوحدات المفعلة</h2>
        <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
          فعّل أو عطّل الوحدات حسب احتياجك. الوحدات الأساسية (نقطة البيع + قائمة QR) مفعّلة دائماً ولا يمكن تعطيلها.
        </p>

        {modulesLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between rounded-[10px] border border-[var(--color-border)] p-3">
                <div className="flex-1">
                  <div className="h-4 w-24 rounded bg-[var(--color-bg)]" />
                  <div className="mt-1 h-3 w-32 rounded bg-[var(--color-bg)]" />
                </div>
                <div className="h-8 w-12 rounded bg-[var(--color-bg)]" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {modules.map((mod) => (
              <div
                key={mod.id}
                className={`flex items-center justify-between rounded-[10px] border p-3 ${
                  mod.is_core
                    ? 'border-[var(--color-border)] bg-[var(--color-bg)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold">{mod.name_ar}</p>
                    {mod.is_core && (
                      <span className="rounded-full bg-[var(--color-primary-tint)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-primary)]">
                        أساسية
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--color-text-muted)]">{mod.description_ar}</p>
                </div>
                {isOwner && !mod.is_core ? (
                  <Switch
                    checked={mod.is_enabled}
                    onCheckedChange={() => toggleModule(mod.id, mod.is_enabled)}
                  />
                ) : mod.is_core ? (
                  <span className="text-[11px] text-[var(--color-text-muted)]">مفعّلة دائماً</span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Subscription (owner-only renewal) */}
      <SubscriptionCard project={project} isOwner={isOwner} expiryDaysLeft={expiryDaysLeft} />

      <form onSubmit={onSubmit} className="card card-body max-w-lg">
        <div className="field">
          <label className="label" htmlFor="store-name">اسم المتجر</label>
          <input
            id="store-name"
            className={`input ${errors.name ? 'input-error' : ''}`}
            required
            maxLength={80}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
            }}
            onBlur={() => {
              const err = validateSettings(name, primaryColor);
              if (err.name) setErrors((prev) => ({ ...prev, name: err.name }));
            }}
          />
          {errors.name && <p className="error-text">{errors.name}</p>}
        </div>

        <div className="field">
          <label className="label" htmlFor="store-slug">المعرّف (slug)</label>
          <input id="store-slug" className="input" dir="ltr" value={project.slug} disabled />
          <p className="hint">ما ينفع تغيير المعرّف بعد الإنشاء</p>
        </div>

        <div className="field">
          <label className="label" htmlFor="currency-select">العملة</label>
          <select
            id="currency-select"
            className="select"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {CURRENCIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="label" htmlFor="primary-color">اللون الأساسي</label>
          <div className="flex items-center gap-3">
            <input
              id="primary-color"
              type="color"
              value={primaryColor}
              onChange={(e) => {
                setPrimaryColor(e.target.value);
                if (errors.color) setErrors((prev) => ({ ...prev, color: undefined }));
              }}
              className="h-10 w-12 cursor-pointer rounded border border-[var(--color-border)]"
            />
            <input
              className={`input flex-1 ${errors.color ? 'input-error' : ''}`}
              dir="ltr"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              pattern="^#[0-9A-Fa-f]{6}$"
            />
          </div>
          {errors.color && <p className="error-text">{errors.color}</p>}
        </div>

        <div className="mb-4 flex items-center justify-between gap-3">
          <label htmlFor="store-active" className="text-sm font-semibold">
            المتجر نشط (القائمة العامة متاحة)
          </label>
          <Switch
            id="store-active"
            checked={isActive}
            disabled={!isOwner}
            onCheckedChange={(v) => {
              if (!isOwner) return;
              if (!v) {
                setConfirmDeactivate(true);
              } else {
                setIsActive(true);
              }
            }}
          />
        </div>
        {!isOwner && (
          <p className="mb-4 text-xs text-[var(--color-text-secondary)]">
            🔒 فقط مالك المتجر يقدر يعدّل الإعدادات أو يوقف المتجر.
          </p>
        )}

        <Button type="submit" disabled={loading || !isOwner}>
          {loading ? 'جاري الحفظ…' : 'حفظ التغييرات'}
        </Button>
      </form>

      {confirmDeactivate && (
        <div
          className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="إيقاف المتجر"
          onClick={() => setConfirmDeactivate(false)}
        >
          <div
            className="w-full max-w-xs rounded-xl bg-[var(--color-surface)] p-5 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-danger-tint)]">
              <span className="text-lg font-bold text-[var(--color-danger)]">!</span>
            </div>
            <p className="mb-1 text-sm font-bold">إيقاف المتجر؟</p>
            <p className="mb-5 text-xs text-[var(--color-text-secondary)]">
              القائمة العامة ستتوقف عن العملاء — روابط الطاولات و QR ما راح يفتحون المنيو حتى تعيد التشغيل.
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => {
                  setIsActive(false);
                  setConfirmDeactivate(false);
                }}
              >
                نعم، إيقاف
              </Button>
              <Button variant="secondary" onClick={() => setConfirmDeactivate(false)}>
                رجوع
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
