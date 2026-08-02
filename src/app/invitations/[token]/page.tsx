import type { Metadata } from 'next';
import AuthShell from '@/components/AuthShell';
import InvitationAccept from './InvitationAccept';

export const metadata: Metadata = { title: 'Campaign invitation — Encounterizer' };

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AuthShell eyebrow="Campaign invitation" title="Join the table">
        <InvitationAccept token={token} />
      </AuthShell>
    </main>
  );
}
