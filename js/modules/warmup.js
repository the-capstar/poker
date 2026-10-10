/**
 * Guided Warm-Up — timed sequence:
 *   mental check-in → facing 3-bet → preflop → math sprint → [postflop spot] → readiness
 *
 * Each step's time budget scales with the chosen length (10/15/20 min). Steps whose
 * module isn't built yet are skipped and their time is redistributed (see STEP_DEFS.ready).
 */
import { h, clear, screen, pct } from '../ui.js';
import * as store from '../store.js';
import * as E from '../engine.js';
import { mountCheckin, checkinResult, tiltCard } from './checkin.js';
import { mountDrill } from './drill.js';
import { pickF3bSpot, f3bStatsLine } from './facing3bet.js';
import { pickPreflopSpot, disciplineLine, CASH_CATS, MTT_CATS } from './preflop.js';
import * as R from '../ranges.js';
import { mountSprint } from './math.js';

/** Share of drill time per step (check-in and readiness are untimed). */
const STEP_DEFS = [
  { id: 'checkin', name: 'Mental check-in', ready: true },
  { id: 'f3b', name: 'Facing 3-bet', share: 0.36, ready: true },
  { id: 'preflop', name: 'Preflop ranges', share: 0.3, ready: true },
  { id: 'math', name: 'Math sprint', share: 0.14, ready: true }, // 60s rounds; repeated for longer warm-ups
  { id: 'postflop', name: 'Postflop spot', share: 0.2, ready: false }, // TODO(module 5): flip to true when built
  { id: 'readiness', name: 'Readiness', ready: true },
];

export function planSteps(minutes) {
  const drillSec = minutes * 60 - 120; // ~2 min reserved for check-in + review
  const req = E.f3bRequiredToday();
  let steps = STEP_DEFS.filter((s) => s.ready && (s.id !== 'f3b' || req.required));
  const share = steps.reduce((a, s) => a + (s.share || 0), 0);
  steps = steps.map((s) => ({ ...s, sec: s.share ? Math.round((drillSec * s.share) / share) : 0 }));
  // Math sprint runs in whole 60s rounds
  const m = steps.find((s) => s.id === 'math');
  if (m) m.rounds = Math.max(1, Math.round(m.sec / 60));
  return { steps, f3bReason: req.reason, f3bRequired: req.required };
}

export function render(root) {
  const { el, body, foot } = screen('Session Prep', { back: '#/' });
  root.append(el);
  const cfg = { mode: localStorage.getItem('pw.mode') || 'cash', minutes: +(localStorage.getItem('pw.min') || 15) };
  let live = null;

  function chooser() {
    const plan = planSteps(cfg.minutes);
    const seg = (items, key) => h('div.seg', items.map(([v, l]) => h(`button${cfg[key] === v ? '.on' : ''}`, { onclick: () => { cfg[key] = v; try { localStorage.setItem(key === 'mode' ? 'pw.mode' : 'pw.min', v); } catch { /* ignore */ } chooser(); } }, l)));
    clear(body).append(
      h('div.card', h('h3', 'Format'), seg([['cash', 'Cash'], ['mtt', 'MTT']], 'mode'), h('h3', 'Length'), seg([[10, '10 min'], [15, '15 min'], [20, '20 min']], 'minutes')),
      h('div.card',
        h('h3', 'Today\'s sequence'),
        h('ol.steps', plan.steps.map((s) => h('li', h('span', s.name), h('small.muted', s.id === 'math' ? `${s.rounds}×60s` : s.sec ? `${Math.round(s.sec / 60 * 10) / 10} min` : '')))),
        h('p.fine', plan.f3bRequired ? `Facing 3-bet: ${plan.f3bReason}.` : `Facing 3-bet skipped today — ${plan.f3bReason}.`),
        STEP_DEFS.some((s) => !s.ready) ? h('p.fine', 'Postflop step unlocks when that module ships; its time goes to the other drills for now.') : null),
    );
    clear(foot).append(h('button.btn.primary.big', { onclick: run }, '▶ Start'));
    foot.classList.add('show');
  }

  function run() {
    const plan = planSteps(cfg.minutes);
    const sid = 'w' + Date.now();
    const session = { id: sid, type: 'warmup', date: Date.now(), mode: cfg.mode, minutes: cfg.minutes, steps: {} };
    let i = 0;
    const progress = h('div.progress');
    const holder = h('div');
    clear(body).append(progress, holder);

    const drawProgress = () => clear(progress).append(
      ...plan.steps.map((s, k) => h(`span.pdot${k < i ? '.done' : k === i ? '.cur' : ''}`, { title: s.name })),
      h('span.pname', plan.steps[i]?.name || ''));

    const nextStep = () => {
      i++;
      go();
    };

    function go() {
      drawProgress();
      const step = plan.steps[i];
      clear(holder);
      if (!step) return;
      if (step.id === 'checkin') {
        mountCheckin(holder, foot, { compact: true, onDone: (ci) => { session.checkin = ci; nextStep(); } });
      } else if (step.id === 'f3b') {
        live = mountDrill(holder, foot, {
          mod: 'f3b', sid, durationSec: step.sec,
          pickSpot: () => pickF3bSpot({}),
          allowSpot: (id) => id.startsWith('F3B_'),
          statsLine: f3bStatsLine,
          onDone: (out) => {
            const f = out.results;
            session.f3b = { n: out.n, acc: out.acc, fold: f.length ? f.filter((r) => r.ans === 'fold').length / f.length : null };
            session.steps.f3b = { n: out.n, acc: out.acc };
            interstitial(`Facing 3-bet: ${pct(out.acc)} (${out.ok}/${out.n})`, nextStep);
          },
        });
      } else if (step.id === 'preflop') {
        const cats = cfg.mode === 'mtt' ? MTT_CATS : CASH_CATS;
        live = mountDrill(holder, foot, {
          mod: 'preflop', sid, durationSec: step.sec,
          pickSpot: () => pickPreflopSpot({ mode: cfg.mode }),
          allowSpot: (id) => { const s = R.getSpot(id); return s && cats.some(([c]) => c === s.category); },
          statsLine: disciplineLine,
          onDone: (out) => {
            session.steps.preflop = { n: out.n, acc: out.acc };
            interstitial(`Preflop: ${pct(out.acc)} (${out.ok}/${out.n})`, nextStep);
          },
        });
      } else if (step.id === 'math') {
        let round = 0;
        const agg = { n: 0, ok: 0, ms: 0 };
        const one = () => {
          round++;
          live = mountSprint(holder, foot, {
            sid,
            onDone: (res) => {
              agg.n += res.n; agg.ok += res.ok; agg.ms += (res.avgMs || 0) * res.n;
              if (round < step.rounds) interstitial(`Round ${round}: ${res.ok} correct${res.pb ? ' 🏆 PB' : ''}`, one, `Round ${round + 1} →`);
              else {
                session.steps.math = { n: agg.n, acc: agg.n ? agg.ok / agg.n : null, avgMs: agg.n ? agg.ms / agg.n : null };
                interstitial(`Math: ${agg.ok}/${agg.n}${res.pb ? ' 🏆 PB' : ''}`, nextStep);
              }
            },
          });
        };
        one();
      } else if (step.id === 'readiness') {
        finish();
      }
    }

    function interstitial(msg, cont, btn = 'Next step →') {
      clear(holder).append(h('div.card.center', h('h2', '✓'), h('p', msg), plan.steps[i + 1] && btn === 'Next step →' ? h('p.muted', `Up next: ${plan.steps[i + 1].name}`) : null));
      clear(foot).append(h('button.btn.primary.big', { onclick: cont }, btn));
      foot.classList.add('show');
    }

    function finish() {
      const drillSteps = Object.values(session.steps).filter((s) => s.n);
      const n = drillSteps.reduce((a, s) => a + s.n, 0);
      const acc = n ? drillSteps.reduce((a, s) => a + s.acc * s.n, 0) / n : null;
      session.drillAcc = acc;
      session.readiness = E.readiness(session.checkin, acc);
      store.update((s) => s.sessions.push(session));
      const r = session.readiness ?? 0;
      const verdict = r >= 75 ? ['good', 'Ready. Play your normal schedule.'] : r >= 55 ? ['warn', 'Playable — trim a table and respect the stop-loss.'] : ['bad', 'Flagged: shorter session, fewer tables, or study instead. Your call.'];
      const ci = session.checkin;
      clear(holder).append(
        h('div.card.center',
          h('small.muted', 'READINESS'),
          h(`div.bignum.${verdict[0]}`, r),
          h('p', verdict[1]),
          h('div.kv', h('span', 'Check-in'), h('b', `${E.checkinScore(ci) ?? '—'}/100`)),
          h('div.kv', h('span', 'Drill accuracy'), h('b', pct(acc))),
          ...Object.entries(session.steps).map(([k, v]) => h('div.kv', h('span.muted', { f3b: 'Facing 3-bet', preflop: 'Preflop', math: 'Math' }[k]), h('b', `${pct(v.acc)} (${v.n})`)))),
        ci ? checkinResult(ci) : null,
        tiltCard(),
      );
      drawProgress();
      clear(foot).append(h('a.btn.primary.big', { href: '#/' }, 'Go play 🃏'));
      foot.classList.add('show');
    }

    go();
  }

  chooser();
  return () => live?.stop();
}
