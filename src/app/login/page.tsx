import type { Metadata } from 'next';
import LoginClient from './login-client';

export const metadata: Metadata = {
  title: { absolute: 'تسجيل الدخول — دكان' },
  description: 'دخول إلى لوحة تحكم دكان — منصة إدارة المطاعم والمقاهي في الخليج',
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return <LoginClient />;
}
