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
  Moon,
  Sun,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const [isDark, setIsDark] = useState(false);

  // Init dark mode from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('dokan-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = stored === 'dark' || (!stored && prefersDark);
    setIsDark(dark);
    document.documentElement.classList.toggle('dark', dark);
  }, []);

  function toggleDark() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('dokan-theme', next ? 'dark' : 'light');
  }

  useEffect(() => {
    try { router.prefetch('/dashboard/settings'); } catch {}
    try { router.prefetch('/dashboard/tables'); } catch {}
  }, [router]);

  async function logout() {
    const { createClient } = await import('@/lib/supabase/client');
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
          'group flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px] font-semibold transition-all duration-200',
          'lg:px-3 lg:py-2',
          active
            ? 'bg-[var(--color-primary-tint)] text-[var(--color-primary)] shadow-sm'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]'
        )}
      >
        <div className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] transition-all duration-200',
          active
            ? 'bg-[var(--color-primary)] text-white'
            : 'bg-transparent text-[var(--color-text-muted)] group-hover:text-[var(--color-text)]'
        )}>
          <Icon className={cn('h-[15px] w-[15px]', active ? 'text-white' : '')} />
        </div>
        <span>{item.label}</span>
        {active && (
          <div className="mr-auto h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" />
        )}
      </Link>
    );
  }

  return (
    <>
      {/* Hamburger — mobile only */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={cn(
          'fixed left-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--color-surface)] shadow-md border border-[var(--color-border)] backdrop-blur-sm',
          'lg:hidden',
          isOpen && 'hidden'
        )}
        aria-label="فتح القائمة"
      >
        <Menu className="h-5 w-5 text-[var(--color-text)]" />
      </button>

      {/* Backdrop — mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed right-0 top-0 z-50 flex h-dvh w-[270px] flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl transition-transform duration-300',
          isOpen ? 'translate-x-0' : 'translate-x-full',
          'lg:static lg:z-auto lg:h-auto lg:w-56 lg:translate-x-0 lg:shadow-none lg:border-l'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-3 lg:px-4 lg:py-4">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-[10px] text-white shadow-sm"
              style={{ background: primaryColor || '#4338CA' }}
            >
              <Store className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-[var(--color-text)]">
                {projectName}
              </div>
              <div className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)]">
                <span>دكان</span>
                <span className="h-1 w-1 rounded-full bg-[var(--color-text-muted)]" />
                <span>المطعم</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-[8px] hover:bg-[var(--color-bg)] lg:hidden"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4 text-[var(--color-text-muted)]" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2 lg:p-2">
          {NAV_MAIN.map(navItem)}
        </nav>

        {/* Bottom */}
        <div className="border-t border-[var(--color-border)] p-2 space-y-0.5">
          {NAV_BOTTOM.map(navItem)}

          {/* Dark mode toggle */}
          <button
            type="button"
            onClick={toggleDark}
            className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)] transition-all duration-200"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-[var(--color-text-muted)]">
              {isDark ? <Sun className="h-[15px] w-[15px]" /> : <Moon className="h-[15px] w-[15px]" />}
            </div>
            <span>{isDark ? 'الوضع النهاري' : 'الوضع الليلي'}</span>
          </button>

          {/* Logout */}
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-danger-tint)] hover:text-[var(--color-danger)] transition-all duration-200"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px]">
              <LogOut className="h-[15px] w-[15px]" />
            </div>
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>
    </>
  );
}
