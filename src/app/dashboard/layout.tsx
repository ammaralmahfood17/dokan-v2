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
    <div className="flex min-h-dvh bg-[var(--color-bg)]">
      {/* Sidebar */}
      <AppSidebar
        projectName={ctx.project.name}
      />

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur-md px-4 py-3 lg:hidden print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[var(--color-primary)] text-xs font-bold text-white shadow-sm">
              {ctx.project.name.slice(0, 1)}
            </div>
            <span className="text-sm font-bold text-[var(--color-text)]">
              {ctx.project.name}
            </span>
          </div>
          <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">
            دكان
          </span>
        </header>

        {/* Main */}
        <main className="flex-1">
          <div className="page-enter">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
