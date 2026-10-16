/**
 * Unobtrusive notifications. One polite live region announces messages to
 * screen readers; visible toasts disappear on their own and never block
 * the page.
 */
import { h, append } from './dom.js';

let region = null;

function ensureRegion() {
  if (region && document.body.contains(region)) return region;
  region = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
  append(document.body, region);
  return region;
}

export function notify(message, { type = 'info', timeout = 3500 } = {}) {
  if (typeof document === 'undefined') return;
  const r = ensureRegion();
  const toast = h('div', { class: ['toast', `toast--${type}`] }, message);
  append(r, toast);
  setTimeout(() => {
    toast.classList.add('toast--leaving');
    setTimeout(() => toast.remove(), 300);
  }, timeout);
}

/** Persistent banner inside a container, for important warnings. */
export function banner(message, { type = 'warning' } = {}) {
  return h('div', { class: ['banner', `banner--${type}`], role: type === 'error' ? 'alert' : 'note' }, message);
}
