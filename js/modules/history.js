/** Session history + streaks 🔥 */
import { h, screen, pct } from '../ui.js';
import * as store from '../store.js';
import * as E from '../engine.js';

const TYPE = { warmup: '🔥 Warm-up', f3b: '🛡 Facing 3-bet', preflop: '🂡 Preflop', math: '⚡ Math', checkin: '🧠 Check-in' };

export function render(root) {
  const { el, body } = screen('History', { back: '#/' });
  root.append(el);
  const s = E.streak();
  const sessions = [...store.get().sessions].reverse();
  const days = new Set(sessions.map((x) => E.dayKey(x.date)));

  // Last 28 days strip
  const strip = h('div.cal');
  for (let k = 27; k >= 0; k--) {
    const d = new Date();
    d.setDate(d.getDate() - k);
    strip.append(h(`span.day${days.has(E.dayKey(d)) ? '.on' : ''}${k === 0 ? '.today' : ''}`, { title: E.dayKey(d) }));
  }

  body.append(
    h('div.card.center',
      h('div.streakbig', `🔥 ${s.current}`),
      h('p.muted', `day streak · best ${s.best}`),
      strip,
      h('p.fine', 'Any warm-up, drill (5+ hands) or check-in counts for the day.')),
    h('div.card',
      h('h3', `Sessions (${sessions.length})`),
      sessions.length ? h('ul.hist', sessions.slice(0, 100).map((x) => h('li',
        h('div', h('b', TYPE[x.type] || x.type), x.mode ? h('span.tag', x.mode.toUpperCase()) : null, x.minutes ? h('span.tag', `${x.minutes}m`) : null),
        h('div.muted', new Date(x.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })),
        h('div', x.type === 'warmup' ? `Readiness ${x.readiness ?? '—'} · drills ${pct(x.drillAcc)}${x.f3b ? ` · 3-bet ${pct(x.f3b.acc)}` : ''}`
          : x.type === 'checkin' ? `Check-in ${x.readiness}/100`
          : x.type === 'math' ? `${x.score} correct · ${pct(x.acc)}` : `${x.n} hands · ${pct(x.acc)}`)))) : h('p.muted', 'Nothing yet. Start a Session Prep.')),
  );
}
