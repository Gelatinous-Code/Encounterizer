'use client';

import { useEffect, useState } from 'react';

export type AuthRuntimeConfig = {
  emailPasswordEnabled: boolean;
  emailVerificationRequired: boolean;
  googleEnabled: boolean;
  turnstileSiteKey: string | null;
};

export function useAuthConfig(): {
  config: AuthRuntimeConfig | null;
  failed: boolean;
} {
  const [config, setConfig] = useState<AuthRuntimeConfig | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/v1/auth/config', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Configuration unavailable');
        return response.json() as Promise<AuthRuntimeConfig>;
      })
      .then((value) => {
        if (active) setConfig(value);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => { active = false; };
  }, []);

  return { config, failed };
}
