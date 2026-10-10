/**
 * Facing 3-Bet Trainer — leak #1 (fold to 3-bet 14%, target 35–45%).
 * You opened; someone 3-bets. 4-bet / call / fold, graded vs the baseline chart.
 */
import { h, clear, screen, pct } from '../ui.js';
import * as R from '../ranges.js';
import * as E from '../engine.js';
import { mountDrill, weighted } from './drill.js';
import { summaryView } from './summary.js';

const POS = ['UTG', 'HJ', 'CO', 'BTN', 'SB'];

/** Weighted spot picker: weaker (position, IP/OOP) groups and OOP spots come up more. */
export function pickF3bSpot(filter = {}) {
  const spots = R.spotsWhere((s) => s.category === 'facing3bet'
    && (!filter.pos?.length || filter.pos.includes(s.hero))
    && (!filter.ctx || filter.ctx === 'all' || (filter.ctx === 'ip') === s.ip)
    && (!filter.size || filter.size === 'all' || filter.size === s.sizing));
  const acc = Object.fromEntries(E.groupAccuracy((a) => (a.cat === 'facing3bet' ? `${a.pos}|${a.ip}` : null)).map((g) => [g.key, g.n >= 6 ? g.acc : 0.6]));
  return weighted(spots.map((s) => ({ v: s, w: (1 + 2 * (1 - (acc[`${s.hero}|${s.ip}`] ?? 0.6))) * (s.ip ? 1 : 1.3) })));
}

/** Live line: your fold% vs the chart's fold% on the same hands vs the HUD target. */
export function f3bStatsLine(results) {
  const f = results.filter((r) => r.cat === 'facing3bet');
  if (!f.length) return h('span.muted', 'Target fold 35–45%');
  const you = f.filter((r) => r.ans === 'fold').length / f.length;
  const chart = f.reduce((s, r) => s + (r.mix.fold || 0), 0) / f.length;
  const inTarget = you >= 0.35 && you <= 0.45;
  return h('span', 'Fold ', h(`b.${inTarget ? 'good' : 'warn'}`, pct(you)), h('small.muted', ` chart ${pct(chart)} · tgt 35–45`));
}

export function render(root) {
  const filter = { pos: [], ctx: 'all', size: 'all' };
  const { el, body, foot } = screen('Facing 3-Bet', { back: '#/' });
  root.append(el);
  let drill = null;

  function setup() {
    drill?.stop();
    foot.classList.remove('show');
    const st = E.leakStats('f3b');
    clear(body).append(
      h('div.card',
        h('h2', 'Leak #1 — Fold to 3-bet'),
        h('div.kv', h('span', 'HUD (112k hands)'), h('b.bad', '14%')),
        h('div.kv', h('span', 'Target'), h('b', '35–45%')),
        h('div.kv', h('span', 'Your drill fold%'), h('b', pct(st.userFold)), h('small.muted', ` chart ${pct(st.chartFold)} on same hands`)),
        h('div.kv', h('span', 'Drill accuracy OOP / IP'), h('b', `${pct(st.oopAcc)} / ${pct(st.ipAcc)}`)),
        h('p.fine', 'Hands are dealt combo-weighted from your opening range, so your in-drill fold% is directly comparable to a fold-to-3bet stat.')),
      h('div.card',
        h('h3', 'Your open position'),
        chips(POS, filter.pos, true),
        h('h3', 'Position vs 3-bettor'),
        chips([['all', 'All'], ['oop', 'OOP'], ['ip', 'IP']], filter, false, 'ctx'),
        h('h3', '3-bet sizing'),
        chips([['all', 'All'], ['small', 'Small'], ['large', 'Large']], filter, false, 'size')),
    );
    clear(foot).append(h('button.btn.primary.big', { onclick: start }, 'Start drill'));
    foot.classList.add('show');
  }

  function chips(items, target, multi, key) {
    const wrap = h('div.chips');
    const draw = () => {
      clear(wrap).append(...items.map((it) => {
        const [v, lbl] = Array.isArray(it) ? it : [it, it];
        const on = multi ? target.includes(v) : target[key] === v;
        return h(`button.chip${on ? '.on' : ''}`, {
          onclick: () => {
            if (multi) { const i = target.indexOf(v); i >= 0 ? target.splice(i, 1) : target.push(v); } else target[key] = v;
            draw();
          },
        }, lbl);
      }));
    };
    draw();
    return wrap;
  }

  function start() {
    const endBtn = h('button.btn.ghost.sm', { onclick: () => drill.finish() }, 'End');
    drill = mountDrill(body, foot, {
      mod: 'f3b',
      pickSpot: () => pickF3bSpot(filter),
      allowSpot: (id) => id.startsWith('F3B_'),
      statsLine: f3bStatsLine,
      onDone: (out) => {
        E.recordDrillSession('f3b', out);
        clear(body).append(summaryView(out, { title: 'Facing 3-bet drill', extra: f3bStatsLine(out.results) }));
        clear(foot).append(h('button.btn.primary.big', { onclick: setup }, 'Done'));
        foot.classList.add('show');
      },
    });
    body.prepend(h('div.endrow', endBtn));
  }

  setup();
  return () => drill?.stop();
}
