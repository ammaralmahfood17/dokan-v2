import { getCurrentProject } from '@/lib/project';
import { redirect } from 'next/navigation';

export default async function NotificationsPage() {
  const ctx = await getCurrentProject();
  if (!ctx) redirect('/onboarding');

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-kicker"><span>التواصل</span></div>
          <h1>الإشعارات</h1>
          <p>إشعارات SMS و email</p>
        </div>
      </div>
      <div className="card card-body">
        <p className="text-sm text-[var(--color-text-secondary)]">
          هذه الوحدة قيد التطوير. ستتمكن قريباً من إعداد إشعارات SMS و email.
        </p>
      </div>
    </div>
  );
}
