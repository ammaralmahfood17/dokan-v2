// Page header — reference "دكان" design.
// Supports the reference breadcrumb + title + sub + actions + tabs pattern,
// while staying backward-compatible with the old kicker/title/description API.
'use client';

import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = string;

export function PageHeader({
  crumb,
  kicker,
  title,
  sub,
  description,
  actions,
  primary,
  secondary,
  tabs,
  activeTab,
  onTab,
  className,
}: {
  /** Breadcrumb trail — reference design (e.g. ["دكان", "المبيعات", "الطلبات"]) */
  crumb?: string[];
  /** Legacy editorial kicker (kept for backward compat) */
  kicker?: string;
  title: string;
  /** Reference subtitle (same as legacy description) */
  sub?: string;
  description?: string;
  /** Right-aligned actions cluster */
  actions?: React.ReactNode;
  /** Primary action button (rendered last) */
  primary?: React.ReactNode;
  /** Secondary action button (rendered first) */
  secondary?: React.ReactNode;
  /** Optional underline tabs below the title */
  tabs?: string[];
  activeTab?: string;
  onTab?: (t: string) => void;
  className?: string;
}) {
  const subText = sub ?? description;
  const tabValues = tabs;

  return (
    <div className={cn('page-header', className)}>
      <div>
        {crumb && crumb.length > 0 && (
          <div className="crumb">
            {crumb.map((c, i) => (
              <span key={`${c}-${i}`} className="flex items-center gap-1">
                {i > 0 && <ChevronLeft size={12} style={{ color: 'var(--color-text-muted)' }} />}
                <span className={i === crumb.length - 1 ? '' : ''}>{c}</span>
              </span>
            ))}
          </div>
        )}
        {kicker && !crumb && (
          <div className="page-kicker">
            <span>{kicker}</span>
          </div>
        )}
        <h1>{title}</h1>
        {subText && <p>{subText}</p>}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : (
        (primary || secondary) && (
          <div className="flex shrink-0 items-center gap-2">
            {secondary}
            {primary}
          </div>
        )
      )}
      {tabValues && (
        <div className="w-full">
          <div className="page-tabs">
            {tabValues.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onTab?.(t)}
                aria-pressed={activeTab === t}
                className={cn('page-tab', activeTab === t && 'active')}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}