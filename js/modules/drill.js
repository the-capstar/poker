/**
 * drill.js — shared "show spot + hand → tap action → graded feedback with range grid" loop.
 * Used by the Facing 3-Bet Trainer, Preflop Range Trainer and the Guided Warm-Up.
 */
import { h, clear, handCards, rangeGrid, legend, timerBar, pct, buzz } from '../ui.js';
import { randomCombo } from '../lib/hands.js';
import * as R from '../ranges.js';
import * as E from '../engine.js';
import * as store from '../store.js';
import { reasonFor } from '../reasons.js';

const REVIEW_P = 0.3; // chance a due Leitner item is served instead of a fresh spot

/**
 * @param {HTMLElement} body   scrollable area
 * @param {HTMLElement} foot   sticky footer for the answer buttons
 * @param {Object} o
 *   mod          'f3b' | 'preflop'
 *   pickSpot()   -> spot
 *   allowSpot(id)-> bool  (which Leitner items may be reviewed here)
 *   durationSec  optional countdown; drill ends after the answer in progress
 *   statsLine(list) -> Node  extra live stats for this drill
 *   onDone(result)
 *   sid          warm-up session id (tags attempts)
 */
export function mountDrill(body, foot, o) {
  const results = [];
  let current = null;
  let finished = false;
  let timeUp = false;
  let timer = null;

  const statsEl = h('div.dstats');
  const stage = h('div.stage');
  clear(body).append(...(o.durationSec ? [(timer = timerBar(o.durationSec, () => { timeUp = true; if (!current) finish(); })).el] : []), statsEl, stage);

  function refreshStats() {
    const ok = results.filter((r) => r.ok).length;
    clear(statsEl).append(
      h('span', h('b', results.length), ' hands'),
      h('span', h('b', pct(results.length ? ok / results.length : null)), ' acc'),
      o.statsLine ? o.statsLine(results) : null
    );
  }

  function next() {
    if (timeUp) return finish();
    let spot, hand, review = false;
    const due = E.dueItems((k) => o.allowSpot(k.split('|')[0]));
    if (due.length && Math.random() < REVIEW_P) {
      const [sid, hd] = due[0].key.split('|');
      spot = R.getSpot(sid);
      hand = hd;
      review = !!spot;
    }
    if (!spot) {
      spot = o.pickSpot();
      hand = R.sampleHand(spot);
    }
    const combo = randomCombo(hand);
    const roll = store.get().settings.gradeMode === 'rng' ? Math.floor(Math.random() * 100) : null;
    current = { spot, hand, combo, roll, review, t0: performance.now() };
    renderQuestion();
  }

  function answerButtons(spot) {
    const acts = [...spot.actions];
    return h('div.answers', { style: { gridTemplateColumns: `repeat(${acts.length}, 1fr)` } },
      acts.map((a) => h(`button.ans.a-${a}`, { onclick: () => answer(a) }, R.label(a))));
  }

  function spotHeader(spot) {
    const tags = [
      spot.hero && h('span.tag.pos', spot.hero),
      spot.villain && h('span.tag', 'vs ' + spot.villain),
      spot.ip != null && spot.category !== 'rfi' && spot.category !== 'steal' && spot.category !== 'push' && h(`span.tag.${spot.ip ? 'ip' : 'oop'}`, spot.ip ? 'IP' : 'OOP'),
      spot.sizing && h('span.tag', spot.sizing === 'small' ? 'small 3b' : 'LARGE 3b'),
      spot.stackBB && spot.stackBB < 100 && h('span.tag', spot.stackBB + 'bb'),
      spot.ante != null && spot.category === 'push' && h('span.tag', spot.ante ? 'ante' : 'no ante'),
      spot.tableSize && spot.tableSize < 6 && h('span.tag', spot.tableSize + '-max'),
      current.review && h('span.tag.rev', '↻ review'),
    ];
    return h('div.spothead', h('div.tags', tags), h('p.line', spot.line));
  }

  function renderQuestion() {
    const { spot, combo, roll } = current;
    refreshStats();
    clear(stage).append(
      spotHeader(spot),
      h('div.dealt', handCards(combo, 'xl')),
      roll != null ? h('div.rng', 'RNG ', h('b', roll), h('small', ' — pick the action whose frequency band contains this roll')) : null
    );
    clear(foot).append(answerButtons(spot));
    foot.classList.add('show');
  }

  function answer(a) {
    if (!current || current.answered) return;
    current.answered = true;
    const { spot, hand, roll } = current;
    const ms = Math.round(performance.now() - current.t0);
    const res = R.grade(spot, hand, a, roll);
    const flags = [];
    if (a === 'limp') flags.push('limp');
    if (a === 'call' && (res.mix.call || 0) < store.get().settings.mixedThreshold && (spot.leaks || []).includes('vpip')) flags.push('badFlat');
    const rec = {
      mod: o.mod, cat: spot.category, spot: spot.id, pos: spot.hero, vil: spot.villain, ip: spot.ip, sizing: spot.sizing,
      hand, ans: a, ok: res.ok, best: res.best, mix: res.mix, ms, flags, leaks: spot.leaks || [], sid: o.sid || null,
      item: `${spot.id}|${hand}`,
    };
    E.record(rec);
    results.push(rec);
    buzz(res.ok);
    renderFeedback(a, res);
  }

  function renderFeedback(a, res) {
    const { spot, hand } = current;
    const strat = R.strategy(spot);
    const shown = spot.actions.filter((x) => !(spot.decoys || []).includes(x));
    const reachable = spot.sampleFrom ? R.strategy(spot.sampleFrom) : null;
    const openAct = spot.sampleFrom ? R.getSpot(spot.sampleFrom).actions[0] : null;
    refreshStats();
    clear(stage).append(
      spotHeader(spot),
      h(`div.verdict.${res.ok ? 'ok' : 'bad'}`,
        h('div.vrow', h('span.vicon', res.ok ? '✓' : '✗'), h('div',
          h('div.vmain', res.ok ? (res.freq < 0.999 && res.freq > 0 ? `Correct (${R.label(a)} ${Math.round(res.freq * 100)}%)` : 'Correct') : `You: ${R.label(a)}`),
          h('div.vmix', `${hand}: ${R.mixLabel(res.mix, shown)}`),
          res.rngBucket ? h('div.vmix', `RNG ${current.roll} → ${R.label(res.rngBucket)}`) : null)),
        h('p.reason', reasonFor(spot, hand, res, a))),
      rangeGrid(strat, shown, { highlight: hand, dim: reachable ? (x) => !(reachable[x][openAct] > 0) : null }),
      legend(shown, R.actionTotals(spot)),
      h('p.fine', spot.sampleFrom ? `Greyed hands aren't in your ${spot.hero} opening range. ` : '', 'Baseline approximation — not solver output.', spot.edited ? ' (Edited by you.)' : '')
    );
    stage.scrollTop = 0;
    body.scrollTo?.({ top: 0 });
    clear(foot).append(h('button.btn.primary.big', { onclick: () => { current = null; next(); } }, timeUp ? 'Finish' : 'Next hand →'));
  }

  function finish() {
    if (finished) return;
    finished = true;
    timer?.stop();
    const n = results.length, ok = results.filter((r) => r.ok).length;
    const out = { n, ok, acc: n ? ok / n : null, results };
    foot.classList.remove('show');
    clear(foot);
    o.onDone && o.onDone(out);
  }

  next();
  return { stop: () => { timer?.stop(); finished = true; }, finish: () => { timeUp = true; if (!current || current.answered) finish(); } };
}

/** Weighted random pick. items: [{w, v}] */
export function weighted(items) {
  const tot = items.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * tot;
  for (const x of items) if ((r -= x.w) <= 0) return x.v;
  return items[items.length - 1].v;
}
