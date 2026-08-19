import { getCurrentProject } from '@/lib/project';
import { redirect } from 'next/navigation';

export default async function ReservationsPage() {
  const ctx = await getCurrentProject();
  if (!ctx) redirect('/onboarding');

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-kicker"><span>العمليات</span></div>
          <h1>الحجوزات</h1>
          <p>حجوزات الطاولات والمواعيد</p>
        </div>
      </div>
      <div className="card card-body">
        <p className="text-sm text-[var(--color-text-secondary)]">
          هذه الوحدة قيد التطوير. ستتمكن قريباً من إدارة الحجوزات والمواعيد.
        </p>
      </div>
    </div>
  );
}
