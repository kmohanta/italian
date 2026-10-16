/**
 * Shared entry point for every HTML page.
 *
 * Each page's <body> carries data-page="…"; the matching module in
 * src/pages/ is loaded (Vite splits each into its own chunk) and mounted
 * inside the shared layout.
 */
import './styles/main.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/lessons.css';
import './styles/reading.css';
import './styles/responsive.css';

import { renderShell } from './components/page-layout.js';
import { pageById } from './core/pages.js';
import { h } from './components/dom.js';

const modules = import.meta.glob('./pages/*.js');

export async function mountPage(pageId, root = document.getElementById('app')) {
  const meta = pageById(pageId) || pageById('index');
  const file = `./pages/${meta.id === 'index' ? 'dashboard' : meta.id}.js`;
  const loader = modules[file];
  try {
    const page = await loader();
    const context = page.context ? page.context() : {};
    const main = renderShell(root, { pageId: meta.id, title: context.title || meta.title, breadcrumbs: context.breadcrumbs });
    await page.render(main, context);
  } catch (err) {
    console.error(err);
    const main = renderShell(root, { pageId: meta.id, title: 'Error' });
    main.append(
      h(
        'section',
        { class: 'empty-state' },
        h('h1', {}, 'Something went wrong'),
        h('p', {}, 'This page could not be displayed. Your saved progress is not affected.'),
        h('pre', { class: 'error-detail' }, String(err && err.message ? err.message : err)),
        h('a', { class: 'btn btn--primary', href: 'index.html' }, 'Back to the dashboard')
      )
    );
  }
}

if (typeof document !== 'undefined' && document.body && document.body.dataset.page && !import.meta.env?.VITEST) {
  mountPage(document.body.dataset.page);
}
