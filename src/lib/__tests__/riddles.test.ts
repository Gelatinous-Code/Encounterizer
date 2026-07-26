import { describe, it, expect } from 'vitest';
import { RIDDLES } from '../../data/riddles';

// Distinctive lines from copyrighted riddles (The Hobbit). Normalized
// substring match — reformatting does not evade it. Extend this list
// whenever a copyrighted riddle is discovered near the corpus.
const DENYLIST = [
  'roots as nobody sees',
  'up up it goes and yet never grows',
  'voiceless it cries',
  'wingless flutters',
  'toothless bites',
  'mouthless mutters',
  'alive without breath as cold as death',
  'never thirsty ever drinking',
  'this thing all things devours',
  'slays king ruins town',
  'box without hinges key or lid',
  'cannot be seen cannot be felt',
  'cannot be heard cannot be smelt',
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

describe('riddle corpus lint (spec §7.2–7.3)', () => {
  it('has at least 100 riddles', () => {
    expect(RIDDLES.length).toBeGreaterThanOrEqual(100);
  });
  it('has unique ids and unique normalized texts', () => {
    expect(new Set(RIDDLES.map(r => r.id)).size).toBe(RIDDLES.length);
    expect(new Set(RIDDLES.map(r => norm(r.text))).size).toBe(RIDDLES.length);
  });
  it('every entry has an answer and a valid obscurity', () => {
    for (const r of RIDDLES) {
      expect(r.answer.length).toBeGreaterThan(0);
      expect([1, 2, 3]).toContain(r.obscurity);
      expect(['traditional', 'original']).toContain(r.origin);
    }
  });
  it('meets the obscurity spread minimums (30/30/15)', () => {
    expect(RIDDLES.filter(r => r.obscurity === 1).length).toBeGreaterThanOrEqual(30);
    expect(RIDDLES.filter(r => r.obscurity === 2).length).toBeGreaterThanOrEqual(30);
    expect(RIDDLES.filter(r => r.obscurity === 3).length).toBeGreaterThanOrEqual(15);
  });
  it('contains no denylisted copyrighted lines (normalized)', () => {
    for (const r of RIDDLES) {
      const t = norm(r.text);
      for (const d of DENYLIST) {
        expect(t.includes(norm(d)), `riddle "${r.id}" matches denylist "${d}"`).toBe(false);
      }
    }
  });
  it('keeps reviewed alternate answers aligned with each riddle', () => {
    const byId = new Map(RIDDLES.map(riddle => [riddle.id, riddle]));

    expect(byId.get('candle')?.altAnswers).not.toContain('a torch');
    expect(byId.get('armor')?.altAnswers).toEqual(expect.arrayContaining(['chainmail', 'chain mail', 'mail']));
    expect(byId.get('mask')?.altAnswers).toEqual(expect.arrayContaining(['disguise', 'costume']));
    expect(byId.get('net')?.text).toMatch(/cast through air or water/i);
  });
});
