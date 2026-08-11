'use client';

import { useMemo, useState } from 'react';
import {
  Plus,
  Search,
  X,
  Users,
  Star,
  Send,
  Pencil,
  Trash2,
  Phone,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/utils';
import { Button } from '@/components/shadcn/button';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { PageHeader } from '@/components/dashboard/page-header';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
  CAMPAIGN_CHANNEL_LABELS,
  CAMPAIGN_STATUS_LABELS,
  type Campaign,
  type Customer,
} from '@/lib/types';

type LoyaltyKind = 'earn' | 'redeem' | 'adjust';

export function CustomersClient({
  projectId,
  currency,
  initialCustomers,
  initialCampaigns,
}: {
  projectId: string;
  currency: string;
  initialCustomers: Customer[];
  initialCampaigns: Campaign[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'customers' | 'campaigns'>('customers');

  // Customer modals
  const [showAdd, setShowAdd] = useState(false);
  const [showLoyalty, setShowLoyalty] = useState<Customer | null>(null);
  const [loyaltyKind, setLoyaltyKind] = useState<LoyaltyKind>('earn');
  const [loyaltyPoints, setLoyaltyPoints] = useState('');
  const [loyaltyReason, setLoyaltyReason] = useState('');

  // Campaign modal
  const [showCampaign, setShowCampaign] = useState(false);
  const [campaignName, setCampaignName] = useState('');
  const [campaignChannel, setCampaignChannel] = useState<'sms' | 'whatsapp' | 'email' | 'push'>('whatsapp');
  const [campaignMsg, setCampaignMsg] = useState('');
  const [campaignMinLoyalty, setCampaignMinLoyalty] = useState('');

  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        (c.name?.toLowerCase().includes(q) ?? false) ||
        (c.phone ?? '').toLowerCase().includes(q) ||
        (c.email?.toLowerCase().includes(q) ?? false)
    );
  }, [customers, query]);

  async function refresh() {
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (data) setCustomers(data as Customer[]);
    router.refresh();
  }

  async function addCustomer(e: React.FormEvent) {
    e.preventDefault();
    const form = new FormData(e.currentTarget as HTMLFormElement);
    const phone = String(form.get('phone') ?? '').trim();
    if (!phone) {
      toast.error('رقم الهاتف مطلوب');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('customers').insert({
      project_id: projectId,
      phone,
      name: String(form.get('name') ?? '').trim() || null,
      email: String(form.get('email') ?? '').trim() || null,
      is_opted_in: true,
    });
    setSaving(false);
    if (error) {
      if (error.code === '23505') toast.error('يوجد عميل بنفس الرقم مسبقًا');
      else toast.error('تعذّر إضافة العميل');
      return;
    }
    toast.success('تمت إضافة العميل');
    setShowAdd(false);
    void refresh();
  }

  async function applyLoyalty() {
    if (!showLoyalty) return;
    const points = Number(loyaltyPoints);
    if (!Number.isFinite(points) || points === 0) {
      toast.error('أدخل عدد نقاط صحيح');
      return;
    }
    const delta = loyaltyKind === 'redeem' ? -Math.abs(points) : loyaltyKind === 'earn' ? Math.abs(points) : points;
    setSaving(true);
    const { error } = await supabase.from('loyalty_events').insert({
      project_id: projectId,
      customer_id: showLoyalty.id,
      kind: loyaltyKind,
      points: delta,
      reason: loyaltyReason.trim() || null,
    });
    if (!error) {
      await supabase
        .from('customers')
        .update({ loyalty_points: showLoyalty.loyalty_points + delta })
        .eq('id', showLoyalty.id);
      toast.success(`تم تعديل النقاط (${delta > 0 ? '+' : ''}${delta})`);
      setShowLoyalty(null);
      setLoyaltyPoints('');
      setLoyaltyReason('');
      void refresh();
    } else {
      toast.error('تعذّر تعديل النقاط');
    }
    setSaving(false);
  }

  async function createCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!campaignName.trim() || !campaignMsg.trim()) {
      toast.error('أكمل اسم الحملة والرسالة');
      return;
    }
    setSaving(true);
    const audience: { minLoyalty?: number } = {};
    if (campaignMinLoyalty && Number(campaignMinLoyalty) > 0) {
      audience.minLoyalty = Number(campaignMinLoyalty);
    }
    const { error } = await supabase.from('campaigns').insert({
      project_id: projectId,
      name: campaignName.trim(),
      channel: campaignChannel,
      message_ar: campaignMsg.trim(),
      message_en: null,
      audience_filter: audience,
      status: 'draft',
    });
    setSaving(false);
    if (error) {
      toast.error('تعذّر إنشاء الحملة');
      return;
    }
    toast.success('أُنشئت الحملة — حالة مسودة، جاهزة للإرسال عبر مزوّد الرسائل');
    setShowCampaign(false);
    setCampaignName('');
    setCampaignMsg('');
    setCampaignMinLoyalty('');
    const { data } = await supabase
      .from('campaigns')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setCampaigns(data as Campaign[]);
  }

  async function deleteCampaign(id: string) {
    const { error } = await supabase.from('campaigns').delete().eq('id', id);
    if (!error) {
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
      toast.success('حُذفت الحملة');
    } else {
      toast.error('تعذّر الحذف');
    }
  }

  async function deleteCustomer(id: string) {
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (!error) {
      setCustomers((prev) => prev.filter((c) => c.id !== id));
      toast.success('حُذف العميل');
    } else {
      toast.error('تعذّر الحذف');
    }
  }

  const loyaltyOptions: { value: LoyaltyKind; label: string }[] = [
    { value: 'earn', label: 'إضافة نقاط' },
    { value: 'redeem', label: 'خصم نقاط' },
    { value: 'adjust', label: 'تعديل مباشر' },
  ];

  return (
    <div className="page">
      <PullToRefresh onRefresh={refresh}>
        <PageHeader
          kicker="الإدارة · CRM"
          title="العملاء"
          description="ملفات العملاء، نقاط الولاء، والحملات التسويقية"
          actions={
            tab === 'customers' ? (
              <Button size="sm" onClick={() => setShowAdd(true)}>
                <Plus className="h-4 w-4" />
                عميل جديد
              </Button>
            ) : (
              <Button size="sm" onClick={() => setShowCampaign(true)}>
                <Plus className="h-4 w-4" />
                حملة جديدة
              </Button>
            )
          }
        />

        {/* Tabs */}
        <div className="tabs mb-5">
          <button
            type="button"
            className={`tab min-h-11 ${tab === 'customers' ? 'active' : ''}`}
            onClick={() => setTab('customers')}
          >
            العملاء ({customers.length})
          </button>
          <button
            type="button"
            className={`tab min-h-11 ${tab === 'campaigns' ? 'active' : ''}`}
            onClick={() => setTab('campaigns')}
          >
            الحملات ({campaigns.length})
          </button>
        </div>

        {tab === 'customers' && (
          <>
            {/* Search */}
            <div className="relative mb-4 max-w-md">
              <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <input
                className="input ps-10 pe-10"
                placeholder="ابحث بالاسم أو الهاتف أو البريد…"
                maxLength={100}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute end-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] hover:bg-[var(--color-surface-sunken)]"
                  aria-label="مسح البحث"
                >
                  <X className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
                </button>
              )}
            </div>

            {filtered.length === 0 ? (
              <div className="border border-[var(--color-border)] bg-[var(--color-surface)]">
                <EmptyState
                  icon={<Users className="h-8 w-8" />}
                  title={query ? 'لا نتائج مطابقة' : 'لا يوجد عملاء بعد'}
                  description={
                    query
                      ? 'جرّب كلمة بحث أخرى.'
                      : 'أضف أول عميل يدويًا، أو انتظر ربط الطلبات بملفات العملاء.'
                  }
                  action={
                    !query ? (
                      <Button size="sm" onClick={() => setShowAdd(true)}>
                        <Plus className="h-4 w-4" />
                        إضافة عميل
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <div className="overflow-x-auto border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
                <table className="data-table min-w-[760px]">
                  <thead>
                    <tr>
                      <th>العميل</th>
                      <th>الهاتف</th>
                      <th>نقاط الولاء</th>
                      <th>إجمالي الإنفاق</th>
                      <th>آخر زيارة</th>
                      <th>الاشتراك</th>
                      <th className="text-end">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-tint)] text-xs font-bold text-[var(--color-primary)]">
                              {(c.name || c.phone).slice(0, 1)}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate font-semibold">{c.name || '—'}</div>
                              {c.email && (
                                <div className="truncate text-[11px] text-[var(--color-text-muted)]" dir="ltr">
                                  {c.email}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="inline-flex items-center gap-1 font-mono text-[12px] tabular-nums" dir="ltr">
                            <Phone className="h-3 w-3 text-[var(--color-text-muted)]" />
                            {c.phone}
                          </span>
                        </td>
                        <td>
                          <span className="inline-flex items-center gap-1 font-semibold">
                            <Star className="h-3.5 w-3.5 text-[var(--color-warn)]" />
                            {c.loyalty_points}
                          </span>
                        </td>
                        <td className="font-mono text-[12.5px] font-bold tabular-nums" dir="ltr">
                          {formatMoney(c.total_spent, currency)}
                        </td>
                        <td className="text-[12px] text-[var(--color-text-secondary)]">
                          {c.last_visit_at
                            ? new Date(c.last_visit_at).toLocaleDateString('ar-BH-u-nu-latn', { timeZone: 'Asia/Bahrain' })
                            : '—'}
                        </td>
                        <td>
                          <span
                            className={`badge ${c.is_opted_in ? 'badge-ready' : 'badge-cancelled'}`}
                          >
                            {c.is_opted_in ? 'مشترك' : 'غير مشترك'}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setShowLoyalty(c);
                                setLoyaltyPoints('');
                                setLoyaltyReason('');
                                setLoyaltyKind('earn');
                              }}
                            >
                              <Star className="h-3.5 w-3.5" />
                              نقاط
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => deleteCustomer(c.id)}
                              aria-label="حذف العميل"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-[var(--color-danger)]" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === 'campaigns' && (
          <div className="grid gap-4 md:grid-cols-2">
            {campaigns.length === 0 && (
              <div className="col-span-full border border-[var(--color-border)] bg-[var(--color-surface)]">
                <EmptyState
                  icon={<Send className="h-8 w-8" />}
                  title="لا توجد حملات بعد"
                  description="أنشئ حملة رسائل للعملاء — ستصلك مسودة جاهزة للإرسال."
                  action={
                    <Button size="sm" onClick={() => setShowCampaign(true)}>
                      <Plus className="h-4 w-4" />
                      حملة جديدة
                    </Button>
                  }
                />
              </div>
            )}
            {campaigns.map((cp) => (
              <div key={cp.id} className="border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">{cp.name}</h3>
                    <p className="mt-0.5 text-[11.5px] text-[var(--color-text-muted)]">
                      {CAMPAIGN_CHANNEL_LABELS[cp.channel]} · أُرسلت إلى {cp.sent_count}
                    </p>
                  </div>
                  <span className={`badge ${cp.status === 'sent' ? 'badge-ready' : cp.status === 'cancelled' ? 'badge-cancelled' : 'badge-pending'}`}>
                    {CAMPAIGN_STATUS_LABELS[cp.status]}
                  </span>
                </div>
                <p className="mb-3 line-clamp-3 text-[12.5px] leading-relaxed text-[var(--color-text-secondary)]">
                  {cp.message_ar}
                </p>
                <div className="flex items-center justify-between text-[11px] text-[var(--color-text-muted)]">
                  <span>
                    {cp.scheduled_at
                      ? `مجدولة: ${new Date(cp.scheduled_at).toLocaleDateString('ar-BH-u-nu-latn', { timeZone: 'Asia/Bahrain' })}`
                      : 'مسودة — لم تُجدول'}
                  </span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon-sm" aria-label="تعديل" disabled>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => deleteCampaign(cp.id)} aria-label="حذف">
                      <Trash2 className="h-3.5 w-3.5 text-[var(--color-danger)]" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </PullToRefresh>

      {/* Add customer */}
      {showAdd && (
        <Modal title="إضافة عميل جديد" onClose={() => setShowAdd(false)} className="max-w-md">
          <form onSubmit={addCustomer} className="field space-y-4">
            <div className="field">
              <label className="label">رقم الهاتف *</label>
              <input className="input" name="phone" type="tel" inputMode="tel" maxLength={20} required />
            </div>
            <div className="field">
              <label className="label">الاسم</label>
              <input className="input" name="name" maxLength={100} />
            </div>
            <div className="field">
              <label className="label">البريد الإلكتروني</label>
              <input className="input" name="email" type="email" maxLength={200} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setShowAdd(false)}>
                إلغاء
              </Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? 'جاري الحفظ…' : 'إضافة'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Loyalty adjust */}
      {showLoyalty && (
        <Modal
          title={`نقاط الولاء — ${showLoyalty.name || showLoyalty.phone}`}
          onClose={() => setShowLoyalty(null)}
          className="max-w-md"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--color-primary-tint)] px-4 py-3">
              <span className="text-[12px] font-semibold text-[var(--color-text-secondary)]">الرصيد الحالي</span>
              <span className="font-mono text-lg font-bold tabular-nums text-[var(--color-primary)]">
                {showLoyalty.loyalty_points} نقطة
              </span>
            </div>
            <div>
              <label className="label">العملية</label>
              <div className="flex gap-1 rounded-[var(--radius-md)] bg-[var(--color-surface-sunken)] p-1">
                {loyaltyOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setLoyaltyKind(opt.value)}
                    aria-pressed={loyaltyKind === opt.value}
                    className={`flex-1 min-h-11 rounded-[var(--radius-sm)] px-2 text-[12px] font-semibold transition-colors ${
                      loyaltyKind === opt.value
                        ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-sm'
                        : 'text-[var(--color-text-secondary)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label className="label">عدد النقاط</label>
              <input
                className="input"
                inputMode="numeric"
                maxLength={6}
                value={loyaltyPoints}
                onChange={(e) => setLoyaltyPoints(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div className="field">
              <label className="label">السبب</label>
              <textarea
                className="textarea"
                maxLength={200}
                value={loyaltyReason}
                onChange={(e) => setLoyaltyReason(e.target.value)}
                placeholder="مثال: بونص عيد الفطر، استبدال وجبة…"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setShowLoyalty(null)}>
                إلغاء
              </Button>
              <Button size="sm" onClick={() => void applyLoyalty()} disabled={saving}>
                {saving ? 'جاري الحفظ…' : 'تطبيق'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create campaign */}
      {showCampaign && (
        <Modal title="حملة تسويقية جديدة" onClose={() => setShowCampaign(false)} className="max-w-md">
          <form onSubmit={createCampaign} className="space-y-4">
            <div className="field">
              <label className="label">اسم الحملة</label>
              <input
                className="input"
                maxLength={100}
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="مثال: عرض الأسبوع — قهوة مجانية"
              />
            </div>
            <div className="field">
              <label className="label">القناة</label>
              <div className="flex gap-1 rounded-[var(--radius-md)] bg-[var(--color-surface-sunken)] p-1">
                {(['whatsapp', 'sms', 'push', 'email'] as const).map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => setCampaignChannel(ch)}
                    aria-pressed={campaignChannel === ch}
                    className={`flex-1 min-h-11 rounded-[var(--radius-sm)] px-1 text-[11.5px] font-semibold transition-colors ${
                      campaignChannel === ch
                        ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-sm'
                        : 'text-[var(--color-text-secondary)]'
                    }`}
                  >
                    {CAMPAIGN_CHANNEL_LABELS[ch]}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label className="label">نص الرسالة (عربي)</label>
              <textarea
                className="textarea"
                maxLength={640}
                value={campaignMsg}
                onChange={(e) => setCampaignMsg(e.target.value)}
                placeholder="اكتب نص الرسالة…"
              />
              <p className="hint">الجمهور: جميع العملاء المشتركين</p>
            </div>
            <div className="field">
              <label className="label">حد أدنى لنقاط الولاء (اختياري)</label>
              <input
                className="input"
                inputMode="numeric"
                maxLength={6}
                value={campaignMinLoyalty}
                onChange={(e) => setCampaignMinLoyalty(e.target.value.replace(/\D/g, ''))}
                placeholder="اتركه فارغًا لكل العملاء"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setShowCampaign(false)}>
                إلغاء
              </Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? 'جاري الإنشاء…' : 'إنشاء مسودة'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
