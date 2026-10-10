/**
 * Preflop Range Trainer — RFI, facing opens, BB defence, steals, squeezes,
 * short-handed, and MTT push/fold + reshove. Leak #2 (limp/flat) and #4 (steals) weighted.
 */
import { h, clear, screen, pct } from '../ui.js';
import * as R from '../ranges.js';
import * as E from '../engine.js';
import { mountDrill, weighted } from './drill.js';
import { summaryView } from './summary.js';

export const CASH_CATS = [
  ['steal', 'Steals CO/BTN/SB', 0.22],
  ['stealDefense', 'Blinds vs steal', 0.2],
  ['facingOpen', 'Facing open', 0.2],
  ['bbDefense', 'BB defence', 0.12],
  ['rfi', 'RFI UTG/HJ', 0.1],
  ['squeeze', 'Squeeze', 0.08],
  ['shorthanded', '3–5 max', 0.08],
];
export const MTT_CATS = [
  ['push', 'Push/fold <15bb', 0.5],
  ['reshove', 'Reshove 12–25bb', 0.3],
  ['steal', 'Steals (100bb ref)', 0.1],
  ['stealDefense', 'Blinds vs steal', 0.1],
];

/** Pick a spot: category weight × weakness multiplier, then uniform within the category. */
export function pickPreflopSpot({ mode = 'cash', cats = [], ante = 'both', stacks = [] } = {}) {
  const table = mode === 'mtt' ? MTT_CATS : CASH_CATS;
  const accByCat = Object.fromEntries(E.groupAccuracy((a) => (a.mod === 'preflop' ? a.cat : null)).map((g) => [g.key, g.n >= 8 ? g.acc : 0.6]));
  const active = table.filter(([c]) => !cats.length || cats.includes(c));
  const cat = weighted(active.map(([c, , w]) => ({ v: c, w: w * (1 + 1.5 * (1 - (accByCat[c] ?? 0.6))) })));
  const pool = R.spotsWhere((s) => s.category === cat
    && (cat !== 'push' || ante === 'both' || (ante === 'on') === s.ante)
    && (!stacks.length || !['push', 'reshove'].includes(cat) || stacks.includes(bucket(s.stackBB))));
  const pick = pool.length ? pool : R.spotsWhere((s) => s.category === cat);
  // BTN steals get double weight within the steal category (leak #4: BTN steal 28%).
  return weighted(pick.map((s) => ({ v: s, w: cat === 'steal' && s.hero === 'BTN' ? 2 : 1 })));
}
const bucket = (bb) => (bb <= 8 ? '≤8' : bb <= 12 ? '10–12' : bb <= 16 ? '15–16' : '20–25');

/** Live "raise-or-fold discipline" = share of vpip-leak decisions with no limp and no flagged flat. */
export function disciplineLine(results) {
  const v = results.filter((r) => r.leaks.includes('vpip'));
  if (!v.length) return null;
  const bad = v.filter((r) => r.flags.includes('limp') || r.flags.includes('badFlat')).length;
  const d = 1 - bad / v.length;
  return h('span', 'R-or-F ', h(`b.${d >= 0.95 ? 'good' : 'warn'}`, pct(d)), bad ? h('small.bad', ` ${bad}⚑`) : null);
}

export function render(root) {
  const opts = { mode: 'cash', cats: [], ante: 'both', stacks: [] };
  const { el, body, foot } = screen('Preflop Ranges', { back: '#/' });
  root.append(el);
  let drill = null;

  function chipRow(items, isOn, onTap) {
    const wrap = h('div.chips');
    const draw = () => clear(wrap).append(...items.map(([v, l]) => h(`button.chip${isOn(v) ? '.on' : ''}`, { onclick: () => { onTap(v); draw(); } }, l)));
    draw();
    return wrap;
  }
  const toggle = (arr, v) => { const i = arr.indexOf(v); i >= 0 ? arr.splice(i, 1) : arr.push(v); };

  function setup() {
    drill?.stop();
    const st = E.leakStats('vpip');
    const steal = E.leakStats('steal');
    const cats = opts.mode === 'mtt' ? MTT_CATS : CASH_CATS;
    clear(body).append(
      h('div.card',
        h('h2', 'Leaks #2 & #4'),
        h('div.kv', h('span', 'VPIP/PFR gap (HUD)'), h('b.bad', '28/16 → 12 pts')),
        h('div.kv', h('span', 'Raise-or-fold discipline'), h('b', pct(st.discipline)), h('small.muted', ` ${st.limps} limps · ${st.badFlats} bad flats`)),
        h('div.kv', h('span', 'BTN steal: you / chart'), h('b', `${pct(steal.userSteal)} / ${pct(steal.chartSteal)}`)),
        h('div.kv', h('span', 'Fold vs steal: you / chart'), h('b', `${pct(steal.userFoldSteal)} / ${pct(steal.chartFoldSteal)}`)),
        h('p.fine', '"Limp" is always offered on opens and is always wrong. Every flat that should be a 3-bet or fold gets flagged ⚑.')),
      h('div.card',
        h('h3', 'Format'),
        chipRow([['cash', 'Cash 100bb'], ['mtt', 'MTT']], (v) => opts.mode === v, (v) => { opts.mode = v; opts.cats = []; setup(); }),
        h('h3', 'Spot types (none = weighted mix)'),
        chipRow(cats.map(([c, l]) => [c, l]), (v) => opts.cats.includes(v), (v) => toggle(opts.cats, v)),
        opts.mode === 'mtt' ? [
          h('h3', 'Ante'),
          chipRow([['both', 'Both'], ['on', 'Ante'], ['off', 'No ante']], (v) => opts.ante === v, (v) => (opts.ante = v)),
          h('h3', 'Stack depth'),
          chipRow([['≤8', '≤8bb'], ['10–12', '10–12bb'], ['15–16', '15–16bb'], ['20–25', '20–25bb']], (v) => opts.stacks.includes(v), (v) => toggle(opts.stacks, v)),
        ] : null),
    );
    clear(foot).append(h('button.btn.primary.big', { onclick: start }, 'Start drill'));
    foot.classList.add('show');
  }

  function start() {
    drill = mountDrill(body, foot, {
      mod: 'preflop',
      pickSpot: () => pickPreflopSpot(opts),
      allowSpot: (id) => { const s = R.getSpot(id); return s && s.category !== 'facing3bet' && (opts.mode === 'mtt' ? MTT_CATS : CASH_CATS).some(([c]) => c === s.category); },
      statsLine: disciplineLine,
      onDone: (out) => {
        E.recordDrillSession('preflop', out);
        clear(body).append(summaryView(out, { title: 'Preflop drill', extra: disciplineLine(out.results) }));
        clear(foot).append(h('button.btn.primary.big', { onclick: setup }, 'Done'));
        foot.classList.add('show');
      },
    });
    body.prepend(h('div.endrow', h('button.btn.ghost.sm', { onclick: () => drill.finish() }, 'End')));
  }

  setup();
  return () => drill?.stop();
}
