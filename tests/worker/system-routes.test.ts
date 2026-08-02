import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const app = (env as unknown as { APP: Fetcher }).APP;

async function request(path: string, init?: RequestInit): Promise<Response> {
  return app.fetch(new Request(`https://encounterizer.test${path}`, init));
}

describe('OpenNext application in workerd', () => {
  it('serves liveness with correlation and security headers', async () => {
    const response = await request('/api/v1/system/health', {
      headers: { 'x-request-id': 'cf1-health-check' },
    });
    const body = await response.json<{
      status: string;
      environment: string;
      requestId: string;
    }>();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: 'ok',
      environment: 'local',
      requestId: 'cf1-health-check',
    });
    expect(response.headers.get('x-request-id')).toBe('cf1-health-check');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });

  it('reports the local Cloudflare runtime as ready', async () => {
    const response = await request('/api/v1/system/readiness');
    const body = await response.json<{
      status: string;
      environment: string;
      checks: Record<string, { status: string }>;
    }>();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ready');
    expect(body.environment).toBe('local');
    expect(Object.values(body.checks).every((check) => check.status === 'pass')).toBe(true);
  });

  it('renders the dynamic server status path', async () => {
    const response = await request('/status');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('Cloudflare Worker runtime');
    expect(html).toContain('System status');
    expect(html).toContain('local');
  });
});
