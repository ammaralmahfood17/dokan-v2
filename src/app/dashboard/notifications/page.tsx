import { getCurrentProject } from '@/lib/project';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/dashboard/page-header';
import { Card } from '@/components/dashboard/primitives';
import { BellRing } from 'lucide-react';

export default async function NotificationsPage() {
  const ctx = await getCurrentProject();
  if (!ctx) redirect('/onboarding');

  return (
    <div className="page">
      <PageHeader crumb={['دكان', 'الفريق', 'الإشعارات']} title="الإشعارات" sub="إرسال رسائل وتنبيهات للعملاء" />
      <Card pad={false} className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-primary-tint)] text-[var(--color-primary)]">
          <BellRing className="h-6 w-6" />
        </span>
        <div>
          <h3 className="text-sm font-bold text-[var(--color-text)]">قريباً</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--color-text-secondary)]">
            هذه الوحدة قيد التطوير. ستتمكن قريباً من إعداد إشعارات SMS و email.
          </p>
        </div>
      </Card>
    </div>
  );
}