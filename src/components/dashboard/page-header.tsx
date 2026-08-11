// Editorial page header — kicker + serif title + description + actions.
// Arabic-first: kicker renders a muted label; Latin "kickerEn" (optional)
// shows beside it in lowercase for the classic editorial voice.
'use client';

import { cn } from '@/lib/utils';

export function PageHeader({
  kicker,
  title,
  description,
  actions,
  className,
}: {
  kicker?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('page-header', className)}>
      <div>
        {kicker && (
          <div className="page-kicker">
            <span>{kicker}</span>
          </div>
        )}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2.5">{actions}</div>}
    </div>
  );
}
