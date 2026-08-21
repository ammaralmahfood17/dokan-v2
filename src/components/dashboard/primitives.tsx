// Shared dashboard primitives — reference "دكان" design.
// Card, Btn, Tag, FilterBar, Pagination, Checkbox, StatStrip.
'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const C = {
  surface: '#FFFFFF',
  ink: '#181D1B',
  sub: '#66716D',
  faint: '#5F6D68',
  border: '#E4E1D6',
  borderStrong: '#D3CFC0',
  primary: '#0F5E56',
  primaryDark: '#0A4640',
  primarySoft: '#E4EFEC',
  gold: '#C9973B',
};

export function Tag({ children, bg, fg, dot, className }: { children: React.ReactNode; bg: string; fg: string; dot?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold whitespace-nowrap', className)} style={{ background: bg, color: fg }}>
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: fg }} />}
      {children}
    </span>
  );
}

export function Card({ children, className, pad = true }: { children: React.ReactNode; className?: string; pad?: boolean }) {
  return (
    <div
      className={cn('rounded-xl border', className)}
      style={{ background: C.surface, borderColor: C.border, padding: pad ? 18 : 0 }}
    >
      {children}
    </div>
  );
}

type BtnVariant = 'primary' | 'gold' | 'secondary' | 'plain' | 'danger';
type BtnSize = 'md' | 'sm';

const VARIANTS: Record<BtnVariant, React.CSSProperties> = {
  primary: { background: C.primary, color: '#fff', border: `1px solid ${C.primary}` },
  gold: { background: C.gold, color: '#fff', border: `1px solid ${C.gold}` },
  secondary: { background: C.surface, color: C.ink, border: `1px solid ${C.borderStrong}` },
  plain: { background: 'transparent', color: C.sub, border: '1px solid transparent' },
  danger: { background: C.surface, color: '#C0483D', border: '1px solid #FBE9E7' },
};

export function Btn({
  children,
  icon: Icon,
  onClick,
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
}: {
  children: React.ReactNode;
  icon?: React.ComponentType<{ size?: number }>;
  onClick?: () => void;
  variant?: BtnVariant;
  size?: BtnSize;
  className?: string;
  type?: 'button' | 'submit';
}) {
  const sizes = { md: 'px-3.5 py-2 text-sm', sm: 'px-2.5 py-1.5 text-xs' };
  return (
    <button
      type={type}
      onClick={onClick}
      className={cn('inline-flex items-center gap-1.5 rounded-[10px] font-semibold transition active:scale-[.97]', sizes[size], className)}
      style={VARIANTS[variant]}
    >
      {Icon && <Icon size={size === 'sm' ? 13 : 15} />}
      {children}
    </button>
  );
}

/** Segment with optional count badge — for cases like kitchen/POS tabs showing live totals. */
export type FilterSegment = {
  key: string;
  label: string;
  count?: number | string;
};

export function FilterBar({
  segments,
  active,
  onChange,
  right,
}: {
  segments: string[] | FilterSegment[];
  active: string;
  onChange: (s: string) => void;
  right?: React.ReactNode;
}) {
  // Normalize to FilterSegment[] — strings become {key: s, label: s}.
  const normalized: FilterSegment[] = segments.map((s) =>
    typeof s === 'string' ? { key: s, label: s } : s
  );
  return (
    <div className="filter-bar">
      <div className="flex flex-wrap items-center gap-1.5">
        {normalized.map((seg) => (
          <button
            key={seg.key}
            type="button"
            onClick={() => onChange(seg.key)}
            aria-pressed={active === seg.key}
            className={cn('filter-seg', active === seg.key && 'active')}
          >
            {seg.label}
            {seg.count !== undefined && <span className="count">{seg.count}</span>}
          </button>
        ))}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

export function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={checked}
      aria-label={checked ? 'إلغاء التحديد' : 'تحديد'}
      className={cn('cbox', checked && 'checked')}
    >
      {checked && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  );
}

export function Pagination({ label }: { label: string }) {
  return (
    <div className="table-pager">
      <p>{label}</p>
      <div className="pager-btns">
        <button type="button" className="pager-btn" aria-label="الصفحة السابقة"><ChevronRight size={15} /></button>
        <button type="button" className="pager-btn active">١</button>
        <button type="button" className="pager-btn">٢</button>
        <button type="button" className="pager-btn" aria-label="الصفحة التالية"><ChevronLeft size={15} /></button>
      </div>
    </div>
  );
}

/** Shopify-style stat strip — single card, divided cells (reference design). */
export function StatStrip({ cells }: { cells: { label: string; value: string; icon?: React.ComponentType<{ size?: number; className?: string }>; delta?: string; positive?: boolean }[] }) {
  return (
    <div className="stat-strip">
      {cells.map((c, i) => {
        const Icon = c.icon;
        return (
          <div key={c.label} className="stat-cell">
            <div className="stat-cell-label">
              {Icon && <Icon size={14} className="text-[var(--color-text-secondary)]" />}
              <span>{c.label}</span>
            </div>
            <div className="stat-cell-value">
              <span>{c.value}</span>
              {c.delta && (
                <span className={cn('stat-cell-delta', c.positive ? 'up' : 'down')}>{c.delta}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}