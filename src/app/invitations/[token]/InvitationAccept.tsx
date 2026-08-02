'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import TurnstileWidget, { type TurnstileHandle } from '@/components/TurnstileWidget';
import { authClient } from '@/lib/auth-client';
import { apiJson } from '@/lib/api-client';
import { useAuthConfig } from '@/app/auth/use-auth-config';

export default function InvitationAccept({ token }: { token: string }) {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const { config, failed } = useAuthConfig();
  const widget = useRef<TurnstileHandle>(null);
  const [challenge, setChallenge] = useState('');
  const [pending, setPending] = useState(false);
  const [campaignId, setCampaignId] = useState('');
  const [error, setError] = useState('');

  async function accept() {
    if (!challenge) return;
    setPending(true);
    setError('');
    try {
      const result = await apiJson<{ campaignId: string }>(
        `/api/v1/invitations/${encodeURIComponent(token)}/accept`,
        { method: 'POST', headers: { 'x-turnstile-token': challenge } },
      );
      setCampaignId(result.campaignId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The invitation could not be accepted.');
    } finally {
      widget.current?.reset();
      setChallenge('');
      setPending(false);
    }
  }

  if (sessionPending || (!failed && !config)) return <p className="text-[var(--text-3)]">Checking your invitation…</p>;
  if (!session) {
    const returnTo = `/invitations/${encodeURIComponent(token)}`;
    return (
      <div className="space-y-4">
        <p className="text-[var(--text-2)]">Sign in with the email address that received this invitation.</p>
        <Link href={`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`} className="btn-primary w-full">Sign in to continue</Link>
      </div>
    );
  }
  if (failed || !config?.turnstileSiteKey) {
    return <p className="rounded-lg bg-[var(--status-warning-wash)] p-4 text-[var(--status-warning)]">Invitation acceptance is temporarily paused while bot protection is activated.</p>;
  }
  if (campaignId) {
    return (
      <div className="space-y-4">
        <p role="status" className="rounded-lg bg-[var(--status-success-wash)] p-4 text-[var(--status-success)]">Invitation accepted. Your new campaign is ready.</p>
        <Link href={`/campaigns?campaign=${encodeURIComponent(campaignId)}`} className="btn-primary w-full">Open campaign</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-[var(--text-2)]">You are signed in as <strong className="text-[var(--text-1)]">{session.user.email}</strong>. Invitations only work for the verified address they were sent to.</p>
      <TurnstileWidget ref={widget} siteKey={config.turnstileSiteKey} action="invitation-accept" onToken={setChallenge} />
      {error && <p role="alert" className="rounded-lg bg-[var(--status-danger-wash)] p-3 text-sm text-[var(--accent-danger)]">{error}</p>}
      <button type="button" onClick={() => void accept()} disabled={pending || !challenge} className="btn-primary w-full">
        {pending ? 'Joining campaign…' : 'Accept invitation'}
      </button>
    </div>
  );
}
