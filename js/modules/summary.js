/** summary.js — end-of-drill recap: score + the hands you missed (tap to expand). */
import { h, pct } from '../ui.js';
import * as R from '../ranges.js';

export function summaryView(out, { title = 'Drill complete', extra = null } = {}) {
  const misses = out.results.filter((r) => !r.ok);
  const avgMs = out.n ? out.results.reduce((s, r) => s + r.ms, 0) / out.n : 0;
  return h('div.summary',
    h('div.card.center',
      h('h2', title),
      h('div.bignum', pct(out.acc)),
      h('p.muted', `${out.ok}/${out.n} correct · ${(avgMs / 1000).toFixed(1)}s avg`),
      extra ? h('p', extra) : null),
    misses.length ? h('div.card',
      h('h3', `Misses (${misses.length}) — queued for spaced review`),
      h('ul.misses', misses.map((m) => {
        const sp = R.getSpot(m.spot);
        const acts = sp ? sp.actions.filter((a) => !(sp.decoys || []).includes(a)) : [];
        return h('li', h('b', m.hand), ' ', h('span.muted', sp ? sp.title : m.spot), h('br'),
          h('span.bad', `You: ${R.label(m.ans)}`), ' → ', h('span.good', R.mixLabel(m.mix, acts)));
      }))) : h('div.card.center', h('p', 'Clean run — no misses. 🎯')));
}
