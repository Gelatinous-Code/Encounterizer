'use client';

import { useRef, useState, type FormEvent } from 'react';
import TurnstileWidget, { type TurnstileHandle } from '@/components/TurnstileWidget';
import { useAuthConfig } from '@/app/auth/use-auth-config';

export default function ForgotPasswordForm() {
  const { config, failed } = useAuthConfig();
  const widget = useRef<TurnstileHandle>(null);
  const [token, setToken] = useState('');
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setPending(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/request-password-reset', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-turnstile-token': token,
        },
        body: JSON.stringify({
          email: form.get('email'),
          redirectTo: '/auth/reset-password',
        }),
      });
      if (!response.ok) throw new Error('The reset request could not be completed.');
      setDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Reset failed.');
    } finally {
      widget.current?.reset();
      setPending(false);
    }
  }

  if (failed) return <p role="alert" className="text-[var(--accent-danger)]">Account configuration is unavailable.</p>;
  if (!config) return <p className="text-[var(--text-3)]">Loading recovery…</p>;
  if (!config.emailPasswordEnabled || !config.turnstileSiteKey) {
    return <p className="rounded-lg bg-[var(--status-warning-wash)] p-4 text-[var(--status-warning)]">Password recovery is temporarily unavailable.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <p className="text-sm text-[var(--text-2)]">Enter your account email. The response is identical whether or not that address exists.</p>
      <div>
        <label htmlFor="email" className="mb-2 block text-sm font-semibold">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input-field w-full" />
      </div>
      <TurnstileWidget ref={widget} siteKey={config.turnstileSiteKey} action="password-reset" onToken={setToken} />
      {done && <p role="status" className="rounded-lg bg-[var(--status-success-wash)] p-3 text-sm text-[var(--status-success)]">If that account exists, a reset link is on its way.</p>}
      {error && <p role="alert" className="rounded-lg bg-[var(--status-danger-wash)] p-3 text-sm text-[var(--accent-danger)]">{error}</p>}
      <button type="submit" disabled={pending || !token} className="btn-primary w-full">{pending ? 'Requesting…' : 'Send reset link'}</button>
    </form>
  );
}
