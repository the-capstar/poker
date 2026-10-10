/**
 * hands.js — the 169 starting-hand classes, the 13x13 grid, combos and cards.
 *
 * Grid convention (standard chart layout):
 *   row i, col j over RANKS (A..2).
 *   i === j  -> pair        ("QQ")
 *   i <  j   -> suited      ("AKs")   (upper-right triangle)
 *   i >  j   -> offsuit     ("AKo")   (lower-left triangle)
 *
 * Pure module: no DOM, so it is shared by the browser app and tools/*.mjs.
 */

export const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
export const SUITS = ['s', 'h', 'd', 'c'];
export const RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, 14 - i])); // A=14 … 2=2

/** Hand-class name for grid cell (i, j). */
export function handAt(i, j) {
  if (i === j) return RANKS[i] + RANKS[j];
  return i < j ? RANKS[i] + RANKS[j] + 's' : RANKS[j] + RANKS[i] + 'o';
}

/** Grid cell [row, col] for a hand class. */
export function cellOf(hand) {
  const a = RANKS.indexOf(hand[0]);
  const b = RANKS.indexOf(hand[1]);
  if (hand.length === 2) return [a, a];
  return hand[2] === 's' ? [a, b] : [b, a];
}

/** All 169 classes in grid order. */
export const ALL_HANDS = (() => {
  const out = [];
  for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) out.push(handAt(i, j));
  return out;
})();

/** Unblocked combos for a class: pair 6, suited 4, offsuit 12. */
export function comboCount(hand) {
  if (hand.length === 2) return 6;
  return hand[2] === 's' ? 4 : 12;
}

export function handType(hand) {
  if (hand.length === 2) return 'pair';
  return hand[2] === 's' ? 'suited' : 'offsuit';
}

/** Enumerate concrete combos for a class, e.g. "AKs" -> [["As","Ks"], …]. */
export function combosOf(hand) {
  const [r1, r2] = [hand[0], hand[1]];
  const out = [];
  if (hand.length === 2) {
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) out.push([r1 + SUITS[a], r2 + SUITS[b]]);
  } else if (hand[2] === 's') {
    for (const s of SUITS) out.push([r1 + s, r2 + s]);
  } else {
    for (const s1 of SUITS) for (const s2 of SUITS) if (s1 !== s2) out.push([r1 + s1, r2 + s2]);
  }
  return out;
}

/** Pick a random concrete combo of a class (for display). */
export function randomCombo(hand, rng = Math.random) {
  const c = combosOf(hand);
  return c[Math.floor(rng() * c.length)];
}

/** Full 52-card deck as strings like "As". */
export function deck() {
  const d = [];
  for (const r of RANKS) for (const s of SUITS) d.push(r + s);
  return d;
}

/** Hand class of two concrete cards. */
export function classOf(c1, c2) {
  let [a, b] = [c1, c2];
  if (RANK_VALUE[a[0]] < RANK_VALUE[b[0]]) [a, b] = [b, a];
  if (a[0] === b[0]) return a[0] + b[0];
  return a[0] + b[0] + (a[1] === b[1] ? 's' : 'o');
}

export const SUIT_GLYPH = { s: '♠', h: '♥', d: '♦', c: '♣' };
