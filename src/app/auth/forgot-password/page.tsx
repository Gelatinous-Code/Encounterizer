import Link from 'next/link';
import AuthShell from '@/components/AuthShell';
import ForgotPasswordForm from '@/app/auth/forgot-password/ForgotPasswordForm';

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Reset your password"
      footer={<Link href="/auth/sign-in" className="font-semibold text-[var(--bronze-light)] hover:underline">Return to sign in</Link>}
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
