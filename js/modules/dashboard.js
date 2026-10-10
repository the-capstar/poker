/** Leak Dashboard — accuracy by module, position and spot type; 3 weakest areas; review queue. */
import { h, screen, pct } from '../ui.js';
import * as E from '../engine.js';

function bars(rows, labelFn = (k) => k) {
  if (!rows.length) return h('p.muted', 'No data yet — run a drill.');
  return h('div.bars', rows.map((r) => h('div.barrow',
    h('span.bl', labelFn(r.key)),
    h('span.bt', h('i', { style: { width: `${Math.round(r.acc * 100)}%`, background: r.acc >= 0.85 ? 'var(--good)' : r.acc >= 0.7 ? 'var(--warn)' : 'var(--bad)' } })),
    h('span.bv', pct(r.acc), h('small', ` ${r.n}`)))));
}

export function render(root) {
  const { el, body } = screen('Leak Dashboard', { back: '#/' });
  root.append(el);
  const MOD = { f3b: 'Facing 3-bet', preflop: 'Preflop', math: 'Math', postflop: 'Postflop' };
  const weakest = E.weakestAreas(3);
  const boxes = E.leitnerSummary();
  const due = E.dueItems().length;
  const sortBy = (rows, order) => rows.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

  body.append(
    h('div.card.alert',
      h('h2', '3 weakest areas'),
      weakest.length ? h('ol.weak', weakest.map((w) => h('li', h('b', w.name), h('span', ` ${pct(w.acc)} `), h('small.muted', `(${w.n})`)))) : h('p.muted', 'Need ≥ 5 answers in an area before it is ranked.')),
    h('div.card', h('h3', 'By module'), bars(E.groupAccuracy((a) => a.mod), (k) => MOD[k] || k)),
    h('div.card', h('h3', 'By position (preflop)'), bars(sortBy(E.groupAccuracy((a) => (a.mod !== 'math' ? a.pos : null)), ['UTG', 'UTG1', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']))),
    h('div.card', h('h3', 'By spot type'), bars(E.groupAccuracy((a) => (a.mod !== 'math' ? a.cat : null)), (k) => E.CAT_LABEL[k] || k)),
    h('div.card', h('h3', 'Facing 3-bet: IP vs OOP · sizing'), bars(E.groupAccuracy((a) => (a.cat === 'facing3bet' ? `${a.ip ? 'IP' : 'OOP'} · ${a.sizing}` : null)))),
    h('div.card', h('h3', 'Math by category'), bars(E.groupAccuracy((a) => (a.mod === 'math' ? a.cat : null)), (k) => E.CAT_LABEL[k] || k)),
    h('div.card',
      h('h3', 'Spaced repetition (Leitner)'),
      h('div.boxes', boxes.slice(1).map((n, i) => h('div.box', h('b', n), h('small', `Box ${i + 1}`)))),
      h('p.fine', `${due} item${due === 1 ? '' : 's'} due now. Misses go to Box 1 and come back within ~4 questions; each correct answer moves an item up a box and spaces it further out.`)),
  );
}
