'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          fontFamily: "'IBM Plex Sans Arabic', sans-serif",
          display: 'flex',
          minHeight: '100dvh',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F5F1E6',
          color: '#17140F',
          padding: 16,
          textAlign: 'center',
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            حدث خطأ غير متوقع
          </h1>
          <p style={{ color: '#475569', fontSize: 14, marginBottom: 16 }}>
            حاول إعادة تحميل الصفحة.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: '#C97A0F',
              color: '#fff',
              border: 0,
              borderRadius: 8,
              padding: '10px 16px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  );
}
