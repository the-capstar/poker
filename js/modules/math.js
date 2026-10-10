/**
 * Math Sprint — 60-second rounds of multiple-choice poker math. Speed matters:
 * no pause between questions, just a colour flash. Misses + explanations at the end.
 */
import { h, clear, screen, timerBar, pct, buzz } from '../ui.js';
import { deck, SUIT_GLYPH, combosOf, RANKS } from '../lib/hands.js';
import * as E from '../engine.js';
import * as store from '../store.js';

const ROUND_SEC = 60;
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const C2 = (n) => (n * (n - 1)) / 2;

/** Build 4 distinct numeric options around the correct value. */
function options(correct, candidates, fmt, minGap) {
  const out = [correct];
  for (const c of shuffle([...candidates])) {
    if (out.length >= 4) break;
    if (c >= 0 && out.every((o) => Math.abs(o - c) >= minGap)) out.push(c);
  }
  let k = 1;
  while (out.length < 4) {
    const c = correct + minGap * k * (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 1.5;
    if (c >= 0 && out.every((o) => Math.abs(o - c) >= minGap)) out.push(c);
    k++;
  }
  const shuffled = shuffle(out.map((v) => ({ v, label: fmt(v) })));
  return { opts: shuffled.map((o) => o.label), correctIdx: shuffled.findIndex((o) => o.v === correct) };
}
const P = (x) => `${Math.round(x)}%`;
const nicePot = () => pick([12, 18, 24, 30, 36, 40, 45, 50, 60, 75, 80, 90, 100, 120, 150]);
const BET_FRACS = [0.25, 0.33, 0.5, 0.66, 0.75, 1, 1.25, 1.5, 2];
const betOf = (p) => { const f = pick(BET_FRACS); return { f, b: Math.round(p * f) }; };
const cardTxt = (c) => `${c[0]}${SUIT_GLYPH[c[1]]}`;

/* ---------------- generators ---------------- */
export const GEN = {
  potodds() {
    const p = nicePot(), { b } = betOf(p);
    const need = (100 * b) / (p + 2 * b);
    return { cat: 'potodds', q: `Pot ${p}. Villain bets ${b}. Equity needed to call?`, ...options(Math.round(need), [Math.round((100 * b) / (p + b)), Math.round((100 * b) / p), Math.round(need) + 6, Math.round(need) - 6, Math.round(need) + 11], P, 4),
      why: `Call ÷ final pot = ${b} ÷ (${p} + ${b} + ${b}) = ${need.toFixed(1)}%.` };
  },
  mdf() {
    const p = nicePot(), { b } = betOf(p);
    const mdf = (100 * p) / (p + b);
    return { cat: 'mdf', q: `Pot ${p}. Villain bets ${b}. Your MDF (defend at least)?`, ...options(Math.round(mdf), [Math.round((100 * b) / (p + b)), Math.round(100 - (100 * b) / (p + 2 * b)), Math.round(mdf) + 7, Math.round(mdf) - 7], P, 4),
      why: `MDF = pot ÷ (pot + bet) = ${p} ÷ ${p + b} = ${mdf.toFixed(1)}%.` };
  },
  alpha() {
    const p = nicePot(), { b } = betOf(p);
    const a = (100 * b) / (p + b);
    return { cat: 'alpha', q: `You bluff ${b} into ${p}. How often must it work (break-even)?`, ...options(Math.round(a), [Math.round((100 * b) / (p + 2 * b)), Math.round((100 * p) / (p + b)), Math.round(a) + 7, Math.round(a) - 7], P, 4),
      why: `α = bet ÷ (pot + bet) = ${b} ÷ ${p + b} = ${a.toFixed(1)}%.` };
  },
  outs() {
    const n = rint(3, 15), flop = Math.random() < 0.55;
    const exact = flop ? 100 * (1 - C2(47 - n) / C2(47)) : (100 * n) / 46;
    const rule = flop ? (n > 8 ? 4 * n - (n - 8) : 4 * n) : 2 * n;
    return { cat: 'outs', q: `${n} outs, ${flop ? 'flop → river (all-in, see both cards)' : 'turn → river'}. Equity to hit?`,
      ...options(Math.round(exact), [Math.round(exact) + 7, Math.round(exact) - 7, Math.round(exact) + 13, Math.round(exact) - 13, flop ? 4 * n : 4 * n], P, 5),
      why: flop ? `Rule of 4${n > 8 ? ' with correction: 4×' + n + ' − (' + n + '−8) = ' + rule : ': 4×' + n + ' = ' + rule}%. Exact ${exact.toFixed(1)}%.` : `Rule of 2: 2×${n} ≈ ${rule}%. Exact ${n}/46 = ${exact.toFixed(1)}%.` };
  },
  combos() {
    return pick([combosAK, combosSets, combosNutFlush, combosOverpairs])();
  },
  spr() {
    const pot = pick([6.5, 11, 15, 20, 22, 25, 30, 45]);
    const stack = pick([40, 55, 75, 89, 92.5, 97.5, 140]);
    const spr = stack / pot;
    const r = Math.round(spr * 10) / 10;
    return { cat: 'spr', q: `Pot ${pot}bb on the flop, effective stack ${stack}bb behind. SPR?`, ...options(r, [r * 1.5, r / 1.5, r + 2, r - 1.5, r + 4], (v) => v.toFixed(1), Math.max(0.6, r * 0.18)),
      why: `SPR = stack ÷ pot = ${stack} ÷ ${pot} = ${spr.toFixed(2)}.${spr < 4 ? ' Low SPR: top pair is a stack-off.' : spr > 10 ? ' Deep: need very strong hands to stack off.' : ''}` };
  },
  implied() {
    // Turn: one card to come, call a bet with a draw; how much MORE must you win on the river?
    for (let tries = 0; tries < 20; tries++) {
      const draws = [['flush draw', 9], ['OESD', 8], ['gutshot', 4], ['flush + gutshot', 12], ['two overs', 6]];
      const [name, n] = pick(draws);
      const p = nicePot(), b = Math.round(p * pick([0.5, 0.66, 0.75, 1]));
      const e = n / 46;
      const w = ((1 - e) * b) / e - (p + b);
      if (w < 5) continue;
      const r = Math.round(w);
      return { cat: 'implied', q: `Turn. Pot ${p}, villain bets ${b}. You have a ${name} (${n} outs). Extra you must win on the river to break even?`,
        ...options(r, [Math.round(r * 1.4), Math.round(r * 0.6), Math.round(r + p / 2), Math.round((1 - e) * b / e)], (v) => String(Math.round(v)), Math.max(4, r * 0.15)),
        why: `Equity ${n}/46 = ${(e * 100).toFixed(1)}%. Need e×(pot+bet+X) ≥ (1−e)×call → X = ${(((1 - e) * b) / e).toFixed(0)} − ${p + b} = ${w.toFixed(0)}.` };
    }
    return GEN.potodds();
  },
};

/* --- combo counting helpers with card removal --- */
function freshDeck() { return shuffle(deck()); }
function countClass(hands, dead) {
  const d = new Set(dead);
  return hands.flatMap((hh) => combosOf(hh)).filter(([a, b]) => !d.has(a) && !d.has(b)).length;
}
function combosAK() {
  // Board with a K or A; hero may hold a blocker.
  const hi = pick(['A', 'K']), other = hi === 'A' ? 'K' : 'A';
  const d = freshDeck().filter((c) => c[0] !== 'A' && c[0] !== 'K');
  const board = [hi + pick('shdc'), d[0], d[1]];
  const heroBlock = Math.random() < 0.6;
  const hero = heroBlock ? [other + pick('shdc'), d[2]] : [d[2], d[3]];
  const dead = [...board, ...hero];
  const n = countClass(['AKs', 'AKo'], dead);
  return { cat: 'combos', q: `Board ${board.map(cardTxt).join(' ')}. You hold ${hero.map(cardTxt).join(' ')}. Combos of AK villain can have?`,
    ...options(n, [16, 12, 9, 8, 6, 4], String, 1),
    why: `A's left × K's left = ${4 - dead.filter((c) => c[0] === 'A').length} × ${4 - dead.filter((c) => c[0] === 'K').length} = ${n}.` };
}
function combosSets() {
  const d = freshDeck();
  const board = [];
  for (const c of d) if (board.length < 3 && !board.some((b) => b[0] === c[0])) board.push(c);
  const rest = d.filter((c) => !board.includes(c));
  const hero = Math.random() < 0.5 ? [rest.find((c) => c[0] === board[0][0]), rest.find((c) => c[0] !== board[0][0] && !board.some((b) => b[0] === c[0]))] : [rest[5], rest[9]];
  const dead = [...board, ...hero];
  let n = 0;
  for (const b of board) n += C2(4 - dead.filter((c) => c[0] === b[0]).length);
  return { cat: 'combos', q: `Board ${board.map(cardTxt).join(' ')}. You hold ${hero.map(cardTxt).join(' ')}. How many set combos are possible for villain?`,
    ...options(n, [9, 7, 6, 3, 12], String, 1),
    why: `Each unpaired board rank leaves C(3,2)=3 combos; a rank you hold one of leaves C(2,2)=1. Total ${n}.` };
}
function combosNutFlush() {
  const s = pick('shdc');
  const suited = shuffle(RANKS.filter((r) => r !== 'A')).slice(0, 3).map((r) => r + s);
  const blocker = Math.random();
  const hero = blocker < 0.3 ? ['A' + s, 'Q' + (s === 'h' ? 'd' : 'h')] : blocker < 0.6 ? [RANKS.find((r) => r !== 'A' && !suited.some((c) => c[0] === r)) + s, '7' + (s === 'c' ? 'd' : 'c')] : ['J' + (s === 'h' ? 'd' : 'h'), 'T' + (s === 'c' ? 'd' : 'c')];
  if (hero[0][0] === hero[1][0] && hero[0][1] === hero[1][1]) hero[1] = '2' + (s === 'c' ? 'd' : 'c');
  const dead = new Set([...suited, ...hero]);
  const n = dead.has('A' + s) ? 0 : RANKS.filter((r) => r !== 'A' && !dead.has(r + s)).length;
  return { cat: 'combos', q: `Monotone board ${suited.map(cardTxt).join(' ')}. You hold ${hero.map(cardTxt).join(' ')}. Combos of the nut flush (A${SUIT_GLYPH[s]}x${SUIT_GLYPH[s]}) for villain?`,
    ...options(n, [9, 10, 8, 1, 0, 12], String, 1),
    why: dead.has('A' + s) ? 'You hold the A of the suit — villain has zero nut flushes (nut blocker).' : `A${SUIT_GLYPH[s]} + any remaining ${SUIT_GLYPH[s]}: 13 − 3 on board − the A − your ${SUIT_GLYPH[s]} = ${n}.` };
}
function combosOverpairs() {
  const sets = [['QQ+', ['AA', 'KK', 'QQ']], ['JJ+', ['AA', 'KK', 'QQ', 'JJ']], ['TT+', ['AA', 'KK', 'QQ', 'JJ', 'TT']], ['QQ+, AK', ['AA', 'KK', 'QQ', 'AKs', 'AKo']]];
  const [name, hs] = pick(sets);
  const d = freshDeck();
  const hero = [d.find((c) => 'AKQ'.includes(c[0])), d.find((c) => !'AKQ'.includes(c[0]))];
  const n = countClass(hs, hero);
  return { cat: 'combos', q: `Preflop. You hold ${hero.map(cardTxt).join(' ')}. How many combos in villain's ${name}?`,
    ...options(n, [n + 3, n - 3, n + 6, n - 6, n + 4], String, 2),
    why: `Pairs: 6 combos each, 3 if you hold one of the rank. AK: 16, or 12 if you hold an A or K. Total ${n}.` };
}

const CATS = Object.keys(GEN);
function nextQuestion(focus) {
  // Mix: weaker categories come up more (accuracy from history).
  const acc = Object.fromEntries(E.groupAccuracy((a) => (a.mod === 'math' ? a.cat : null)).map((g) => [g.key, g.n >= 6 ? g.acc : 0.7]));
  const pool = focus ? [focus] : CATS;
  const ws = pool.map((c) => 1 + 2 * (1 - (acc[c] ?? 0.7)));
  let r = Math.random() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) if ((r -= ws[i]) <= 0) return GEN[pool[i]]();
  return GEN[pool[0]]();
}

/**
 * Run one 60s round inside body/foot. onDone({n, ok, acc, avgMs, score, misses})
 */
export function mountSprint(body, foot, { onDone, sid = null, focus = null, seconds = ROUND_SEC } = {}) {
  let n = 0, ok = 0, totalMs = 0, q = null, t0 = 0, over = false;
  const misses = [];
  const score = h('div.dstats');
  const qEl = h('div.mathq');
  const timer = timerBar(seconds, end);
  clear(body).append(timer.el, score, qEl);
  foot.classList.add('show');

  function draw() {
    clear(score).append(h('span', h('b', ok), ' correct'), h('span', h('b', n), ' answered'), h('span', h('b', n ? (totalMs / n / 1000).toFixed(1) + 's' : '—'), ' avg'));
    q = nextQuestion(focus);
    t0 = performance.now();
    clear(qEl).append(h('span.tag', E.CAT_LABEL[q.cat]), h('p.q', q.q));
    clear(foot).append(h('div.answers.grid2', q.opts.map((o, i) => h('button.ans.opt', { onclick: (e) => answer(i, e.currentTarget) }, o))));
  }

  function answer(i, btn) {
    if (over) return;
    const ms = performance.now() - t0;
    const good = i === q.correctIdx;
    n++; totalMs += ms;
    if (good) ok++; else misses.push({ ...q, picked: q.opts[i] });
    E.record({ mod: 'math', cat: q.cat, ok: good, ms: Math.round(ms), sid, leaks: [] });
    buzz(good);
    btn.classList.add(good ? 'flash-ok' : 'flash-bad');
    if (!good) foot.querySelectorAll('.ans')[q.correctIdx].classList.add('flash-ok');
    setTimeout(() => !over && draw(), good ? 120 : 650);
  }

  function end() {
    over = true;
    timer.stop();
    const res = { n, ok, acc: n ? ok / n : null, avgMs: n ? totalMs / n : null, score: ok, misses, date: Date.now() };
    let pb = false;
    store.update((s) => {
      s.math.rounds.push({ n, ok, acc: res.acc, avgMs: res.avgMs, date: res.date, focus });
      s.math.rounds = s.math.rounds.slice(-200);
      if (!focus && (!s.math.best || ok > s.math.best.score || (ok === s.math.best.score && res.avgMs < s.math.best.avgMs))) {
        s.math.best = { score: ok, acc: res.acc, avgMs: res.avgMs, date: res.date };
        pb = n > 0;
      }
    });
    res.pb = pb;
    clear(foot);
    foot.classList.remove('show');
    onDone && onDone(res);
  }

  draw();
  return { stop: () => { over = true; timer.stop(); } };
}

export function sprintSummary(res) {
  const best = store.get().math.best;
  return h('div.summary',
    h('div.card.center',
      h('h2', res.pb ? '🏆 New personal best!' : 'Round over'),
      h('div.bignum', res.ok),
      h('p.muted', `correct · ${pct(res.acc)} accuracy · ${res.avgMs ? (res.avgMs / 1000).toFixed(1) : '—'}s avg`),
      best ? h('p.fine', `PB: ${best.score} correct · ${pct(best.acc)} · ${(best.avgMs / 1000).toFixed(1)}s`) : null),
    res.misses.length ? h('div.card', h('h3', 'Misses'), h('ul.misses', res.misses.map((m) => h('li', h('p', m.q), h('span.bad', `You: ${m.picked}`), ' → ', h('span.good', m.opts[m.correctIdx]), h('p.fine', m.why))))) : null);
}

export function render(root) {
  const { el, body, foot } = screen('Math Sprint', { back: '#/' });
  root.append(el);
  let run = null;
  let focus = null;

  function setup() {
    run?.stop();
    const s = store.get().math;
    const byCat = E.groupAccuracy((a) => (a.mod === 'math' ? a.cat : null));
    const avgMs = Object.fromEntries(CATS.map((c) => {
      const l = E.attempts((a) => a.mod === 'math' && a.cat === c, 60);
      return [c, l.length ? l.reduce((x, a) => x + a.ms, 0) / l.length : null];
    }));
    const chipsEl = h('div.chips');
    const drawChips = () => clear(chipsEl).append(...[[null, 'Mixed'], ...CATS.map((c) => [c, E.CAT_LABEL[c]])].map(([c, l]) => h(`button.chip${focus === c ? '.on' : ''}`, { onclick: () => { focus = c; drawChips(); } }, l)));
    drawChips();
    clear(body).append(
      h('div.card',
        h('h2', '60-second rounds'),
        s.best ? h('div.kv', h('span', 'Personal best'), h('b', `${s.best.score} correct`), h('small.muted', ` ${pct(s.best.acc)} · ${(s.best.avgMs / 1000).toFixed(1)}s avg`)) : h('p.muted', 'No rounds yet.'),
        h('div.kv', h('span', 'Rounds played'), h('b', s.rounds.length))),
      h('div.card', h('h3', 'Focus'), chipsEl, h('p.fine', 'Personal bests only count on Mixed rounds.')),
      byCat.length ? h('div.card', h('h3', 'By category'), h('table.tbl', h('tr', h('th', ''), h('th', 'Acc'), h('th', 'Avg'), h('th', 'n')),
        byCat.map((g) => h('tr', h('td', E.CAT_LABEL[g.key]), h('td', pct(g.acc)), h('td', avgMs[g.key] ? (avgMs[g.key] / 1000).toFixed(1) + 's' : '—'), h('td', g.n))))) : null,
    );
    clear(foot).append(h('button.btn.primary.big', { onclick: start }, 'Go — 60s'));
    foot.classList.add('show');
  }

  function start() {
    run = mountSprint(body, foot, {
      focus,
      onDone: (res) => {
        E.recordDrillSession('math', { n: res.n, acc: res.acc }, { score: res.ok });
        clear(body).append(sprintSummary(res));
        clear(foot).append(h('div.answers', { style: { gridTemplateColumns: '1fr 1fr' } }, h('button.btn.big', { onclick: setup }, 'Done'), h('button.btn.primary.big', { onclick: start }, 'Again')));
        foot.classList.add('show');
      },
    });
  }

  setup();
  return () => run?.stop();
}
