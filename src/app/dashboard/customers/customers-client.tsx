'use client';

import { useMemo, useState } from 'react';
import {
  Plus,
  Search,
  X,
  Users,
  Star,
  Send,
  Trash2,
  Phone,
  History,
  Check,
  Ban,
  Megaphone,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/utils';
import { Button } from '@/components/shadcn/button';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { PageHeader } from '@/components/dashboard/page-header';
import { Btn, Card, Pagination, Tag } from '@/components/dashboard/primitives';
import { validatePhone } from '@/lib/phone-validation';
import type { Json } from '@/lib/database.types';
import {
  AudienceFilterSchema,
  customerMatchesAudience,
  describeAudience,
  type AudienceFilter,
} from '@/lib/campaign-schema';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
  CAMPAIGN_CHANNEL_LABELS,
  CAMPAIGN_STATUS_LABELS,
  type Campaign,
  type Customer,
  type LoyaltyEvent,
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
  // Destructive actions must confirm via a Modal (window.confirm() is broken on
  // iOS PWA and would silently delete). These hold the pending target.
  const [confirmCustomer, setConfirmCustomer] = useState<Customer | null>(null);
  const [confirmCampaign, setConfirmCampaign] = useState<Campaign | null>(null);
  const [campaignName, setCampaignName] = useState('');
  const [campaignChannel, setCampaignChannel] = useState<'sms' | 'whatsapp' | 'email' | 'push'>('whatsapp');
  const [campaignMsg, setCampaignMsg] = useState('');
  const [campaignMinLoyalty, setCampaignMinLoyalty] = useState('');
  const [campaignMinVisits, setCampaignMinVisits] = useState('');
  const [campaignMinSpent, setCampaignMinSpent] = useState('');
  const [campaignLastVisit, setCampaignLastVisit] = useState('');
  const [saving, setSaving] = useState(false);

  // Loyalty history modal
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [historyEvents, setHistoryEvents] = useState<LoyaltyEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  /** Count of opted-in customers from the loaded list that match a filter. */
  const audienceCount = (f: AudienceFilter) =>
    customers.filter((c) => c.is_opted_in && customerMatchesAudience(c, f)).length;

  const num = (s: string) => (s.trim() !== '' && Number.isFinite(Number(s)) ? Number(s) : undefined);

  const draftAudience: AudienceFilter = {
    minLoyalty: num(campaignMinLoyalty),
    minVisits: num(campaignMinVisits),
    minSpent: num(campaignMinSpent),
    lastVisitWithinDays: num(campaignLastVisit),
  };
  const draftAudienceValid = AudienceFilterSchema.safeParse(draftAudience).success;

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
    const all: Customer[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error || !data) break;
      all.push(...(data as Customer[]));
      if (data.length < PAGE) break;
    }
    if (all.length) setCustomers(all);
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
    if (!validatePhone(phone)) {
      toast.error('رقم الهاتف غير صالح');
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
      // Read the authoritative current balance (not the stale client copy) so
      // concurrent edits/awarded points aren't clobbered.
      const { data: cur } = await supabase
        .from('customers')
        .select('loyalty_points')
        .eq('id', showLoyalty.id)
        .single();
      const currentPoints = Number(cur?.loyalty_points ?? 0);
      await supabase
        .from('customers')
        .update({ loyalty_points: currentPoints + delta })
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

  async function openHistory(c: Customer) {
    setHistoryCustomer(c);
    setHistoryLoading(true);
    const { data } = await supabase
      .from('loyalty_events')
      .select('*')
      .eq('customer_id', c.id)
      .order('created_at', { ascending: false })
      .limit(100);
    setHistoryEvents((data ?? []) as LoyaltyEvent[]);
    setHistoryLoading(false);
  }

  async function createCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!campaignName.trim() || !campaignMsg.trim()) {
      toast.error('أكمل اسم الحملة والرسالة');
      return;
    }
    const parsed = AudienceFilterSchema.safeParse(draftAudience);
    if (!parsed.success) {
      toast.error('قيم الجمهور غير صحيحة — التزم بأرقام موجبة');
      return;
    }
    const audience = parsed.data;
    const reach = audienceCount(audience);
    setSaving(true);
    const { error } = await supabase.from('campaigns').insert({
      project_id: projectId,
      name: campaignName.trim(),
      channel: campaignChannel,
      message_ar: campaignMsg.trim(),
      message_en: null,
      audience_filter: audience as unknown as Json,
      status: 'draft',
    });
    setSaving(false);
    if (error) {
      toast.error('تعذّر إنشاء الحملة');
      return;
    }
    toast.success(`أُنشئت الحملة — ستصل (تقديريًا) إلى ${reach} عميل مشترك`);
    setShowCampaign(false);
    setCampaignName('');
    setCampaignMsg('');
    setCampaignMinLoyalty('');
    setCampaignMinVisits('');
    setCampaignMinSpent('');
    setCampaignLastVisit('');
    const { data } = await supabase
      .from('campaigns')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setCampaigns(data as Campaign[]);
  }

  async function setCampaignState(cp: Campaign, status: Campaign['status']) {
    const update: { status: Campaign['status']; sent_count?: number } = {
      status,
      ...(status === 'sent' ? { sent_count: audienceCount(filterFromCampaign(cp)) } : {}),
    };
    const { error } = await supabase.from('campaigns').update(update).eq('id', cp.id);
    if (error) {
      toast.error('تعذّر تحديث الحملة');
      return;
    }
    setCampaigns((prev) =>
      prev.map((c) => (c.id === cp.id ? { ...c, ...update } as Campaign : c))
    );
    toast.success(status === 'sent' ? 'حُدّدت كأُرسلت' : status === 'cancelled' ? 'أُلغيت الحملة' : 'تم التحديث');
  }

  function filterFromCampaign(cp: Campaign): AudienceFilter {
    const f = AudienceFilterSchema.safeParse(cp?.audience_filter ?? {});
    return f.success ? f.data : {};
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

  const custTab = `العملاء (${customers.length})`;
  const campTab = `الحملات (${campaigns.length})`;

  return (
    <div className="page">
      <PullToRefresh onRefresh={refresh}>
        <PageHeader
          crumb={['دكان', 'الفريق', 'العملاء']}
          title="العملاء"
          sub="ملفات العملاء، نقاط الولاء، والحملات التسويقية"
          tabs={[custTab, campTab]}
          activeTab={tab === 'customers' ? custTab : campTab}
          onTab={(t) => setTab(t === custTab ? 'customers' : 'campaigns')}
          primary={
            tab === 'customers' ? (
              <Btn variant="gold" icon={Plus} onClick={() => setShowAdd(true)}>
                عميل جديد
              </Btn>
            ) : (
              <Btn variant="gold" icon={Plus} onClick={() => setShowCampaign(true)}>
                حملة جديدة
              </Btn>
            )
          }
        />

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
                      <Btn size="sm" variant="primary" onClick={() => setShowAdd(true)}>
                        <Plus className="h-4 w-4" />
                        إضافة عميل
                      </Btn>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <div className="table-card">
                <div className="table-wrap">
                <table className="ref-table min-w-[760px]">
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
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-bold text-white">
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
                          <span className="ms-1.5 text-[10.5px] text-[var(--color-text-muted)]">
                            {c.loyalty_points >= 500 ? 'ذهبي' : c.loyalty_points >= 100 ? 'فضي' : 'برونزي'}
                          </span>
                        </td>
                        <td className="font-mono text-[12.5px] font-bold tabular-nums" dir="ltr">
                          {formatMoney(c.total_spent, currency)}
                        </td>
                        <td className="text-[12px] text-[var(--color-text-secondary)]">
                          <span className="tabular-nums">{c.visit_count} زيارة</span>
                          {c.last_visit_at && (
                            <>
                              {' · '}
                              {new Date(c.last_visit_at).toLocaleDateString('ar-BH-u-nu-latn', { timeZone: 'Asia/Bahrain' })}
                            </>
                          )}
                        </td>
                        <td>
                          <Tag bg={c.is_opted_in ? '#E5F3EA' : '#EEF0EC'} fg={c.is_opted_in ? '#2F8F5B' : '#66716D'} dot>
                            {c.is_opted_in ? 'مشترك' : 'غير مشترك'}
                          </Tag>
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-1">
                            <Btn
                              variant="plain"
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
                            </Btn>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => void openHistory(c)}
                              aria-label="سجل النقاط"
                            >
                              <History className="h-3.5 w-3.5" />
                            </Button>
                              <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setConfirmCustomer(c)}
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
                <Pagination label={`عرض ١–${filtered.length.toLocaleString('ar-BH-u-nu-latn')} من ${customers.length.toLocaleString('ar-BH-u-nu-latn')}`} />
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
                    <Btn size="sm" variant="primary" onClick={() => setShowCampaign(true)}>
                      <Plus className="h-4 w-4" />
                      حملة جديدة
                    </Btn>
                  }
                />
              </div>
            )}
            {campaigns.map((cp) => {
              const audience = filterFromCampaign(cp);
              return (
                <Card key={cp.id}>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold">{cp.name}</h3>
                      <p className="mt-0.5 text-[11.5px] text-[var(--color-text-muted)]">
                        {CAMPAIGN_CHANNEL_LABELS[cp.channel]} · أُرسلت إلى {cp.sent_count}
                      </p>
                    </div>
                    <Tag bg={cp.status === 'sent' ? '#E5F3EA' : cp.status === 'cancelled' ? '#FBE9E7' : '#FBF0DD'} fg={cp.status === 'sent' ? '#2F8F5B' : cp.status === 'cancelled' ? '#C0483D' : '#D98E2C'}>
                      {CAMPAIGN_STATUS_LABELS[cp.status]}
                    </Tag>
                  </div>
                  <p className="mb-3 line-clamp-3 text-[12.5px] leading-relaxed text-[var(--color-text-secondary)]">
                    {cp.message_ar}
                  </p>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {describeAudience(audience).map((chip) => (
                      <Tag key={chip} bg="#EEF0EC" fg="#66716D">{chip}</Tag>
                    ))}
                    <Tag bg="#EEF0EC" fg="#66716D">
                      ~{audienceCount(audience)} مستلم تقديري
                    </Tag>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[var(--color-text-muted)]">
                    <span>
                      {cp.scheduled_at
                        ? `مجدولة: ${new Date(cp.scheduled_at).toLocaleDateString('ar-BH-u-nu-latn', { timeZone: 'Asia/Bahrain' })}`
                        : 'مسودة — لم تُجدول'}
                    </span>
                    <div className="flex flex-wrap justify-end gap-1">
                      {(cp.status === 'draft' || cp.status === 'scheduled') && (
                        <>
                          <Btn variant="plain" size="sm" onClick={() => void setCampaignState(cp, 'sent')}>
                            <Check className="h-3.5 w-3.5" />
                            أُرسلت
                          </Btn>
                          <Btn variant="plain" size="sm" onClick={() => void setCampaignState(cp, 'cancelled')}>
                            <Ban className="h-3.5 w-3.5" />
                            إلغاء
                          </Btn>
                        </>
                      )}
                      {(cp.status === 'draft' || cp.status === 'cancelled') && (
                          <Button variant="ghost" size="icon-sm" onClick={() => setConfirmCampaign(cp)} aria-label="حذف">
                            <Trash2 className="h-3.5 w-3.5 text-[var(--color-danger)]" />
                          </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
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
              <Btn variant="secondary" size="sm" onClick={() => setShowAdd(false)}>
                إلغاء
              </Btn>
              <Btn type="submit" variant="primary" size="sm" disabled={saving}>
                {saving ? 'جاري الحفظ…' : 'إضافة'}
              </Btn>
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
              <Btn variant="secondary" size="sm" onClick={() => setShowLoyalty(null)}>
                إلغاء
              </Btn>
              <Btn size="sm" variant="primary" onClick={() => void applyLoyalty()} disabled={saving}>
                {saving ? 'جاري الحفظ…' : 'تطبيق'}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Loyalty history */}
      {historyCustomer && (
        <Modal
          title={`سجل النقاط — ${historyCustomer.name || historyCustomer.phone}`}
          onClose={() => setHistoryCustomer(null)}
          className="max-w-md"
        >
          {historyLoading ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-10 w-full rounded-md bg-muted" />
              <div className="h-10 w-full rounded-md bg-muted" />
              <div className="h-10 w-full rounded-md bg-muted" />
            </div>
          ) : historyEvents.length === 0 ? (
            <EmptyState
              icon={<History className="h-7 w-7" />}
              title="لا يوجد سجل"
              description="لم تُسجل أي حركة نقاط لهذا العميل بعد."
            />
          ) : (
            <div className="max-h-[55dvh] divide-y divide-[var(--color-border)] overflow-y-auto">
              {historyEvents.map((ev) => (
                <div key={ev.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold">
                      {ev.kind === 'earn' ? 'إضافة نقاط' : ev.kind === 'redeem' ? 'استبدال نقاط' : 'تعديل مباشر'}
                    </div>
                    {ev.reason && (
                      <div className="truncate text-[11.5px] text-[var(--color-text-muted)]">{ev.reason}</div>
                    )}
                    <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                      {new Date(ev.created_at).toLocaleString('ar-BH-u-nu-latn', { timeZone: 'Asia/Bahrain' })}
                    </div>
                  </div>
                  <span
                    className={`font-mono text-[13px] font-bold tabular-nums ${
                      ev.points > 0 ? 'text-[var(--color-primary)]' : 'text-[var(--color-danger)]'
                    }`}
                  >
                    {ev.points > 0 ? '+' : ''}
                    {ev.points}
                  </span>
                </div>
              ))}
            </div>
          )}
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
            </div>
            <div>
              <label className="label">استهداف الجمهور (اختياري — فارغ = الكل)</label>
              <div className="grid grid-cols-2 gap-3">
                <div className="field">
                  <label className="label">حد أدنى لنقاط الولاء</label>
                  <input
                    className="input"
                    inputMode="numeric"
                    maxLength={6}
                    value={campaignMinLoyalty}
                    onChange={(e) => setCampaignMinLoyalty(e.target.value.replace(/\D/g, ''))}
                    placeholder="0"
                  />
                </div>
                <div className="field">
                  <label className="label">حد أدنى للزيارات</label>
                  <input
                    className="input"
                    inputMode="numeric"
                    maxLength={4}
                    value={campaignMinVisits}
                    onChange={(e) => setCampaignMinVisits(e.target.value.replace(/\D/g, ''))}
                    placeholder="0"
                  />
                </div>
                <div className="field">
                  <label className="label">حد أدنى للإنفاق ({currency})</label>
                  <input
                    className="input"
                    inputMode="decimal"
                    maxLength={10}
                    value={campaignMinSpent}
                    onChange={(e) => setCampaignMinSpent(e.target.value.replace(/[^\d.]/g, ''))}
                    placeholder="0.000"
                  />
                </div>
                <div className="field">
                  <label className="label">آخر زيارة خلال (أيام)</label>
                  <input
                    className="input"
                    inputMode="numeric"
                    maxLength={4}
                    value={campaignLastVisit}
                    onChange={(e) => setCampaignLastVisit(e.target.value.replace(/\D/g, ''))}
                    placeholder="30"
                  />
                </div>
              </div>
              <p
                className={`mt-2 text-[11.5px] ${draftAudienceValid ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-danger)]'}`}
              >
                <Megaphone className="me-1 inline h-3.5 w-3.5 align-[-2px]" />
                {draftAudienceValid
                  ? `سيستهدف هذا الجمهور ${audienceCount(draftAudience)} عميلًا مشتركًا من المسجلين حاليًا`
                  : 'تحقق من قيم الاستهداف — الأرقام يجب أن تكون موجبة'}
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Btn variant="secondary" size="sm" onClick={() => setShowCampaign(false)}>
                إلغاء
              </Btn>
              <Btn type="submit" variant="primary" size="sm" disabled={saving}>
                {saving ? 'جاري الإنشاء…' : 'إنشاء مسودة'}
              </Btn>
            </div>
          </form>
        </Modal>
      )}

      {confirmCustomer && (
        <Modal title="حذف العميل" onClose={() => setConfirmCustomer(null)}>
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-danger-tint)]">
              <Trash2 className="h-6 w-6 text-[var(--color-danger)]" />
            </div>
            <p className="mb-5 text-xs text-[var(--color-text-secondary)]">
              هل أنت متأكد من حذف العميل «{confirmCustomer.name || confirmCustomer.phone}»؟ لا يمكن التراجع.
            </p>
            <div className="flex gap-2">
              <Btn variant="danger" className="w-full" disabled={saving} onClick={async () => { await deleteCustomer(confirmCustomer.id); setConfirmCustomer(null); }}>
                {saving ? 'جاري…' : 'نعم، حذف'}
              </Btn>
              <Btn variant="secondary" onClick={() => setConfirmCustomer(null)}>
                تراجع
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {confirmCampaign && (
        <Modal title="حذف الحملة" onClose={() => setConfirmCampaign(null)}>
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-danger-tint)]">
              <Trash2 className="h-6 w-6 text-[var(--color-danger)]" />
            </div>
            <p className="mb-5 text-xs text-[var(--color-text-secondary)]">
              هل أنت متأكد من حذف الحملة «{confirmCampaign.name}»؟ لا يمكن التراجع.
            </p>
            <div className="flex gap-2">
              <Btn variant="danger" className="w-full" disabled={saving} onClick={async () => { await deleteCampaign(confirmCampaign.id); setConfirmCampaign(null); }}>
                {saving ? 'جاري…' : 'نعم، حذف'}
              </Btn>
              <Btn variant="secondary" onClick={() => setConfirmCampaign(null)}>
                تراجع
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
