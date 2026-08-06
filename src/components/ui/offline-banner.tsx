'use client';

// D7: Offline indicator — a slim banner instead of a full-screen block so
// the customer can still see the menu and their cart while offline.
// Listens to navigator.onLine events; disappears automatically on reconnect.
import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-[var(--color-danger)] px-4 py-2 text-[12.5px] font-bold text-white shadow-lg"
    >
      <WifiOff className="h-4 w-4" />
      أنت غير متصل — الطلب غير متاح حتى يعود الاتصال
    </div>
  );
}
