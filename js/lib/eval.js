/**
 * eval.js — small, dependency-free 5–7 card hand evaluator.
 * Returns a comparable integer (higher = better). Fast enough for Monte Carlo
 * equity in the range-seeding tool and future postflop/hand-reading drills.
 */
import { RANK_VALUE } from './hands.js';

const CAT = { HIGH: 0, PAIR: 1, TWO: 2, TRIPS: 3, STRAIGHT: 4, FLUSH: 5, FULL: 6, QUADS: 7, SF: 8 };

function score(cat, kickers) {
  let s = cat;
  for (let i = 0; i < 5; i++) s = s * 15 + (kickers[i] || 0);
  return s;
}

function straightHigh(mask) {
  // mask bit v set if rank value v present (2..14); ace also counts as 1
  if (mask & (1 << 14)) mask |= 1 << 1;
  for (let hi = 14; hi >= 5; hi--) {
    const need = 0b11111 << (hi - 4);
    if ((mask & need) === need) return hi;
  }
  return 0;
}

/** cards: array of strings like "As","Td". */
export function evaluate(cards) {
  const counts = new Array(15).fill(0);
  const suitMasks = { s: 0, h: 0, d: 0, c: 0 };
  const suitCounts = { s: 0, h: 0, d: 0, c: 0 };
  let mask = 0;
  for (const c of cards) {
    const v = RANK_VALUE[c[0]];
    counts[v]++;
    mask |= 1 << v;
    suitMasks[c[1]] |= 1 << v;
    suitCounts[c[1]]++;
  }
  // Flush / straight flush
  for (const s of 'shdc') {
    if (suitCounts[s] >= 5) {
      const sf = straightHigh(suitMasks[s]);
      if (sf) return score(CAT.SF, [sf]);
      const ks = [];
      for (let v = 14; v >= 2 && ks.length < 5; v--) if (suitMasks[s] & (1 << v)) ks.push(v);
      return score(CAT.FLUSH, ks);
    }
  }
  const quads = [], trips = [], pairs = [], singles = [];
  for (let v = 14; v >= 2; v--) {
    if (counts[v] === 4) quads.push(v);
    else if (counts[v] === 3) trips.push(v);
    else if (counts[v] === 2) pairs.push(v);
    else if (counts[v] === 1) singles.push(v);
  }
  if (quads.length) {
    const k = Math.max(...[...trips, ...pairs, ...singles, ...quads.slice(1)]);
    return score(CAT.QUADS, [quads[0], k]);
  }
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const p = Math.max(trips[1] || 0, pairs[0] || 0);
    return score(CAT.FULL, [trips[0], p]);
  }
  const st = straightHigh(mask);
  if (st) return score(CAT.STRAIGHT, [st]);
  if (trips.length) return score(CAT.TRIPS, [trips[0], ...[...pairs, ...singles].sort((a, b) => b - a).slice(0, 2)]);
  if (pairs.length >= 2) {
    const rest = [...pairs.slice(2), ...singles].sort((a, b) => b - a);
    return score(CAT.TWO, [pairs[0], pairs[1], rest[0]]);
  }
  if (pairs.length) return score(CAT.PAIR, [pairs[0], ...singles.slice(0, 3)]);
  return score(CAT.HIGH, singles.slice(0, 5));
}

export const HAND_CATEGORY = CAT;
export function categoryOf(scoreValue) {
  return Math.floor(scoreValue / 15 ** 5);
}
