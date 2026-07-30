'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Package,
  ClipboardList,
  ChefHat,
  Monitor,
  QrCode,
  Settings,
  LogOut,
  Store,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

type NavItem = {
  href: string;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV_MAIN: NavItem[] = [
  { href: '/dashboard', label: 'الرئيسية', shortLabel: 'الرئيسية', icon: LayoutDashboard },
  { href: '/dashboard/products', label: 'المنتجات', shortLabel: 'منتجات', icon: Package },
  { href: '/dashboard/orders', label: 'الطلبات', shortLabel: 'طلبات', icon: ClipboardList },
  { href: '/dashboard/kitchen', label: 'شاشة المطبخ', shortLabel: 'مطبخ', icon: ChefHat },
  { href: '/dashboard/pos', label: 'نقطة البيع', shortLabel: 'POS', icon: Monitor },
  { href: '/dashboard/tables', label: 'الطاولات و QR', shortLabel: 'طاولات', icon: QrCode },
];

const NAV_BOTTOM: NavItem[] = [
  { href: '/dashboard/settings', label: 'الإعدادات', shortLabel: 'إعدادات', icon: Settings },
];

export function AppSidebar({
  projectName,
  primaryColor,
}: {
  projectName: string;
  primaryColor: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  // Prefetch heavier routes after mount
  useEffect(() => {
    try { router.prefetch('/dashboard/settings'); } catch {}
    try { router.prefetch('/dashboard/tables'); } catch {}
  }, [router]);

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  }

  function navItem(item: NavItem) {
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        prefetch={true}
        onClick={() => setIsOpen(false)}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex items-center gap-2.5 rounded-[8px] px-3 py-2.5 text-[13px] font-semibold transition-colors',
          'lg:px-3 lg:py-2',
          active
            ? 'bg-[var(--color-primary-tint)] text-[var(--color-primary)]'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]'
        )}
      >
        <Icon className="h-5 w-5 shrink-0 lg:h-4 lg:w-4" />
        <span>{item.label}</span>
      </Link>
    );
  }

  return (
    <>
      {/* Hamburger button — mobile only, positioned on the left (leading edge in RTL) */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={cn(
          'fixed left-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-[8px] bg-[var(--color-surface)] shadow-md border border-[var(--color-border)]',
          'lg:hidden',
          isOpen && 'hidden'
        )}
        aria-label="فتح القائمة"
      >
        <Menu className="h-5 w-5 text-[var(--color-text)]" />
      </button>

      {/* Backdrop — mobile only */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          // Mobile: fixed, slides from right
          'fixed right-0 top-0 z-50 flex h-dvh w-[260px] flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl transition-transform duration-300',
          isOpen ? 'translate-x-0' : 'translate-x-full',
          // Desktop: sticky, always visible in flex flow
          'lg:static lg:z-auto lg:h-auto lg:w-56 lg:translate-x-0 lg:shadow-none lg:border-l'
        )}
      >
        {/* Header with close button (mobile) + project info */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-3 lg:px-4 lg:py-4">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-[8px] text-white lg:h-9 lg:w-9"
              style={{ background: primaryColor || '#4338CA' }}
            >
              <Store className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-[var(--color-text)]">
                {projectName}
              </div>
              <div className="text-[11px] text-[var(--color-text-secondary)]">دكان</div>
            </div>
          </div>

          {/* Close button — mobile only */}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-[8px] hover:bg-[var(--color-bg)] lg:hidden"
            aria-label="إغلاق القائمة"
          >
            <X className="h-5 w-5 text-[var(--color-text-muted)]" />
          </button>
        </div>

        {/* Main navigation */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2 lg:p-2">
          {NAV_MAIN.map(navItem)}
        </nav>

        {/* Bottom actions */}
        <div className="border-t border-[var(--color-border)] p-2">
          {NAV_BOTTOM.map(navItem)}

          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2.5 text-[13px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] hover:text-[var(--color-danger)]"
          >
            <LogOut className="h-5 w-5 shrink-0 lg:h-4 lg:w-4" />
            تسجيل الخروج
          </button>
        </div>
      </aside>
    </>
  );
}
