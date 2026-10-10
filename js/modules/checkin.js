/**
 * Mental Game Check-In — first step of every warm-up.
 * Ratings → readiness flag (never blocks), session limits, bankroll reminder, today's focus.
 */
import { h, clear, screen } from '../ui.js';
import * as store from '../store.js';
import * as E from '../engine.js';

const RATINGS = [
  ['sleep', 'Sleep', ['Wrecked', 'Poor', 'OK', 'Good', 'Great']],
  ['energy', 'Energy', ['Drained', 'Low', 'OK', 'Good', 'Wired-in']],
  ['focus', 'Focus', ['Scattered', 'Distracted', 'OK', 'Sharp', 'Locked-in']],
  ['mood', 'Mood', ['Tilted', 'Irritable', 'Neutral', 'Positive', 'Great']],
];

/** Suggestions (not blocks) when the check-in is weak. */
export function readinessFlags(c, plan) {
  const flags = [];
  const score = E.checkinScore(c);
  if (score < 50) flags.push(`Readiness ${score}/100 — consider ${Math.min(plan.timeLimitMin, 60)} min max and ${Math.max(1, plan.tables - 1)} table${plan.tables - 1 > 1 ? 's' : ''}.`);
  if (c.sleep <= 2) flags.push('Low sleep: decision quality drops late in sessions. Set a hard stop time.');
  if (c.mood <= 2) flags.push('Mood is low — your tilt triggers are listed at the end. Be quicker to quit.');
  if (c.focus <= 2) flags.push('Focus is low — one fewer table than usual.');
  return flags;
}

export function mountCheckin(body, foot, { onDone, compact = false } = {}) {
  const st = store.get();
  const c = { sleep: 3, energy: 3, focus: 3, mood: 3 };
  const plan = { ...st.settings.defaults };
  const br = st.settings.bankroll;

  const ratingRow = ([k, lbl, words]) => {
    const row = h('div.rating');
    const word = h('span.rword', words[c[k] - 1]);
    const btns = h('div.rbtns');
    const draw = () => {
      clear(btns).append(...[1, 2, 3, 4, 5].map((v) => h(`button.rb${c[k] === v ? '.on' : ''}${v <= 2 ? '.lo' : ''}`, { onclick: () => { c[k] = v; word.textContent = words[v - 1]; draw(); } }, v)));
    };
    draw();
    row.append(h('div.rhead', h('b', lbl), word), btns);
    return row;
  };

  const stepper = (key, lbl, unit, step, min, max) => {
    const val = h('b', plan[key]);
    const set = (d) => { plan[key] = Math.min(max, Math.max(min, plan[key] + d)); val.textContent = plan[key]; };
    return h('div.stepper', h('span', lbl), h('div.sctl', h('button.sb', { onclick: () => set(-step) }, '−'), h('span.sval', val, h('small', ' ' + unit)), h('button.sb', { onclick: () => set(step) }, '+')));
  };

  clear(body).append(
    h('div.card', h('h2', 'How are you, honestly?'), ...RATINGS.map(ratingRow)),
    h('div.card',
      h('h3', 'Session limits'),
      stepper('stopLossBI', 'Stop-loss', 'buy-ins', 1, 1, 10),
      stepper('timeLimitMin', 'Time limit', 'min', 15, 15, 480),
      stepper('tables', 'Tables', '', 1, 1, 8)),
    h('div.card.note',
      h('h3', 'Bankroll rules'),
      h('p', br.total ? `Bankroll ${br.total} · stake ${br.stakes} · max ${br.maxBuyinPct}% per buy-in` : `Stake ${br.stakes} · max ${br.maxBuyinPct}% of roll per buy-in`),
      br.notes ? h('p.muted', br.notes) : null,
      h('a.fine', { href: '#/settings' }, 'Edit in Settings')),
  );
  clear(foot).append(h('button.btn.primary.big', {
    onclick: () => {
      const out = { ...c, ...plan, score: E.checkinScore(c), flags: readinessFlags(c, plan), focusLine: E.todaysFocus(), t: Date.now() };
      store.update((s) => { s.settings.defaults = { ...plan }; });
      onDone(out);
    },
  }, compact ? 'Next →' : 'Save check-in'));
  foot.classList.add('show');
}

export function checkinResult(ci) {
  return h('div.card',
    h('h2', `Check-in: ${ci.score}/100`),
    ci.flags.length ? h('ul.flags', ci.flags.map((f) => h('li', '⚠ ', f))) : h('p.good', 'Good to go.'),
    h('div.kv', h('span', 'Stop-loss'), h('b', `${ci.stopLossBI} BI`)),
    h('div.kv', h('span', 'Time limit'), h('b', `${ci.timeLimitMin} min`)),
    h('div.kv', h('span', 'Tables'), h('b', ci.tables)),
    h('div.focus', h('small', "TODAY'S FOCUS"), h('p', ci.focusLine)));
}

export function render(root) {
  const { el, body, foot } = screen('Mental Check-In', { back: '#/' });
  root.append(el);
  mountCheckin(body, foot, {
    onDone: (ci) => {
      store.update((s) => s.sessions.push({ id: 'c' + Date.now(), type: 'checkin', date: Date.now(), checkin: ci, readiness: ci.score }));
      clear(body).append(checkinResult(ci), tiltCard());
      clear(foot).append(h('a.btn.primary.big', { href: '#/' }, 'Done'));
    },
  });
}

export function tiltCard() {
  const t = store.get().settings.tiltTriggers;
  return h('div.card.tilt', h('h3', '🧯 Your tilt triggers'), h('ul', t.map((x) => h('li', x))), h('p.fine', 'Hit one? Stand up, 5 breaths, re-read your stop-loss. Edit in Settings.'));
}
