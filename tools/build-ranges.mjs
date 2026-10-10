#!/usr/bin/env node
/**
 * build-ranges.mjs — SEED script that wrote the baseline JSON in /data/ranges.
 *
 *   node tools/build-ranges.mjs           # rewrite data/ranges/*.json from the tables below
 *   node tools/build-ranges.mjs --check   # print stats only, write nothing
 *
 * ⚠  Running this OVERWRITES data/ranges/*.json. If you've pasted in your own
 *    solver charts, edit the JSON directly (or use the in-app editor) and do
 *    not re-run this script — or port your changes into the tables here first.
 *
 * Every range here is a hand-built BASELINE APPROXIMATION of 6-max 100bb
 * cash (2.5x opens, 3x SB) and short-stack MTT play. It is not solver output.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_HANDS, comboCount, combosOf, deck } from '../js/lib/hands.js';
import { buildStrategy, parseRange, serializeRange } from '../js/lib/notation.js';
import { evaluate } from '../js/lib/eval.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'ranges');
const CHECK = process.argv.includes('--check');
const DISCLAIMER = 'Baseline approximations, not solver output. Replace with your own solver charts via the in-app editor or by editing this file.';

/* ------------------------------------------------------------------ */
/* 1. Cash 6-max 100bb — raise first in                                */
/* ------------------------------------------------------------------ */
const RFI = {
  UTG: '22+, A2s+, K9s+, Q9s+, J9s+, T9s, 98s, 87s:0.5, 76s:0.5, AJo+, KQo, ATo:0.5, KJo:0.5',
  HJ: '22+, A2s+, K7s+, Q9s+, J9s+, T8s+, 97s+, 87s, 76s, 65s:0.5, ATo+, KJo+, QJo, KTo:0.5',
  CO: '22+, A2s+, K4s+, Q6s+, J7s+, T7s+, 96s+, 86s+, 75s+, 64s:0.5, 54s, A8o+, A5o:0.5, KTo+, QTo+, JTo, K9o:0.5, T9o:0.5',
  BTN: '22+, A2s+, K2s+, Q3s+, J5s+, T6s+, 96s+, 85s+, 74s+, 64s+, 53s+, 43s, A2o+, K8o+, Q9o+, J9o+, T8o+, 98o, 87o:0.5, K7o:0.5, K6o:0.25, Q8o:0.5, 97o:0.25',
  SB: '22+, A2s+, K2s+, Q4s+, J6s+, T6s+, 96s+, 85s+, 75s+, 64s+, 54s, A2o+, K8o+, Q9o+, J9o+, T9o, K7o:0.5, Q8o:0.5, 98o:0.5, T8o:0.5',
};
const RFI_NOTE = {
  UTG: 'Five players behind: linear, strong range. Small pairs and suited wheel aces play well; offsuit broadways below KQ/AJ get dominated.',
  HJ: 'Four behind: add suited kings/connectors and ATo/KJo. Still no offsuit junk.',
  CO: 'Three behind: wide steal. Suited hands down to K4s/Q6s, offsuit broadways, A8o+.',
  BTN: 'Only the blinds behind + position all hand: open ~45%. Any suited king, most suited queens, every offsuit ace.',
  SB: 'Raise-or-fold baseline vs BB (3x). Solvers mix limps at low rake, but for your VPIP/PFR leak the drill treats every limp as wrong.',
};

/* ------------------------------------------------------------------ */
/* 2. Facing a single open (IP flats, SB 3-bet-or-fold, BB defence)    */
/* ------------------------------------------------------------------ */
const FACING_OPEN = [
  // hero, villain, 3bet, call
  ['HJ', 'UTG', 'QQ+, AK, JJ:0.5, AQs:0.5, A5s:0.6, A4s:0.4, KQs:0.4, AQo:0.3', 'JJ, TT-88, 77:0.5, AQs, AJs:0.7, KQs:0.6'],
  ['CO', 'UTG', 'QQ+, AK, JJ:0.6, TT:0.3, AQs:0.6, AJs:0.3, KQs:0.5, A5s:0.7, A4s:0.5, AQo:0.3', 'JJ, TT:0.7, 99-77, 66:0.5, AQs, AJs:0.7, ATs:0.5, KQs:0.5, KJs:0.5, QJs:0.5, JTs:0.5'],
  ['CO', 'HJ', 'JJ+, AK, AQs, TT:0.5, AJs:0.5, KQs:0.6, KJs:0.3, QJs:0.2, A5s, A4s, A3s:0.4, AQo:0.6, 76s:0.2, 65s:0.2', 'TT, 99-66, AJs, ATs:0.6, KQs, KJs:0.5, QJs:0.5, JTs:0.6, T9s:0.4'],
  ['BTN', 'UTG', 'QQ+, AK, JJ:0.5, AQs:0.5, A5s:0.6, A4s:0.4, KQs:0.4, AQo:0.3', 'JJ, TT-22, AQs, AJs, ATs, KQs, KJs, KTs, QJs, QTs:0.5, JTs, T9s, 98s, 87s:0.5, 76s:0.5, AQo:0.4, AJo:0.3'],
  ['BTN', 'HJ', 'JJ+, AK, AQs, TT:0.5, AJs:0.5, KQs:0.5, KJs:0.3, A5s, A4s, A3s:0.5, AQo:0.6, AJo:0.2, 65s:0.3, 54s:0.3', 'TT, 99-22, AJs, ATs, A9s:0.5, KQs, KJs:0.7, KTs, QJs, QTs, JTs, J9s:0.5, T9s, 98s, 87s, 76s:0.5, AQo, AJo:0.4, KQo:0.5'],
  ['BTN', 'CO', 'TT+, AK, AQ, AJs, ATs:0.5, KQs, KJs:0.5, K9s:0.3, QJs:0.4, JTs:0.3, A5s-A2s, AJo:0.5, KQo:0.4, 99:0.3, 76s:0.4, 65s:0.4, 54s:0.3', '99, 88-22, ATs, A9s-A6s:0.5, KJs, KTs, K9s:0.4, QJs, QTs, Q9s:0.5, JTs, J9s, T9s, T8s:0.5, 98s, 87s, 76s:0.6, 65s:0.4, AJo, KQo:0.6, ATo:0.3, KJo:0.3'],
  ['SB', 'UTG', 'TT+, AK, AQs, AJs:0.6, KQs:0.6, A5s:0.7, A4s:0.5, 99:0.5, AQo:0.5', ''],
  ['SB', 'HJ', '99+, AK, AQ, AJs, ATs:0.6, KQs, KJs:0.5, QJs:0.4, A5s, A4s, A3s:0.4, 88:0.4, AJo:0.3, KQo:0.3', ''],
  ['SB', 'CO', '88+, 77:0.5, 66:0.3, AK, AQ, AJ, ATs, A9s:0.5, KQs, KJs, KTs:0.6, K9s:0.3, QJs, QTs:0.5, JTs:0.6, T9s:0.4, 98s:0.3, A5s-A2s, KQo, ATo:0.4, KJo:0.4', ''],
  ['SB', 'BTN', '66+, 55:0.5, 44:0.3, A2s+, K8s+, K7s:0.5, K6s:0.3, Q9s+, J9s+, T8s+, 97s+, 87s, 76s, 65s:0.6, 54s:0.4, ATo+, A9o:0.4, KJo+, KTo:0.5, QJo:0.6, QTo:0.3, JTo:0.4', ''],
  // BB defence vs 2.5x (vs SB 3x)
  ['BB', 'UTG', 'QQ+, AK, JJ:0.4, AQs:0.4, A5s:0.5, A4s:0.4, KQs:0.3', 'JJ, TT-22, AQs, AJs-A2s, K9s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 64s+, 54s, AQo, AJo:0.7, KQo:0.7, KJo:0.3, QJo:0.3'],
  ['BB', 'HJ', 'JJ+, AK, AQs, TT:0.4, AJs:0.4, KQs:0.5, A5s:0.6, A4s:0.5, A3s:0.3, AQo:0.4, 76s:0.15, 65s:0.15', '22+, A2s+, K6s+, Q8s+, J8s+, T7s+, 96s+, 85s+, 74s+, 64s+, 53s+, 43s:0.5, ATo+, KTo+, QTo+, JTo, A9o:0.5, T9o:0.5'],
  ['BB', 'CO', 'TT+, 99:0.3, AK, AQ, AJs, ATs:0.5, KQs, KJs:0.5, K9s:0.2, QJs:0.3, A5s-A2s:0.6, AJo:0.3, KQo:0.3, 76s:0.3, 65s:0.3, 54s:0.2', '22+, A2s+, K2s+, Q5s+, J6s+, T6s+, 95s+, 85s+, 74s+, 63s+, 53s+, 43s, A7o+, A5o:0.5, K9o+, Q9o+, J9o+, T8o+, 98o, 87o:0.5'],
  ['BB', 'BTN', '99+, 88:0.4, AK, AQ, AJ, ATs, A9s:0.4, KQs, KJs, KTs:0.5, K9s:0.3, QJs:0.6, QTs:0.3, Q9s:0.2, JTs:0.4, J9s:0.2, T9s:0.3, A5s-A2s:0.6, KQo:0.5, ATo:0.3, 76s:0.3, 65s:0.3, 54s:0.3', '22+, A2s+, K2s+, Q2s+, J3s+, T5s+, 95s+, 84s+, 74s+, 63s+, 52s+, 42s+, 32s, A2o+, K5o+, K4o:0.5, Q8o+, Q7o:0.5, J8o+, T8o+, 97o+, 87o, 86o:0.5, 76o, 65o:0.5'],
  ['BB', 'SB', '88+, 77:0.4, A9s+, A5s-A2s, KTs+, K9s:0.5, K5s:0.3, QTs+, Q8s:0.2, JTs, J8s:0.2, T9s:0.5, 98s:0.3, 87s:0.3, A9o+, KJo+, QJo:0.5', '22+, A2s+, K2s+, Q2s+, J4s+, T6s+, 96s+, 85s+, 74s+, 63s+, 53s+, 43s, A2o+, K7o+, K6o:0.5, K5o:0.5, Q8o+, J8o+, T8o+, 98o, 87o, 76o:0.5'],
];
const IP_OF = (hero, villain) => (hero === 'SB' ? false : hero === 'BB' ? villain === 'SB' : true);

/* Squeezes: [id, hero, opener, caller, 3bet, call] */
const SQUEEZE = [
  ['SQ_SB_CO_BTN', 'SB', 'CO', 'BTN', 'TT+, 99:0.4, AK, AQs, AJs:0.5, KQs:0.5, A5s, A4s:0.6, AQo:0.5', ''],
  ['SQ_BB_CO_BTN', 'BB', 'CO', 'BTN', 'JJ+, TT:0.4, AK, AQs, AJs:0.4, KQs:0.4, A5s:0.6, A4s:0.4, AQo:0.3, 76s:0.2, 65s:0.2', 'TT, 99-22, A2s+, K8s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 64s+, 54s, AQo, AJo, ATo:0.4, KQo, KJo:0.5, QJo:0.3'],
  ['SQ_BTN_HJ_CO', 'BTN', 'HJ', 'CO', 'QQ+, JJ:0.5, AK, AQs:0.5, KQs:0.3, A5s:0.6, A4s:0.4', 'JJ, TT-22, AQs, AJs, ATs, KQs, KJs, QJs, JTs, T9s, 98s, 87s, 76s:0.5, AQo:0.4'],
  ['SQ_SB_UTG_BTN', 'SB', 'UTG', 'BTN', 'QQ+, JJ:0.4, AK, AQs:0.4, A5s:0.4', ''],
  ['SQ_BB_BTN_SB', 'BB', 'BTN', 'SB', 'TT+, 99:0.3, AK, AQ, AJs, ATs:0.5, KQs, KJs:0.4, A5s-A3s:0.5, 65s:0.2', '99, 88-22, A2s+, K2s+, Q5s+, J7s+, T7s+, 96s+, 85s+, 75s+, 64s+, 54s, 43s:0.5, AJo, ATo, A9o:0.5, KTo+, QJo, QTo:0.5, JTo'],
];

/* ------------------------------------------------------------------ */
/* 3. Facing a 3-bet after we open (100bb)                             */
/* ------------------------------------------------------------------ */
// Per opener: OOP (3-bettor acts after us preflop, plays IP) and IP (3-bettor in the blinds).
// Each has small/large sizing. Order: 4bet string, call string.
const F3B = {
  UTG: {
    oop: {
      small: ['KK+, QQ:0.3, AKs:0.7, AKo:0.5, A5s:0.4, A4s:0.3', 'QQ-66, 55:0.5, AK, AQs, AJs, ATs, KQs, KJs, QJs:0.8, JTs:0.8, T9s:0.6, 98s:0.3, AQo:0.8, AJo:0.2, KQo:0.3, A5s:0.5, A4s:0.4'],
      large: ['KK+, QQ:0.4, AKs:0.8, AKo:0.6, A5s:0.4, A4s:0.2', 'QQ-77, 66:0.5, AK, AQs, AJs:0.8, ATs:0.4, KQs, KJs:0.4, QJs:0.4, JTs:0.4, T9s:0.2, AQo:0.5, A5s:0.3'],
    },
    ip: {
      small: ['KK+, QQ:0.25, AKs:0.6, AKo:0.5, A5s:0.4, A4s:0.3', 'QQ-44, AK, AQs, AJs, ATs, A9s:0.3, KQs, KJs, KTs:0.5, QJs, QTs:0.4, JTs, T9s, 98s:0.5, 87s:0.3, AQo, AJo:0.4, KQo:0.5, A5s:0.6, A4s:0.4'],
      large: ['KK+, QQ:0.3, AKs:0.7, AKo:0.5, A5s:0.4, A4s:0.3', 'QQ-55, AK, AQs, AJs, ATs:0.6, KQs, KJs:0.7, QJs:0.6, JTs:0.6, T9s:0.4, AQo:0.7, A5s:0.4'],
    },
  },
  HJ: {
    oop: {
      small: ['KK+, QQ:0.4, AKs:0.6, AKo:0.6, AQs:0.2, KQs:0.15, A5s:0.5, A4s:0.4', 'QQ-44, 33:0.4, AK, AQs, AJs, ATs, A9s:0.5, KQs, KJs, KTs:0.6, QJs, QTs:0.4, JTs, J9s:0.2, T9s:0.8, 98s:0.6, 87s:0.4, 76s:0.3, AQo, AJo:0.5, KQo:0.6, A5s, A4s:0.6, A3s:0.3'],
      large: ['KK+, QQ:0.4, AKs:0.7, AKo:0.6, AQs:0.2, A5s:0.5, A4s:0.3', 'QQ-66, 55:0.5, AK, AQs, AJs, ATs:0.7, KQs, KJs:0.7, QJs:0.7, JTs:0.7, T9s:0.5, 98s:0.3, AQo:0.8, AJo:0.2, KQo:0.3, A5s:0.5, A4s:0.3'],
    },
    ip: {
      small: ['KK+, QQ:0.4, AKs:0.6, AKo:0.6, A5s:0.4, A4s:0.4, A3s:0.2', 'QQ-33, AK, AQs, AJs, ATs, A9s:0.6, A8s:0.3, KQs, KJs, KTs, K9s:0.3, QJs, QTs:0.7, JTs, J9s:0.3, T9s, 98s, 87s:0.6, 76s:0.4, AQo, AJo:0.6, KQo:0.7, KJo:0.2, A5s, A4s, A3s:0.4'],
      large: ['KK+, QQ:0.4, AKs:0.7, AKo:0.6, A5s:0.4, A4s:0.3', 'QQ-55, AK, AQs, AJs, ATs:0.7, KQs, KJs:0.8, KTs:0.4, QJs:0.8, JTs:0.8, T9s:0.6, 98s:0.3, AQo:0.7, AJo:0.2, KQo:0.3, A5s:0.6, A4s:0.4'],
    },
  },
  CO: {
    oop: {
      small: ['QQ+, JJ:0.3, AKs, AKo:0.8, AQs:0.3, KQs:0.2, K9s:0.15, A5s:0.5, A4s:0.5, A3s:0.3, AJo:0.15, 76s:0.1', 'JJ-33, 22:0.5, AK, AQ, AJs, ATs, A9s, A8s:0.6, A7s:0.3, KQs, KJs, KTs, K9s:0.6, QJs, QTs:0.8, Q9s:0.3, JTs, J9s:0.5, T9s, T8s:0.3, 98s:0.8, 87s:0.7, 76s:0.6, 65s:0.5, 54s:0.3, AJo:0.8, ATo:0.4, KQo:0.9, KJo:0.4, QJo:0.3, A5s, A4s, A3s:0.6, A2s:0.5'],
      large: ['QQ+, JJ:0.3, AKs, AKo:0.8, AQs:0.3, A5s:0.5, A4s:0.4, A3s:0.2', 'JJ-44, 33:0.4, AK, AQ, AJs, ATs, A9s:0.5, KQs, KJs, KTs:0.6, QJs, QTs:0.4, JTs, T9s:0.7, 98s:0.5, 87s:0.4, 76s:0.3, AQo, AJo:0.6, KQo:0.6, KJo:0.2, A5s:0.6, A4s:0.5, A3s:0.4'],
    },
    ip: {
      small: ['QQ+, JJ:0.3, AKs, AKo:0.8, AQs:0.3, A5s:0.5, A4s:0.4, A3s:0.3, K9s:0.15, 65s:0.1', 'JJ-22, AK, AQ, AJs, ATs, A9s, A8s:0.7, A7s:0.4, KQs, KJs, KTs, K9s:0.6, QJs, QTs, Q9s:0.5, JTs, J9s:0.7, T9s, T8s:0.5, 98s, 87s, 76s:0.7, 65s:0.5, 54s:0.3, AJo, ATo:0.4, KQo, KJo:0.5, QJo:0.2, A5s, A4s, A3s:0.6, A2s:0.5'],
      large: ['QQ+, JJ:0.3, AKs, AKo:0.8, AQs:0.3, A5s:0.5, A4s:0.4, A3s:0.2', 'JJ-44, 33:0.3, AK, AQ, AJs, ATs, A9s:0.5, KQs, KJs, KTs:0.6, QJs, QTs:0.5, JTs, J9s:0.3, T9s:0.8, 98s:0.5, 87s:0.3, AJo:0.6, KQo:0.6, KJo:0.1, A5s, A4s:0.7, A3s:0.3'],
    },
  },
  BTN: {
    ip: {
      small: ['QQ+, JJ:0.3, AKs, AKo, AQs:0.3, A5s:0.5, A4s:0.5, A3s:0.3, K9s:0.2, KTs:0.15, Q9s:0.15, AJo:0.15, KJo:0.1, 65s:0.1, 54s:0.1', 'JJ-22, AQ, AJ, ATs, A9s, A8s-A6s, KQ, KJs, KTs, K9s, K8s:0.8, K7s:0.4, QJs, QTs, Q9s, Q8s:0.5, JTs, J9s, J8s:0.7, T9s, T8s, T7s:0.3, 98s, 97s:0.8, 87s, 86s:0.6, 76s, 75s:0.4, 65s, 64s:0.3, 54s, 53s:0.3, ATo, A9o:0.5, KJo, KTo:0.6, K9o:0.3, QJo:0.8, QTo:0.4, JTo:0.5, A5s-A2s'],
      large: ['QQ+, JJ:0.3, AKs, AKo, AQs:0.3, A5s:0.5, A4s:0.5, A3s:0.2, K9s:0.15, AJo:0.1', 'JJ-33, 22:0.6, AQ, AJs, AJo, ATs, A9s, A8s:0.6, A7s:0.4, KQ, KJs, KTs, K9s:0.8, K8s:0.3, QJs, QTs, Q9s:0.5, JTs, J9s:0.7, T9s, T8s:0.6, 98s, 87s:0.9, 76s:0.8, 65s:0.6, 54s:0.4, ATo:0.5, KJo:0.6, KTo:0.2, QJo:0.4, A5s-A2s'],
    },
  },
  SB: {
    oop: {
      small: ['QQ+, JJ:0.4, AK, AQs:0.4, A5s:0.5, A4s:0.4, A3s:0.3, K9s:0.2, Q9s:0.1, AJo:0.2, KJo:0.1', 'JJ-22, AQ, AJ, ATs, A9s, A8s-A6s, ATo, A9o:0.5, A8o:0.3, KQ, KJ, KTs, K9s, K8s:0.7, K7s:0.5, K6s:0.3, KTo:0.6, QJs, QTs, Q9s, Q8s:0.4, QJo:0.8, QTo:0.3, JTs, J9s, J8s:0.5, T9s, T8s, 98s, 97s:0.6, 87s, 86s:0.4, 76s, 75s:0.3, 65s, 54s:0.8, A5s-A2s'],
      large: ['QQ+, JJ:0.4, AK, AQs:0.4, A5s:0.5, A4s:0.4, A3s:0.2, K9s:0.15', 'JJ-33, 22:0.6, AQ, AJs, AJo, ATs, A9s, A8s:0.6, A7s:0.3, KQ, KJs, KTs, K9s:0.6, K8s:0.2, QJs, QTs:0.8, Q9s:0.4, JTs, J9s:0.6, T9s:0.9, T8s:0.4, 98s:0.8, 87s:0.6, 76s:0.5, 65s:0.4, ATo:0.5, KJo:0.6, KTo:0.2, QJo:0.4, A5s-A2s'],
    },
  },
};
const ORDER = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
// Sizing text by context. Opens are 2.5bb (SB 3bb).
const SIZE_TXT = {
  oop: { small: '7.5bb (3x)', large: '10bb (4x)' },
  ip: { small: '10bb (4x)', large: '12.5bb (5x)' },
  sb: { small: '9bb (3x)', large: '12bb (4x)' },
};

/* ------------------------------------------------------------------ */
/* 4. Short-handed (3–5 max) adjustments                               */
/* ------------------------------------------------------------------ */
const SHORT = [
  { id: 'SH5_UTG', size: 5, hero: 'UTG', range: RFI.HJ, desc: '5-handed, first in from UTG (the 6-max HJ seat)', note: 'With one fewer player behind, UTG plays the 6-max HJ range: add K7s+, T8s+, ATo, KJo.' },
  { id: 'SH4_CO', size: 4, hero: 'CO', range: RFI.CO, desc: '4-handed, first in from CO (UTG = CO)', note: '4-handed the first seat is the 6-max CO: ~28% wide, suited kings down to K4s.' },
  { id: 'SH4_BTN', size: 4, hero: 'BTN', range: RFI.BTN, desc: '4-handed, first in on the BTN', note: 'Same BTN range as 6-max; players behind are identical (just the blinds).' },
  { id: 'SH3_BTN', size: 3, hero: 'BTN', range: '22+, A2s+, K2s+, Q2s+, J4s+, T5s+, 95s+, 85s+, 74s+, 63s+, 53s+, 43s, A2o+, K6o+, K5o:0.5, Q8o+, J8o+, T8o+, 97o+, 87o, 76o:0.5', desc: '3-handed, first in on the BTN', note: '3-handed BTN opens ~50%: blinds defend wider so pure trash still folds, but every Kx-suited and Q8o+ is in.' },
  { id: 'SH3_SB', size: 3, hero: 'SB', range: RFI.SB, desc: '3-handed, BTN folds, you are SB', note: 'Blind vs blind is unchanged by table size: raise ~45% for 3x, never limp in this drill.' },
];

/* ------------------------------------------------------------------ */
/* 5. MTT push/fold + reshove (8-handed, % of hands by stack depth)    */
/* ------------------------------------------------------------------ */
const MTT_POS = ['UTG', 'UTG1', 'LJ', 'HJ', 'CO', 'BTN', 'SB'];
const PUSH_STACKS = [15, 12, 10, 8, 6];
// % of hands jammed first-in WITH a 1bb big-blind ante (approximates Nash/HRC charts).
const PUSH_PCT_ANTE = {
  UTG: [9, 11, 13, 16, 22], UTG1: [10, 12, 14.5, 18, 25], LJ: [11, 13.5, 16, 20, 28], HJ: [13, 16, 19, 24, 33],
  CO: [17, 21, 25, 31, 42], BTN: [23, 28, 34, 42, 55], SB: [48, 55, 62, 70, 80],
};
const NO_ANTE_FACTOR = (pos) => (pos === 'SB' ? 0.85 : 0.78);
// Reshove (jam over an open to 2.2bb), with ante. [hero, opener, {stack: pct}]
const RESHOVE = [
  ['BB', 'BTN', { 25: 14, 20: 17, 16: 21, 12: 26 }],
  ['SB', 'BTN', { 25: 13, 20: 16, 16: 20, 12: 24 }],
  ['BB', 'CO', { 25: 11, 20: 13, 16: 16, 12: 20 }],
  ['BTN', 'CO', { 25: 11, 20: 13, 16: 16, 12: 20 }],
  ['BB', 'UTG', { 25: 6, 20: 7, 16: 9, 12: 11 }],
];

/* ================================================================== */
/* Builders                                                            */
/* ================================================================== */
function spot(o) {
  const strat = buildStrategy(o.actions, o.ranges);
  o._stats = statsOf(strat, o);
  return o;
}
function statsOf(strat, o) {
  const tot = {};
  for (const h of ALL_HANDS) for (const [a, f] of Object.entries(strat[h])) tot[a] = (tot[a] || 0) + comboCount(h) * f;
  return Object.fromEntries(Object.entries(tot).map(([a, c]) => [a, +(100 * c / 1326).toFixed(1)]));
}

const rfiFile = {
  schema: 1, id: 'cash-rfi', title: 'Cash 6-max 100bb — Raise first in', disclaimer: DISCLAIMER,
  spots: ['UTG', 'HJ', 'CO', 'BTN', 'SB'].map((p) => spot({
    id: `RFI_${p}`, category: p === 'BTN' || p === 'CO' || p === 'SB' ? 'steal' : 'rfi',
    leaks: p === 'BTN' || p === 'CO' || p === 'SB' ? ['vpip', 'steal'] : ['vpip'],
    hero: p, tableSize: 6, stackBB: 100,
    title: `${p} · folded to you`, line: `Folded to you in the ${p}. 100bb. Open ${p === 'SB' ? '3bb' : '2.5bb'} or fold?`,
    actions: ['raise', 'limp', 'fold'], decoys: ['limp'], ranges: { raise: RFI[p] }, note: RFI_NOTE[p],
  })),
};

const facingOpenSpots = FACING_OPEN.map(([hero, vil, tb, call]) => {
  const ip = IP_OF(hero, vil);
  const isBB = hero === 'BB';
  const stealish = ['CO', 'BTN', 'SB'].includes(vil) && ['SB', 'BB'].includes(hero);
  const openSize = vil === 'SB' ? '3bb' : '2.5bb';
  return spot({
    id: `${isBB ? 'BBD' : 'FO'}_${hero}_vs_${vil}`,
    category: stealish ? 'stealDefense' : isBB ? 'bbDefense' : 'facingOpen',
    leaks: stealish ? ['vpip', 'steal'] : ['vpip'],
    hero, villain: vil, ip, tableSize: 6, stackBB: 100,
    title: `${hero} vs ${vil} open`,
    line: `${vil} opens ${openSize}${ORDER.indexOf(vil) < ORDER.indexOf(hero) - 1 ? ', folds to you' : ''}. You're ${hero}${ip ? ' (in position)' : ' (out of position)'}.`,
    actions: ['3bet', 'call', 'fold'], ranges: { '3bet': tb, call: call || '' },
    note: hero === 'SB' ? 'SB vs an open is 3-bet-or-fold: a flat invites a BB squeeze and leaves you OOP with a capped range.'
      : isBB ? `BB closes the action with ${vil === 'SB' ? '2bb' : '1.5bb'} already in: defend wide, but 3-bet the top and some suited blockers.`
      : ip ? 'In position vs a single open: 3-bet linear-ish with blockers, flat pairs/suited broadways that play well IP, fold dominated offsuit hands.' : '',
  });
});
const squeezeSpots = SQUEEZE.map(([id, hero, op, caller, tb, call]) => spot({
  id, category: 'squeeze', leaks: ['vpip'], hero, villain: op, caller, ip: hero === 'BTN', tableSize: 6, stackBB: 100,
  title: `${hero} vs ${op} open + ${caller} call`,
  line: `${op} opens 2.5bb, ${caller} calls. You're ${hero}. Squeeze, call, or fold?`,
  actions: ['3bet', 'call', 'fold'], ranges: { '3bet': tb, call },
  note: 'The caller is capped (no QQ+/AK most of the time), so squeezes get lots of folds — but over-calling OOP multiway with weak hands burns money.',
}));
const facingOpenFile = {
  schema: 1, id: 'cash-facing-open', title: 'Cash 6-max 100bb — Facing an open (incl. BB defence, squeezes)', disclaimer: DISCLAIMER,
  spots: [...facingOpenSpots, ...squeezeSpots],
};

const f3bSpots = [];
for (const hero of ['UTG', 'HJ', 'CO', 'BTN', 'SB']) {
  const later = ORDER.slice(ORDER.indexOf(hero) + 1);
  for (const vil of later) {
    const ctx = hero === 'SB' ? 'oop' : ['SB', 'BB'].includes(vil) ? 'ip' : 'oop';
    const sizeTxt = hero === 'SB' ? SIZE_TXT.sb : SIZE_TXT[ctx];
    for (const sz of ['small', 'large']) {
      const [fb, call] = F3B[hero][ctx][sz];
      f3bSpots.push(spot({
        id: `F3B_${hero}_vs_${vil}_${sz}`, category: 'facing3bet', leaks: ['f3b'],
        hero, villain: vil, ip: ctx === 'ip', sizing: sz, tableSize: 6, stackBB: 100,
        sampleFrom: `RFI_${hero}`,
        title: `${hero} open · ${vil} 3-bets ${sz}`,
        line: `You open ${hero === 'SB' ? '3bb' : '2.5bb'} from ${hero}. ${vil} 3-bets to ${sizeTxt[sz]}. You're ${ctx === 'ip' ? 'IN position' : 'OUT of position'}.`,
        actions: ['4bet', 'call', 'fold'], ranges: { '4bet': fb, call },
      }));
    }
  }
}
const f3bFile = { schema: 1, id: 'cash-facing-3bet', title: 'Cash 6-max 100bb — Facing a 3-bet', disclaimer: DISCLAIMER, spots: f3bSpots };

const shortFile = {
  schema: 1, id: 'cash-shorthanded', title: 'Cash 3–5 handed adjustments', disclaimer: DISCLAIMER,
  spots: [
    ...SHORT.map((s) => spot({
      id: s.id, category: 'shorthanded', leaks: ['vpip', ...(s.hero === 'BTN' || s.hero === 'SB' ? ['steal'] : [])],
      hero: s.hero, tableSize: s.size, stackBB: 100, title: `${s.size}-max · ${s.hero} first in`, line: `${s.desc}. 100bb.`,
      actions: ['raise', 'limp', 'fold'], decoys: ['limp'], ranges: { raise: s.range }, note: s.note,
    })),
    spot({
      id: 'SH3_BBD_vs_BTN', category: 'shorthanded', leaks: ['vpip', 'steal'], hero: 'BB', villain: 'BTN', ip: false, tableSize: 3, stackBB: 100,
      title: '3-max · BB vs BTN open', line: '3-handed: BTN opens 2.5bb, SB folds. You\'re BB.',
      actions: ['3bet', 'call', 'fold'],
      ranges: { '3bet': '88+, AT+, A5s-A2s, KJs+, KQo, QJs, JTs:0.5, K9s:0.3, 76s:0.3, 65s:0.3', call: '22+, A2s+, K2s+, Q2s+, J2s+, T4s+, 94s+, 84s+, 73s+, 63s+, 52s+, 42s+, 32s, A2o+, K3o+, Q6o+, J7o+, T7o+, 97o+, 86o+, 76o, 65o' },
      note: '3-handed the BTN range is wider still: defend ~70% and fold only true trash.',
    }),
  ],
};

/* ---------- MTT: rank hands by all-in equity (Monte Carlo) ---------- */
function equityRanking(villainHands, trials) {
  const D = deck();
  const villainCombos = villainHands.flatMap((h) => combosOf(h));
  const scores = {};
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (const h of ALL_HANDS) {
    let win = 0, n = 0;
    const heroCombos = combosOf(h);
    for (let t = 0; t < trials; t++) {
      const hc = heroCombos[t % heroCombos.length];
      let vc;
      do { vc = villainCombos[Math.floor(rnd() * villainCombos.length)]; } while (vc.some((c) => hc.includes(c)));
      const used = new Set([...hc, ...vc]);
      const board = [];
      while (board.length < 5) { const c = D[Math.floor(rnd() * 52)]; if (!used.has(c)) { used.add(c); board.push(c); } }
      const a = evaluate([...hc, ...board]), b = evaluate([...vc, ...board]);
      win += a > b ? 1 : a === b ? 0.5 : 0; n++;
    }
    scores[h] = win / n;
  }
  return scores;
}
function topPct(order, pct) {
  const target = (pct / 100) * 1326;
  const out = [];
  let c = 0;
  for (const h of order) { if (c >= target) break; out.push(h); c += comboCount(h); }
  return out;
}

let pushFile = null;
if (!CHECK || process.argv.includes('--mtt')) {
  const TRIALS = 6000;
  const eqRandom = equityRanking(ALL_HANDS, TRIALS);
  const byRandom = [...ALL_HANDS].sort((a, b) => eqRandom[b] - eqRandom[a]);
  const top20 = topPct(byRandom, 20);
  const eqTop = equityRanking(top20, TRIALS);
  // Push order blends raw equity (fold equity hands) with equity when called.
  const pushOrder = [...ALL_HANDS].sort((a, b) => (eqRandom[b] + eqTop[b]) - (eqRandom[a] + eqTop[a]));
  const reshoveOrder = [...ALL_HANDS].sort((a, b) => eqTop[b] - eqTop[a]);
  const asStr = (hands) => serializeRange(new Map(hands.map((h) => [h, 1])));
  const spots = [];
  for (const ante of [true, false]) {
    for (const pos of MTT_POS) {
      PUSH_STACKS.forEach((st, i) => {
        const pct = PUSH_PCT_ANTE[pos][i] * (ante ? 1 : NO_ANTE_FACTOR(pos));
        spots.push(spot({
          id: `PUSH_${pos}_${st}bb_${ante ? 'ante' : 'noante'}`, category: 'push', leaks: [], hero: pos, tableSize: 8, stackBB: st, ante,
          title: `${pos} · ${st}bb jam${ante ? ' (ante)' : ''}`,
          line: `MTT, 8-handed, ${ante ? 'BB ante in play' : 'no ante'}. Folded to you in ${pos} with ${st}bb effective.`,
          actions: ['jam', 'fold'], ranges: { jam: asStr(topPct(pushOrder, pct)) },
          note: st >= 13 ? 'At 13–15bb a min-raise/fold strategy exists from EP; this chart is the pure jam-or-fold baseline.' : `~${pct.toFixed(0)}% jam range. Antes widen every jam: there is more dead money to pick up.`,
        }));
      });
    }
  }
  for (const [hero, op, table] of RESHOVE) {
    for (const [st, pct] of Object.entries(table)) {
      spots.push(spot({
        id: `RESHOVE_${hero}_vs_${op}_${st}bb`, category: 'reshove', leaks: ['f3b'], hero, villain: op, tableSize: 8, stackBB: +st, ante: true,
        title: `${hero} vs ${op} open · ${st}bb reshove`,
        line: `MTT, BB ante. ${op} opens 2.2bb (covers you). You're ${hero} with ${st}bb. Jam or fold?`,
        actions: ['jam', 'fold'], ranges: { jam: asStr(topPct(reshoveOrder, pct)) },
        note: 'Baseline linear reshove (jam-or-fold). Deeper than ~20bb some hands prefer flatting; this drill trains the jam threshold.',
      }));
    }
  }
  pushFile = { schema: 1, id: 'mtt-pushfold', title: 'MTT push/fold & reshove (8-handed)', disclaimer: DISCLAIMER, rankings: { push: pushOrder, reshove: reshoveOrder }, spots };
}

/* ---------- stats + write ---------- */
const files = [rfiFile, facingOpenFile, f3bFile, shortFile, ...(pushFile ? [pushFile] : [])];
const byId = Object.fromEntries(files.flatMap((f) => f.spots).map((s) => [s.id, s]));
for (const f of files) {
  console.log(`\n== ${f.title}`);
  for (const s of f.spots) {
    let extra = '';
    if (s.sampleFrom) {
      // fold-to-3bet % *within* the opening range
      const open = buildStrategy(byId[s.sampleFrom].actions, byId[s.sampleFrom].ranges);
      const me = buildStrategy(s.actions, s.ranges);
      let tot = 0, fold = 0;
      for (const h of ALL_HANDS) {
        const w = comboCount(h) * (open[h].raise || 0);
        tot += w; fold += w * (me[h].fold || 0);
      }
      extra = `  fold-to-3bet ${(100 * fold / tot).toFixed(0)}%`;
    }
    if (!s.id.startsWith('PUSH') || s.id.endsWith('ante') && s.id.includes('10bb')) console.log(`${s.id.padEnd(26)} ${JSON.stringify(s._stats)}${extra}`);
    delete s._stats;
  }
}
if (!CHECK) {
  mkdirSync(OUT, { recursive: true });
  for (const f of files) writeFileSync(join(OUT, `${f.id}.json`), JSON.stringify(f, null, 1) + '\n');
  writeFileSync(join(OUT, 'index.json'), JSON.stringify({ files: files.map((f) => `${f.id}.json`) }, null, 1) + '\n');
  console.log(`\nWrote ${files.length} files to data/ranges/`);
}
// Silence unused import warning in some linters.
void parseRange;
