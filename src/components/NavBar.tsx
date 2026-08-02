'use client';

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, Menu, Moon, Sun, Swords, X } from 'lucide-react';
import {
  NAV_SHORTCUT_ROUTES,
  TOOL_SECTIONS,
  type RouteInfo,
} from '@/lib/site';
import RouteIcon from '@/components/RouteIcon';
import AuthNav from '@/components/AuthNav';
import { getTheme, setTheme, subscribeTheme } from '@/lib/theme';

interface NavigationState {
  pathname: string;
  mobileOpen: boolean;
  toolsOpen: boolean;
}

function routeElementId(path: string) {
  return path.replace(/^\//, '').replaceAll('/', '-');
}

function ToolLink({
  route,
  active,
  onNavigate,
}: {
  route: RouteInfo;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={route.path}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={`group inline-flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-[var(--steel-800)] text-[var(--text-1)]'
          : 'text-[var(--text-2)] hover:bg-[var(--steel-800)] hover:text-[var(--text-1)]'
      }`}
    >
      <RouteIcon
        name={route.icon}
        size={18}
        className={active
          ? 'shrink-0 text-[var(--bronze)]'
          : 'shrink-0 text-[var(--text-3)] transition-colors group-hover:text-[var(--bronze)]'}
      />
      <span className="min-w-0 leading-tight">{route.navLabel}</span>
      {active && (
        <span
          className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--bronze)]"
          aria-hidden="true"
        />
      )}
    </Link>
  );
}

function ShortcutLink({
  route,
  active,
  onNavigate,
}: {
  route: RouteInfo;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      id={`desktop-nav-shortcut-${routeElementId(route.path)}`}
      href={route.path}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={`group relative inline-flex min-h-11 items-center rounded-md px-2.5 text-sm font-semibold transition-colors ${
        active
          ? 'text-[var(--text-1)]'
          : 'text-[var(--text-2)] hover:bg-[var(--steel-800)] hover:text-[var(--text-1)]'
      }`}
    >
      {route.navLabel}
      <span
        className={`absolute inset-x-2.5 bottom-0 h-0.5 rounded-full transition-colors ${
          active ? 'bg-[var(--bronze)]' : 'bg-transparent group-hover:bg-[var(--steel-700)]'
        }`}
        aria-hidden="true"
      />
    </Link>
  );
}

function ToolGroups({
  pathname,
  onNavigate,
  mobile = false,
}: {
  pathname: string;
  onNavigate: () => void;
  mobile?: boolean;
}) {
  const isActive = (path: string) =>
    pathname === path || pathname.startsWith(`${path}/`);

  return (
    <div className={mobile ? 'space-y-4' : 'grid grid-cols-3 gap-3'}>
      {TOOL_SECTIONS.map((section) => (
        <section key={section.id} aria-labelledby={`${mobile ? 'mobile' : 'desktop'}-tools-${section.id}`}>
          <h2
            id={`${mobile ? 'mobile' : 'desktop'}-tools-${section.id}`}
            className="px-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--bronze-light)]"
          >
            {section.label}
          </h2>
          <ul className={mobile ? 'mt-1 grid grid-cols-2 gap-1' : 'mt-1 grid gap-1'}>
            {section.routes.map((route) => (
              <li key={route.path} className="min-w-0">
                <ToolLink
                  route={route}
                  active={isActive(route.path)}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default function NavBar() {
  const pathname = usePathname();

  // The player screen is a handout, not a tool page — no site chrome.
  // trailingSlash: true means usePathname() reports the slashed form.
  if (pathname === '/noncombat/player' || pathname.startsWith('/noncombat/player/')) return null;

  // Remounting the interactive shell on navigation permanently clears transient
  // disclosure state, including when browser history later returns to a route.
  return <NavigationBar key={pathname} pathname={pathname} />;
}

function NavigationBar({ pathname }: { pathname: string }) {
  const [navigation, setNavigation] = useState<NavigationState>({
    pathname,
    mobileOpen: false,
    toolsOpen: false,
  });
  const desktopDisclosureRef = useRef<HTMLDivElement>(null);
  const toolsButtonRef = useRef<HTMLButtonElement>(null);
  const homeLinkRef = useRef<HTMLAnchorElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => 'dark');

  // Tying open state to the route makes browser back/forward and client-side
  // navigation close transient UI immediately, without moving keyboard focus.
  const stateIsCurrent = navigation.pathname === pathname;
  const menuOpen = stateIsCurrent && navigation.mobileOpen;
  const toolsOpen = stateIsCurrent && navigation.toolsOpen;

  const closeNavigation = () => {
    setNavigation({ pathname, mobileOpen: false, toolsOpen: false });
  };

  const isActive = (path: string) =>
    pathname === path || pathname.startsWith(`${path}/`);
  const activeRoute = TOOL_SECTIONS
    .flatMap((section) => section.routes)
    .find((route) => isActive(route.path));
  const activeShortcut = NAV_SHORTCUT_ROUTES.find((route) => isActive(route.path));
  const secondaryActiveRoute = activeRoute && !activeShortcut ? activeRoute : undefined;

  const toggleTools = () => {
    setNavigation((current) => ({
      pathname,
      mobileOpen: false,
      toolsOpen: current.pathname === pathname ? !current.toolsOpen : true,
    }));
  };

  const focusFirstToolLink = () => {
    window.requestAnimationFrame(() => {
      document
        .getElementById('desktop-tools-panel')
        ?.querySelector<HTMLAnchorElement>('a')
        ?.focus();
    });
  };

  const handleToolsKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault();
    setNavigation({ pathname, mobileOpen: false, toolsOpen: true });
    focusFirstToolLink();
  };

  // Escape is the one dismissal that restores focus. Pointer, focus, route,
  // and breakpoint dismissals intentionally leave focus where the user put it.
  useEffect(() => {
    if (!menuOpen && !toolsOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();

      const owner = menuOpen ? menuButtonRef.current : toolsButtonRef.current;
      setNavigation({ pathname, mobileOpen: false, toolsOpen: false });
      window.requestAnimationFrame(() => owner?.focus());
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      if (toolsOpen && !desktopDisclosureRef.current?.contains(target)) {
        setNavigation((current) => ({ ...current, toolsOpen: false }));
      }

      const withinMobileNavigation =
        mobileMenuRef.current?.contains(target)
        || menuButtonRef.current?.contains(target);
      if (menuOpen && !withinMobileNavigation) {
        setNavigation((current) => ({ ...current, mobileOpen: false }));
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      if (toolsOpen && !desktopDisclosureRef.current?.contains(target)) {
        setNavigation((current) => ({ ...current, toolsOpen: false }));
      }

      const withinMobileNavigation =
        mobileMenuRef.current?.contains(target)
        || menuButtonRef.current?.contains(target);
      if (menuOpen && !withinMobileNavigation) {
        setNavigation((current) => ({ ...current, mobileOpen: false }));
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, [menuOpen, pathname, toolsOpen]);

  // A control from one navigation mode should never remain open after the
  // viewport crosses the desktop breakpoint.
  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 1024px)');
    const handleBreakpointChange = (event: MediaQueryListEvent) => {
      const activeElement = document.activeElement;
      const focusIsLeavingWithMode = event.matches
        ? Boolean(
            activeElement
            && (mobileMenuRef.current?.contains(activeElement)
              || menuButtonRef.current?.contains(activeElement)),
          )
        : Boolean(activeElement && desktopDisclosureRef.current?.contains(activeElement));

      setNavigation((current) => ({
        ...current,
        mobileOpen: false,
        toolsOpen: false,
      }));

      if (focusIsLeavingWithMode) {
        window.requestAnimationFrame(() => {
          if (!event.matches) {
            menuButtonRef.current?.focus();
            return;
          }

          if (activeShortcut) {
            document
              .getElementById(`desktop-nav-shortcut-${routeElementId(activeShortcut.path)}`)
              ?.focus();
            return;
          }

          if (activeRoute) {
            toolsButtonRef.current?.focus();
            return;
          }

          homeLinkRef.current?.focus();
        });
      }
    };

    desktopQuery.addEventListener('change', handleBreakpointChange);
    return () => desktopQuery.removeEventListener('change', handleBreakpointChange);
  }, [activeRoute, activeShortcut]);

  return (
    <header
      data-app-shell="navigation"
      className="sticky top-0 z-50 border-b border-[var(--steel-800)] bg-[var(--steel-900)] shadow-[0_8px_24px_rgba(0,0,0,0.14)] backdrop-blur-xl print:hidden"
      style={{ backgroundColor: 'color-mix(in srgb, var(--steel-900) 92%, transparent)' }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[var(--bronze)] to-transparent opacity-25"
        aria-hidden="true"
      />
      <nav aria-label="Main" className="relative mx-auto max-w-7xl px-4 py-2 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <Link
            ref={homeLinkRef}
            href="/"
            aria-current={pathname === '/' ? 'page' : undefined}
            onClick={closeNavigation}
            className="group inline-flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg"
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--steel-700)] bg-[var(--steel-950)] shadow-sm transition-colors group-hover:border-[var(--bronze)]">
              <Swords size={20} className="text-[var(--bronze)]" aria-hidden="true" />
            </span>
            <span className="truncate text-lg font-display sm:text-xl">Encounterizer</span>
          </Link>

          <div className="flex shrink-0 items-center gap-1">
            <div ref={desktopDisclosureRef} className="hidden items-center gap-0.5 lg:flex">
              {NAV_SHORTCUT_ROUTES.map((route) => (
                <ShortcutLink
                  key={route.path}
                  route={route}
                  active={isActive(route.path)}
                  onNavigate={closeNavigation}
                />
              ))}

              <button
                ref={toolsButtonRef}
                type="button"
                aria-expanded={toolsOpen}
                aria-controls={toolsOpen ? 'desktop-tools-panel' : undefined}
                onClick={toggleTools}
                onKeyDown={handleToolsKeyDown}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-md px-2.5 text-sm font-semibold transition-colors ${
                  toolsOpen
                    ? 'bg-[var(--steel-800)] text-[var(--text-1)]'
                    : secondaryActiveRoute
                      ? 'text-[var(--text-1)]'
                      : 'text-[var(--text-2)] hover:bg-[var(--steel-800)] hover:text-[var(--text-1)]'
                }`}
              >
                All tools
                {secondaryActiveRoute && (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--bronze)]" aria-hidden="true" />
                    <span className="sr-only">
                      , contains current page: {secondaryActiveRoute.navLabel}
                    </span>
                  </>
                )}
                <ChevronDown
                  size={15}
                  className={`text-[var(--text-3)] transition-transform ${toolsOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>

              {toolsOpen && (
                <div
                  id="desktop-tools-panel"
                  role="region"
                  aria-label="All tools"
                  className="absolute right-8 top-full mt-2 w-[48rem] max-w-[calc(100vw_-_4rem)] rounded-xl border border-[var(--steel-700)] bg-[var(--steel-900)] p-3 shadow-[0_18px_45px_rgba(0,0,0,0.34)]"
                >
                  <ToolGroups pathname={pathname} onNavigate={closeNavigation} />
                </div>
              )}
            </div>

            <div className="hidden sm:block">
              <AuthNav onNavigate={closeNavigation} />
            </div>

            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[var(--text-2)] transition-colors hover:bg-[var(--steel-800)] hover:text-[var(--bronze)]"
              onClick={() => {
                closeNavigation();
                setTheme(theme === 'light' ? 'dark' : 'light');
              }}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light'
                ? <Moon size={19} aria-hidden="true" />
                : <Sun size={19} aria-hidden="true" />}
            </button>

            <button
              ref={menuButtonRef}
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[var(--text-2)] transition-colors hover:bg-[var(--steel-800)] hover:text-[var(--text-1)] lg:hidden"
              aria-expanded={menuOpen}
              aria-controls={menuOpen ? 'mobile-nav' : undefined}
              aria-label={menuOpen ? 'Close main navigation' : 'Open main navigation'}
              onClick={() => {
                setNavigation((current) => ({
                  pathname,
                  mobileOpen: current.pathname === pathname ? !current.mobileOpen : true,
                  toolsOpen: false,
                }));
              }}
            >
              {menuOpen ? <X size={23} aria-hidden="true" /> : <Menu size={23} aria-hidden="true" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div
            id="mobile-nav"
            ref={mobileMenuRef}
            className="absolute inset-x-4 top-full mt-2 max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain rounded-xl border border-[var(--steel-700)] bg-[var(--steel-900)] p-3 shadow-[0_18px_45px_rgba(0,0,0,0.34)] sm:inset-x-6 lg:hidden"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <div className="mb-3 sm:hidden">
              <AuthNav onNavigate={closeNavigation} />
            </div>
            <ToolGroups pathname={pathname} onNavigate={closeNavigation} mobile />
          </div>
        )}
      </nav>
    </header>
  );
}
