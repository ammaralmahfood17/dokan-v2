import { getCurrentProject } from '@/lib/project';
import { redirect } from 'next/navigation';

export default async function LoyaltyPage() {
  const ctx = await getCurrentProject();
  if (!ctx) redirect('/onboarding');

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-kicker"><span>الولاء</span></div>
          <h1>برنامج الولاء</h1>
          <p>نقاط ومكافآت للزبائن</p>
        </div>
      </div>
      <div className="card card-body">
        <p className="text-sm text-[var(--color-text-secondary)]">
          هذه الوحدة قيد التطوير. ستتمكن قريباً من إدارة برنامج الولاء والنقاط للزبائن.
        </p>
      </div>
    </div>
  );
}
