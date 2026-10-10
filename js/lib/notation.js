/**
 * notation.js — parse / serialize standard range notation with frequencies.
 *
 * Supported tokens (comma separated, whitespace ignored):
 *   AA  AKs  AKo  AK          single class (AK = AKs + AKo)
 *   22+                       pairs 22 up to AA
 *   99-66                     pair span
 *   A2s+   K9o+   QT+         kicker climbs up to one below the top card
 *   A5s-A2s   K9o-K6o         kicker span with same top card
 *   any token :0.5 or :50     frequency (0–1, or a percentage if > 1)
 *
 * A spot stores one string per action. Actions are applied IN ORDER and a
 * later action only receives the frequency still unassigned, e.g.
 *   { "4bet": "A5s:0.4", "call": "A5s" }  ->  A5s = 4bet 40% / call 60%
 * Whatever is left over goes to the spot's default action (usually fold).
 */
import { RANKS, ALL_HANDS, cellOf } from './hands.js';

const R = (c) => RANKS.indexOf(c); // 0 = A … 12 = 2

function expandToken(tok) {
  const t = tok.trim();
  if (!t) return [];
  let m;
  // Pair span "99-66" or plus "22+"
  if ((m = t.match(/^([2-9TJQKA])\1\+$/))) {
    const out = [];
    for (let i = R(m[1]); i >= 0; i--) out.push(RANKS[i] + RANKS[i]);
    return out;
  }
  if ((m = t.match(/^([2-9TJQKA])\1-([2-9TJQKA])\2$/))) {
    let [a, b] = [R(m[1]), R(m[2])];
    if (a > b) [a, b] = [b, a];
    const out = [];
    for (let i = a; i <= b; i++) out.push(RANKS[i] + RANKS[i]);
    return out;
  }
  if ((m = t.match(/^([2-9TJQKA])\1$/))) return [t];
  // Non-pair with optional suffix and modifiers
  if ((m = t.match(/^([2-9TJQKA])([2-9TJQKA])([so]?)\+$/))) {
    const [hi, lo, suf] = [R(m[1]), R(m[2]), m[3]];
    const out = [];
    for (let k = lo; k > hi; k--) out.push(...withSuffix(RANKS[hi] + RANKS[k], suf));
    return out;
  }
  if ((m = t.match(/^([2-9TJQKA])([2-9TJQKA])([so]?)-\1([2-9TJQKA])\3$/))) {
    const hi = R(m[1]);
    let [a, b] = [R(m[2]), R(m[4])];
    if (a > b) [a, b] = [b, a];
    const out = [];
    for (let k = a; k <= b; k++) if (k > hi) out.push(...withSuffix(RANKS[hi] + RANKS[k], m[3]));
    return out;
  }
  if ((m = t.match(/^([2-9TJQKA])([2-9TJQKA])([so]?)$/))) {
    // normalise order (e.g. "KA" -> "AK")
    let [a, b] = [m[1], m[2]];
    if (R(a) > R(b)) [a, b] = [b, a];
    return withSuffix(a + b, m[3]);
  }
  throw new Error(`Unrecognised range token "${tok}"`);
}

function withSuffix(base, suf) {
  return suf ? [base + suf] : [base + 's', base + 'o'];
}

/** Parse one notation string -> Map(hand -> freq 0..1). Later tokens override earlier ones. */
export function parseRange(str) {
  const map = new Map();
  if (!str) return map;
  for (const raw of str.split(',')) {
    if (!raw.trim()) continue;
    let [body, f] = raw.split(':');
    let freq = 1;
    if (f !== undefined) {
      freq = parseFloat(f);
      if (Number.isNaN(freq)) throw new Error(`Bad frequency in "${raw}"`);
      if (freq > 1) freq /= 100;
      freq = Math.max(0, Math.min(1, freq));
    }
    for (const h of expandToken(body)) map.set(h, freq);
  }
  return map;
}

/**
 * Build the full strategy for a spot.
 * @param {string[]} actions   e.g. ["4bet","call","fold"] — last one is the default/remainder action
 * @param {Object} ranges      {action: notationString}
 * @returns {Object} hand -> {action: freq}  (every hand present, freqs sum to 1)
 */
export function buildStrategy(actions, ranges) {
  const def = actions[actions.length - 1];
  const strat = {};
  for (const h of ALL_HANDS) strat[h] = {};
  const left = Object.fromEntries(ALL_HANDS.map((h) => [h, 1]));
  for (const a of actions) {
    if (a === def || !ranges[a]) continue;
    for (const [h, f] of parseRange(ranges[a])) {
      const take = Math.min(f, left[h]);
      if (take > 0.0001) {
        strat[h][a] = round3((strat[h][a] || 0) + take);
        left[h] -= take;
      }
    }
  }
  for (const h of ALL_HANDS) if (left[h] > 0.0001) strat[h][def] = round3(left[h]);
  return strat;
}

const round3 = (x) => Math.round(x * 1000) / 1000;

/**
 * Serialize Map(hand->freq) back into compact notation ("22+, A2s+, K9o-K6o:0.5 …").
 * Groups runs that share the same frequency.
 */
export function serializeRange(map) {
  const parts = [];
  const fmt = (body, f) => (f >= 0.999 ? body : `${body}:${+f.toFixed(2)}`);
  const get = (h) => map.get(h) || 0;

  // Pairs: walk from AA down
  let i = 0;
  while (i < 13) {
    const f = get(RANKS[i] + RANKS[i]);
    if (!f) { i++; continue; }
    let j = i;
    while (j + 1 < 13 && Math.abs(get(RANKS[j + 1] + RANKS[j + 1]) - f) < 1e-6) j++;
    const top = RANKS[i] + RANKS[i];
    const bot = RANKS[j] + RANKS[j];
    parts.push(fmt(i === 0 && j > 0 ? bot + '+' : i === j ? top : `${top}-${bot}`, f));
    i = j + 1;
  }
  // Non-pairs: per top card, per suit-type, walk kickers from just-below-top downward
  for (const suf of ['s', 'o']) {
    for (let hi = 0; hi < 12; hi++) {
      let k = hi + 1;
      while (k < 13) {
        const h = RANKS[hi] + RANKS[k] + suf;
        const f = get(h);
        if (!f) { k++; continue; }
        let e = k;
        while (e + 1 < 13 && Math.abs(get(RANKS[hi] + RANKS[e + 1] + suf) - f) < 1e-6) e++;
        const lowH = RANKS[hi] + RANKS[e] + suf;
        if (k === hi + 1 && e > k) parts.push(fmt(lowH + '+', f));
        else if (e === k) parts.push(fmt(h, f));
        else parts.push(fmt(`${h}-${lowH}`, f));
        k = e + 1;
      }
    }
  }
  return parts.join(', ');
}

/** Convert a strategy (hand -> {action: freq}) back to per-action notation strings. */
export function strategyToRanges(actions, strat) {
  const def = actions[actions.length - 1];
  const out = {};
  for (const a of actions) {
    if (a === def) continue;
    const m = new Map();
    for (const h of ALL_HANDS) if (strat[h][a] > 0.0001) m.set(h, strat[h][a]);
    // Order-of-application semantics: an action's stated freq must be its absolute share,
    // which holds because earlier actions never exceed what we serialize here.
    const s = serializeRange(m);
    if (s) out[a] = s;
  }
  return out;
}

/** Percentage of all 1326 combos covered by `pred(hand)` weighted by freq. */
export function comboShare(strat, actionFilter) {
  let num = 0;
  for (const h of ALL_HANDS) {
    const c = h.length === 2 ? 6 : h[2] === 's' ? 4 : 12;
    for (const [a, f] of Object.entries(strat[h])) if (actionFilter(a)) num += c * f;
  }
  return num / 1326;
}

export { cellOf };
