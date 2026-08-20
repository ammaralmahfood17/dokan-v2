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
  Utensils,
  HeartPulse,
  Briefcase,
  ShoppingCart,
  Dumbbell,
  GraduationCap,
  Scissors,
  BedDouble,
  Building2,
  Pill,
  Car,
  Truck,
  Calendar,
  Award,
  CreditCard,
  Bell,
  FileText,
  Wallet2,
  Wallet,
  PiggyBank,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Module, BusinessType } from '@/lib/types';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  /** Module code required to see this item. If omitted, always visible. */
  module?: string;
  /** Badge shown next to the label (e.g. open order count). */
  badge?: string;
};

/** Grouped nav — reference "دكان" sidebar (المبيعات / المالية / الفريق / الإدارة). */
const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [{ href: '/dashboard', label: 'الرئيسية', icon: LayoutDashboard }],
  },
  {
    label: 'المبيعات',
    items: [
      { href: '/dashboard/orders', label: 'الطلبات', icon: ClipboardList, badge: '٧' },
      { href: '/dashboard/products', label: 'القائمة', icon: Package },
      { href: '/dashboard/tables', label: 'الطاولات وQR', icon: QrCode, module: 'menu_qr' },
      { href: '/dashboard/pos', label: 'نقطة البيع', icon: Monitor, module: 'pos' },
      { href: '/dashboard/kitchen', label: 'شاشة المطبخ', icon: ChefHat, module: 'kds' },
      { href: '/dashboard/delivery', label: 'التوصيل', icon: Truck, module: 'delivery' },
      { href: '/dashboard/reservations', label: 'الحجوزات', icon: Calendar, module: 'reservations' },
    ],
  },
  {
    label: 'المالية',
    items: [
      { href: '/dashboard/analytics', label: 'الإحصائيات', icon: BarChart3 },
      { href: '/dashboard/reports', label: 'التقارير', icon: FileText },
      { href: '/dashboard/budget', label: 'الميزانية', icon: Wallet },
      { href: '/dashboard/transactions', label: 'المعاملات', icon: Receipt },
      { href: '/dashboard/billing', label: 'الاشتراك والفواتير', icon: PiggyBank, module: 'accounting' },
      { href: '/dashboard/payments', label: 'بوابات الدفع', icon: CreditCard, module: 'payments' },
    ],
  },
  {
    label: 'الفريق',
    items: [
      { href: '/dashboard/customers', label: 'العملاء', icon: Users, module: 'crm' },
      { href: '/dashboard/inventory', label: 'المخزون والموردون', icon: Boxes, module: 'inventory' },
      { href: '/dashboard/loyalty', label: 'برنامج الولاء', icon: Award, module: 'loyalty' },
      { href: '/dashboard/notifications', label: 'الإشعارات', icon: Bell, module: 'notifications' },
    ],
  },
  {
    label: null,
    items: [{ href: '/dashboard/settings', label: 'الإعدادات', icon: Settings }],
  },
];

const C = {
  primaryDark: '#0A4640',
  gold: '#C9973B',
};

function BusinessTypeIcon({ icon, size = 20 }: { icon: string | null; size?: number }) {
  switch (icon) {
    case 'utensils': return <Utensils className="h-5 w-5" size={size} />;
    case 'store': return <Package className="h-5 w-5" size={size} />;
    case 'heart-pulse': return <HeartPulse className="h-5 w-5" size={size} />;
    case 'briefcase': return <Briefcase className="h-5 w-5" size={size} />;
    case 'shopping-cart': return <ShoppingCart className="h-5 w-5" size={size} />;
    case 'dumbbell': return <Dumbbell className="h-5 w-5" size={size} />;
    case 'graduation-cap': return <GraduationCap className="h-5 w-5" size={size} />;
    case 'scissors': return <Scissors className="h-5 w-5" size={size} />;
    case 'bed-double': return <BedDouble className="h-5 w-5" size={size} />;
    case 'building-2': return <Building2 className="h-5 w-5" size={size} />;
    case 'pill': return <Pill className="h-5 w-5" size={size} />;
    case 'car': return <Car className="h-5 w-5" size={size} />;
    default: return <Store className="h-5 w-5" size={size} />;
  }
}

export function AppSidebar({ projectName, activeModules, businessType }: { projectName: string; activeModules: Module[]; businessType: BusinessType | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const activeModuleCodes = new Set(activeModules.map((m) => m.code));

  // Shared drawer state with the top header (dokan:open-drawer event).
  useEffect(() => {
    function onOpen() {
      setIsOpen(true);
    }
    window.addEventListener('dokan:open-drawer', onOpen);
    return () => window.removeEventListener('dokan:open-drawer', onOpen);
  }, []);

  useEffect(() => {
    for (const p of [
      '/dashboard/settings',
      '/dashboard/tables',
      '/dashboard/analytics',
      '/dashboard/customers',
      '/dashboard/inventory',
      '/dashboard/billing',
      '/dashboard/loyalty',
      '/dashboard/delivery',
      '/dashboard/reservations',
      '/dashboard/payments',
      '/dashboard/notifications',
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

  return (
    <>
      {/* Backdrop — mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[var(--z-drawer)] bg-black/40 lg:hidden animate-fade-in"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        id="app-drawer"
        className={cn(
          'fixed inset-y-0 end-0 z-[var(--z-drawer)] flex w-60 shrink-0 flex-col border-s transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          isOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0',
          'print:hidden'
        )}
        style={{ background: C.primaryDark, borderColor: 'rgba(255,255,255,.08)' }}
        aria-label="التنقل الرئيسي"
      >
        {/* Brand — gold chef-hat mark (reference) */}
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/dashboard" onClick={() => setIsOpen(false)} className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-[10px]" style={{ background: C.gold }}>
              {businessType ? (
                <BusinessTypeIcon icon={businessType.icon} />
              ) : (
                <ChefHat size={16} color="#fff" />
              )}
            </div>
            <div className="leading-tight">
              <p className="kufi text-[15px] font-bold text-white">دكان</p>
              <p className="text-[10px] text-white/45">{businessType?.name_ar ?? 'منصة الأعمال'}</p>
            </div>
          </Link>
          <button className="lg:hidden text-white/70" onClick={() => setIsOpen(false)} aria-label="إغلاق">
            <X size={18} />
          </button>
        </div>

        {/* Navigation — grouped like the reference */}
        <nav className="mt-1 flex flex-col gap-4 overflow-y-auto px-3 pb-4" style={{ maxHeight: 'calc(100vh - 150px)' }} aria-label="التنقل الرئيسي">
          {NAV_GROUPS.map((g, gi) => {
            const visible = g.items.filter((item) => !item.module || activeModuleCodes.has(item.module));
            if (visible.length === 0) return null;
            return (
              <div key={gi}>
                {g.label && (
                  <p className="mb-1 px-2.5 text-[10.5px] font-bold uppercase tracking-wide text-white/35">{g.label}</p>
                )}
                <div className="flex flex-col gap-0.5">
                  {visible.map((item) => {
                    const active = isActive(item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setIsOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className="flex items-center justify-between gap-2 rounded-[10px] px-2.5 py-2 text-[13.5px] font-medium transition-colors"
                        style={{
                          background: active ? 'rgba(255,255,255,.1)' : 'transparent',
                          color: active ? '#fff' : 'rgba(255,255,255,.68)',
                        }}
                      >
                        <span className="flex items-center gap-2.5">
                          <Icon size={16} />
                          {item.label}
                        </span>
                        {item.badge && (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                            style={{ background: active ? C.gold : 'rgba(255,255,255,.12)', color: active ? '#fff' : 'rgba(255,255,255,.7)' }}
                          >
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Bottom — growth plan (reference) + logout */}
        <div className="absolute bottom-0 w-full border-t p-3" style={{ borderColor: 'rgba(255,255,255,.08)' }}>
          <div className="rounded-[10px] p-3" style={{ background: 'rgba(255,255,255,.06)' }}>
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-white">خطة النمو</p>
              <p className="text-[11px] text-white/50">٣ فروع</p>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-white/15">
              <div className="h-1.5 rounded-full" style={{ width: '62%', background: C.gold }} />
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="mt-2 flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] font-semibold text-white/70 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut size={16} />
            تسجيل الخروج
          </button>
        </div>
      </aside>
    </>
  );
}