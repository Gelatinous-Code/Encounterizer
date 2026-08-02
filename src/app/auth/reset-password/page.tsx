import AuthShell from '@/components/AuthShell';
import ResetPasswordForm from '@/app/auth/reset-password/ResetPasswordForm';

export const dynamic = 'force-dynamic';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const params = await searchParams;
  const token = params.token ?? '';
  return (
    <AuthShell eyebrow="Account recovery" title="Choose a new password">
      <ResetPasswordForm token={token} invalid={!token || Boolean(params.error)} />
    </AuthShell>
  );
}
