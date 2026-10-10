/**
 * Range Editor — paint a spot's 13x13 grid (tap or drag), or edit the notation text.
 * Edits are stored as overrides in localStorage; "Export file" downloads the JSON
 * with your edits merged so you can commit it to /data/ranges and redeploy.
 */
import { h, clear, screen, rangeGrid, legend, actColor, toast } from '../ui.js';
import * as store from '../store.js';
import * as R from '../ranges.js';
import { buildStrategy, strategyToRanges } from '../lib/notation.js';
import { download } from './settings.js';
import { ALL_HANDS } from '../lib/hands.js';

export function render(root) {
  const { el, body } = screen('Range Editor', { back: '#/' });
  root.append(el);
  const files = R.getFiles();
  let fileIdx = 0;
  let spotId = files[0].data.spots[0].id;
  const brush = { action: null, freq: 1 };

  draw();

  function draw() {
    const file = files[fileIdx];
    const spot = R.getSpot(spotId);
    const acts = spot.actions.filter((a) => !(spot.decoys || []).includes(a));
    if (!acts.includes(brush.action)) brush.action = acts[0];
    // Working copy of the strategy we mutate while painting
    const strat = JSON.parse(JSON.stringify(R.strategy(spot)));
    const def = acts[acts.length - 1];

    const fileSel = h('select', { onchange: (e) => { fileIdx = +e.target.value; spotId = files[fileIdx].data.spots[0].id; draw(); } },
      files.map((f, i) => h('option', { value: i, selected: i === fileIdx }, f.data.title)));
    const spotSel = h('select', { onchange: (e) => { spotId = e.target.value; draw(); } },
      file.data.spots.map((s) => h('option', { value: s.id, selected: s.id === spotId }, `${s.title}${store.get().rangeOverrides[s.id] ? ' ✎' : ''}`)));

    const gridWrap = h('div');
    const legendWrap = h('div');
    const texts = {};
    const redrawGrid = () => {
      clear(gridWrap).append(rangeGrid(strat, acts, { onCell: paint, onDrag: paint }));
      const tot = {};
      for (const hd of ALL_HANDS) for (const [a, f] of Object.entries(strat[hd])) tot[a] = (tot[a] || 0) + f * (hd.length === 2 ? 6 : hd[2] === 's' ? 4 : 12);
      for (const a in tot) tot[a] /= 1326;
      clear(legendWrap).append(legend(acts, tot), h('p.fine', '% of all 1326 combos.'));
      const rs = strategyToRanges(acts, strat);
      for (const a of acts) if (texts[a]) texts[a].value = rs[a] || '';
    };

    let lastPainted = null;
    function paint(hand) {
      if (hand === lastPainted) return;
      lastPainted = hand;
      setTimeout(() => (lastPainted = null), 250);
      const mix = strat[hand];
      if (brush.action === def) {
        // fold brush: remove the other actions' share proportionally
        for (const a of acts) mix[a] = a === def ? 1 : 0;
      } else {
        mix[brush.action] = brush.freq;
        let room = 1 - brush.freq;
        for (const a of acts) {
          if (a === brush.action || a === def) continue;
          mix[a] = Math.min(mix[a] || 0, room);
          room -= mix[a];
        }
        mix[def] = Math.max(0, room);
      }
      for (const a of Object.keys(mix)) if (mix[a] < 0.001) delete mix[a];
      redrawGrid();
    }

    const brushRow = h('div.chips');
    const drawBrush = () => clear(brushRow).append(
      ...acts.map((a) => h(`button.chip${brush.action === a ? '.on' : ''}`, { style: { borderColor: actColor(a) }, onclick: () => { brush.action = a; drawBrush(); } }, R.label(a))),
      h('span.sep'),
      ...[1, 0.75, 0.5, 0.25].map((f) => h(`button.chip${brush.freq === f ? '.on' : ''}`, { disabled: brush.action === def, onclick: () => { brush.freq = f; drawBrush(); } }, `${f * 100}%`)));
    drawBrush();

    const textAreas = acts.slice(0, -1).map((a) => {
      texts[a] = h('textarea.mono', { rows: 3, spellcheck: false });
      return h('label.field', h('span', `${R.label(a)} range`), texts[a]);
    });

    clear(body).append(
      h('div.card', h('label.field', h('span', 'File'), fileSel), h('label.field', h('span', 'Spot'), spotSel), h('p.line', spot.line), h('p.fine', file.data.disclaimer)),
      h('div.card', h('h3', 'Brush — tap or drag on the grid'), brushRow, gridWrap, legendWrap),
      h('div.card',
        h('h3', 'Notation'),
        ...textAreas,
        h('p.fine', `Remaining frequency is ${R.label(def)}. Actions apply in order: a later action only gets what's left. Tokens: 22+, 99-66, A2s+, K9o-K6o, AK, A5s:0.5`),
        h('button.btn.sm', { onclick: () => {
          try {
            const ranges = Object.fromEntries(acts.slice(0, -1).map((a) => [a, texts[a].value]));
            const st2 = buildStrategy(acts, ranges);
            for (const hd of ALL_HANDS) strat[hd] = st2[hd];
            redrawGrid();
            toast('Applied text to grid');
          } catch (e) { toast(e.message, 4000); }
        } }, 'Apply text → grid')),
      h('div.btnrow.sticky',
        h('button.btn.primary', { onclick: () => {
          store.update((s) => (s.rangeOverrides[spot.id] = { ranges: strategyToRanges(acts, strat), t: Date.now() }));
          R.rebuild();
          toast('Saved — drills now use your range');
          draw();
        } }, 'Save'),
        h('button.btn', { onclick: () => {
          if (!confirm('Reset this spot to the baseline from the JSON file?')) return;
          store.update((s) => delete s.rangeOverrides[spot.id]);
          R.rebuild();
          draw();
        } }, 'Reset'),
        h('button.btn', { onclick: () => exportFile(file) }, '⬇ File')),
    );
    redrawGrid();
  }

  function exportFile(file) {
    const ov = store.get().rangeOverrides;
    const data = { ...file.data, spots: file.data.spots.map((s) => (ov[s.id] ? { ...s, ranges: ov[s.id].ranges } : s)) };
    download(file.file, JSON.stringify(data, null, 1) + '\n');
    toast(`Downloaded ${file.file} — commit it to data/ranges/`);
  }
}
