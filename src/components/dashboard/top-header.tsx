'use client';

import { Search, HelpCircle, Bell, ChevronDown, Menu as MenuIcon } from 'lucide-react';

/**
 * Top header — reference "دكان" design.
 * Sticky app header: mobile hamburger (toggles the sidebar drawer) + quick
 * search + notifications bell + profile. Pure chrome, no data fetching.
 */
export function TopHeader({ projectName }: { projectName: string }) {
  // Reference hides the hamburger on lg (sidebar is static); we dispatch the
  // event to AppSidebar so both share one drawer state.
  function openDrawer() {
    window.dispatchEvent(new CustomEvent('dokan:open-drawer'));
  }

  return (
    <header
      className="sticky top-0 z-[var(--z-sticky)] flex h-[68px] items-center justify-between gap-3 border-b px-4 backdrop-blur lg:px-8 print:hidden"
      style={{ background: 'rgba(246,248,245,.84)', borderColor: 'rgba(228,225,214,.8)' }}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={openDrawer}
          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-white/70 lg:hidden"
          aria-label="فتح القائمة"
        >
          <MenuIcon size={20} style={{ color: 'var(--color-text)' }} />
        </button>
        <div
          className="hidden items-center gap-2 rounded-2xl border px-3.5 py-2 sm:flex"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)', minWidth: 240 }}
        >
          <Search size={15} style={{ color: 'var(--color-text-muted)' }} />
          <input
            placeholder="بحث سريع — طلبات، أصناف، عملاء..."
            className="w-full bg-transparent text-xs outline-none"
            style={{ color: 'var(--color-text)' }}
            maxLength={80}
            aria-label="بحث سريع"
          />
          <kbd
            className="rounded border px-1.5 py-0.5 text-[10px]"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
          >
            ⌘K
          </kbd>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="hidden h-10 w-10 items-center justify-center rounded-2xl border sm:flex"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
          aria-label="المساعدة"
        >
          <HelpCircle size={16} style={{ color: 'var(--color-text-secondary)' }} />
        </button>
        <button
          type="button"
          className="relative flex h-10 w-10 items-center justify-center rounded-2xl border"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
          aria-label="الإشعارات"
        >
          <Bell size={16} style={{ color: 'var(--color-text)' }} />
        </button>
        <div className="mx-1 h-6 w-px" style={{ background: 'var(--color-border)' }} />

        <button
          type="button"
          className="flex items-center gap-2 rounded-2xl px-2 py-1.5 transition-colors hover:bg-white/70"
        >
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ background: 'var(--color-primary)' }}
          >
            {projectName.slice(0, 1)}
          </div>
          <div className="hidden text-right sm:block">
            <p className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
              {projectName}
            </p>
            <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
              المالك
            </p>
          </div>
          <ChevronDown size={14} className="hidden sm:block" style={{ color: 'var(--color-text-muted)' }} />
        </button>
      </div>
    </header>
  );
}