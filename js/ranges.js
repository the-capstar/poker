/**
 * ranges.js — loads /data/ranges/*.json, applies in-app edits, builds strategies,
 * samples drill hands and grades answers (incl. mixed strategies).
 */
import { ALL_HANDS, comboCount, cellOf, RANKS, handAt } from './lib/hands.js';
import { buildStrategy } from './lib/notation.js';
import * as store from './store.js';

let files = []; // [{file, data}]
let spots = {}; // id -> spot (with overrides applied)
const stratCache = new Map();

export async function loadRanges() {
  const idx = await (await fetch('data/ranges/index.json')).json();
  files = await Promise.all(
    idx.files.map(async (f) => ({ file: f, data: await (await fetch('data/ranges/' + f)).json() }))
  );
  rebuild();
}

/** Re-index spots and apply user overrides from localStorage. */
export function rebuild() {
  spots = {};
  stratCache.clear();
  const ov = store.get().rangeOverrides || {};
  for (const { file, data } of files) {
    for (const s of data.spots) {
      const merged = { ...s, file };
      if (ov[s.id]?.ranges) {
        merged.ranges = ov[s.id].ranges;
        merged.edited = true;
      }
      spots[s.id] = merged;
    }
  }
}

export const getFiles = () => files;
export const getSpot = (id) => spots[id];
export const allSpots = () => Object.values(spots);
export const spotsWhere = (pred) => Object.values(spots).filter(pred);

/** Original (un-overridden) spot from the JSON file — used by the editor's export/reset. */
export function baseSpot(id) {
  for (const { data } of files) {
    const s = data.spots.find((x) => x.id === id);
    if (s) return s;
  }
  return null;
}

export function strategy(spotOrId) {
  const s = typeof spotOrId === 'string' ? spots[spotOrId] : spotOrId;
  if (!stratCache.has(s.id)) stratCache.set(s.id, buildStrategy(s.actions.filter((a) => !(s.decoys || []).includes(a)), s.ranges));
  return stratCache.get(s.id);
}

/** Overall frequency of each action across the hands a spot can be dealt (combo-weighted). */
export function actionTotals(spot) {
  const st = strategy(spot);
  const pool = basePool(spot);
  const tot = {};
  let w = 0;
  for (const h of ALL_HANDS) {
    const pw = pool[h];
    if (!pw) continue;
    w += pw;
    for (const [a, f] of Object.entries(st[h])) tot[a] = (tot[a] || 0) + pw * f;
  }
  for (const a in tot) tot[a] /= w;
  return tot;
}

/** Combo weights of hands that can reach this spot (opening range for facing-3bet; else all hands). */
function basePool(spot) {
  const pool = {};
  if (spot.sampleFrom && spots[spot.sampleFrom]) {
    const open = strategy(spots[spot.sampleFrom]);
    const openAct = spots[spot.sampleFrom].actions[0];
    for (const h of ALL_HANDS) pool[h] = comboCount(h) * (open[h][openAct] || 0);
  } else {
    for (const h of ALL_HANDS) pool[h] = comboCount(h);
  }
  return pool;
}

const majority = (mix) => Object.entries(mix).sort((a, b) => b[1] - a[1])[0][0];

/** A hand is "boundary" if it's mixed or a grid neighbour plays a different majority action. */
function isBoundary(st, h) {
  const mix = st[h];
  if (Math.max(...Object.values(mix)) < 0.9) return true;
  const [r, c] = cellOf(h);
  const m = majority(mix);
  for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
    const rr = r + dr, cc = c + dc;
    if (rr < 0 || cc < 0 || rr > 12 || cc > 12) continue;
    if (majority(st[handAt(rr, cc)]) !== m) return true;
  }
  return false;
}

/**
 * Drill sampling weights. Facing-3bet hands come combo-weighted from the opening
 * range (so your in-drill fold% is comparable to a real fold-to-3bet stat).
 * Other spots skip most trivial folds and over-weight the decision boundary.
 */
export function sampleWeights(spot) {
  const st = strategy(spot);
  const pool = basePool(spot);
  const def = spot.actions[spot.actions.length - 1];
  const w = {};
  for (const h of ALL_HANDS) {
    if (!pool[h]) continue;
    const b = isBoundary(st, h);
    if (spot.sampleFrom) w[h] = pool[h] * (b ? 1.8 : 1);
    else {
      const playable = (st[h][def] || 0) < 0.999;
      w[h] = pool[h] * (b ? 2.5 : playable ? 1 : 0.06);
    }
  }
  return w;
}

export function sampleHand(spot, rng = Math.random) {
  const w = sampleWeights(spot);
  const entries = Object.entries(w);
  let r = rng() * entries.reduce((s, [, x]) => s + x, 0);
  for (const [h, x] of entries) if ((r -= x) <= 0) return h;
  return entries[entries.length - 1][0];
}

/**
 * Grade an answer.
 * @returns {ok, best, freq, mix, rngBucket}
 *   lenient mode: correct if the action is played ≥ threshold (default 25%) — frequency-matching
 *   rng mode:     correct only if it matches the action band the RNG roll (0–99) falls in
 */
export function grade(spot, hand, answer, roll = null) {
  const mix = strategy(spot)[hand];
  const freq = mix[answer] || 0;
  const best = majority(mix);
  const { gradeMode, mixedThreshold } = store.get().settings;
  let ok;
  let rngBucket = null;
  if ((spot.decoys || []).includes(answer)) ok = false;
  else if (gradeMode === 'rng' && roll !== null) {
    rngBucket = bucketFor(spot, mix, roll);
    ok = answer === rngBucket;
  } else ok = freq >= mixedThreshold - 1e-6 || answer === best;
  return { ok, best, freq, mix, rngBucket };
}

function bucketFor(spot, mix, roll) {
  let acc = 0;
  for (const a of spot.actions) {
    acc += (mix[a] || 0) * 100;
    if (roll < acc) return a;
  }
  return spot.actions[spot.actions.length - 1];
}

export function mixLabel(mix, actions) {
  return actions
    .filter((a) => mix[a] > 0.001)
    .map((a) => `${label(a)} ${Math.round(mix[a] * 100)}%`)
    .join(' / ');
}

export function label(a) {
  return { '3bet': '3-bet', '4bet': '4-bet', jam: 'Jam', raise: 'Raise', call: 'Call', fold: 'Fold', limp: 'Limp' }[a] || a;
}

export { RANKS };
