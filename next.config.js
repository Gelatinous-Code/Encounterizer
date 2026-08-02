/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transitional Azure build. CF-1 in the cloud-native roadmap replaces this
  // with the OpenNext Workers runtime and server-capable configuration.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  // Pin the workspace root to THIS checkout. Without it, Turbopack sees the
  // primary repo's lockfile from inside .claude/worktrees/* checkouts and
  // resolves the client bundle from the wrong tree (SSR right, page wrong).
  turbopack: { root: __dirname },
};

module.exports = nextConfig;
