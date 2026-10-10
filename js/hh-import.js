/**
 * hh-import.js — HOOK ONLY (not built yet).
 *
 * Future: import JSON from the poker-reader parser (schema v2) to
 *   (a) recompute real leak stats and overwrite state.leakBaseline (→ My Leaks card), and
 *   (b) turn the user's own hands into drills (custom spots + Leitner items).
 *
 * Expected input (schema v2, from poker-reader):
 *   { "schema_version": 2,
 *     "hands": [ { "hand_id": "…", "hero": "…", "positions": {"player": "BTN", …},
 *                  "actions": [ {"street": "preflop", "player": "…", "action": "raise",
 *                                "to_bb": 2.5, "added_bb": 2.5}, … ],
 *                  "hero_cards": ["As","Kd"], "board": [...] } ] }
 *
 * Contract the rest of the app already relies on:
 *   - leakBaseline keys: f3b, vpip, pfr, aggr, steal, foldToSteal (all %), hands, source
 *     (store.js) — the My Leaks card and engine.weakness() read these.
 *   - Drill spots are plain objects with the same shape as data/ranges/*.json spots
 *     (id, category, hero, villain, ip, line, actions, ranges, leaks[]). A spot built
 *     from a real hand can set `fixedHand: "AJo"` and be pushed into a synthetic
 *     ranges file via ranges.js → the drill engine needs no changes.
 */
import * as store from './store.js';

export const HH_SCHEMA_VERSION = 2;

/** Validate shape only. Returns {ok, count, error}. */
export function validate(json) {
  if (!json || json.schema_version !== HH_SCHEMA_VERSION) return { ok: false, error: `Expected schema_version ${HH_SCHEMA_VERSION}` };
  if (!Array.isArray(json.hands)) return { ok: false, error: 'Missing hands[]' };
  const bad = json.hands.find((x) => !x.hand_id || !Array.isArray(x.actions));
  if (bad) return { ok: false, error: 'Each hand needs hand_id and actions[] (with to_bb / added_bb)' };
  return { ok: true, count: json.hands.length };
}

/** (a) Recompute leak stats from hands → leakBaseline. TODO: implement counters. */
export function computeLeakStats(/* hands */) {
  throw new Error('Hand-history stats not implemented yet');
}

/** (b) Convert hands to drill spots. TODO: implement. */
export function handsToDrills(/* hands */) {
  throw new Error('Hand-history drills not implemented yet');
}

/** Entry point the Settings screen will call. */
export function importHandHistories(json) {
  const v = validate(json);
  if (!v.ok) throw new Error(v.error);
  const stats = computeLeakStats(json.hands);
  store.update((s) => {
    s.leakBaseline = { ...s.leakBaseline, ...stats, hands: v.count, source: 'Hand histories' };
    s.hhImports.push({ t: Date.now(), count: v.count });
  });
}
