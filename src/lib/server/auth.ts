import 'server-only';

import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { type AppContext, csvValues, getAppContext, requireBinding } from '@/lib/server/env';
import { scheduleTransactionalEmail } from '@/lib/server/email';

const DAY = 60 * 60 * 24;
const SESSION_IDLE_SECONDS = 7 * DAY;
const SESSION_ABSOLUTE_MS = 30 * DAY * 1000;
const PRIVILEGED_FRESH_SECONDS = 15 * 60;

export type EncounterizerAuth = ReturnType<typeof createAuth>;

export async function getAuth(): Promise<EncounterizerAuth> {
  return createAuth(await getAppContext());
}

export function createAuth(app: AppContext) {
  const env = app.env;
  const secret = requireBinding(env.BETTER_AUTH_SECRET, 'BETTER_AUTH_SECRET');
  const origin = requireBinding(env.AUTH_ORIGIN, 'AUTH_ORIGIN');
  const allowedHosts = csvValues(env.AUTH_ALLOWED_HOSTS);
  const trustedOrigins = csvValues(env.AUTH_TRUSTED_ORIGINS);
  const emailEnabled = env.AUTH_EMAIL_ENABLED === 'true';

  if (allowedHosts.length === 0 || trustedOrigins.length === 0) {
    throw new Error('Authentication host and origin allowlists are required');
  }

  const socialProviders = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
      }
    : undefined;

  return betterAuth({
    appName: 'Encounterizer',
    database: env.DB,
    secret,
    baseURL: {
      allowedHosts,
      fallback: origin,
      protocol: 'auto',
    },
    trustedOrigins,
    socialProviders,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: emailEnabled,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: false,
      resetPasswordTokenExpiresIn: 15 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: emailEnabled
        ? async ({ user, token }) => {
            const resetUrl = `${origin}/auth/reset-password?token=${encodeURIComponent(token)}`;
            scheduleTransactionalEmail(app, {
              to: user.email,
              subject: 'Reset your Encounterizer password',
              heading: 'Reset your password',
              message: 'This link expires in 15 minutes and can only be used once.',
              actionLabel: 'Reset password',
              actionUrl: resetUrl,
            });
          }
        : undefined,
    },
    emailVerification: emailEnabled
      ? {
          expiresIn: DAY,
          sendOnSignUp: true,
          sendOnSignIn: true,
          autoSignInAfterVerification: false,
          sendVerificationEmail: async ({ user, url }) => {
            scheduleTransactionalEmail(app, {
              to: user.email,
              subject: 'Verify your Encounterizer email',
              heading: 'Verify your email',
              message: 'Confirm this address to finish securing your Encounterizer account.',
              actionLabel: 'Verify email',
              actionUrl: url,
            });
          },
        }
      : undefined,
    user: {
      additionalFields: {
        deletionRequestedAt: {
          type: 'date',
          required: false,
          input: false,
          returned: false,
        },
        deletedAt: {
          type: 'date',
          required: false,
          input: false,
          returned: false,
        },
        lastExportedAt: {
          type: 'date',
          required: false,
          input: false,
          returned: false,
        },
      },
      deleteUser: {
        enabled: true,
        deleteTokenExpiresIn: 15 * 60,
        sendDeleteAccountVerification: emailEnabled
          ? async ({ user, url }) => {
              scheduleTransactionalEmail(app, {
                to: user.email,
                subject: 'Confirm Encounterizer account deletion',
                heading: 'Confirm account deletion',
                message: 'This permanently removes your identity after campaign ownership is resolved.',
                actionLabel: 'Delete my account',
                actionUrl: url,
              });
            }
          : undefined,
        beforeDelete: async (user, request) => {
          const owner = await env.DB.prepare(
            `SELECT cm.campaignId
               FROM campaignMembership cm
               JOIN campaign c ON c.id = cm.campaignId
              WHERE cm.userId = ?1
                AND cm.role = 'owner'
                AND c.deletedAt IS NULL
              LIMIT 1`,
          ).bind(user.id).first<{ campaignId: string }>();

          if (owner) {
            throw new APIError('CONFLICT', {
              message: 'Transfer or delete owned campaigns before deleting this account.',
            });
          }

          const now = Date.now();
          await env.DB.batch([
            env.DB.prepare('UPDATE user SET deletionRequestedAt = ?1, updatedAt = ?1 WHERE id = ?2')
              .bind(now, user.id),
            env.DB.prepare(
              `INSERT INTO accountLifecycleEvent
                 (id, userId, eventType, occurredAt, requestId)
               VALUES (?1, ?2, 'deletion_requested', ?3, ?4)`,
            ).bind(
              crypto.randomUUID(),
              user.id,
              now,
              request?.headers.get('x-request-id') ?? crypto.randomUUID(),
            ),
          ]);
        },
        afterDelete: async (user, request) => {
          await env.DB.prepare(
            `INSERT INTO accountLifecycleEvent
               (id, userId, eventType, occurredAt, requestId)
             VALUES (?1, ?2, 'deleted', ?3, ?4)`,
          ).bind(
            crypto.randomUUID(),
            user.id,
            Date.now(),
            request?.headers.get('x-request-id') ?? crypto.randomUUID(),
          ).run();
        },
      },
    },
    session: {
      expiresIn: SESSION_IDLE_SECONDS,
      updateAge: DAY,
      freshAge: PRIVILEGED_FRESH_SECONDS,
      cookieCache: { enabled: false },
      additionalFields: {
        absoluteExpiresAt: {
          type: 'date',
          required: true,
          input: false,
          returned: true,
          defaultValue: () => new Date(Date.now() + SESSION_ABSOLUTE_MS),
        },
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => ({
            data: {
              ...session,
              absoluteExpiresAt: new Date(Date.now() + SESSION_ABSOLUTE_MS),
            },
          }),
        },
        update: {
          before: async (session, context) => {
            const absolute = context?.context.session?.session
              ? (context.context.session.session as Record<string, unknown>).absoluteExpiresAt
              : undefined;
            const absoluteDate = absolute instanceof Date ? absolute : new Date(String(absolute ?? ''));
            if (!session.expiresAt || Number.isNaN(absoluteDate.getTime())) return { data: session };
            return {
              data: {
                ...session,
                expiresAt: new Date(Math.min(session.expiresAt.getTime(), absoluteDate.getTime())),
              },
            };
          },
        },
      },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60, max: 3 },
        '/request-password-reset': { window: 300, max: 3 },
        '/reset-password': { window: 300, max: 5 },
      },
    },
    account: {
      accountLinking: {
        enabled: false,
      },
    },
    advanced: {
      cookiePrefix: 'encounterizer',
      useSecureCookies: env.APP_ENV !== 'local',
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip'],
        disableIpTracking: false,
      },
    },
    logger: {
      level: 'error',
      log: (level) => {
        console.error({ event: 'auth.error', level });
      },
    },
  });
}
