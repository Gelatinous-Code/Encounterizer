'use client';

import { useRef, useState, type FormEvent } from 'react';
import TurnstileWidget, { type TurnstileHandle } from '@/components/TurnstileWidget';
import { useAuthConfig } from '@/app/auth/use-auth-config';

export default function SignUpForm() {
  const { config, failed } = useAuthConfig();
  const widget = useRef<TurnstileHandle>(null);
  const [token, setToken] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setPending(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-turnstile-token': token,
        },
        body: JSON.stringify({
          name: form.get('name'),
          email: form.get('email'),
          password: form.get('password'),
          callbackURL: '/campaigns',
        }),
      });
      if (!response.ok) throw new Error('The account could not be created. Check the fields and try again.');
      setMessage(config?.emailVerificationRequired
        ? 'Account created. Check your email to verify it, then sign in.'
        : 'Account created. You can sign in now.');
      event.currentTarget.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign up failed.');
    } finally {
      widget.current?.reset();
      setPending(false);
    }
  }

  if (failed) return <p role="alert" className="text-[var(--accent-danger)]">Account configuration is unavailable.</p>;
  if (!config) return <p className="text-[var(--text-3)]">Loading secure signup…</p>;
  if (!config.turnstileSiteKey) {
    return <p className="rounded-lg bg-[var(--status-warning-wash)] p-4 text-[var(--status-warning)]">New account creation is temporarily paused while bot protection is activated.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label htmlFor="name" className="mb-2 block text-sm font-semibold">Display name</label>
        <input id="name" name="name" autoComplete="name" required minLength={2} maxLength={80} className="input-field w-full" />
      </div>
      <div>
        <label htmlFor="email" className="mb-2 block text-sm font-semibold">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input-field w-full" />
      </div>
      <div>
        <label htmlFor="password" className="mb-2 block text-sm font-semibold">Password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} className="input-field w-full" />
        <p className="mt-2 text-xs text-[var(--text-3)]">At least 12 characters. A passphrase works well.</p>
      </div>
      <TurnstileWidget ref={widget} siteKey={config.turnstileSiteKey} action="signup" onToken={setToken} />
      {message && <p role="status" className="rounded-lg bg-[var(--status-success-wash)] p-3 text-sm text-[var(--status-success)]">{message}</p>}
      {error && <p role="alert" className="rounded-lg bg-[var(--status-danger-wash)] p-3 text-sm text-[var(--accent-danger)]">{error}</p>}
      <button type="submit" disabled={pending || !token} className="btn-primary w-full">
        {pending ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  );
}
