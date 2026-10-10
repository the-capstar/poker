/**
 * reasons.js — 1-line explanations for preflop answers.
 * Rule-based on hand features + spot context. A spot may override any hand with
 * `"notes": {"A5s": "your text"}` in its JSON.
 */
import { RANK_VALUE } from './lib/hands.js';
import { label } from './ranges.js';

function features(h) {
  const hi = RANK_VALUE[h[0]], lo = RANK_VALUE[h[1]];
  const pair = h.length === 2, suited = h[2] === 's', gap = hi - lo - 1;
  return {
    hi, lo, pair, suited, gap,
    premium: (pair && hi >= 12) || h.startsWith('AK'),
    bigPair: pair && hi >= 10,
    midPair: pair && hi >= 6 && hi <= 9,
    smallPair: pair && hi <= 5,
    wheelAce: suited && hi === 14 && lo <= 5,
    suitedAce: suited && hi === 14,
    broadway: !pair && lo >= 10,
    offBroadway: !pair && !suited && lo >= 10,
    suitedConn: suited && !pair && gap <= 1 && hi <= 11,
    weakOff: !pair && !suited && lo < 10,
  };
}

const fmtPct = (x) => `${Math.round(x * 100)}%`;

export function reasonFor(spot, hand, res, answer) {
  if (spot.notes?.[hand]) return spot.notes[hand];
  const f = features(hand);
  const best = res.best;
  const mixed = Object.values(res.mix).filter((x) => x > 0.05).length > 1;
  const where = spot.ip ? 'in position' : 'out of position';
  let r = '';

  switch (spot.category) {
    case 'facing3bet':
      if (best === '4bet') r = f.premium ? `Value 4-bet: ${hand} is ahead of ${spot.villain}'s continuing range and happy to stack off.`
        : f.wheelAce ? 'Blocker 4-bet bluff: the A blocks AA/AK, and it keeps wheel/flush playability when called.'
        : 'Low-frequency 4-bet bluff with blockers; balances the value 4-bets.';
      else if (best === 'call') r = f.bigPair || f.premium ? `Too strong to fold, and 4-betting only gets called by better — flat and play ${where}.`
        : f.midPair || f.smallPair ? (spot.sizing === 'small' ? `Set value: the small 3-bet keeps implied odds; ${spot.ip ? 'position makes this an easy call' : 'call, then play fit-or-fold OOP'}.` : 'Pair still continues here, but it is close vs the larger sizing.')
        : f.suited ? `Suited and connected enough to realize equity ${where} vs ${spot.sizing === 'small' ? 'a small' : 'even a large'} 3-bet.`
        : `Strong offsuit broadway: dominates enough of ${spot.villain}'s bluffs to continue ${where}.`;
      else r = f.offBroadway ? `Dominated offsuit broadway ${where}: vs AK/AQ/KQ you're drawing to 3 outs in a bloated pot — fold.`
        : f.smallPair ? `${spot.sizing === 'large' ? 'Large sizing kills set-mining' : 'Not enough implied odds'} — you need ~15–20× the call to set-mine; fold.`
        : f.suited ? `Plays poorly ${where} in a 3-bet pot (SPR ~${spot.ip ? 4.5 : 4}); folding here is exactly what moves your 14% toward 40%.`
        : 'Bottom of your opening range — this is a fold vs any 3-bet.';
      break;
    case 'rfi':
    case 'steal':
    case 'shorthanded':
      if (spot.actions.includes('raise')) {
        if (answer === 'limp') r = 'Never open-limp: it caps your range and hands the blinds a free squeeze. Raise or fold.';
        else if (best === 'raise') r = f.suited || f.pair ? `${hand} opens profitably from ${spot.hero}: ${f.pair ? 'set value + fold equity' : 'suited playability + fold equity'} vs the players behind.`
          : `High-card strength opens from ${spot.hero}; fold equity vs the blinds does the rest.`;
        else r = `Too weak to open from ${spot.hero}${f.weakOff ? ' — offsuit and disconnected' : ''}. Fold (limping is not an option).`;
        break;
      }
    // falls through for 3-handed BB defence spot
    case 'facingOpen':
    case 'bbDefense':
    case 'stealDefense':
    case 'squeeze': {
      const isBlind = spot.hero === 'SB' || spot.hero === 'BB';
      if (best === '3bet') r = f.premium || f.bigPair || (f.broadway && f.hi === 14) ? `3-bet for value: ahead of ${spot.villain}'s range — flatting lets ${spot.category === 'squeeze' ? 'both players' : 'the blinds'} in cheap.`
        : `3-bet bluff: ${f.wheelAce ? 'A-blocker' : 'blocker + playability'} hand that does better as a 3-bet than a flat.`;
      else if (best === 'call') r = spot.hero === 'BB' ? `Closing the action with a discount: ${hand} has the equity to defend${spot.villain === 'SB' ? ' and you have position' : ''}.`
        : `Flat ${where}: too good to fold, not strong enough to 3-bet for value.`;
      else r = spot.hero === 'SB' ? `Fold — from the SB it's 3-bet or fold; ${hand} isn't strong enough to 3-bet.`
        : isBlind ? `Even with the discount, ${hand} realizes too little equity OOP vs ${spot.villain}. Fold.`
        : `Dominated by ${spot.villain}'s range. Fold rather than flat.`;
      if (answer === 'call' && (res.mix.call || 0) < 0.25 && best !== 'call') r = `⚑ Flat flagged — should be ${label(best)}. ` + r;
      break;
    }
    case 'push':
      r = best === 'jam' ? `Inside the jam range at ${spot.stackBB}bb${spot.ante ? ' with antes' : ''}: fold equity + equity when called make it +chip-EV.`
        : `Outside the ${spot.stackBB}bb jam range from ${spot.hero}: too often called by better with too little equity.`;
      break;
    case 'reshove':
      r = best === 'jam' ? `Reshove: ${hand} has ~${f.pair || f.hi === 14 ? '45–55' : '35–45'}% vs ${spot.villain}'s calling range and the open + antes are worth winning uncontested.`
        : `Fold: not enough equity vs ${spot.villain}'s calling range at ${spot.stackBB}bb.`;
      break;
    default:
      r = '';
  }
  if (mixed && !r.startsWith('⚑')) r += ` (Mixed: ${Object.entries(res.mix).filter(([, v]) => v > 0.05).map(([a, v]) => `${label(a)} ${fmtPct(v)}`).join(' / ')}.)`;
  return r;
}
