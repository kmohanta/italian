/**
 * Tiny DOM helpers. No framework: elements are built with h() and text is
 * always inserted as text nodes, so learner-entered content (notes, pasted
 * lyrics, custom words) can never inject HTML.
 */

/**
 * h('button', { class: 'btn', onclick: fn, 'aria-label': 'Close' }, 'Text', childNode)
 * - attributes starting with "on" become event listeners
 * - `class` may be a string or an array (falsy entries ignored)
 * - `dataset` and `style` may be objects
 * - children may be strings, numbers, nodes, arrays, null/false (ignored)
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v; // only ever used with trusted, escaped content
    else if (v === true) el.setAttribute(k, '');
    else if (k in el && !k.includes('-') && k !== 'list' && k !== 'form') el[k] = v;
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

/** Append children, skipping null/undefined/false (native Element.append would print "null"). */
export function append(el, ...children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false || c === '') continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Inline formatting for course text (trusted content only):
 *   *parola*   → <em lang="it">parola</em>  (Italian words in explanations)
 *   **text**   → <strong>text</strong>
 *   [[lesson-id|label]] → link to that lesson
 */
export function formatInline(text) {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em lang="it">$1</em>')
    .replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, '<a class="lesson-ref" href="lesson.html?id=$1">$2</a>');
}

/** Lesson IDs referenced with the [[lesson-id|label]] syntax in course text. */
export function lessonRefs(text) {
  return [...String(text).matchAll(/\[\[([a-z0-9-]+)\|[^\]]+\]\]/g)].map((m) => m[1]);
}

/** Element containing formatted course text. */
export function rich(tag, text, attrs = {}) {
  return h(tag, { ...attrs, html: formatInline(text) });
}

/** Italian text element with the correct lang attribute (for screen readers and TTS). */
export function it(tag, text, attrs = {}) {
  return h(tag, { lang: 'it', ...attrs }, text);
}

export function pct(x) {
  return x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`;
}

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Simple progress bar with an accessible label. */
export function progressBar(value, max, label) {
  const ratio = max ? Math.min(1, value / max) : 0;
  return h(
    'div',
    { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': value, 'aria-label': label },
    h('div', { class: 'progress__bar', style: { width: `${Math.round(ratio * 100)}%` } })
  );
}
