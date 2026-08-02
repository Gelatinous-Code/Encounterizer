import type { Metadata } from 'next';
import Link from 'next/link';
import { Swords } from 'lucide-react';
import { Spectral, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import NavBar from '@/components/NavBar';
import RouteIcon from '@/components/RouteIcon';
import { SITE_DESCRIPTION, SITE_URL, TOOL_SECTIONS } from '@/lib/site';
import { APP_RELEASE_URL, APP_VERSION_TAG } from '@/lib/version';

// Self-hosted at build time by next/font — zero runtime requests.
const spectral = Spectral({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
  display: 'swap',
});

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Encounterizer — D&D 5.5e Encounter Toolkit',
    template: '%s · Encounterizer',
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: 'Encounterizer',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const themeScript = `(() => {
    try {
      const raw = localStorage.getItem('encounterizer:v1:theme');
      const stored = raw ? JSON.parse(raw) : null;
      const theme = stored === 'light' || stored === 'dark'
        ? stored
        : (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    } catch {
      const theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    }
  })();`;

  return (
    <html lang="en" className={`${spectral.variable} ${plexSans.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-screen flex-col">
        <a
          href="#main-content"
          data-app-shell="skip-link"
          className="skip-link print:hidden"
        >
          Skip to main content
        </a>

        <NavBar />

        {/* Main Content */}
        <main
          id="main-content"
          data-app-shell="main"
          tabIndex={-1}
          className="relative mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-8"
        >
          {children}
        </main>

        {/* Footer */}
        <footer data-app-shell="footer" className="relative mt-10 overflow-hidden border-t border-[var(--steel-800)] bg-[var(--steel-900)] print:hidden">
          <div
            className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[36rem] -translate-x-1/2 rounded-full bg-[var(--bronze)] opacity-[0.06] blur-3xl"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--bronze)] to-transparent opacity-60"
            aria-hidden="true"
          />

          <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)] lg:items-start">
              <div className="max-w-xl">
                <div className="mb-4 flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--steel-800)] bg-[var(--steel-950)]">
                    <Swords size={21} className="text-[var(--bronze)]" aria-hidden="true" />
                  </span>
                  <div>
                    <div className="text-xl font-display">Encounterizer</div>
                    <div className="micro-label mt-1">Tools for game night</div>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-[var(--text-2)]">
                  Plan the session, run the table, and find answers fast. Campaign access is
                  protected at the Cloudflare edge.
                </p>
              </div>

              <nav aria-label="Footer tools" className="grid gap-5 sm:grid-cols-3">
                {TOOL_SECTIONS.map((section) => (
                  <section key={section.id} aria-labelledby={`footer-${section.id}`}>
                    <h2 id={`footer-${section.id}`} className="micro-label px-2">
                      {section.label}
                    </h2>
                    <ul className="mt-2 space-y-1">
                      {section.routes.map((route) => (
                        <li key={route.path}>
                          <Link
                            href={route.path}
                            className="group inline-flex min-h-11 w-full items-center gap-2 rounded-lg border border-transparent px-2 py-2 text-sm text-[var(--text-2)] transition-colors hover:border-[var(--steel-800)] hover:bg-[var(--steel-900)] hover:text-[var(--text-1)]"
                          >
                            <RouteIcon
                              name={route.icon}
                              size={17}
                              className="text-[var(--text-3)] transition-colors group-hover:text-[var(--bronze)]"
                            />
                            {route.navLabel}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </nav>
            </div>

            <div className="mt-6 flex flex-col gap-3 border-t border-[var(--steel-800)] pt-5 text-xs leading-relaxed text-[var(--text-3)] md:flex-row md:items-start md:justify-between">
              {/* Full SRD 5.2.1 / CC-BY-4.0 attribution lives on /credits; a
                  footer link satisfies the license (CC-BY-4.0 §3(a)(2)). */}
              <p className="max-w-4xl">Unofficial Fan Content</p>
              <div className="flex flex-wrap items-center gap-x-3">
                <a
                  href={APP_RELEASE_URL}
                  className="inline-flex min-h-11 items-center rounded-lg px-2 font-medium text-[var(--text-2)] underline decoration-[var(--steel-700)] underline-offset-4 transition-colors hover:text-[var(--bronze)]"
                  aria-label={`Encounterizer release ${APP_VERSION_TAG}`}
                >
                  {APP_VERSION_TAG}
                </a>
                <Link
                  href="/credits"
                  className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 font-medium text-[var(--text-2)] underline decoration-[var(--steel-700)] underline-offset-4 transition-colors hover:text-[var(--bronze)]"
                >
                  Credits and licensing
                </Link>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
