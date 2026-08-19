import { getCurrentProject } from '@/lib/project';
import { redirect } from 'next/navigation';

export default async function PaymentsPage() {
  const ctx = await getCurrentProject();
  if (!ctx) redirect('/onboarding');

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-kicker"><span>المالية</span></div>
          <h1>بوابات الدفع</h1>
          <p>دفع إلكتروني متعدد</p>
        </div>
      </div>
      <div className="card card-body">
        <p className="text-sm text-[var(--color-text-secondary)]">
          هذه الوحدة قيد التطوير. ستتمكن قريباً من إعداد بوابات الدفع الإلكترونية.
        </p>
      </div>
    </div>
  );
}
