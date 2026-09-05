import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getCurrentProject } from '@/lib/project';
import { AppSidebar } from '@/components/dashboard/app-sidebar';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { getImpersonationById } from '@/lib/super-admin';
import { TopHeader } from '@/components/dashboard/top-header';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getCurrentProject();

  if (!ctx) {
    redirect('/onboarding');
  }

  // Phase C: impersonation banner — marker cookie set by the super-admin
  // "login as" flow. If the marker exists but the session is expired/deleted,
  // still show the banner in "expired" state so the admin can restore their
  // own session (never silently stuck impersonated).
  const cookieStore = await cookies();
  const impSessionId = cookieStore.get('dokan-impersonation')?.value ?? '';
  let impersonation: { targetEmail: string; expiresAt: string; expired: boolean } | null = null;
  if (impSessionId) {
    const active = await getImpersonationById(impSessionId);
    if (active) {
      impersonation = { targetEmail: active.targetEmail, expiresAt: active.expiresAt, expired: false };
    } else {
      impersonation = { targetEmail: '', expiresAt: '', expired: true };
    }
  }

  // Subscription warning banner (7-day grace). Runs server-side so it shows
  // for every staff member without extra data fetching. Null expiry = perpetual.
  let expiryWarn = '';
  const daysLeft = ctx.subscriptionDaysLeft;
  if (daysLeft !== null && daysLeft <= 7) {
    expiryWarn =
      daysLeft <= 0
        ? 'انتهى الاشتراك — تواصل مع إدارة دكان للتجديد.'
        : `ينتهي الاشتراك خلال ${daysLeft} ${daysLeft === 1 ? 'يوم واحد' : 'أيام'} — جدّد قبل انقطاع الخدمة.`;
  }

  return (
    <div className="dashboard-frame flex min-h-dvh bg-[var(--color-bg)]">
      {/* Phase C: persistent support-mode banner (top of every dashboard page) */}
      {impersonation && (
        <ImpersonationBanner
          sessionId={impSessionId}
          targetEmail={impersonation.targetEmail}
          expiresAt={impersonation.expiresAt}
          expired={impersonation.expired}
        />
      )}

      {/* Sidebar */}
      <AppSidebar
        projectName={ctx.project.name}
        activeModules={ctx.activeModules}
        businessType={ctx.businessType}
      />

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top header — reference design (search + notifications + profile) */}
        <TopHeader projectName={ctx.project.name} />

        {expiryWarn && (
          <div className="border-b border-[var(--color-danger)]/20 bg-[var(--color-danger-tint)] px-4 py-2.5 text-center text-xs font-semibold text-[var(--color-danger)]">
            {expiryWarn}
          </div>
        )}

        {/* Main */}
        <main className="relative flex-1 overflow-hidden">
          <div className="dashboard-glow dashboard-glow-one" aria-hidden="true" />
          <div className="dashboard-glow dashboard-glow-two" aria-hidden="true" />
          <div className="page-enter relative z-[1]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
