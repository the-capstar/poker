/**
 * engine.js — the learning engine: attempt logging, Leitner spaced repetition,
 * accuracy aggregation, leak metrics, readiness score and streaks.
 */
import * as store from './store.js';

/* ------------------------------------------------------------------ */
/* Attempts                                                            */
/* ------------------------------------------------------------------ */

/** Log one answered question and update its Leitner box. */
export function record(a) {
  store.update((s) => {
    s.counters.q++;
    s.attempts.push({ t: Date.now(), ...a });
    if (a.item) leitnerUpdate(s, a.item, a.ok);
  });
}

export function attempts(filter = () => true, limit = Infinity) {
  const all = store.get().attempts.filter(filter);
  return limit === Infinity ? all : all.slice(-limit);
}

export function accuracy(list) {
  if (!list.length) return null;
  return list.filter((a) => a.ok).length / list.length;
}

/* ------------------------------------------------------------------ */
/* Leitner boxes — missed items come back fast, known items drift away */
/* ------------------------------------------------------------------ */
// Interval measured in "questions answered anywhere in the app" — keeps it simple and
// lets a missed spot reappear within the same warm-up.
const INTERVAL = [0, 4, 12, 35, 90, 220];

function leitnerUpdate(s, key, ok) {
  const it = s.leitner[key] || { box: 0, due: 0, misses: 0 };
  if (ok) it.box = Math.min(5, it.box + 1);
  else {
    it.box = 1;
    it.misses++;
  }
  it.due = s.counters.q + INTERVAL[it.box];
  // Items that have been in the top box and are answered right again graduate (deleted).
  if (ok && it.box === 5 && it.graduating) delete s.leitner[key];
  else {
    if (it.box === 5) it.graduating = true;
    s.leitner[key] = it;
  }
}

/** Due review items whose key passes `pred` — lowest box first. Key format "spotId|hand". */
export function dueItems(pred = () => true) {
  const s = store.get();
  return Object.entries(s.leitner)
    .filter(([k, v]) => v.due <= s.counters.q && pred(k))
    .sort((a, b) => a[1].box - b[1].box || a[1].due - b[1].due)
    .map(([k, v]) => ({ key: k, ...v }));
}

export function leitnerSummary() {
  const boxes = [0, 0, 0, 0, 0, 0];
  for (const v of Object.values(store.get().leitner)) boxes[v.box]++;
  return boxes;
}

/* ------------------------------------------------------------------ */
/* Leak metrics (powers the "My Leaks" card)                           */
/* ------------------------------------------------------------------ */
const WINDOW = 400; // most recent answers per leak

export const LEAKS = [
  { id: 'f3b', name: 'Fold to 3-bet', real: (b) => `${b.f3b}%`, target: '35–45%' },
  { id: 'vpip', name: 'VPIP/PFR gap', real: (b) => `${b.vpip - b.pfr} pts (${b.vpip}/${b.pfr})`, target: '≤ 5 pts' },
  { id: 'aggr', name: 'Postflop aggression', real: (b) => `${b.aggr}%`, target: '45–55%' },
  { id: 'steal', name: 'BTN steal / Fold to steal', real: (b) => `${b.steal}% / ${b.foldToSteal}%`, target: '35%+ / ≤ 55%' },
];

export function leakStats(id) {
  const list = attempts((a) => (a.leaks || []).includes(id), WINDOW);
  const out = { n: list.length, acc: accuracy(list), trend: trend(list) };
  if (id === 'f3b') {
    const f = list.filter((a) => a.cat === 'facing3bet');
    out.userFold = f.length ? f.filter((a) => a.ans === 'fold').length / f.length : null;
    out.chartFold = f.length ? f.reduce((s, a) => s + (a.mix?.fold || 0), 0) / f.length : null;
    const oop = f.filter((a) => !a.ip), ip = f.filter((a) => a.ip);
    out.oopAcc = accuracy(oop);
    out.ipAcc = accuracy(ip);
  }
  if (id === 'vpip') {
    const bad = list.filter((a) => (a.flags || []).some((f) => f === 'limp' || f === 'badFlat')).length;
    out.discipline = list.length ? 1 - bad / list.length : null;
    out.limps = list.filter((a) => (a.flags || []).includes('limp')).length;
    out.badFlats = list.filter((a) => (a.flags || []).includes('badFlat')).length;
  }
  if (id === 'steal') {
    const opens = list.filter((a) => a.cat === 'steal' && a.pos === 'BTN');
    out.userSteal = opens.length ? opens.filter((a) => a.ans === 'raise').length / opens.length : null;
    out.chartSteal = opens.length ? opens.reduce((s, a) => s + (a.mix?.raise || 0), 0) / opens.length : null;
    const def = list.filter((a) => a.cat === 'stealDefense');
    out.userFoldSteal = def.length ? def.filter((a) => a.ans === 'fold').length / def.length : null;
    out.chartFoldSteal = def.length ? def.reduce((s, a) => s + (a.mix?.fold || 0), 0) / def.length : null;
  }
  if (id === 'aggr') {
    // Filled in by the Postflop Spot Trainer (module 5). Attempts tagged leaks:['aggr'] with
    // flags 'aggrCorrect' (chose bet/raise when that was right) feed this.
    const shouldBet = list.filter((a) => (a.flags || []).includes('shouldAggress'));
    out.aggrWhenCorrect = shouldBet.length ? shouldBet.filter((a) => (a.flags || []).includes('aggrCorrect')).length / shouldBet.length : null;
  }
  return out;
}

/** Accuracy over last 7 days minus the 7 before (null if too little data). */
function trend(list) {
  const now = Date.now(), wk = 7 * 864e5;
  const a = list.filter((x) => now - x.t < wk), b = list.filter((x) => now - x.t >= wk && now - x.t < 2 * wk);
  if (a.length < 10 || b.length < 10) return null;
  return accuracy(a) - accuracy(b);
}

/** Leak weakness 0..1 (higher = weaker). Falls back to the HUD stat distance when there's little drill data. */
export function weakness(id) {
  const st = leakStats(id);
  const b = store.get().leakBaseline;
  const hud = {
    f3b: Math.min(1, Math.max(0, (35 - b.f3b) / 35)),
    vpip: Math.min(1, Math.max(0, (b.vpip - b.pfr - 5) / 15)),
    aggr: Math.min(1, Math.max(0, (45 - b.aggr) / 45)),
    steal: Math.min(1, Math.max(0, (35 - b.steal) / 35 + (b.foldToSteal - 55) / 100)),
  }[id];
  if (st.n < 15 || st.acc === null) return hud;
  return 0.5 * hud + 0.5 * (1 - st.acc);
}

export function weakestLeak({ includeAggr = false } = {}) {
  return LEAKS.filter((l) => includeAggr || l.id !== 'aggr').map((l) => ({ ...l, w: weakness(l.id) })).sort((a, b) => b.w - a.w)[0];
}

/** One-line "today's focus" derived from the weakest leak and *how* it is weak. */
export function todaysFocus() {
  const leak = weakestLeak();
  const st = leakStats(leak.id);
  switch (leak.id) {
    case 'f3b': {
      const worseOOP = st.oopAcc !== null && st.ipAcc !== null ? st.oopAcc <= st.ipAcc : true;
      if (st.userFold !== null && st.chartFold !== null && st.userFold > st.chartFold + 0.06)
        return `Defend more vs 3-bets ${worseOOP ? 'OOP' : 'IP'} — you're over-folding in drills now`;
      return `Fold more vs 3-bets ${worseOOP ? 'OOP' : 'IP'} — offsuit broadways and weak Ax are folds`;
    }
    case 'vpip':
      return st.badFlats > st.limps ? 'Raise or fold: 3-bet or fold instead of flatting, especially from the SB' : 'Raise or fold: never open-limp, never flat the SB';
    case 'steal':
      return st.userFoldSteal !== null && st.userFoldSteal > (st.chartFoldSteal || 0) + 0.05
        ? 'Defend the blinds wider vs BTN/CO steals — stop folding suited and connected hands'
        : 'Open every BTN steal hand: any suited K, Q3s+, all Ax';
    default:
      return 'Bet/raise when you have the range edge — fewer check-calls';
  }
}

/* ------------------------------------------------------------------ */
/* Dashboard aggregation                                               */
/* ------------------------------------------------------------------ */
export function groupAccuracy(keyFn, list = attempts(() => true, 3000)) {
  const g = {};
  for (const a of list) {
    const k = keyFn(a);
    if (k == null) continue;
    (g[k] ||= { n: 0, ok: 0 }).n++;
    if (a.ok) g[k].ok++;
  }
  return Object.entries(g).map(([k, v]) => ({ key: k, n: v.n, acc: v.ok / v.n })).sort((a, b) => a.acc - b.acc);
}

export const CAT_LABEL = {
  facing3bet: 'Facing 3-bet', rfi: 'RFI (EP)', steal: 'Steals (CO/BTN/SB)', facingOpen: 'Facing open', bbDefense: 'BB defence',
  stealDefense: 'Blind vs steal', squeeze: 'Squeeze', shorthanded: 'Short-handed', push: 'Push/fold', reshove: 'Reshove',
  potodds: 'Pot odds', mdf: 'MDF', alpha: 'Bluff break-even', outs: 'Outs → equity', combos: 'Combos/blockers', spr: 'SPR', implied: 'Implied odds',
};

export function weakestAreas(n = 3) {
  return groupAccuracy((a) => (a.mod === 'math' ? `math:${a.cat}` : `${a.cat}:${a.pos || ''}`))
    .filter((g) => g.n >= 5)
    .slice(0, n)
    .map((g) => {
      const [cat, pos] = g.key.split(':');
      const name = cat === 'math' ? `Math · ${CAT_LABEL[pos] || pos}` : `${CAT_LABEL[cat] || cat}${pos ? ' · ' + pos : ''}`;
      return { ...g, name };
    });
}

/* ------------------------------------------------------------------ */
/* Sessions, streaks, readiness                                        */
/* ------------------------------------------------------------------ */
export function dayKey(t = Date.now()) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function streak() {
  const days = new Set(store.get().sessions.map((s) => dayKey(s.date)));
  let n = 0;
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1); // today not done yet doesn't break the streak
  while (days.has(dayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  const best = bestStreak(days);
  return { current: n, best: Math.max(best, n), doneToday: days.has(dayKey()) };
}

function bestStreak(days) {
  const sorted = [...days].sort();
  let best = 0, run = 0, prev = null;
  for (const k of sorted) {
    const t = new Date(k + 'T12:00:00').getTime();
    run = prev !== null && Math.round((t - prev) / 864e5) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

/** Check-in component 0–100 from sleep/energy/focus/mood (1–5 each). */
export function checkinScore(c) {
  if (!c) return null;
  const vals = ['sleep', 'energy', 'focus', 'mood'].map((k) => c[k] || 3);
  return Math.round(((vals.reduce((a, b) => a + b, 0) / vals.length - 1) / 4) * 100);
}

/** Readiness = 40% check-in + 60% drill accuracy (accuracy alone if no check-in). */
export function readiness(checkin, drillAcc) {
  const c = checkinScore(checkin);
  if (drillAcc == null) return c;
  const d = Math.round(drillAcc * 100);
  return c == null ? d : Math.round(0.4 * c + 0.6 * d);
}

/**
 * Facing-3bet drill is mandatory in every warm-up until the last 3 warm-ups each hit > 85%
 * (with at least 8 hands). After that it's a maintenance step every 3rd warm-up.
 */
export function f3bGraduated() {
  const ws = store.get().sessions.filter((s) => s.type === 'warmup' && s.f3b && s.f3b.n >= 8).slice(-3);
  return ws.length === 3 && ws.every((s) => s.f3b.acc > 0.85);
}

export function f3bRequiredToday() {
  if (!f3bGraduated()) return { required: true, reason: 'Mandatory until > 85% in 3 straight warm-ups' };
  const n = store.get().sessions.filter((s) => s.type === 'warmup').length;
  return { required: n % 3 === 0, reason: 'Graduated — maintenance rep every 3rd warm-up' };
}

/** Standalone drills (≥ 5 answers) count as sessions for history and streaks. */
export function recordDrillSession(type, out, extra = {}) {
  if (!out || out.n < 5) return;
  store.update((s) => s.sessions.push({ id: 'd' + Date.now(), type, date: Date.now(), n: out.n, acc: out.acc, ...extra }));
}
