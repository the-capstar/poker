/**
 * store.js — all persistent state lives in ONE localStorage key.
 *
 * Shape (schema v1):
 * {
 *   v: 1,
 *   settings: { gradeMode, bankroll{...}, tiltTriggers[], defaults{...} },
 *   leakBaseline: { f3b, vpip, pfr, aggr, steal, foldToSteal, hands, source },   // from HUD / HH import
 *   attempts: [ {t, mod, cat, spot, pos, hand, ans, ok, ms, freqOk, flags[], sid} ],  // capped ring buffer
 *   leitner: { "<itemKey>": {box, due} },  counters: { q: <global question counter> },
 *   sessions: [ {id, date, mode, minutes, checkin, steps{}, readiness, f3bAcc} ],
 *   math: { best: {score, acc, avgMs, date}, rounds: [...] },
 *   rangeOverrides: { "<spotId>": {ranges:{...}} },
 *   hhImports: []   // reserved for the hand-history hook (see js/hh-import.js)
 * }
 */

const KEY = 'pokerWarmup.v1';
const MAX_ATTEMPTS = 6000;

export const DEFAULT_STATE = () => ({
  v: 1,
  settings: {
    gradeMode: 'lenient', // 'lenient' = any action played ≥ 25% is correct; 'rng' = must match an RNG roll
    mixedThreshold: 0.25,
    bankroll: { total: 0, maxBuyinPct: 5, stakes: 'NL25', notes: 'Max 20 buy-ins for current stake. Move down after losing 5 buy-ins.' },
    defaults: { stopLossBI: 3, timeLimitMin: 120, tables: 2 },
    tiltTriggers: [
      'Getting 4-bet off my hand repeatedly',
      'Coolers / bad beats in big pots',
      'Running card-dead for an hour',
      'Playing past my stop-loss "to get it back"',
    ],
  },
  // Your 112k-hand HUD sample. The HH-import hook will overwrite this with recomputed stats.
  leakBaseline: { f3b: 14, vpip: 28, pfr: 16, aggr: 38, steal: 28, foldToSteal: 67, hands: 112000, source: 'HUD (manual)' },
  attempts: [],
  leitner: {},
  counters: { q: 0 },
  sessions: [],
  math: { best: null, rounds: [] },
  rangeOverrides: {},
  hhImports: [],
});

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_STATE();
    return migrate(JSON.parse(raw));
  } catch (e) {
    console.warn('State load failed, starting fresh', e);
    return DEFAULT_STATE();
  }
}

/** Fill in any keys added after the user's data was first saved. */
function migrate(s) {
  const d = DEFAULT_STATE();
  for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
  s.settings = { ...d.settings, ...s.settings, bankroll: { ...d.settings.bankroll, ...(s.settings || {}).bankroll }, defaults: { ...d.settings.defaults, ...(s.settings || {}).defaults } };
  return s;
}

export function get() {
  return state;
}

export function save() {
  try {
    if (state.attempts.length > MAX_ATTEMPTS) state.attempts = state.attempts.slice(-MAX_ATTEMPTS);
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Save failed (storage full?)', e);
  }
}

/** Mutate state with a callback, then persist. */
export function update(fn) {
  fn(state);
  save();
}

export function exportJSON() {
  return JSON.stringify({ app: 'poker-warmup', exportedAt: new Date().toISOString(), state }, null, 1);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  const s = parsed.state || parsed;
  if (!s || typeof s !== 'object' || !('attempts' in s)) throw new Error('Not a poker-warmup backup file');
  state = migrate(s);
  save();
}

export function resetAll() {
  state = DEFAULT_STATE();
  save();
}
