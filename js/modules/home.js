/** Home — Start Session Prep, My Leaks card, streak, module tiles. */
import { h, pct } from '../ui.js';
import * as store from '../store.js';
import * as E from '../engine.js';

const LEAK_ROUTE = { f3b: '#/f3b', vpip: '#/preflop', aggr: null, steal: '#/preflop' };

function trendTxt(t) {
  if (t == null) return '';
  const p = Math.round(t * 100);
  return p === 0 ? ' →' : p > 0 ? ` ▲${p}` : ` ▼${-p}`;
}

export function leaksCard() {
  const b = store.get().leakBaseline;
  const weakest = E.weakestLeak().id;
  const rows = E.LEAKS.map((l, i) => {
    const st = E.leakStats(l.id);
    let drill;
    if (l.id === 'f3b') drill = st.n ? `Drill ${pct(st.acc)} · you fold ${pct(st.userFold)}` : 'No drill data yet';
    else if (l.id === 'vpip') drill = st.n ? `Drill ${pct(st.acc)} · R-or-F ${pct(st.discipline)}` : 'No drill data yet';
    else if (l.id === 'steal') drill = st.n ? `Drill ${pct(st.acc)} · steal ${pct(st.userSteal)} · fold ${pct(st.userFoldSteal)}` : 'No drill data yet';
    else drill = st.aggrWhenCorrect != null ? `Aggression when correct ${pct(st.aggrWhenCorrect)}` : 'Unlocks with Postflop trainer';
    const route = LEAK_ROUTE[l.id];
    return h(route ? 'a.leak' : 'div.leak', { href: route || undefined, class: l.id === weakest ? 'leak weakest' : 'leak' },
      h('div.lnum', i + 1),
      h('div.lbody',
        h('div.ltop', h('b', l.name), h('span.lacc', st.n ? pct(st.acc) : '—', h('small', trendTxt(st.trend)))),
        h('div.lstat', h('span.bad', l.real(b)), ' → ', h('span.good', l.target)),
        h('div.ldrill', drill)));
  });
  return h('div.card.leaks',
    h('div.cardhead', h('h2', 'My Leaks'), h('small.muted', `${(b.hands / 1000).toFixed(0)}k hands · ${b.source}`)),
    ...rows,
    h('div.focus', h('small', "TODAY'S FOCUS"), h('p', E.todaysFocus())));
}

export function render(root) {
  const s = E.streak();
  const sessions = store.get().sessions.filter((x) => x.type === 'warmup');
  const last = sessions[sessions.length - 1];
  const tiles = [
    ['#/f3b', '🛡', 'Facing 3-Bet', 'Leak #1'],
    ['#/preflop', '🂡', 'Preflop Ranges', 'Leaks #2 #4'],
    ['#/math', '⚡', 'Math Sprint', '60s rounds'],
    ['#/checkin', '🧠', 'Check-In', 'Mental game'],
    ['#/dashboard', '📊', 'Leak Dashboard', 'Weakest areas'],
    ['#/history', '🔥', 'History', `${s.current}-day streak`],
    [null, '🃏', 'Postflop Spots', 'Next up'],
    [null, '🔎', 'Hand Reading', 'Coming'],
    [null, '🏆', 'Tournament ICM', 'Coming'],
    ['#/editor', '✏️', 'Range Editor', 'Your charts'],
    ['#/settings', '⚙️', 'Settings', 'Backup · limits'],
  ];
  root.append(h('section.screen.home',
    h('header.top.homehead', h('h1', 'Warm-Up'), h('a.streak', { href: '#/history' }, `🔥 ${s.current}`)),
    h('main.body',
      h('a.btn.primary.hero', { href: '#/warmup' }, h('span', 'Start Session Prep'), h('small', s.doneToday ? 'Done today ✓ — go again?' : last ? `Last: ${new Date(last.date).toLocaleDateString()} · readiness ${last.readiness ?? '—'}` : '10–20 min · cash or MTT')),
      leaksCard(),
      h('div.tiles', tiles.map(([href, ic, t, sub]) => h(href ? 'a.tile' : 'div.tile.soon', { href: href || undefined }, h('span.ic', ic), h('b', t), h('small', sub)))),
      h('p.fine.center', 'Ranges are baseline approximations, not solver output. Swap in your own in the Range Editor.'))));
}
