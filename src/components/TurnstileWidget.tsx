'use client';

import Script from 'next/script';
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

type TurnstileWidgetId = string;
type TurnstileApi = {
  render(container: HTMLElement, options: {
    sitekey: string;
    action: string;
    theme: 'auto';
    size: 'flexible';
    callback(token: string): void;
    'expired-callback'(): void;
    'error-callback'(): void;
  }): TurnstileWidgetId;
  reset(widgetId: TurnstileWidgetId): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export type TurnstileHandle = { reset(): void };

type Props = {
  siteKey: string;
  action: 'signup' | 'password-reset' | 'invitation-accept';
  onToken(token: string): void;
};

const TurnstileWidget = forwardRef<TurnstileHandle, Props>(function TurnstileWidget(
  { siteKey, action, onToken },
  forwardedRef,
) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<TurnstileWidgetId | null>(null);
  const [error, setError] = useState(false);

  const render = useCallback(() => {
    if (!container.current || widgetId.current || !window.turnstile) return;
    widgetId.current = window.turnstile.render(container.current, {
      sitekey: siteKey,
      action,
      theme: 'auto',
      size: 'flexible',
      callback: (token) => {
        setError(false);
        onToken(token);
      },
      'expired-callback': () => onToken(''),
      'error-callback': () => {
        setError(true);
        onToken('');
      },
    });
  }, [action, onToken, siteKey]);

  useImperativeHandle(forwardedRef, () => ({
    reset() {
      if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
      setError(false);
      onToken('');
    },
  }), [onToken]);

  return (
    <div className="space-y-2">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={render}
      />
      <div ref={container} className="min-h-[65px]" />
      {error && (
        <p role="alert" className="text-sm text-[var(--accent-danger)]">
          Verification could not load. Check your connection and try again.
        </p>
      )}
    </div>
  );
});

export default TurnstileWidget;
