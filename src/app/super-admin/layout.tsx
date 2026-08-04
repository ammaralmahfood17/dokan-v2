import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSuperAdmin } from '@/lib/super-admin';

/**
 * Super-admin route group guard. Runs on EVERY request (server component
 * layout) — a session that was valid at page load does not carry over; each
 * navigation re-checks membership in super_admins.
 *
 * No link to this surface exists anywhere in the regular dashboard — direct
 * URL only.
 */
export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSuperAdmin();

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-bg)]">
      {/* Top bar — deliberately distinct from the tenant dashboard */}
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[var(--color-danger)] text-xs font-bold text-white">
              SA
            </span>
            <span className="text-sm font-bold">لوحة التحكم الرئيسية</span>
          </div>
          <nav className="flex items-center gap-1 text-xs font-semibold">
            <Link
              href="/super-admin/subscriptions"
              className="rounded-[8px] px-3 py-2 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text)]"
            >
              الاشتراكات
            </Link>
            <Link
              href="/super-admin/audit"
              className="rounded-[8px] px-3 py-2 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text)]"
            >
              سجل العمليات
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
