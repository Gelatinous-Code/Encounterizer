'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { safeReturnTo } from '@/lib/safe-return';
import { useAuthConfig } from '@/app/auth/use-auth-config';

export default function SignInForm({ returnTo }: { returnTo: string }) {
  const { config } = useAuthConfig();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const destination = safeReturnTo(returnTo);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password'),
          rememberMe: true,
          callbackURL: destination,
        }),
      });
      if (!response.ok) throw new Error('Email or password was not accepted.');
      window.location.assign(destination);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign in failed.');
      setPending(false);
    }
  }

  async function googleSignIn() {
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/auth/sign-in/social', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'google', callbackURL: destination }),
      });
      const body = await response.json() as { url?: string };
      if (!response.ok || !body.url) throw new Error('Google sign in is unavailable.');
      window.location.assign(body.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign in failed.');
      setPending(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-semibold">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input-field w-full" />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between gap-4">
            <label htmlFor="password" className="text-sm font-semibold">Password</label>
            <Link href="/auth/forgot-password" className="text-sm text-[var(--bronze-light)] hover:underline">Forgot password?</Link>
          </div>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="input-field w-full" />
        </div>
        {error && <p role="alert" className="rounded-lg bg-[var(--status-danger-wash)] p-3 text-sm text-[var(--accent-danger)]">{error}</p>}
        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {config?.googleEnabled && (
        <>
          <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-widest text-[var(--text-3)]">
            <span className="h-px flex-1 bg-[var(--steel-700)]" /> or <span className="h-px flex-1 bg-[var(--steel-700)]" />
          </div>
          <button type="button" onClick={googleSignIn} disabled={pending} className="btn-secondary w-full">Continue with Google</button>
        </>
      )}
    </>
  );
}
