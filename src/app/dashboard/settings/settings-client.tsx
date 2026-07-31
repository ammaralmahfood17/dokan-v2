'use client';

import { FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CURRENCIES, DEFAULT_PRIMARY_COLOR, type Project } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { PushNotificationManager } from '@/components/push-notification-manager';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

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

export function SettingsClient({
  project,
  projectId,
}: {
  project: Project;
  projectId: string;
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validateSettings(name, primaryColor);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('projects')
      .update({
        name: name.trim(),
        currency,
        primary_color: primaryColor,
        is_active: isActive,
      })
      .eq('id', project.id);
    setLoading(false);
    if (error) {
      toast.error('ما قدرت نحفظ الإعدادات — حاول مرة ثانية');
      return;
    }
    toast.success('تم الحفظ');
    router.refresh();
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>الإعدادات</h1>
          <p>اسم المتجر، العملة، الهوية، والإشعارات</p>
        </div>
      </div>

      {/* Push Notification Settings */}
      <div className="mb-4 max-w-lg">
        <PushNotificationManager projectId={projectId} />
      </div>

      <form onSubmit={onSubmit} className="card card-body max-w-lg">
        <div className="field">
          <label className="label">اسم المتجر</label>
          <input
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
          <label className="label">المعرّف (slug)</label>
          <input className="input" dir="ltr" value={project.slug} disabled />
          <p className="hint">ما ينفع تغيير المعرّف بعد الإنشاء</p>
        </div>

        <div className="field">
          <label className="label">العملة</label>
          <select
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
          <label className="label">اللون الأساسي</label>
          <div className="flex items-center gap-3">
            <input
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
          <Toggle id="store-active" checked={isActive} onChange={setIsActive} />
        </div>

        <Button type="submit" disabled={loading}>
          {loading ? 'جاري الحفظ…' : 'حفظ التغييرات'}
        </Button>
      </form>
    </div>
  );
}
