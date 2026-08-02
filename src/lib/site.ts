// ─── Site Constants ──────────────────────────────────────────────
// One source of truth for the site URL, route list, and per-route copy.
// The nav, homepage directory, sitemap, and per-page metadata all read from
// here so they can never drift apart.

export const SITE_NAME = 'Encounterizer';

export const SITE_DESCRIPTION =
  'Free, private tools for D&D 5.5e DMs: build encounters, generate maps and challenges, '
  + 'run combat, and search SRD rules, classes, monsters, spells, equipment, and character options.';

/** Set SITE_URL to the canonical origin for the active deployment environment.
 *  `||` (not `??`) on purpose: when the repo variable is unset, GitHub
 *  Actions passes an EMPTY string, which must also fall back — new URL('')
 *  throws and kills the build. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://encounterizer.azurestaticapps.net';

/** Lucide icon names for the tool routes — rendered by RouteIcon. */
export type RouteIconName =
  | 'swords'
  | 'skull'
  | 'map'
  | 'puzzle'
  | 'users'
  | 'screen'
  | 'battle'
  | 'book';

export interface RouteInfo {
  path: string;
  navLabel: string;
  title: string;
  description: string;
  navDescription: string;
  icon: RouteIconName;
}

export type ToolSectionId = 'prep' | 'run' | 'reference';

export interface ToolSection {
  id: ToolSectionId;
  label: string;
  description: string;
  routes: RouteInfo[];
}

/**
 * The primary information architecture for the toolkit. Keep tools grouped by
 * the moment a DM needs them instead of adding more items to one flat menu.
 */
export const TOOL_SECTIONS: ToolSection[] = [
  {
    id: 'prep',
    label: 'Make',
    description: 'Parties, encounters, maps, and challenges.',
    routes: [
      {
        path: '/party',
        navLabel: 'Party',
        title: 'Party Manager',
        description: 'Keep your adventuring party ready once, then bring it into your planning workflow.',
        navDescription: 'Create and keep reusable adventuring parties.',
        icon: 'users',
      },
      {
        path: '/encounters',
        navLabel: 'Encounters',
        title: 'Encounter Builder',
        description: 'Set the party, shape the fight, and build a balanced encounter.',
        navDescription: 'Balance a fight and test the odds.',
        icon: 'swords',
      },
      {
        path: '/maps',
        navLabel: 'Maps',
        title: 'Battle Map Generator',
        description: 'Generate a dungeon, cave, or outdoor battlefield.',
        navDescription: 'Generate a dungeon, cave, or battlefield.',
        icon: 'map',
      },
      {
        path: '/noncombat',
        navLabel: 'Puzzles',
        title: 'Puzzles & Challenges',
        description: 'Build a puzzle, trap, chase, journey, or social scene.',
        navDescription: 'Build puzzles, traps, chases, and scenes.',
        icon: 'puzzle',
      },
    ],
  },
  {
    id: 'run',
    label: 'Run',
    description: 'Your DM screen and live battle tools.',
    routes: [
      {
        path: '/dm-screen',
        navLabel: 'Screen',
        title: 'DM Screen',
        description: 'Keep notes, rules, monsters, spells, and trackers together.',
        navDescription: 'Keep your session tools together.',
        icon: 'screen',
      },
      {
        path: '/battle',
        navLabel: 'Battle',
        title: 'Battle Organizer',
        description: 'Track initiative, HP, conditions, reactions, and rounds.',
        navDescription: 'Track initiative, HP, and conditions.',
        icon: 'battle',
      },
    ],
  },
  {
    id: 'reference',
    label: 'Find',
    description: 'One reference library, plus the bestiary.',
    routes: [
      {
        path: '/reference',
        navLabel: 'Reference',
        title: 'Reference Library',
        description: 'Search SRD rules, classes, spells, equipment, magic items, and character options in one place.',
        navDescription: 'Search rules, classes, gear, spells, and more.',
        icon: 'book',
      },
      {
        path: '/monsters',
        navLabel: 'Monsters',
        title: 'Monster Bestiary',
        description: 'Search SRD monsters by CR, type, movement, defenses, and more.',
        navDescription: 'Search SRD stat blocks.',
        icon: 'skull',
      },
    ],
  },
];

/** Flat compatibility view for metadata, cards, and consumers that do not need sections. */
export const TOOL_ROUTES: RouteInfo[] = TOOL_SECTIONS.flatMap((section) => section.routes);

/** Frequent destinations remain one click from every desktop page. */
export const NAV_SHORTCUT_PATHS = [
  '/encounters',
  '/dm-screen',
  '/battle',
  '/reference',
] as const;

export const NAV_SHORTCUT_ROUTES: RouteInfo[] = NAV_SHORTCUT_PATHS.map((path) => {
  const route = TOOL_ROUTES.find((candidate) => candidate.path === path);
  if (!route) throw new Error(`Navigation shortcut is missing route metadata: ${path}`);
  return route;
});

/** Tools that make sense as links from inside a DM Screen. The screen itself
 * is intentionally excluded: embedding a link back to the current surface is
 * circular and appears broken when selected. */
export const DM_SCREEN_TOOL_ROUTES: RouteInfo[] = TOOL_ROUTES.filter(
  (route) => route.path !== '/dm-screen',
);

/** Adding a route to Make should not silently change the DM Screen's starter tool. */
export const DM_SCREEN_DEFAULT_TOOL_PATH = '/encounters' as const;

/** Every indexable route — drives sitemap.xml. */
export const ALL_ROUTE_PATHS: string[] = [
  '/',
  ...TOOL_ROUTES.map((r) => r.path),
  '/credits',
];
