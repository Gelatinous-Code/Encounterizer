'use client';

import Link from 'next/link';
import { LogIn, Shield } from 'lucide-react';
import { authClient } from '@/lib/auth-client';

export default function AuthNav({ onNavigate }: { onNavigate?: () => void }) {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <span className="h-9 w-24 animate-pulse rounded-lg bg-[var(--steel-800)]" aria-label="Loading account" />;
  }

  if (!session) {
    return (
      <Link
        href="/auth/sign-in"
        onClick={onNavigate}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--steel-700)] px-3 text-sm font-semibold text-[var(--text-2)] hover:border-[var(--bronze)] hover:text-[var(--text-1)]"
      >
        <LogIn size={17} aria-hidden="true" />
        Sign in
      </Link>
    );
  }

  return (
    <Link
      href="/campaigns"
      onClick={onNavigate}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--steel-700)] px-3 text-sm font-semibold text-[var(--text-2)] hover:border-[var(--bronze)] hover:text-[var(--text-1)]"
      title={session.user.email}
    >
      <Shield size={17} className="text-[var(--bronze)]" aria-hidden="true" />
      <span className="max-w-28 truncate">{session.user.name}</span>
    </Link>
  );
}
