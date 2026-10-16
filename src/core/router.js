/**
 * Minimal routing helpers for a multi-page site.
 *
 * Each major destination is a real HTML page; individual items are chosen
 * with query parameters (lesson.html?id=present-are). Sub-views inside a
 * page use the URL hash (grammar.html#analyser). No client-side router is
 * needed.
 */

export function getParam(name, search = globalThis.location ? globalThis.location.search : '') {
  return new URLSearchParams(search).get(name);
}

export function getHash(hash = globalThis.location ? globalThis.location.hash : '') {
  return decodeURIComponent(String(hash).replace(/^#/, ''));
}

export function setHash(value) {
  if (!globalThis.history) return;
  const url = new URL(globalThis.location.href);
  url.hash = value ? `#${encodeURIComponent(value)}` : '';
  globalThis.history.replaceState(null, '', url);
}

/** Replace query parameters without reloading (keeps the browser history clean). */
export function setParams(params) {
  if (!globalThis.history) return;
  const url = new URL(globalThis.location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '') url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  globalThis.history.replaceState(null, '', url);
}
