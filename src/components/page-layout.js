/**
 * Shared page shell: skip link, sidebar navigation (collapsible on small
 * screens), header with search and theme toggle, main content area and
 * footer. Every page renders inside it.
 */
import { h, clear, append } from './dom.js';
import { icon } from './icons.js';
import { renderNavigation, renderBreadcrumbs } from './navigation.js';
import { getStore } from '../core/storage.js';
import { siteSearch } from '../core/search.js';
import { pageUrl } from '../core/pages.js';
import { banner } from './notifications.js';

const TEXT_SIZES = { small: '15px', medium: '17px', large: '19px', 'x-large': '21px' };

export function applyPreferences(settings) {
  const root = document.documentElement;
  if (settings.theme === 'light' || settings.theme === 'dark') root.dataset.theme = settings.theme;
  else delete root.dataset.theme;
  root.style.setProperty('--base-font-size', TEXT_SIZES[settings.textSize] || TEXT_SIZES.medium);
}

function themeButton(store) {
  const order = ['auto', 'light', 'dark'];
  const labels = { auto: 'Theme: follow system', light: 'Theme: light', dark: 'Theme: dark' };
  const icons = { auto: 'Monitor', light: 'Sun', dark: 'Moon' };
  const btn = h('button', { type: 'button', class: 'icon-btn' });
  const paint = () => {
    const t = store.get().settings.theme;
    btn.replaceChildren(icon(icons[t]));
    btn.setAttribute('aria-label', `${labels[t]}. Click to change.`);
    btn.title = labels[t];
  };
  btn.addEventListener('click', () => {
    const t = store.get().settings.theme;
    const next = order[(order.indexOf(t) + 1) % order.length];
    store.update((d) => {
      d.settings.theme = next;
    });
    applyPreferences(store.get().settings);
    paint();
  });
  paint();
  return btn;
}

function searchBox(store) {
  const listId = 'site-search-results';
  const input = h('input', {
    type: 'search',
    class: 'search__input',
    placeholder: 'Search lessons, words, stories…',
    'aria-label': 'Search the site',
    'aria-controls': listId,
    'aria-expanded': 'false',
    autocomplete: 'off'
  });
  const list = h('ul', { class: 'search__results', id: listId, role: 'listbox', hidden: true });
  const hrefFor = (r) =>
    r.type === 'lesson'
      ? pageUrl('lesson', { id: r.id })
      : r.type === 'word'
        ? pageUrl('vocabulary', { word: r.id })
        : r.type === 'story'
          ? pageUrl('story', { id: r.id })
          : pageUrl('song', { id: r.id });
  const render = () => {
    const results = siteSearch(input.value, store.get().vocabulary.custom);
    clear(list);
    if (!input.value.trim() || input.value.trim().length < 2) {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      return;
    }
    if (!results.length) append(list, h('li', { class: 'search__empty' }, 'No matches.'));
    for (const r of results) {
      append(list, h('li', { role: 'option' }, h('a', { href: hrefFor(r) }, h('span', { class: 'search__title', lang: r.type === 'lesson' ? 'en' : 'it' }, r.title), h('span', { class: 'search__detail' }, r.detail))));
    }
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };
  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      render();
    }
    if (e.key === 'ArrowDown') {
      const first = list.querySelector('a');
      if (first) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  list.addEventListener('keydown', (e) => {
    const links = [...list.querySelectorAll('a')];
    const i = links.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' && i < links.length - 1) {
      e.preventDefault();
      links[i + 1].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      (i > 0 ? links[i - 1] : input).focus();
    } else if (e.key === 'Escape') {
      input.focus();
      input.value = '';
      render();
    }
  });
  const wrap = h('div', { class: 'search', role: 'search' }, icon('Search'), input, list);
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
    }
  });
  return wrap;
}

/**
 * Build the page shell and return the <main> element for the page content.
 * opts: { pageId, title, breadcrumbs }
 */
export function renderShell(root, { pageId, title, breadcrumbs } = {}) {
  const store = getStore();
  applyPreferences(store.get().settings);
  document.title = title ? `${title} · Italian Learning Lab` : 'Italian Learning Lab';

  const sidebarId = 'sidebar';
  const toggle = h(
    'button',
    { type: 'button', class: 'icon-btn menu-toggle', 'aria-controls': sidebarId, 'aria-expanded': 'false', 'aria-label': 'Open menu' },
    icon('Menu')
  );
  const sidebar = h(
    'aside',
    { class: 'sidebar', id: sidebarId },
    h('a', { class: 'brand', href: 'index.html' }, h('span', { class: 'brand__mark', 'aria-hidden': 'true' }, 'It'), h('span', { class: 'brand__name' }, 'Italian Learning Lab')),
    renderNavigation(pageId),
    h('p', { class: 'sidebar__note' }, 'Your progress is saved in this browser only.')
  );
  const setMenu = (open) => {
    document.body.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    toggle.replaceChildren(icon(open ? 'X' : 'Menu'));
  };
  toggle.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
  sidebar.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('menu-open')) {
      setMenu(false);
      toggle.focus();
    }
  });
  const scrim = h('div', { class: 'scrim', onclick: () => setMenu(false) });

  const header = h(
    'header',
    { class: 'topbar' },
    toggle,
    h('a', { class: 'topbar__brand', href: 'index.html' }, 'Italian Learning Lab'),
    searchBox(store),
    themeButton(store)
  );

  const main = h('main', { id: 'main', class: 'main', tabindex: '-1' });
  const crumbs = renderBreadcrumbs(breadcrumbs);
  const footer = h(
    'footer',
    { class: 'footer' },
    h('p', {}, 'Italian Learning Lab — open-source, offline-first. Progress is stored only in this browser; export a backup from ', h('a', { href: 'settings.html' }, 'Settings'), '.'),
    h('p', {}, h('a', { href: 'sources.html' }, 'Sources & licences'), ' · Code MIT · Content CC BY 4.0')
  );

  clear(root);
  root.removeAttribute('aria-busy');
  root.className = 'app';
  append(root, 
    h('a', { class: 'skip-link', href: '#main' }, 'Skip to content'),
    sidebar,
    scrim,
    h('div', { class: 'content' }, header, h('div', { class: 'page' }, crumbs, ...store.warnings.map((w) => banner(w)), main, footer))
  );
  return main;
}

/** Friendly message for a missing or invalid item, with a way back. */
export function renderNotFound(main, { what = 'page', backHref = 'index.html', backLabel = 'Go to the dashboard', detail } = {}) {
  clear(main);
  append(main, 
    h(
      'section',
      { class: 'empty-state' },
      h('h1', {}, `This ${what} could not be found`),
      h('p', {}, detail || `The link may be out of date, or the ${what} may have been renamed.`),
      h('a', { class: 'btn btn--primary', href: backHref }, backLabel)
    )
  );
}

/** Standard page heading. */
export function pageHeader(title, intro, actions) {
  return h('header', { class: 'page-header' }, h('div', {}, h('h1', {}, title), intro ? h('p', { class: 'lead' }, intro) : null), actions ? h('div', { class: 'page-header__actions' }, actions) : null);
}
