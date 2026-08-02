import Link from 'next/link';
import AuthShell from '@/components/AuthShell';
import SignUpForm from '@/app/auth/sign-up/SignUpForm';

export default function SignUpPage() {
  return (
    <AuthShell
      eyebrow="Cloud-native identity"
      title="Create your account"
      footer={<>Already have an account? <Link href="/auth/sign-in" className="font-semibold text-[var(--bronze-light)] hover:underline">Sign in</Link></>}
    >
      <SignUpForm />
    </AuthShell>
  );
}
