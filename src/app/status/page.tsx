import Link from 'next/link';

import { evaluateReadiness, readRuntimeIdentity } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

export default async function RuntimeStatusPage() {
  const runtime = await readRuntimeIdentity();
  const readiness = evaluateReadiness(runtime);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-3">
        <p className="micro-label">Cloudflare Worker runtime</p>
        <h1 className="text-4xl font-display">System status</h1>
        <p className="text-[var(--text-2)]">
          This page is rendered on the server for each request and reports only non-sensitive deployment metadata.
        </p>
      </header>

      <dl className="grid gap-4 sm:grid-cols-2" aria-label="Runtime metadata">
        {[
          ['Readiness', readiness.ready ? 'Ready' : 'Not ready'],
          ['Environment', runtime.environment],
          ['Worker version', runtime.versionId],
          ['Version tag', runtime.versionTag],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-[var(--steel-800)] bg-[var(--steel-900)] p-5">
            <dt className="micro-label">{label}</dt>
            <dd className="mt-2 break-all text-lg text-[var(--text-1)]">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="text-sm text-[var(--text-3)]">
        Rendered at {new Date().toISOString()}. Detailed machine checks are available from{' '}
        <Link className="text-[var(--bronze)] underline" href="/api/v1/system/readiness">
          the readiness endpoint
        </Link>
        .
      </p>
    </div>
  );
}
