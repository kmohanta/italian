/**
 * Single source of truth for the site's pages.
 *
 * - `vite.config.js` uses it to register every HTML entry point.
 * - The navigation component uses the entries with `nav: true`.
 * - Tests use it to verify that every navigation link has a real page.
 *
 * `section` decides which navigation item is highlighted: a lesson page
 * belongs to the "learning-path" section, a story to "reading", and so on.
 */
export const PAGES = [
  { id: 'index', file: 'index.html', title: 'Dashboard', nav: true, icon: 'House', section: 'index' },
  { id: 'learning-path', file: 'learning-path.html', title: 'Learning path', nav: true, icon: 'Route', section: 'learning-path' },
  { id: 'grammar', file: 'grammar.html', title: 'Grammar', nav: true, icon: 'BookOpen', section: 'grammar' },
  { id: 'vocabulary', file: 'vocabulary.html', title: 'Vocabulary', nav: true, icon: 'Languages', section: 'vocabulary' },
  { id: 'reading', file: 'reading.html', title: 'Reading', nav: true, icon: 'BookText', section: 'reading' },
  { id: 'songs', file: 'songs.html', title: 'Songs', nav: true, icon: 'Music', section: 'songs' },
  { id: 'review', file: 'review.html', title: 'Review', nav: true, icon: 'Repeat', section: 'review' },
  { id: 'progress', file: 'progress.html', title: 'Progress', nav: true, icon: 'ChartColumn', section: 'progress' },
  { id: 'settings', file: 'settings.html', title: 'Settings', nav: true, icon: 'Settings', section: 'settings' },
  { id: 'sources', file: 'sources.html', title: 'Sources & licences', nav: true, icon: 'Library', section: 'sources' },
  { id: 'lesson', file: 'lesson.html', title: 'Lesson', nav: false, section: 'learning-path' },
  { id: 'story', file: 'story.html', title: 'Story', nav: false, section: 'reading' },
  { id: 'song', file: 'song.html', title: 'Song', nav: false, section: 'songs' },
  { id: 'diagnostic', file: 'diagnostic.html', title: 'Diagnostic test', nav: false, section: 'learning-path' }
];

export const NAV_PAGES = PAGES.filter((p) => p.nav);

export function pageById(id) {
  return PAGES.find((p) => p.id === id) || null;
}

/** Relative URL for a page, optionally with query parameters. */
export function pageUrl(id, params = {}) {
  const page = pageById(id);
  if (!page) throw new Error(`Unknown page: ${id}`);
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  return query ? `${page.file}?${query}` : page.file;
}
