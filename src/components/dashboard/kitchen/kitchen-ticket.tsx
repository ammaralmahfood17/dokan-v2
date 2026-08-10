'use client';

// FIX-C-002: KitchenTicket — extracted from kitchen-client.tsx.
// One kitchen order card: status tone border, merged lines, stage actions.
import { toast } from 'sonner';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/lib/types';

// FIX-C-002: أنواع محلية مستقلة (بنية التذكرة كما تصل من الـ parent)
export type KitchenTicketLine = {
  key: string;
  quantity: number;
  productName: string;
  addons: { name: string }[];
  notes: string | null;
};

export type KitchenTicketData = {
  order: {
    id: string;
    status: string;
    created_at: string;
    order_number: number;
    type: string;
    notes: string | null;
    tables?: { number: number } | null;
  };
  lines: KitchenTicketLine[];
  totalQty: number;
};

export const OVERDUE_MIN_PENDING = 15;
export const OVERDUE_MIN_PREPARING = 30;

export function KitchenTicket({
  ticket,
  now,
  currency,
  onStart,
  onReady,
  onDeliver,
  onCancel,
}: {
  ticket: KitchenTicketData;
  now: number;
  currency: string;
  onStart: () => void;
  onReady: () => void;
  onDeliver: () => void;
  onCancel: () => void;
}) {
  const { order, lines, totalQty } = ticket;
  const status = order.status as OrderStatus;
  // Guard against a malformed/absent created_at — a NaN diff would silently
  // read "قبل NaN دقيقة" and never flag overdue.
  const createdMs = new Date(order.created_at).getTime();
  const mins = Number.isFinite(createdMs)
    ? Math.max(0, Math.floor((now - createdMs) / 60000))
    : 0;

  const tone =
    status === 'pending'
      ? 'success'
      : status === 'preparing'
        ? 'warning'
        : 'success';

  let overdue = false;
  if (status === 'pending' && mins >= OVERDUE_MIN_PENDING) overdue = true;
  if (status === 'preparing' && mins >= OVERDUE_MIN_PREPARING) overdue = true;

  const badgeTone = overdue ? 'danger' : tone;
  const badgeLabel = overdue ? 'متأخر' : ORDER_STATUS_LABELS[status];

  // Timer color gradient — success → warning → danger (5 / 12 / 20 min)
  const timerTone =
    mins < 5
      ? 'var(--color-success)'
      : mins < 12
        ? 'var(--color-warn)'
        : mins < 20
          ? 'var(--color-warn-hover)'
          : 'var(--color-danger)';

  const toneBorder: Record<string, string> = {
    success: 'border-[var(--color-success)]',
    warning: 'border-[var(--color-warn)]',
    danger: 'border-[var(--color-danger)]',
  };
  const toneBadge: Record<string, string> = {
    success: 'bg-[var(--color-success-tint)] text-[var(--color-success)]',
    warning: 'bg-[var(--color-warn-tint)] text-[var(--color-warn)]',
    danger: 'bg-[var(--color-danger-tint)] text-[var(--color-danger)]',
  };

  const tableLabel = order.tables
    ? `TABLE·${String(order.tables.number).padStart(2, '0')}`
    : order.type === 'drivethru'
      ? `DRIVE-${String(order.order_number).padStart(2, '0')}`
      : `WALKIN·${String(order.order_number).padStart(2, '0')}`;

  const timeLabel = mins < 1 ? 'الآن' : `قبل ${mins} دقيقة`;

  return (
    /* AR-4: اسم وصفي للتذكرة لقارئ الشاشة (رقم الطلب + التأخر) */
    <article
      aria-label={`طلب رقم ${order.order_number}${overdue ? ' - متأخر' : ''}`}
      className={`border-2 bg-[var(--color-surface)] p-4 ${toneBorder[badgeTone]}`}
    >
      {/* Head: order number + table/time */}
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <span className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-sunken)] px-2 py-0.5 font-mono text-[12px] font-bold tabular-nums text-[var(--color-text)]" dir="ltr">
          #{String(order.order_number).padStart(3, '0')}
        </span>
        <div className="text-end">
          <p className="font-mono text-[12px] font-semibold tabular-nums text-[var(--color-text-secondary)]" dir="ltr">
            {tableLabel}
          </p>
          <p className="text-[11px]" style={{ color: timerTone }}>
            {timeLabel}
            {overdue && ' · متأخر!'}
          </p>
        </div>
      </div>

      {/* Status tag — pill (§6.3) */}
      <span
        className={`mb-2.5 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${toneBadge[badgeTone]}`}
      >
        {badgeLabel}
      </span>

      {/* Items — one line per merged product */}
      <ul className="mb-3 list-none p-0">
        {lines.map((l) => (
          <li
            key={l.key}
            className="flex items-start justify-between gap-2 border-b border-dashed border-[var(--color-border)] py-1.5 text-[14px] last:border-b-0"
          >
            <span>
              {l.productName}
              {l.addons.length > 0 && (
                <span className="block text-[11.5px] text-[var(--color-text-muted)]">
                  {l.addons.map((a) => a.name).join(' · ')}
                </span>
              )}
              {l.notes && (
                <span className="mt-0.5 block text-[11.5px] text-[var(--color-danger)]">
                  {l.notes}
                </span>
              )}
            </span>
            <span className="shrink-0 font-mono text-[13px] font-bold tabular-nums text-[var(--color-primary)]" dir="ltr">
              ×{l.quantity}
            </span>
          </li>
        ))}
        {order.notes && (
          <li className="mt-1.5 border-0 bg-[var(--color-bg)] px-2 py-1.5 text-[11.5px] text-[var(--color-danger)]">
            {order.notes}
          </li>
        )}
      </ul>

      {/* Actions — one primary per stage; ghost "تأخير" only while cooking.
          Cancel is available on every cancellable stage (pending/preparing/ready)
          — the server re-checks status inside the UPDATE (TOCTOU-safe). */}
      <div className="flex gap-2">
        {status === 'pending' && (
          <>
            <button
              type="button"
              onClick={onStart}
              className="min-h-[44px] flex-1 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[var(--color-primary-hover)]"
            >
              بدء التحضير
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="min-h-[44px] min-w-[96px] rounded-[var(--radius-sm)] border border-[var(--color-danger-tint)] bg-transparent px-4 text-[13px] font-bold text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger-tint)]"
            >
              إلغاء
            </button>
          </>
        )}
        {(status === 'preparing' || status === 'ready') && (
          <>
            {status === 'preparing' && (
              <button
                type="button"
                onClick={onReady}
                className="min-h-[44px] flex-1 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[var(--color-primary-hover)]"
              >
                جاهز للتسليم
              </button>
            )}
            {status === 'ready' && (
              <button
                type="button"
                onClick={onDeliver}
                className="min-h-[44px] flex-1 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[var(--color-primary-hover)]"
              >
                تم التسليم
              </button>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="min-h-[44px] min-w-[96px] rounded-[var(--radius-sm)] border border-[var(--color-danger-tint)] bg-transparent px-4 text-[13px] font-bold text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger-tint)]"
            >
              إلغاء
            </button>
          </>
        )}
      </div>
    </article>
  );
}
