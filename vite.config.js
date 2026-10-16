import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES } from './src/core/pages.js';

/*
 * Base path
 * ---------
 * Every HTML page lives at the site root, and all links between pages are
 * relative (e.g. "lesson.html?id=x"). A relative base ("./") therefore works
 * unchanged for both kinds of GitHub Pages site:
 *
 *   https://username.github.io/            (user / organisation site)
 *   https://username.github.io/repository/ (project site)
 *
 * If you ever need an absolute base (for example when moving pages into
 * sub-directories), set BASE_PATH at build time:
 *
 *   BASE_PATH=/italian-learning-lab/ npm run build
 */
const base = process.env.BASE_PATH || './';

const root = dirname(fileURLToPath(import.meta.url));

const input = Object.fromEntries(
  PAGES.map((page) => [page.id, resolve(root, page.file)])
);

export default defineConfig({
  base,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    // All course content (lessons, vocabulary, stories) is bundled as JSON so
    // the site works offline; the main chunk is therefore large but compresses
    // well (to about a quarter of its size with gzip, which GitHub Pages applies).
    chunkSizeWarningLimit: 1200,
    rollupOptions: { input }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    css: false
  }
});
