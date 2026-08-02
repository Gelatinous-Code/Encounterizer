/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "connect-src 'self'",
              "font-src 'self' data:",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "img-src 'self' data: blob: https:",
              "object-src 'none'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
            ].join('; '),
          },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(), payment=(), usb=()' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
  // Pin the workspace root to THIS checkout. Without it, Turbopack sees the
  // primary repo's lockfile from inside .claude/worktrees/* checkouts and
  // resolves the client bundle from the wrong tree (SSR right, page wrong).
  turbopack: { root: __dirname },
};

module.exports = nextConfig;

// Makes Wrangler bindings available when the app is run with `next dev`.
void import('@opennextjs/cloudflare').then(({ initOpenNextCloudflareForDev }) =>
  initOpenNextCloudflareForDev({ environment: 'local' }),
);
