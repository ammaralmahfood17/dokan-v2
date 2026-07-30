import { redirect } from 'next/navigation';
import { getCurrentProject } from '@/lib/project';
import { AppSidebar } from '@/components/dashboard/app-sidebar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getCurrentProject();

  if (!ctx) {
    redirect('/onboarding');
  }

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar — unified for mobile + desktop */}
      <AppSidebar
        projectName={ctx.project.name}
        primaryColor={ctx.project.primary_color}
      />

      {/* Content area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header — shows only on small screens */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 lg:hidden">
          <div className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-[8px] text-xs font-bold text-white"
              style={{ background: ctx.project.primary_color }}
            >
              {ctx.project.name.slice(0, 1)}
            </div>
            <span className="text-sm font-bold">{ctx.project.name}</span>
          </div>
          <span className="text-[11px] text-[var(--color-text-muted)]">دكان</span>
        </header>

        {/* Main content */}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
