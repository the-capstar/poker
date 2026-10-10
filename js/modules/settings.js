/** Settings — grading, bankroll, defaults, tilt triggers, HUD baseline, backup/restore. */
import { h, clear, screen, toast } from '../ui.js';
import * as store from '../store.js';
import { rebuild } from '../ranges.js';

export function download(name, text, type = 'application/json') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export function render(root) {
  const { el, body } = screen('Settings', { back: '#/' });
  root.append(el);
  draw();

  function field(lbl, value, onChange, type = 'text', attrs = {}) {
    return h('label.field', h('span', lbl), h('input', { type, value, onchange: (e) => onChange(type === 'number' ? +e.target.value : e.target.value), ...attrs }));
  }

  function draw() {
    const s = store.get();
    const st = s.settings;
    const save = (fn) => { store.update(fn); toast('Saved'); };
    const triggers = h('ul.edit');
    const drawTriggers = () => clear(triggers).append(...store.get().settings.tiltTriggers.map((t, i) => h('li', h('span', t), h('button.x', { 'aria-label': 'Remove', onclick: () => { store.update((x) => x.settings.tiltTriggers.splice(i, 1)); drawTriggers(); } }, '×'))));
    drawTriggers();
    const newTrig = h('input', { placeholder: 'Add a trigger…' });

    clear(body).append(
      h('div.card',
        h('h3', 'Mixed-strategy grading'),
        h('div.seg', [['lenient', 'Lenient'], ['rng', 'RNG roll']].map(([v, l]) => h(`button${st.gradeMode === v ? '.on' : ''}`, { onclick: () => { save((x) => (x.settings.gradeMode = v)); draw(); } }, l))),
        h('p.fine', st.gradeMode === 'lenient' ? 'Any action the chart plays at least the threshold below counts as correct (e.g. 3-bet 40% / call 60% → both correct).' : 'A 0–99 roll is shown with each hand. Pick the action whose band contains it (actions in listed order). Trains real frequency execution.'),
        field('Lenient threshold (%)', Math.round(st.mixedThreshold * 100), (v) => save((x) => (x.settings.mixedThreshold = Math.min(50, Math.max(5, v)) / 100)), 'number', { min: 5, max: 50 })),
      h('div.card',
        h('h3', 'Bankroll limits'),
        field('Bankroll ($)', st.bankroll.total, (v) => save((x) => (x.settings.bankroll.total = v)), 'number'),
        field('Current stake', st.bankroll.stakes, (v) => save((x) => (x.settings.bankroll.stakes = v))),
        field('Max % of roll per buy-in', st.bankroll.maxBuyinPct, (v) => save((x) => (x.settings.bankroll.maxBuyinPct = v)), 'number'),
        h('label.field', h('span', 'Rules / reminders'), h('textarea', { rows: 3, value: st.bankroll.notes, onchange: (e) => save((x) => (x.settings.bankroll.notes = e.target.value)) }))),
      h('div.card',
        h('h3', 'Tilt triggers'),
        triggers,
        h('div.addrow', newTrig, h('button.btn.sm', { onclick: () => { if (!newTrig.value.trim()) return; store.update((x) => x.settings.tiltTriggers.push(newTrig.value.trim())); newTrig.value = ''; drawTriggers(); } }, 'Add'))),
      h('div.card',
        h('h3', 'HUD baseline (My Leaks)'),
        h('p.fine', 'Your real stats. Update by hand for now; hand-history import will fill these automatically later.'),
        ...[['f3b', 'Fold to 3-bet %'], ['vpip', 'VPIP %'], ['pfr', 'PFR %'], ['aggr', 'Postflop aggression freq %'], ['steal', 'BTN steal %'], ['foldToSteal', 'Fold to steal %'], ['hands', 'Sample size (hands)']]
          .map(([k, l]) => field(l, s.leakBaseline[k], (v) => save((x) => { x.leakBaseline[k] = v; x.leakBaseline.source = 'HUD (manual)'; }), 'number'))),
      h('div.card',
        h('h3', 'Backup'),
        h('p.fine', 'All progress lives in this browser only (localStorage). Export regularly — clearing Safari data wipes it.'),
        h('div.btnrow',
          h('button.btn', { onclick: () => download(`poker-warmup-backup-${new Date().toISOString().slice(0, 10)}.json`, store.exportJSON()) }, '⬇ Export JSON'),
          h('label.btn', 'Import JSON', h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: async (e) => {
            const f = e.target.files[0];
            if (!f) return;
            try { store.importJSON(await f.text()); rebuild(); toast('Backup restored'); draw(); } catch (err) { toast('Import failed: ' + err.message, 4000); }
          } })))),
      h('div.card',
        h('h3', 'Hand histories'),
        h('button.btn', { disabled: true }, 'Import poker-reader JSON (coming)'),
        h('p.fine', 'Hook is in place (js/hh-import.js, schema v2): will recompute your leak stats and turn your own hands into drills.')),
      h('div.card',
        h('h3', 'Danger zone'),
        h('button.btn.danger', { onclick: () => { if (confirm('Erase ALL progress, settings and range edits on this device?')) { store.resetAll(); rebuild(); draw(); toast('Reset'); } } }, 'Reset all data')),
      h('p.fine.center', 'Poker Warm-Up · v', h('span#ver', '')),
    );
    fetch('version.json').then((r) => r.json()).then((v) => { const e = document.getElementById('ver'); if (e) e.textContent = v.version; }).catch(() => {});
  }
}
