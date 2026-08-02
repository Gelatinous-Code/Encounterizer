'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { apiError, apiJson } from '@/lib/api-client';
import { authClient } from '@/lib/auth-client';

type Role = 'owner' | 'dm' | 'player';
type Campaign = {
  id: string;
  name: string;
  primaryOwnerUserId: string;
  role: Role;
  createdAt?: number;
  updatedAt?: number;
};
type Member = { userId: string; name: string; email: string; role: Role; createdAt: number };

export default function CampaignsClient() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [localInvitation, setLocalInvitation] = useState('');
  const selected = campaigns.find((campaign) => campaign.id === selectedId);
  const userId = session?.user.id;

  async function loadCampaigns(preferredId?: string) {
    setError('');
    const result = await apiJson<{ campaigns: Campaign[] }>('/api/v1/campaigns');
    setCampaigns(result.campaigns);
    setSelectedId((current) => {
      const candidate = preferredId || current || new URLSearchParams(window.location.search).get('campaign') || '';
      return result.campaigns.some((campaign) => campaign.id === candidate) ? candidate : (result.campaigns[0]?.id ?? '');
    });
  }

  async function loadMembers(campaignId: string) {
    if (!campaignId) {
      setMembers([]);
      return;
    }
    const result = await apiJson<{ members: Member[] }>(`/api/v1/campaigns/${encodeURIComponent(campaignId)}/members`);
    setMembers(result.members);
  }

  useEffect(() => {
    if (sessionPending) return;
    if (!userId) return;
    let active = true;
    void (async () => {
      try {
        const result = await apiJson<{ campaigns: Campaign[] }>('/api/v1/campaigns');
        if (!active) return;
        setCampaigns(result.campaigns);
        const preferred = new URLSearchParams(window.location.search).get('campaign') ?? '';
        setSelectedId(result.campaigns.some((campaign) => campaign.id === preferred) ? preferred : (result.campaigns[0]?.id ?? ''));
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Campaigns could not be loaded.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [userId, sessionPending]);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    void (async () => {
      try {
        const result = await apiJson<{ members: Member[] }>(`/api/v1/campaigns/${encodeURIComponent(selectedId)}/members`);
        if (active) setMembers(result.members);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Members could not be loaded.');
      }
    })();
    return () => { active = false; };
  }, [selectedId]);

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const result = await apiJson<{ campaign: Campaign }>('/api/v1/campaigns', {
        method: 'POST', body: JSON.stringify({ name: form.get('name') }),
      });
      event.currentTarget.reset();
      await loadCampaigns(result.campaign.id);
      setMessage('Campaign created.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Campaign could not be created.');
    } finally {
      setBusy(false);
    }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError('');
    setLocalInvitation('');
    const form = new FormData(event.currentTarget);
    try {
      const result = await apiJson<{ invitation: { acceptanceUrl?: string } }>(
        `/api/v1/campaigns/${encodeURIComponent(selected.id)}/invitations`,
        { method: 'POST', body: JSON.stringify({ email: form.get('email'), role: form.get('role') }) },
      );
      event.currentTarget.reset();
      setLocalInvitation(result.invitation.acceptanceUrl ?? '');
      setMessage('Invitation issued. A prior pending invitation for this address was revoked.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Invitation could not be issued.');
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(member: Member, role: Role) {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await apiJson(`/api/v1/campaigns/${encodeURIComponent(selected.id)}/members/${encodeURIComponent(member.userId)}`, {
        method: 'PATCH', body: JSON.stringify({ role }),
      });
      await Promise.all([loadMembers(selected.id), loadCampaigns(selected.id)]);
      setMessage(`${member.name} is now ${role}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Role could not be changed.');
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(member: Member) {
    if (!selected || !window.confirm(`Remove ${member.name} from ${selected.name}?`)) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/v1/campaigns/${encodeURIComponent(selected.id)}/members/${encodeURIComponent(member.userId)}`, { method: 'DELETE' });
      if (!response.ok) throw await apiError(response, 'Member could not be removed.');
      await Promise.all([loadMembers(selected.id), loadCampaigns(selected.id)]);
      setMessage(`${member.name} was removed.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Member could not be removed.');
    } finally {
      setBusy(false);
    }
  }

  async function transferOwnership(member: Member) {
    if (!selected || !window.confirm(`Make ${member.name} the primary owner of ${selected.name}?`)) return;
    setBusy(true);
    setError('');
    try {
      await apiJson(`/api/v1/campaigns/${encodeURIComponent(selected.id)}/ownership`, {
        method: 'POST', body: JSON.stringify({ userId: member.userId }),
      });
      await loadCampaigns(selected.id);
      setMessage(`Primary ownership transferred to ${member.name}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Ownership could not be transferred.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelected() {
    if (!selected || !window.confirm(`Delete ${selected.name}? This removes it from active campaigns.`)) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/v1/campaigns/${encodeURIComponent(selected.id)}`, { method: 'DELETE' });
      if (!response.ok) throw await apiError(response, 'Campaign could not be deleted.');
      await loadCampaigns();
      setMessage('Campaign deleted.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Campaign could not be deleted.');
    } finally {
      setBusy(false);
    }
  }

  if (sessionPending || (session && loading)) return <p className="text-[var(--text-3)]">Loading private campaigns…</p>;
  if (!session) {
    return (
      <section className="empty-state">
        <h1 className="text-3xl">Your campaigns live in the cloud now.</h1>
        <p className="mx-auto mt-3 max-w-xl">Sign in to create a private campaign, invite DMs and players, and access it from any device.</p>
        <Link href="/auth/sign-in?returnTo=%2Fcampaigns" className="btn-primary mt-5">Sign in</Link>
      </section>
    );
  }

  const canInvite = selected?.role === 'owner' || selected?.role === 'dm';
  const canManageOwners = selected?.role === 'owner';
  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="space-y-5 rounded-2xl border border-[var(--steel-700)] bg-[var(--surface-panel)] p-4">
        <div>
          <p className="micro-label">Signed in</p>
          <p className="mt-1 truncate font-semibold">{session.user.name}</p>
          <p className="truncate text-xs text-[var(--text-3)]">{session.user.email}</p>
        </div>
        <nav aria-label="Campaigns" className="space-y-2">
          {campaigns.map((campaign) => (
            <button key={campaign.id} type="button" onClick={() => setSelectedId(campaign.id)} className={`w-full rounded-lg border p-3 text-left ${selectedId === campaign.id ? 'border-[var(--bronze)] bg-[var(--steel-800)]' : 'border-[var(--steel-800)] hover:border-[var(--steel-600)]'}`}>
              <span className="block truncate font-semibold">{campaign.name}</span>
              <span className="mt-1 block text-xs capitalize text-[var(--text-3)]">{campaign.role}</span>
            </button>
          ))}
        </nav>
        <form onSubmit={createCampaign} className="space-y-2 border-t border-[var(--steel-800)] pt-4">
          <label htmlFor="campaign-name" className="block text-sm font-semibold">New campaign</label>
          <input id="campaign-name" name="name" minLength={1} maxLength={120} required placeholder="The Ashen March" className="input-field w-full" />
          <button type="submit" disabled={busy} className="btn-primary w-full text-sm">Create</button>
        </form>
        <div className="flex gap-3 border-t border-[var(--steel-800)] pt-4 text-sm">
          <Link href="/account" className="text-[var(--bronze-light)] hover:underline">Account</Link>
          <button type="button" onClick={() => void authClient.signOut({ fetchOptions: { onSuccess: () => window.location.assign('/') } })} className="text-[var(--text-2)] hover:underline">Sign out</button>
        </div>
      </aside>

      <main className="min-w-0 space-y-6">
        {message && <p role="status" className="rounded-lg bg-[var(--status-success-wash)] p-3 text-sm text-[var(--status-success)]">{message}</p>}
        {error && <p role="alert" className="rounded-lg bg-[var(--status-danger-wash)] p-3 text-sm text-[var(--accent-danger)]">{error}</p>}
        {!selected ? (
          <section className="empty-state"><h1 className="text-3xl">Create your first campaign</h1><p className="mt-3">It starts private with you as its owner.</p></section>
        ) : (
          <>
            <section className="rounded-2xl border border-[var(--steel-700)] bg-[var(--surface-panel)] p-5 sm:p-7">
              <p className="micro-label">{selected.role} access</p>
              <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                <div><h1 className="text-3xl sm:text-4xl">{selected.name}</h1><p className="mt-2 text-sm text-[var(--text-3)]">Membership is rechecked in D1 on every protected request.</p></div>
                {selected.role === 'owner' && <button type="button" disabled={busy} onClick={() => void deleteSelected()} className="btn-secondary text-sm text-[var(--accent-danger)]">Delete campaign</button>}
              </div>
            </section>

            {canInvite && (
              <section className="rounded-2xl border border-[var(--steel-700)] bg-[var(--surface-panel)] p-5">
                <h2 className="text-2xl">Invite someone</h2>
                <form onSubmit={invite} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
                  <input name="email" type="email" autoComplete="email" required placeholder="player@example.com" className="input-field w-full" aria-label="Invitee email" />
                  <select name="role" className="w-full" aria-label="Invitation role">
                    <option value="player">Player</option>
                    {selected.role === 'owner' && <option value="dm">DM</option>}
                  </select>
                  <button type="submit" disabled={busy} className="btn-primary">Send invite</button>
                </form>
                {localInvitation && <p className="mt-3 break-all text-xs text-[var(--text-3)]">Local-only acceptance URL: <a href={localInvitation} className="text-[var(--bronze-light)] underline">{localInvitation}</a></p>}
              </section>
            )}

            <section className="rounded-2xl border border-[var(--steel-700)] bg-[var(--surface-panel)] p-5">
              <h2 className="text-2xl">Members</h2>
              <ul className="mt-4 divide-y divide-[var(--steel-800)]">
                {members.map((member) => (
                  <li key={member.userId} className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div className="min-w-0"><p className="truncate font-semibold">{member.name}{member.userId === selected.primaryOwnerUserId ? ' · primary owner' : ''}</p><p className="truncate text-xs text-[var(--text-3)]">{member.email}</p></div>
                    <div className="flex flex-wrap items-center gap-2">
                      {canManageOwners ? (
                        <select value={member.role} disabled={busy} onChange={(event) => void changeRole(member, event.target.value as Role)} aria-label={`Role for ${member.name}`} className="min-h-10 text-sm">
                          <option value="owner">Owner</option><option value="dm">DM</option><option value="player">Player</option>
                        </select>
                      ) : <span className="rounded-full border border-[var(--steel-700)] px-3 py-1 text-xs capitalize">{member.role}</span>}
                      {canManageOwners && member.role === 'owner' && member.userId !== selected.primaryOwnerUserId && <button type="button" disabled={busy} onClick={() => void transferOwnership(member)} className="btn-secondary text-xs">Make primary</button>}
                      {canManageOwners && member.userId !== session.user.id && <button type="button" disabled={busy} onClick={() => void removeMember(member)} className="btn-secondary text-xs text-[var(--accent-danger)]">Remove</button>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
