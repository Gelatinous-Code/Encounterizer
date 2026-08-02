import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { ALL_MONSTERS, getMonsterByName } from '@/data';
import { buildSimPlayer } from '@/data/class-templates';
import { simulateBattle } from '@/lib/battle-sim';
import type { SimMonster, SimPlayer } from '@/lib/battle-sim-types';
import { generateEncounter } from '@/lib/encounter-generator';
import { filterMonsters } from '@/lib/monster-filter';
import { monsterToSimMonster } from '@/lib/monster-to-sim';
import type { Party } from '@/lib/types';

const ROOT = resolve(import.meta.dirname, '..');
const OUT_DIR = join(ROOT, 'out');
const BASELINE_FILE = join(ROOT, 'docs', 'architecture', 'baselines', 'local-static-export.json');

interface TimingSummary {
  iterations: number;
  totalMs: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
}

interface PageSummary {
  route: '/';
  samples: number;
  documentP50Ms: number;
  documentP95Ms: number;
  pageP50Ms: number;
  pageP95Ms: number;
  htmlBytes: number;
  criticalAssetCount: number;
  criticalAssetBytes: number;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function percentile(values: number[], fraction: number): number {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * fraction))] ?? 0;
}

function benchmark(iterations: number, operation: (index: number) => unknown): TimingSummary {
  for (let index = 0; index < Math.min(20, iterations); index++) operation(index);

  const samples: number[] = [];
  const started = performance.now();
  for (let index = 0; index < iterations; index++) {
    const sampleStarted = performance.now();
    operation(index);
    samples.push(performance.now() - sampleStarted);
  }
  const totalMs = performance.now() - started;

  return {
    iterations,
    totalMs: round(totalMs),
    meanMs: round(totalMs / iterations),
    p50Ms: round(percentile(samples, 0.5)),
    p95Ms: round(percentile(samples, 0.95)),
  };
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function fixtureParty(): Party {
  return {
    id: 'cloud-baseline-party',
    name: 'Cloud Baseline Party',
    members: Array.from({ length: 4 }, (_, index) => ({
      name: `Adventurer ${index + 1}`,
      level: 8,
      className: 'Adventurer',
    })),
  };
}

function fixtureEncounter(seed = 20260801) {
  return generateEncounter(ALL_MONSTERS, {
    party: fixtureParty(),
    difficulty: 'High',
    environment: 'Forest',
    filter: { crMin: 1, crMax: 10 },
    seed,
  }, filterMonsters);
}

function fixturePlayers(): SimPlayer[] {
  return ['fighter-champion', 'cleric-life', 'wizard-evoker', 'rogue-thief']
    .map((templateId, index) => buildSimPlayer({
      name: `Player ${index + 1}`,
      templateId,
      level: 8,
    }, index));
}

function fixtureMonsters(): SimMonster[] {
  const monster = getMonsterByName('Ogre');
  if (!monster) throw new Error('Cloud baseline requires the Ogre SRD fixture.');
  return Array.from({ length: 3 }, (_, index) => monsterToSimMonster(monster, index, 3));
}

function fixtureSimulation(iterations = 1000) {
  return simulateBattle(fixturePlayers(), fixtureMonsters(), {
    seed: 20260801,
    iterations,
  });
}

function fixtureSearch() {
  return filterMonsters(ALL_MONSTERS, {
    search: 'fire',
    crMin: 2,
    crMax: 17,
    environments: ['Forest', 'Mountain'],
    sortBy: 'cr',
    sortDir: 'desc',
  }).map(({ id, name, challengeRating }) => ({ id, name, challengeRating }));
}

function directoryBytes(directory: string, extensions?: Set<string>): number {
  if (!existsSync(directory)) return 0;
  let bytes = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) bytes += directoryBytes(path, extensions);
    else if (!extensions || extensions.has(extname(entry.name))) bytes += statSync(path).size;
  }
  return bytes;
}

function contentType(path: string): string {
  switch (extname(path)) {
    case '.css': return 'text/css; charset=utf-8';
    case '.html': return 'text/html; charset=utf-8';
    case '.js': return 'text/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.webp': return 'image/webp';
    case '.woff2': return 'font/woff2';
    default: return 'application/octet-stream';
  }
}

async function measureStaticPage(): Promise<PageSummary | null> {
  if (!existsSync(join(OUT_DIR, 'index.html'))) return null;

  const server = createServer((request, response) => {
    const requestPath = new URL(request.url ?? '/', 'http://baseline.local').pathname;
    const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
    const path = normalize(join(OUT_DIR, relativePath));
    if (!path.startsWith(normalize(OUT_DIR)) || !existsSync(path) || statSync(path).isDirectory()) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader('content-type', contentType(path));
    createReadStream(path).pipe(response);
  });

  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to bind baseline server.');
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    const initial = await fetch(`${origin}/`);
    const html = await initial.text();
    const assets = [...html.matchAll(/(?:src|href)=["'](\/_next\/[^"']+\.(?:css|js|woff2?))["']/g)]
      .map((match) => match[1]);
    const uniqueAssets = [...new Set(assets)];
    const criticalAssetBytes = uniqueAssets.reduce((total, asset) => {
      const path = join(OUT_DIR, asset.replace(/^\/+/, ''));
      return total + (existsSync(path) ? statSync(path).size : 0);
    }, 0);

    const documentSamples: number[] = [];
    const pageSamples: number[] = [];
    for (let index = 0; index < 10; index++) {
      const started = performance.now();
      const documentResponse = await fetch(`${origin}/`);
      documentSamples.push(performance.now() - started);
      await documentResponse.arrayBuffer();
      await Promise.all(uniqueAssets.map(async (asset) => {
        const response = await fetch(`${origin}${asset}`);
        await response.arrayBuffer();
      }));
      pageSamples.push(performance.now() - started);
    }

    return {
      route: '/',
      samples: 10,
      documentP50Ms: round(percentile(documentSamples, 0.5)),
      documentP95Ms: round(percentile(documentSamples, 0.95)),
      pageP50Ms: round(percentile(pageSamples, 0.5)),
      pageP95Ms: round(percentile(pageSamples, 0.95)),
      htmlBytes: Buffer.byteLength(html),
      criticalAssetCount: uniqueAssets.length,
      criticalAssetBytes,
    };
  } finally {
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => error ? rejectClose(error) : resolveClose());
    });
  }
}

async function main() {
  const generationFixture = fixtureEncounter();
  const simulationFixture = fixtureSimulation();
  const searchFixture = fixtureSearch();
  const staticDirectory = join(OUT_DIR, '_next', 'static');

  const report = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    runtime: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
    },
    corpus: {
      monsters: ALL_MONSTERS.length,
    },
    deterministic: {
      encounterSha256: stableHash(generationFixture),
      simulationSha256: stableHash(simulationFixture),
      searchSha256: stableHash(searchFixture),
      searchResultCount: searchFixture.length,
    },
    workloads: {
      encounterGeneration: benchmark(250, (index) => fixtureEncounter(20260801 + index)),
      battleSimulation: benchmark(5, (index) => fixtureSimulation(500 + index)),
      catalogSearch: benchmark(1000, () => fixtureSearch()),
    },
    bundle: existsSync(OUT_DIR) ? {
      staticExportBytes: directoryBytes(OUT_DIR),
      nextStaticBytes: directoryBytes(staticDirectory),
      javascriptBytes: directoryBytes(staticDirectory, new Set(['.js'])),
      cssBytes: directoryBytes(staticDirectory, new Set(['.css'])),
    } : null,
    pageLoad: await measureStaticPage(),
  };

  if (process.argv.includes('--check')) {
    if (!existsSync(BASELINE_FILE)) throw new Error(`Missing committed baseline: ${BASELINE_FILE}`);
    const committed = JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as typeof report;
    const mismatches = Object.entries(report.deterministic)
      .filter(([key, value]) => committed.deterministic[key as keyof typeof report.deterministic] !== value)
      .map(([key]) => key);
    if (mismatches.length > 0) {
      throw new Error(`Deterministic cloud fixtures changed: ${mismatches.join(', ')}`);
    }
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
