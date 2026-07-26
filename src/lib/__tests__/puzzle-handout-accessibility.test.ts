import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PuzzleHandout from '@/components/PuzzleHandout';

describe('PuzzleHandout accessibility', () => {
  it('exposes diagram rows and cells as a two-dimensional grid', () => {
    const markup = renderToStaticMarkup(PuzzleHandout({
      spec: {
        kind: 'grid-diagram',
        rows: 2,
        cols: 2,
        cells: [
          { state: 'on' },
          { state: 'off' },
          { label: 'Moon' },
          { state: 'masked' },
        ],
      },
    }));

    expect(markup).toContain('role="grid"');
    expect(markup).toContain('aria-rowcount="2"');
    expect(markup.match(/role="row"/g)).toHaveLength(2);
    expect(markup.match(/role="gridcell"/g)).toHaveLength(4);
    expect(markup).toContain('aria-colindex="2"');
  });

  it('uses row headers for logic-grid anchors', () => {
    const markup = renderToStaticMarkup(PuzzleHandout({
      spec: {
        kind: 'logic-grid',
        categories: ['Guardian', 'Sigil'],
        items: [['Ox', 'Ram'], ['Sun', 'Moon']],
        clues: ['The Ox bears the Sun.'],
      },
    }));

    expect(markup).toContain('<th scope="row"');
    expect(markup).toContain('>Ox</th>');
  });
});
