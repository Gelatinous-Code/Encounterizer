'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';

export default function ResetPasswordForm({ token, invalid }: { token: string; invalid: boolean }) {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(invalid ? 'This reset link is invalid or expired.' : '');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get('password') ?? '');
    const confirmation = String(form.get('confirmation') ?? '');
    if (newPassword !== confirmation) {
      setError('The passwords do not match.');
      setPending(false);
      return;
    }
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ newPassword, token }),
      });
      if (!response.ok) throw new Error('This reset link is invalid or expired.');
      setDone(true);
      event.currentTarget.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Password reset failed.');
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-5">
        <p role="status" className="rounded-lg bg-[var(--status-success-wash)] p-4 text-[var(--status-success)]">Password changed and existing sessions were revoked.</p>
        <Link href="/auth/sign-in" className="btn-primary w-full">Sign in</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label htmlFor="password" className="mb-2 block text-sm font-semibold">New password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={invalid} className="input-field w-full" />
      </div>
      <div>
        <label htmlFor="confirmation" className="mb-2 block text-sm font-semibold">Confirm password</label>
        <input id="confirmation" name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={invalid} className="input-field w-full" />
      </div>
      {error && <p role="alert" className="rounded-lg bg-[var(--status-danger-wash)] p-3 text-sm text-[var(--accent-danger)]">{error}</p>}
      <button type="submit" disabled={pending || invalid} className="btn-primary w-full">{pending ? 'Changing password…' : 'Change password'}</button>
    </form>
  );
}
