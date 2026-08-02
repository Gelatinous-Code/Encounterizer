import 'server-only';

import { type AppContext } from '@/lib/server/env';

type TransactionalEmail = {
  to: string;
  subject: string;
  heading: string;
  message: string;
  actionLabel: string;
  actionUrl: string;
};

export function scheduleTransactionalEmail(
  context: AppContext,
  email: TransactionalEmail,
): void {
  if (context.env.AUTH_EMAIL_ENABLED !== 'true') return;

  const send = context.env.EMAIL.send({
    to: email.to,
    from: { email: 'noreply@encounterizer.com', name: 'Encounterizer' },
    subject: email.subject,
    text: `${email.heading}\n\n${email.message}\n\n${email.actionLabel}: ${email.actionUrl}`,
    html: renderEmail(email),
  });

  context.ctx.waitUntil(send.catch(() => {
    // Provider errors can echo recipient data; keep operational logs metadata-only.
    console.error({ event: 'email.delivery_failed' });
  }));
}

function renderEmail(email: TransactionalEmail): string {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#101116;color:#f6f3ee;font-family:Arial,sans-serif">
    <main style="max-width:560px;margin:0 auto;padding:40px 24px">
      <p style="color:#e8a15e;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Encounterizer</p>
      <h1 style="font-size:28px">${escapeHtml(email.heading)}</h1>
      <p style="color:#cbc8c2;line-height:1.6">${escapeHtml(email.message)}</p>
      <p style="margin:28px 0">
        <a href="${escapeAttribute(email.actionUrl)}" style="display:inline-block;border-radius:8px;background:#e8a15e;color:#211206;padding:12px 18px;font-weight:700;text-decoration:none">${escapeHtml(email.actionLabel)}</a>
      </p>
      <p style="color:#9699a4;font-size:13px;line-height:1.5">If you did not request this, you can ignore this email.</p>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
