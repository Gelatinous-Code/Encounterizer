import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

export default function AuthShell({
  title,
  eyebrow,
  children,
  footer,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_1.08fr] lg:items-start">
      <section className="pt-4 lg:sticky lg:top-28">
        <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--steel-700)] bg-[var(--steel-900)]">
          <ShieldCheck className="text-[var(--bronze)]" aria-hidden="true" />
        </div>
        <p className="micro-label">{eyebrow}</p>
        <h1 className="mt-3 text-4xl sm:text-5xl">{title}</h1>
        <p className="mt-5 max-w-lg text-[var(--text-2)]">
          Your campaigns are private by default. Access is checked by the Worker against fresh D1 membership on every protected request.
        </p>
        <Link href="/" className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--bronze-light)] hover:underline">
          Back to the toolkit
        </Link>
      </section>
      <section className="rounded-2xl border border-[var(--steel-700)] bg-[var(--surface-panel)] p-5 shadow-[var(--shadow-card)] sm:p-7">
        {children}
        {footer && <div className="mt-6 border-t border-[var(--steel-800)] pt-5 text-sm text-[var(--text-2)]">{footer}</div>}
      </section>
    </div>
  );
}
