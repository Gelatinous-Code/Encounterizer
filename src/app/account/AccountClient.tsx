'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { apiError } from '@/lib/api-client';
import { authClient } from '@/lib/auth-client';

type ProblemError = Error & { problem?: { campaigns?: Array<{ id: string; name: string }> } };

export default function AccountClient() {
  const { data: session, isPending } = authClient.useSession();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [blockingCampaigns, setBlockingCampaigns] = useState<Array<{ id: string; name: string }>>([]);

  async function exportAccount() {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/v1/account/export', { method: 'POST' });
      if (!response.ok) throw await apiError(response, 'Account data could not be exported.');
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') ?? '';
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'encounterizer-account.json';
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage('Account export downloaded.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Account data could not be exported.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get('confirmation') !== 'DELETE') {
      setError('Type DELETE to confirm.');
      return;
    }
    setBusy(true);
    setMessage('');
    setError('');
    setBlockingCampaigns([]);
    try {
      const response = await fetch('/api/v1/account', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: String(form.get('password') ?? '') || undefined }),
      });
      if (!response.ok) throw await apiError(response, 'The account could not be deleted.');
      setMessage('Deletion confirmed. You will be signed out when the account is removed.');
      window.setTimeout(() => window.location.assign('/'), 1200);
    } catch (caught) {
      const typed = caught as ProblemError;
      setBlockingCampaigns(typed.problem?.campaigns ?? []);
      setError(typed instanceof Error ? typed.message : 'The account could not be deleted.');
    } finally {
      setBusy(false);
    }
  }

  if (isPending) return <p className="text-[var(--text-3)]">Loading account…</p>;
  if (!session) {
    return <section className="empty-state"><h1 className="text-3xl">Sign in to manage your account</h1><Link href="/auth/sign-in?returnTo=%2Faccount" className="btn-primary mt-5">Sign in</Link></section>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="micro-label">Cloud account</p>
        <h1 className="mt-2 text-4xl">Account controls</h1>
        <p className="mt-3 text-[var(--text-2)]">Signed in as {session.user.email}</p>
      </header>
      {message && <p role="status" className="rounded-lg bg-[var(--status-success-wash)] p-3 text-sm text-[var(--status-success)]">{message}</p>}
      {error && <p role="alert" className="rounded-lg bg-[var(--status-danger-wash)] p-3 text-sm text-[var(--accent-danger)]">{error}</p>}

      <section className="rounded-2xl border border-[var(--steel-700)] bg-[var(--surface-panel)] p-5 sm:p-7">
        <h2 className="text-2xl">Your data</h2>
        <p className="mt-2 text-sm text-[var(--text-2)]">Download your profile and active campaign memberships as JSON. A recently authenticated session is required.</p>
        <button type="button" onClick={() => void exportAccount()} disabled={busy} className="btn-primary mt-4">Download account data</button>
      </section>

      <section className="rounded-2xl border border-[var(--accent-danger)]/50 bg-[var(--surface-panel)] p-5 sm:p-7">
        <h2 className="text-2xl">Delete account</h2>
        <p className="mt-2 text-sm text-[var(--text-2)]">You must transfer or delete every campaign you own first. Deletion revokes sessions and removes your identity data.</p>
        {blockingCampaigns.length > 0 && (
          <div className="mt-4 rounded-lg border border-[var(--status-warning)]/50 bg-[var(--status-warning-wash)] p-4 text-sm">
            <p className="font-semibold">Resolve ownership first:</p>
            <ul className="mt-2 list-disc pl-5">{blockingCampaigns.map((campaign) => <li key={campaign.id}>{campaign.name}</li>)}</ul>
            <Link href="/campaigns" className="mt-3 inline-block text-[var(--bronze-light)] underline">Open campaigns</Link>
          </div>
        )}
        <form onSubmit={deleteAccount} className="mt-5 space-y-4">
          <div><label htmlFor="delete-password" className="mb-2 block text-sm font-semibold">Password <span className="font-normal text-[var(--text-3)]">(if your account has one)</span></label><input id="delete-password" name="password" type="password" autoComplete="current-password" maxLength={128} className="input-field w-full" /></div>
          <div><label htmlFor="delete-confirmation" className="mb-2 block text-sm font-semibold">Type DELETE</label><input id="delete-confirmation" name="confirmation" required pattern="DELETE" autoComplete="off" className="input-field w-full" /></div>
          <button type="submit" disabled={busy} className="btn-secondary text-[var(--accent-danger)]">Delete my account</button>
        </form>
      </section>

      <div className="flex flex-wrap gap-4 text-sm"><Link href="/campaigns" className="text-[var(--bronze-light)] hover:underline">Back to campaigns</Link><button type="button" onClick={() => void authClient.signOut({ fetchOptions: { onSuccess: () => window.location.assign('/') } })} className="text-[var(--text-2)] hover:underline">Sign out</button></div>
    </div>
  );
}
