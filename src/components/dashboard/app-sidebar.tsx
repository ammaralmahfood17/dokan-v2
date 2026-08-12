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
  BarChart3,
  Settings,
  LogOut,
  Store,
  Users,
  Boxes,
  Receipt,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type NavItem = {
  href: string;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  section: 'overview' | 'operations' | 'manage';
};

const NAV_MAIN: NavItem[] = [
  // نظرة عامة — Overview
  { href: '/dashboard', label: 'الرئيسية', shortLabel: 'الرئيسية', icon: LayoutDashboard, section: 'overview' },
  { href: '/dashboard/analytics', label: 'الإحصائيات', shortLabel: 'إحصائيات', icon: BarChart3, section: 'overview' },
  // عمليات — Operations
  { href: '/dashboard/orders', label: 'الطلبات', shortLabel: 'طلبات', icon: ClipboardList, section: 'operations' },
  { href: '/dashboard/kitchen', label: 'شاشة المطبخ', shortLabel: 'مطبخ', icon: ChefHat, section: 'operations' },
  { href: '/dashboard/pos', label: 'نقطة البيع', shortLabel: 'POS', icon: Monitor, section: 'operations' },
  { href: '/dashboard/products', label: 'المنتجات', shortLabel: 'منتجات', icon: Package, section: 'operations' },
  { href: '/dashboard/tables', label: 'الطاولات و QR', shortLabel: 'طاولات', icon: QrCode, section: 'operations' },
  // إدارة — Manage
  { href: '/dashboard/customers', label: 'العملاء', shortLabel: 'عملاء', icon: Users, section: 'manage' },
  { href: '/dashboard/inventory', label: 'المخزون والموردون', shortLabel: 'مخزون', icon: Boxes, section: 'manage' },
  { href: '/dashboard/billing', label: 'الاشتراك والفواتير', shortLabel: 'فواتير', icon: Receipt, section: 'manage' },
  { href: '/dashboard/settings', label: 'الإعدادات', shortLabel: 'إعدادات', icon: Settings, section: 'manage' },
];

const SECTION_LABELS: Record<NavItem['section'], { label: string; en: string }> = {
  overview: { label: 'نظرة عامة', en: 'Overview' },
  operations: { label: 'العمليات', en: 'Operations' },
  manage: { label: 'الإدارة', en: 'Manage' },
};

export function AppSidebar({ projectName }: { projectName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    for (const p of [
      '/dashboard/settings',
      '/dashboard/tables',
      '/dashboard/analytics',
      '/dashboard/customers',
      '/dashboard/inventory',
      '/dashboard/billing',
    ]) {
      try { router.prefetch(p); } catch {}
    }
  }, [router]);

  async function logout() {
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/login');
      router.refresh();
    } catch {
      toast.error('تعذّر تسجيل الخروج — حاول مرة أخرى');
    }
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
          'group relative flex min-h-11 items-center gap-3 rounded-[10px] px-3 py-2 text-[13px] font-semibold transition-colors duration-150',
          active
            ? 'bg-[var(--color-primary-tint)] text-[var(--color-primary)]'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]'
        )}
      >
        <div
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] transition-colors duration-150',
            active
              ? 'bg-[var(--color-primary-tint-strong)] text-[var(--color-primary)]'
              : 'bg-transparent text-[var(--color-text-muted)] group-hover:text-[var(--color-text)]'
          )}
        >
          <Icon className={cn('h-4 w-4', active ? 'text-[var(--color-primary)]' : '')} />
        </div>
        <span>{item.label}</span>
        {active && <span className="ms-auto h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" />}
      </Link>
    );
  }

  function navSection(items: NavItem[]) {
    const label = SECTION_LABELS[items[0].section];
    return (
      <div key={items[0].section}>
        <div className="mb-2 flex items-center gap-2 px-3">
          <span className="h-px w-3 bg-[var(--color-primary)]" />
          <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
            {label.label}
          </span>
          <span dir="ltr" className="text-[10.5px] font-medium lowercase text-[var(--color-text-disabled)]">
            {label.en}
          </span>
        </div>
        <div className="space-y-0.5">{items.map(navItem)}</div>
      </div>
    );
  }

  const sections = (['overview', 'operations', 'manage'] as const)
    .map((s) => NAV_MAIN.filter((n) => n.section === s))
    .filter((arr) => arr.length > 0);

  return (
    <>
      {/* Hamburger — mobile only */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={cn(
          'fixed end-3 top-3 z-[var(--z-drawer)] flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--color-surface)] shadow-md border border-[var(--color-border)]',
          'lg:hidden',
          isOpen && 'hidden'
        )}
        aria-label="فتح القائمة"
        aria-expanded={isOpen}
        aria-controls="app-drawer"
      >
        <Menu className="h-5 w-5 text-[var(--color-text)]" />
      </button>

      {/* Backdrop — mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[var(--z-drawer)] bg-black/50 lg:hidden animate-fade-in"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        id="app-drawer"
        className={cn(
          'fixed start-0 top-0 z-[var(--z-drawer)] flex h-dvh w-[280px] flex-col border-e border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl transition-transform duration-300',
          isOpen ? 'translate-x-0' : 'translate-x-full',
          'lg:static lg:z-auto lg:h-auto lg:w-60 lg:translate-x-0 lg:shadow-none',
          'print:hidden'
        )}
      >
        {/* Brand — serif wordmark */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-5">
          <Link href="/dashboard" onClick={() => setIsOpen(false)} className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[var(--color-primary)] text-white shadow-sm">
              <Store className="h-5 w-5" />
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[15px] font-semibold tracking-wide text-[var(--color-text)]">
                {projectName}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
                <span className="font-serif italic">dokan</span>
                <span className="h-1 w-1 rounded-full bg-[var(--color-border-strong)]" />
                <span>منصة المطاعم</span>
              </div>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] hover:bg-[var(--color-bg)] lg:hidden"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4 text-[var(--color-text-muted)]" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label="التنقل الرئيسي">
          <div className="space-y-6">{sections.map(navSection)}</div>
        </nav>

        {/* Bottom — logout */}
        <div className="border-t border-[var(--color-border)] px-3 py-3">
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-danger-tint)] hover:text-[var(--color-danger)] transition-colors duration-150"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)]">
              <LogOut className="h-4 w-4" />
            </div>
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>
    </>
  );
}