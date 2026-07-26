// Renders every HandoutSpec kind inside the light-island card used for
// player-facing material. Runic text always gets .font-runic — the
// unicode-range keeps Latin text unaffected.
import type { JSX } from 'react';
import type { HandoutSpec } from '@/lib/noncombat/types';

export default function PuzzleHandout({
  spec,
  embedded = false,
}: {
  spec: HandoutSpec;
  embedded?: boolean;
}) {
  return (
    <div className={embedded ? 'light-island rounded-[var(--radius-panel)] border p-4' : 'card light-island'}>
      <h3 className="text-lg mb-2 text-[var(--statblock-light-accent)]">Player Handout</h3>
      <HandoutBody spec={spec} />
    </div>
  );
}

function assertNever(x: never): never {
  throw new Error(`Unhandled handout kind: ${JSON.stringify(x)}`);
}

function HandoutBody({ spec }: { spec: HandoutSpec }): JSX.Element {
  switch (spec.kind) {
    case 'text':
      return (
        <div>
          {spec.title && <h4 className="text-sm font-bold mb-1">{spec.title}</h4>}
          <p className="text-sm whitespace-pre-line font-display">{spec.body}</p>
        </div>
      );
    case 'logic-grid':
      return (
        <div className="space-y-3">
          <div className="max-w-full overflow-x-auto pb-1" role="region" tabIndex={0} aria-label="Scrollable logic grid">
            <table className="min-w-max text-xs border-collapse">
              <thead>
                <tr>
                  <th scope="col" className="border px-2 py-1 text-left">{spec.categories[0]}</th>
                  {spec.categories.slice(1).map(c => (
                    <th key={c} scope="col" className="border px-2 py-1 text-left">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {spec.items[0].map(anchor => (
                  <tr key={anchor}>
                    <th scope="row" className="border px-2 py-1 text-left font-bold">{anchor}</th>
                    {spec.categories.slice(1).map(c => (
                      <td key={c} className="border px-2 py-1 min-w-16" />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-xs">
            {spec.categories.map((c, i) => (
              <div key={c}><span className="font-bold">{c}:</span> {spec.items[i].join(', ')}</div>
            ))}
          </div>
          <ol className="text-sm list-decimal list-inside space-y-1">
            {spec.clues.map((c, i) => <li key={i}>{c}</li>)}
          </ol>
        </div>
      );
    case 'symbol-sequence':
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-lg font-display">
            {spec.symbols.map((s, i) => (
              <span key={i} className={`px-2 py-1 rounded border ${spec.blanks.includes(i) ? 'border-dashed text-transparent min-w-10' : ''}`}>
                {spec.blanks.includes(i) ? '?' : s}
              </span>
            ))}
          </div>
          {spec.options && <p className="text-sm">Loose pieces: {spec.options.join(', ')}</p>}
        </div>
      );
    case 'cipher-text':
      return (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide">{spec.scriptName}</p>
          <p className="text-xl font-runic break-words leading-relaxed">{spec.body}</p>
          {spec.partialKey && (
            <p className="text-sm">
              Partial key: {Object.entries(spec.partialKey).map(([c, p]) => `${c} = ${p}`).join(' · ')}
            </p>
          )}
        </div>
      );
    case 'grid-diagram':
      return (
        <div className="space-y-2">
          <div className="max-w-full overflow-x-auto pb-1" role="region" tabIndex={0} aria-label="Scrollable puzzle diagram">
            <div
              className="inline-grid min-w-max gap-1"
              style={{ gridTemplateColumns: `repeat(${spec.cols}, minmax(2rem, auto))` }}
              role="grid"
              aria-label={`${spec.rows} by ${spec.cols} puzzle diagram`}
              aria-rowcount={spec.rows}
              aria-colcount={spec.cols}
            >
              {Array.from({ length: spec.rows }, (_, rowIndex) => (
                <div key={rowIndex} role="row" aria-rowindex={rowIndex + 1} className="contents">
                  {spec.cells
                    .slice(rowIndex * spec.cols, (rowIndex + 1) * spec.cols)
                    .map((c, columnIndex) => (
                      <div
                        key={columnIndex}
                        role="gridcell"
                        aria-colindex={columnIndex + 1}
                        aria-label={
                          c.state === 'on' ? 'lit plate'
                          : c.state === 'off' ? 'dark plate'
                          : c.state === 'masked' ? 'empty socket'
                          : c.label ?? 'tile'
                        }
                        className={`aspect-square flex items-center justify-center rounded border text-sm font-bold ${
                          c.state === 'on' ? 'bg-[var(--bronze)] text-[var(--steel-950)]'
                          : c.state === 'off' ? 'bg-[var(--steel-950)] text-[var(--text-2)]'
                          : c.state === 'masked' ? 'border-dashed'
                          : ''
                        }`}
                      >
                        {c.label ?? ''}
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </div>
          {spec.legend && (
            <ul className="text-xs space-y-0.5">
              {spec.legend.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          )}
        </div>
      );
    case 'attempts-ledger':
      return (
        <div className="space-y-2 text-sm">
          <p className="font-bold">Previous attempts:</p>
          <ol className="list-decimal list-inside space-y-1">
            {spec.attempts.map((a, i) => (
              <li key={i}>
                <span className="font-runic text-lg mr-2">{a.guess.join(' ')}</span>
                <span className="text-xs">{a.feedback}</span>
              </li>
            ))}
          </ol>
          <p>Runes available: <span className="font-runic text-lg">{spec.runeSet.join(' ')}</span></p>
        </div>
      );
    case 'clue-cards':
      return (
        <div className="grid sm:grid-cols-2 gap-2">
          {spec.cards.map((c, i) => (
            <div key={i} className="p-2 rounded border text-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold">{c.title}</span>
                <span className="text-xs uppercase tracking-wide">{c.vector}</span>
              </div>
              {c.body}
            </div>
          ))}
        </div>
      );
    default:
      return assertNever(spec);
  }
}
