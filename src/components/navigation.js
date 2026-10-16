import { h } from './dom.js';
import { icon } from './icons.js';
import { NAV_PAGES, pageById } from '../core/pages.js';

/** The main navigation list; the current section is marked with aria-current. */
export function renderNavigation(pageId) {
  const current = pageById(pageId);
  const section = current ? current.section : pageId;
  return h(
    'nav',
    { class: 'nav', 'aria-label': 'Main' },
    h(
      'ul',
      { class: 'nav__list' },
      NAV_PAGES.map((p) =>
        h(
          'li',
          {},
          h(
            'a',
            { class: ['nav__link', p.section === section && 'is-active'], href: p.file, 'aria-current': p.section === section ? 'page' : null },
            icon(p.icon),
            h('span', {}, p.title)
          )
        )
      )
    )
  );
}

/** Breadcrumbs: [{ label, href }] — the last item is the current page. */
export function renderBreadcrumbs(items) {
  if (!items || !items.length) return null;
  return h(
    'nav',
    { class: 'breadcrumbs', 'aria-label': 'Breadcrumb' },
    h(
      'ol',
      {},
      items.map((item, i) =>
        h(
          'li',
          {},
          i < items.length - 1 && item.href ? h('a', { href: item.href }, item.label) : h('span', { 'aria-current': 'page' }, item.label)
        )
      )
    )
  );
}
