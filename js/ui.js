/**
 * ui.js — tiny DOM helpers + shared widgets (cards, 13x13 range grid, timer bar, toasts).
 */
import { RANKS, handAt, SUIT_GLYPH } from './lib/hands.js';
import { label } from './ranges.js';

/** h('div.card#id', {onclick, style:{...}, dataset:{...}}, children...) */
export function h(sel, attrs, ...kids) {
  if (attrs == null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) {
    kids.unshift(attrs);
    attrs = {};
  }
  const [tagPart, ...rest] = sel.split(/(?=[.#])/);
  const el = document.createElement(tagPart || 'div');
  for (const r of rest) {
    if (r[0] === '.') el.classList.add(r.slice(1));
    else if (r[0] === '#') el.id = r.slice(1);
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list' && k !== 'type') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

/** Standard screen: sticky header with back link + scrollable body + optional sticky footer. */
export function screen(title, { back = '#/', right = null } = {}) {
  const body = h('main.body');
  const foot = h('footer.foot');
  const el = h('section.screen',
    h('header.top', back ? h('a.back', { href: back, 'aria-label': 'Back' }, '‹') : h('span.back'), h('h1', title), right || h('span.back')),
    body, foot);
  return { el, body, foot };
}

export function cardEl(card, size = '') {
  const suit = card[1];
  return h(`div.pcard.s-${suit}${size ? '.' + size : ''}`, h('span.r', card[0] === 'T' ? '10' : card[0]), h('span.su', SUIT_GLYPH[suit]));
}

export function handCards(combo, size) {
  return h('div.hand', combo.map((c) => cardEl(c, size)));
}

/** Action → CSS colour variable. */
export function actColor(a) {
  return { raise: 'var(--agg)', '3bet': 'var(--agg)', '4bet': 'var(--agg2)', jam: 'var(--agg)', call: 'var(--call)', fold: 'var(--fold)', limp: 'var(--limp)' }[a] || 'var(--fold)';
}

/** Cell background for a mixed strategy: hard-stop stacked gradient left→right. */
export function mixBg(mix, actions) {
  let acc = 0;
  const stops = [];
  for (const a of actions) {
    const f = mix[a] || 0;
    if (f <= 0.001) continue;
    const c = actColor(a);
    stops.push(`${c} ${acc * 100}%`, `${c} ${(acc + f) * 100}%`);
    acc += f;
  }
  return stops.length ? `linear-gradient(90deg, ${stops.join(', ')})` : 'var(--fold)';
}

/**
 * 13x13 grid. `strat` = hand -> {action: freq}.
 * opts: highlight (hand), dim (hand->bool, for hands outside the reachable range), onCell(hand)
 */
export function rangeGrid(strat, actions, opts = {}) {
  const grid = h('div.grid', { role: 'grid' });
  for (let i = 0; i < 13; i++) {
    for (let j = 0; j < 13; j++) {
      const hand = handAt(i, j);
      const cell = h('div.cell', { dataset: { hand } }, hand.length === 2 ? hand : hand.slice(0, 2) + (i < j ? 's' : 'o'));
      cell.style.background = mixBg(strat[hand], actions);
      if (opts.dim && opts.dim(hand)) cell.classList.add('dim');
      if (opts.highlight === hand) cell.classList.add('hi');
      if (opts.onCell) cell.addEventListener('pointerdown', (e) => { e.preventDefault(); opts.onCell(hand, cell); });
      grid.append(cell);
    }
  }
  if (opts.onDrag) {
    // Paint by dragging a finger across cells (range editor)
    grid.addEventListener('pointermove', (e) => {
      if (!e.buttons && e.pointerType === 'mouse') return;
      const t = document.elementFromPoint(e.clientX, e.clientY);
      if (t?.classList.contains('cell') && t.parentElement === grid) opts.onDrag(t.dataset.hand, t);
    });
    grid.style.touchAction = 'none';
  }
  return grid;
}

export function legend(actions, totals) {
  return h('div.legend', actions.map((a) => h('span.lg', h('i', { style: { background: actColor(a) } }), label(a), totals && totals[a] != null ? ` ${Math.round(totals[a] * 100)}%` : '')));
}

/** Countdown bar. Calls onEnd once. Returns {stop, remaining()} */
export function timerBar(seconds, onEnd, { onTick } = {}) {
  const fill = h('div.tfill');
  const txt = h('span.ttxt');
  const el = h('div.tbar', fill, txt);
  const start = performance.now();
  let done = false;
  let raf;
  const tick = () => {
    const left = Math.max(0, seconds - (performance.now() - start) / 1000);
    fill.style.transform = `scaleX(${left / seconds})`;
    const secs = Math.ceil(left);
    txt.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    if (left < 10) el.classList.add('low');
    onTick && onTick(left);
    if (left <= 0) {
      if (!done) { done = true; onEnd(); }
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  tick();
  return { el, stop: () => { done = true; cancelAnimationFrame(raf); }, remaining: () => Math.max(0, seconds - (performance.now() - start) / 1000) };
}

export function toast(msg, ms = 2200) {
  const t = h('div.toast', msg);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}

export const pct = (x, d = 0) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`);

export function buzz(ok) {
  try { navigator.vibrate && navigator.vibrate(ok ? 15 : [30, 40, 30]); } catch { /* not supported */ }
}

export { RANKS };
