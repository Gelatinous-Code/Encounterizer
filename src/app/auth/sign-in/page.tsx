import Link from 'next/link';
import AuthShell from '@/components/AuthShell';
import SignInForm from '@/app/auth/sign-in/SignInForm';
import { safeReturnTo } from '@/lib/safe-return';

export const dynamic = 'force-dynamic';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const returnTo = safeReturnTo((await searchParams).returnTo);
  return (
    <AuthShell
      eyebrow="Private campaign access"
      title="Welcome back"
      footer={<>New here? <Link href={`/auth/sign-up?returnTo=${encodeURIComponent(returnTo)}`} className="font-semibold text-[var(--bronze-light)] hover:underline">Create an account</Link></>}
    >
      <SignInForm returnTo={returnTo} />
    </AuthShell>
  );
}
