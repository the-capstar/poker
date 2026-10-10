# Poker Warm-Up

A mobile-first, offline-capable PWA for a 10–20 minute routine before a session. Every drill is weighted toward four known leaks (112k-hand sample):

| # | Leak | HUD | Target |
|---|------|-----|--------|
| 1 | Fold to 3-bet | 14% | 35–45% |
| 2 | VPIP/PFR gap | 28/16 (12 pts) | ≤ 5 pts |
| 3 | Postflop aggression freq | 38% | 45–55% |
| 4 | BTN steal / fold to steal | 28% / 67% | 35%+ / ≤ 55% |

No backend, no login, no build step. Plain HTML/CSS and ES-module JavaScript, hosted on GitHub Pages.

## What's built (MVP)

- **Guided Warm-Up** (Start Session Prep): pick Cash or MTT and 10, 15 or 20 minutes. The steps are check-in → facing 3-bet → preflop → math sprint → readiness score. The facing 3-bet step runs in every warm-up until you score above 85% in 3 warm-ups in a row. After that it comes back as a refresher every 3rd warm-up.
- **Facing 3-Bet Trainer**: 30 spots (each open position × each 3-bettor × small/large sizing, IP/OOP). You answer 4-bet, call or fold, and mixed frequencies are supported. Hands are dealt combo-weighted from your opening range, so your in-drill fold % compares directly to a fold-to-3-bet stat. It is shown next to the chart's own fold % for the same hands and the 35–45% target.
- **Preflop Range Trainer**: RFI, facing opens, BB defence, steals and steal defence, squeezes, 3–5-handed play, and MTT push/fold (6–15bb, ante on/off) plus reshoves (12–25bb). "Limp" is always offered on opens and is always wrong. A flat that should be a 3-bet or fold gets flagged ⚑, and both feed a **raise-or-fold discipline** score.
- **Math Sprint**: 60-second rounds covering pot odds, MDF, alpha, outs → equity (rule of 2/4 with the over-8-outs correction), combos with card removal, SPR and implied odds. It tracks accuracy, average time and personal bests.
- **Mental Check-In**: 1–5 ratings, stop-loss, time limit, table count and a bankroll reminder. If readiness is low it flags it but never blocks you. It ends with a one-line "today's focus" taken from your weakest leak.
- **My Leaks card**, **Leak Dashboard** (by module, position and spot type, with your 3 weakest areas), **History** with day streaks 🔥, and a **Leitner** spaced-repetition queue (missed spots come back within ~4 questions).
- **Range Editor**: paint the 13×13 grid or edit the range text, then export the JSON file.
- **Settings**: grading mode, bankroll, tilt triggers, HUD baseline, and JSON export/import backup.

**Next up, one at a time:** Postflop Spot Trainer (leak #3), Hand Reading Quiz, Tournament Pressure (ICM). The home screen already has placeholder tiles for them, and the warm-up has a `postflop` step waiting to be switched on (`js/modules/warmup.js` → `STEP_DEFS`).

## Ranges: baseline approximations, not solver output

All charts live in `data/ranges/*.json`:

| File | Contents |
|------|----------|
| `cash-rfi.json` | 6-max 100bb opens, UTG–SB (2.5x, SB 3x raise-or-fold) |
| `cash-facing-open.json` | IP flats/3-bets, SB 3-bet-or-fold, BB defence, squeezes |
| `cash-facing-3bet.json` | 30 facing-3-bet spots |
| `cash-shorthanded.json` | 3–5-handed adjustments |
| `mtt-pushfold.json` | 8-handed jam/fold and reshove ranges |

### Spot format

```json
{
  "id": "F3B_CO_vs_BTN_small",
  "category": "facing3bet",
  "hero": "CO", "villain": "BTN", "ip": false, "sizing": "small",
  "sampleFrom": "RFI_CO",
  "line": "You open 2.5bb from CO. BTN 3-bets to 7.5bb (3x). You're OUT of position.",
  "actions": ["4bet", "call", "fold"],
  "ranges": {
    "4bet": "QQ+, AKs, AKo:0.8, A5s:0.5, A4s:0.5",
    "call": "JJ-33, AQ, AJs, ATs, KQs, A5s, A4s"
  },
  "notes": { "A5s": "Optional custom 1-line reason for this hand" }
}
```

- **Notation:** `AA`, `AKs`, `AKo`, `AK` (both suits), `22+`, `99-66`, `A2s+`, `K9o-K6o`. Add `:0.4` (or `:40`) for a frequency.
- **Order matters:** actions are applied in the order listed, and a later action only gets the frequency still left. Above, A5s = 4-bet 50% / call 50%. Whatever is left over goes to the **last** action (fold).
- `decoys` (e.g. `["limp"]`) appear as buttons but are always graded wrong.
- `sampleFrom` deals hands only from that spot's range. Facing-3-bet spots use your opening range.
- `leaks` tags which My Leaks row a spot feeds: `f3b`, `vpip`, `steal`, `aggr`.

### Three ways to swap in your own solver charts

1. **On your phone:** open Range Editor, pick a spot, then paint the grid or paste notation and tap **Save**. Drills use your version right away (it's stored on the device). Tap **⬇ File** to download the whole JSON file with your edits merged in.
2. **On your PC:** open the file in `data/ranges/`, replace the `ranges` strings, commit and push. The deploy workflow checks that every range parses before publishing.
3. **Re-seed:** `node tools/build-ranges.mjs` regenerates every file from the tables inside that script. It **overwrites** the JSON, so don't run it after hand-editing the files.

Mixed grading: **Lenient** (default) counts any action the chart plays at least 25% of the time as correct. **RNG** shows a 0–99 roll, and you must pick the action whose frequency band contains it. Change this in Settings.

## Deploy / redeploy

Every push to `main` deploys automatically through `.github/workflows/pages.yml`. The workflow:

1. checks all range JSON and notation,
2. stamps the commit SHA into `sw.js` and `version.json`,
3. publishes to Pages.

Phones that already have the app show a "New version ready — tap to reload" banner on their next online launch.

To redeploy after editing ranges: commit → push to `main` → wait about 1 minute (watch the **Actions** tab) → reopen the app.

### Run locally

```bash
npx http-server -c-1 .     # or: python -m http.server
# open http://localhost:8080
```

ES modules and the service worker need http(s); opening `index.html` as a file won't work.

## Data & backup

All progress is stored in `localStorage` under the key `pokerWarmup.v1`. This covers attempts, Leitner boxes, sessions, math PBs, settings and range edits. **Settings → Export JSON** saves a backup, and **Import JSON** restores it. iOS can clear site data for apps you haven't used in a while, so export now and then.

## Hand-history import (hook, not built)

`js/hh-import.js` defines the contract for poker-reader JSON (schema v2: `hand_id`, `actions[]` with `to_bb`/`added_bb`):

- `computeLeakStats(hands)` → overwrites `leakBaseline`, which updates the My Leaks card;
- `handsToDrills(hands)` → spot objects in the same shape as the range JSON, so the drill engine needs no changes.

## Code map

```
index.html, manifest.webmanifest, sw.js   PWA shell + offline cache
css/app.css                               dark, mobile-first styles
js/app.js                                 boot + hash router
js/store.js                               localStorage state, export/import
js/ranges.js                              load JSON, overrides, sampling, mixed grading
js/engine.js                              attempts, Leitner, leak metrics, streaks, readiness
js/reasons.js                             1-line answer explanations
js/ui.js                                  DOM helpers, cards, 13x13 grid, timer
js/lib/{hands,notation,eval}.js           hand classes, range notation, hand evaluator
js/modules/*.js                           one file per screen
tools/build-ranges.mjs                    seed script for data/ranges
```
