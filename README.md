# Encounterizer

[![CI](https://github.com/Daren9m/Encounterizer/actions/workflows/ci.yml/badge.svg)](https://github.com/Daren9m/Encounterizer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-gold.svg)](LICENSE)

![Encounterizer — Build the encounter. Know the odds. Run the room.](public/og.png)

A free D&D 5.5e (2024 rules) toolkit for Dungeon Masters: build balanced
encounters, forecast the battle before your party rolls initiative, and run
the whole session — prep tools, live battle support, and searchable SRD rules
in one place.

> **Platform direction:** Encounterizer is moving from its current browser-only
> static build to a server-authoritative, cloud-native application on
> Cloudflare. See the
> [Cloudflare Cloud-Native Roadmap](docs/cloudflare-cloud-native-roadmap.md).

## The Tools

- **⚔️ Encounter Builder** — Set party size, level, and difficulty; get a
  balanced encounter with monsters, scenario hook, tactics, treasure, and an
  optional battle map. Uses the real **2024 DMG XP budgets**
  (Low/Moderate/High — no 2014 multipliers). Every generated encounter is
  seeded: **Copy Link** produces a URL that regenerates the exact same
  encounter for anyone. Save named encounters for later sessions.
- **🔮 Battle Forecast** — One click runs **1,000 Monte Carlo battle
  simulations** against your actual party (pick class templates and levels,
  tweak the numbers if you like). Get the win rate, expected rounds,
  round-by-round HP curve, who's most likely to drop, and an honest
  "the XP says Moderate, but this plays like Deadly" assessment. It's a
  weather forecast, not a promise — but no mainstream encounter builder
  does it.
- **🐉 Monster Bestiary** — **331 monsters from the SRD 5.2.1** (genuine
  2024 stat blocks), each with a dedicated portrait, plus deep filtering:
  CR, type, size, environment,
  movement modes, damage types dealt, resistances, immunities, conditions,
  legendary/spellcaster/lair toggles. **Import your own monsters** from
  5etools bestiary JSON or Encounterizer exports — stored locally in the
  current build and moving to private campaign-scoped cloud storage.
- **🗺️ Map Generator** — Procedural battle maps: BSP room-and-corridor
  dungeons, cellular-automata caves, and environment-specific outdoor
  terrain. Export as JSON or ASCII.
- **🧩 Puzzles & Challenges** — One seeded generator: verified logic/word/spatial puzzles, riddles, ciphers, contests, plus social encounters, journeys, traps, chases, and investigations.
- **🛡️ DM Screen** — Build a private command screen from monsters, spells,
  rules, notes, tool links, and a compact live battle tracker.
- **⚔️ Battle Organizer** — Sort initiative and track HP, conditions,
  concentration, reactions, legendary actions, rounds, and turn flow.
- **📖 Reference Library** — One searchable home for **200 SRD rule articles,
  12 classes, 12 subclasses, 339 spells, 182 equipment entries, 257 magic
  items, 17 feats, 4 backgrounds, and 9 species**. Use category-specific
  filters, open focused printable details, and bookmark anything for later.
  **Import your own spells** from 5etools
  spell JSON or Encounterizer exports — stored locally in the current build
  and moving to private campaign-scoped cloud storage.

Every prep page has a **Print** button with a dedicated print stylesheet —
clean, ink-friendly handouts straight from the browser. The current build
persists settings and workspace data in browser storage; the cloud-native
milestones replace that persistence with authenticated D1, R2, and Durable
Object services.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 App Router (static export during the platform transition) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS + CSS custom properties (Dusksteel tokens), Spectral + IBM Plex Sans via next/font, Lucide icons |
| Current data | Generated SRD 5.2.1 TypeScript data plus transitional browser persistence |
| Target platform | Cloudflare Workers/OpenNext, D1, R2, Durable Objects, Queues, and Workflows |
| Testing | Vitest (140+ tests: rules math, importer, Monte Carlo statistics) |
| CI/CD | GitHub Actions; Azure Static Web Apps during transition, then Cloudflare Workers |

## Project Structure

```
src/
  app/                       # Next.js App Router (static during the platform transition)
    page.tsx                 # Landing page (stats computed from data modules)
    encounters/              # Encounter Builder + Battle Forecast
    monsters/                # Bestiary + custom monster import
    maps/                    # Map Generator
    noncombat/               # Puzzles & Challenges
    dm-screen/               # Configurable DM command screen
    battle/                  # Live initiative and combat organizer
    reference/               # Unified rules, classes, gear, spells, items, and character reference
    compendium/, spells/     # Compatibility routes into the unified reference
    credits/                 # SRD attribution + licensing
    icon.svg, opengraph-image.png, robots.ts, sitemap.ts
  components/
    NavBar.tsx               # Responsive nav with active states
    FilterPanel.tsx          # Full-criteria monster filter UI
    MonsterStatBlock.tsx     # 5e-style stat block renderer
    MapGrid.tsx              # Grid map display with terrain legend
    PartySetupPanel.tsx      # Battle Forecast party configuration
    BattleReportCard.tsx     # Forecast results (SVG donut + HP curve)
    CustomMonsterPanel.tsx   # JSON import / manage custom monsters
    DifficultyBadge.tsx, PrintButton.tsx
  lib/
    types.ts                 # Core type system + 2024 XP budget table
    encounter-generator.ts   # Budget math, knapsack selection, hooks/tactics/treasure
    battle-sim.ts            # Seeded Monte Carlo combat engine
    monster-to-sim.ts        # Stat block → simulator stats extraction
    monster-filter.ts        # Search/filter engine
    map-generator.ts         # BSP + cellular automata + outdoor scatter
    noncombat/generate.ts    # Unified orchestrator: puzzles & challenges (one seeded gen)
    encounter-recipes.ts     # Recipe-based encounter templates (engine)
    import-5etools.ts        # 5etools JSON → Monster converter (2024 format)
    custom-monster-import.ts # Client-side JSON import with validation
    random.ts                # Shared seeded RNG (shareable-link determinism)
    storage.ts               # SSR-safe localStorage utility
  data/
    monsters-*.ts            # AUTO-GENERATED SRD 5.2.1 bestiary (7 CR bands)
    bestiary-meta.ts         # Generated count + source commit
    class-templates.ts       # Battle Forecast class builds (15 × 4 tiers)
    spells.ts                # Spell type + search/filter helpers (aggregates the bands)
    spells-l*.ts             # AUTO-GENERATED SRD 5.2.1 spells (4 level bands)
    spells-meta.ts           # Generated count + source commit
    spell-summaries.ts       # Hand-curated effect summary overrides
    reference-articles.ts    # AUTO-GENERATED SRD rules and toolbox chapters
    classes.ts               # AUTO-GENERATED SRD classes and subclasses
    equipment.ts             # AUTO-GENERATED SRD weapons, armor, gear, tools, and vehicles
    magic-items-*.ts         # AUTO-GENERATED SRD magic items (rarity bands)
    feats.ts                 # AUTO-GENERATED SRD feats
    backgrounds.ts           # AUTO-GENERATED SRD backgrounds
    species.ts               # AUTO-GENERATED SRD species
scripts/
  import-bestiary.ts         # Regenerates monster data from 5etools (npm run import:bestiary)
  import-spells.ts           # Regenerates spell data from 5etools (npm run import:spells)
  import-srd-content.ts       # Regenerates rules, classes, equipment, items, feats, and origins
```

## Getting Started

### Prerequisites
- Node.js 20+
- npm

### Install and Run

```bash
git clone https://github.com/Daren9m/Encounterizer.git
cd Encounterizer
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Scripts

```bash
npm run dev              # Development server
npm run build            # Static export → out/
npm run typecheck        # tsc --noEmit
npm run lint             # ESLint (next/core-web-vitals)
npm test                 # Vitest suite
npm run import:bestiary  # Regenerate the SRD bestiary from the pinned source
npm run import:spells    # Regenerate the SRD spell reference from the pinned source
npm run import:srd       # Regenerate structured SRD content from pinned Markdown
npm run srd:check        # Audit every committed SRD corpus (no network)
```

## Monster Database

**331 monsters from the System Reference Document 5.2.1** — the
CC-BY-4.0-licensed subset of the 2024 Monster Manual — spanning CR 0 (Frog)
to CR 30 (Tarrasque), with genuine 2024 stat values. The data files are
generated by `scripts/import-bestiary.ts` from a pinned 5etools source
commit and never edited by hand; an audit gate fails the import on
unstripped formatting tags, lost attacks, or missing XP.

Want more? The Bestiary page imports additional monsters from **5etools
bestiary JSON** or Encounterizer's own export format — converted and
validated entirely in your browser, never uploaded anywhere.

## Reference Library

**339 spells from the System Reference Document 5.2.1** — every SRD spell
from cantrips to 9th level, with verbatim 2024 rules text, generated by
`scripts/import-spells.ts` from a pinned 5etools source commit and never
edited by hand. An audit gate enforces exact corpus counts, licensing name
checks, format whitelists, and field-coverage parity on every regeneration.
The bold one-line effect summaries are layered: hand-curated overrides in
`src/data/spell-summaries.ts` win over machine-synthesized mechanics lines.

## Structured SRD Library

The same reference contains the complete structured rules corpus: **200 rule
articles (including Playing the Game, Character Creation, Equipment Rules,
Spellcasting Rules, the Rules Glossary, the Gameplay Toolbox, and Magic Item
Rules), 12 classes, 12 subclasses, 182 equipment entries, 257 magic items,
17 feats, 4 backgrounds, and 9 species** from SRD 5.2.1. Together with the
339 spells, that is 1,032 built-in references. `scripts/import-srd-content.ts`
parses the pinned SRD-reForged Markdown, applies a small audited correction
ledger for known PDF transcription boundaries, and emits typed,
formatting-free records. The `/reference` route exposes the complete corpus
with full-text search, resource filters, focused printable detail views, and
browser-local bookmarks. See the [pipeline documentation](docs/srd-content-pipeline.md).

Like the bestiary, the Reference Library imports additional spells from **5etools
spell JSON** or Encounterizer exports — converted and validated entirely in
your browser, never uploaded anywhere.

## Encounter Math

Uses the official 2024 Dungeon Master's Guide encounter-building rules:
- XP Budget per character level and difficulty tier (Low/Moderate/High)
- Raw monster XP compared directly against the budget — the 2024 rules
  dropped the 2014 monster-count multiplier entirely
- Encounters exceeding the High budget are flagged **Extreme** (a house
  label — the DMG defines nothing above High)
- Knapsack-style monster selection that fills the budget with variety
- Every generated encounter embeds its RNG seed: **Copy Link** produces a
  URL that regenerates the exact same encounter and map

The encounter generator also produces scenario hooks, per-type tactics,
and treasure by CR tier.

## Battle Forecast

The simulator models initiative, attack rolls, crits, multiattack routines,
breath-weapon recharges, legendary actions, healing, Rage damage reduction,
Sneak Attack, and Evasion. Monster stats are extracted automatically from
their stat blocks; caster monsters whose damage lives in spell text get a
CR-appropriate damage floor so a Lich never simulates as a pushover.
Deliberate simplifications (KO is final, AoE hits two targets) are part of
the design — the report brands itself a forecast and lists any
approximations it made.

## Map Generation

Three procedural algorithms:
- **BSP (Binary Space Partition)** — dungeon rooms connected by L-shaped corridors, with doors, stairs, traps, treasure, pillars
- **Cellular Automata** — organic cave systems (Underdark, mountain caves, planar rifts) with guaranteed connectivity
- **Outdoor Scatter** — environment-specific terrain (forest vegetation, swamp water, desert dunes, arctic ice, rivers with bridges)

Every map comes with **keyed rooms** — names, DM purposes, and read-aloud
text — rendered as a clean-tactical SVG battle map with coordinate rulers
and room-number chips. Exports: PNG, Markdown (grid + room key), JSON,
ASCII text, and **UVTT (.dd2vtt)** with line-of-sight walls and door
portals for Foundry-style importers.

Maps are seeded and shareable (`/maps?seed=…`). Maps generated alongside
encounters share the encounter's seed, so shared links reproduce the map,
the room key, AND the suggested token placement (party spawns, monster
zones, boss room). With a map attached, the Battle Forecast runs **on the
grid**: movement, weapon ranges, difficult terrain, and chokepoints all
shape the outcome, and the report shows rounds-to-contact alongside its
usual statistics.

## Deployment

The current deployment workflow produces a static export and sends it to Azure
Static Web Apps. That is a temporary baseline, not the target architecture.

The approved target is a full-stack Next.js application on Cloudflare Workers
through OpenNext, with separate preview/staging and production resources. The
runtime conversion, resource provisioning, data migration, production cutover,
and Azure retirement are defined in the
[Cloudflare Cloud-Native Roadmap](docs/cloudflare-cloud-native-roadmap.md).

## Releases

Releases follow [Semantic Versioning](https://semver.org/) and are automated
by `.github/workflows/release.yml`. Conventional commits on `main` are
collected into a release pull request:

- `fix:` produces a patch release.
- `feat:` produces a minor release.
- A breaking-change footer (`BREAKING CHANGE:`) or `!` after the commit type
  produces a major release.

Merging the release pull request updates `package.json`, `package-lock.json`,
the changelog, and the release manifest, then creates the matching `vX.Y.Z`
Git tag and GitHub Release. The deployed site reads its footer version directly
from `package.json`, so the displayed version and release tag stay aligned.

Repository administrators must allow GitHub Actions to create pull requests
under **Settings → Actions → General → Workflow permissions**.

## Design Principles

1. **Cloud-native authority** — Cloudflare services own durable application data, compute, files, and live-session coordination.
2. **Server-enforced trust** — Authentication, authorization, validation, and tenancy boundaries are enforced on the server.
3. **Deterministic rules core** — Official rules math and seeded generation remain testable, versioned, and independent of AI output.
4. **Cost discipline** — Metered features ship with limits, observability, and budget alerts.
5. **2024 rules** — 5.5e / 2024 encounter math and SRD 5.2.1 stat blocks must remain accurate; DMs rely on these numbers at the table.
6. **DM-centric** — Every feature answers "does this save the DM time during prep or at the table?"
7. **Legally clean and private by default** — The public catalog contains CC-BY-4.0 SRD content; custom non-SRD content remains private unless its owner explicitly shares it.
8. **No required LLM dependency** — Core encounter, reference, and battle workflows continue to work without AI services.

## Roadmap

The active platform plan is the
[Cloudflare Cloud-Native Roadmap](docs/cloudflare-cloud-native-roadmap.md),
organized as milestones CF-0 through CF-9 with explicit exit gates and
issue-shaped work packages.

See [GitHub Issues](https://github.com/Daren9m/Encounterizer/issues) and the
[milestones](https://github.com/Daren9m/Encounterizer/milestones) for the full
product backlog. Existing highlights include:

- **Character Import** (#10) — Parse D&D Beyond links, PDFs, or sheet images into Battle Forecast parties
- **Enhanced Export** (#15) — PDF stat blocks (map VTT export shipped with the Map Generator Overhaul)
- **Battle Forecast Phase 2/3** — death saves, AoE modeling, save-or-suck conditions, "what if?" suggestions

## Security

Please report suspected vulnerabilities privately. See the
[Security Policy](SECURITY.md) for supported versions, reporting instructions,
and disclosure expectations.

## Licensing

- **Code:** [MIT](LICENSE).
- **Game content:** This work includes material from the System Reference
  Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at
  <https://www.dndbeyond.com/srd>. The SRD 5.2.1 is licensed under the
  Creative Commons Attribution 4.0 International License
  (<https://creativecommons.org/licenses/by/4.0/legalcode>).
- Encounterizer is unofficial fan content, not affiliated with or endorsed
  by Wizards of the Coast. See the in-app [Credits page](src/app/credits/page.tsx).
