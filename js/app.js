/**
 * app.js — boot + hash router. Each route module exports render(root) and may
 * return a cleanup function (stops timers when you navigate away).
 */
import { loadRanges } from './ranges.js';
import { h } from './ui.js';
import * as home from './modules/home.js';
import * as warmup from './modules/warmup.js';
import * as f3b from './modules/facing3bet.js';
import * as preflop from './modules/preflop.js';
import * as math from './modules/math.js';
import * as checkin from './modules/checkin.js';
import * as dashboard from './modules/dashboard.js';
import * as history from './modules/history.js';
import * as settings from './modules/settings.js';
import * as editor from './modules/editor.js';

// Future modules plug in here: postflop, handreading, icm.
const ROUTES = { '': home, warmup, f3b, preflop, math, checkin, dashboard, history, settings, editor };

const root = document.getElementById('app');
let cleanup = null;

function route() {
  const name = location.hash.replace(/^#\/?/, '').split('?')[0];
  const mod = ROUTES[name] || home;
  if (typeof cleanup === 'function') cleanup();
  root.replaceChildren();
  window.scrollTo(0, 0);
  try {
    cleanup = mod.render(root);
  } catch (e) {
    console.error(e);
    root.append(h('div.card', h('h2', 'Something broke'), h('pre', String(e.stack || e)), h('a.btn', { href: '#/' }, 'Home')));
  }
}

async function boot() {
  try {
    await loadRanges();
  } catch (e) {
    root.replaceChildren(h('div.card', h('h2', 'Could not load ranges'), h('p', String(e)), h('p.fine', 'If offline on first launch, open once with a connection so the app can cache itself.')));
    return;
  }
  window.addEventListener('hashchange', route);
  route();
}

// Service worker: offline + installable. Shows a banner when a new version is ready.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            const bar = h('button.update', { onclick: () => location.reload() }, 'New version ready — tap to reload');
            document.body.append(bar);
          }
        });
      });
    }).catch((e) => console.warn('SW registration failed', e));
  });
}

boot();
