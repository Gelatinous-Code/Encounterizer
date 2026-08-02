'use client';

import { createAuthClient } from 'better-auth/react';

// The client resolves the current browser origin and defaults to /api/auth.
// Keeping the origin dynamic also lets static prerendering run without a URL.
export const authClient = createAuthClient();
