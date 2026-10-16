// @vitest-environment jsdom
/**
 * Smoke tests: mount every page (and every lesson, story and song) in a
 * simulated browser and check that it renders real content without errors,
 * and that every internal link points to an existing page.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mountPage } from '../src/main.js';
import { PAGES } from '../src/core/pages.js';
import { LESSONS, STORIES, RHYMES, PRACTICE_SETS, getLesson, getStory } from '../src/core/data-loader.js';
import { setStore, createStore, memoryAdapter } from '../src/core/storage.js';

const files = new Set(PAGES.map((p) => p.file));

async function mount(pageId, url) {
  window.history.replaceState(null, '', url);
  document.body.innerHTML = '<div id="app"></div>';
  document.body.dataset.page = pageId;
  await mountPage(pageId, document.getElementById('app'));
  const main = document.querySelector('main');
  return main;
}

function checkLinks() {
  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (/^(https?:|mailto:|#)/.test(href)) continue;
    const file = href.split(/[?#]/)[0];
    expect(files.has(file), `broken internal link: ${href}`).toBe(true);
    const id = new URLSearchParams(href.split('?')[1] || '').get('id');
    if (file === 'lesson.html' && id) expect(getLesson(id), `link to a missing lesson: ${href}`).not.toBeNull();
    if (file === 'story.html' && id) expect(getStory(id), `link to a missing story: ${href}`).not.toBeNull();
  }
}

beforeEach(() => {
  setStore(createStore({ adapter: memoryAdapter() }));
});

describe('every page renders', () => {
  for (const p of PAGES) {
    it(p.id, async () => {
      const main = await mount(p.id, `/${p.file}`);
      expect(main).not.toBeNull();
      expect(document.querySelector('.error-detail'), main.textContent.slice(0, 300)).toBeNull();
      if (['lesson', 'story', 'song'].includes(p.id)) expect(main.querySelector('.empty-state')).not.toBeNull();
      else expect(main.textContent.trim().length).toBeGreaterThan(100);
      expect(document.querySelector('h1')).not.toBeNull();
      checkLinks();
    });
  }
});

describe('navigation', () => {
  it('marks the current section', async () => {
    await mount('lesson', '/lesson.html?id=present-are');
    const current = document.querySelector('.nav__link[aria-current="page"]');
    expect(current.getAttribute('href')).toBe('learning-path.html');
    expect(document.querySelector('.breadcrumbs')).not.toBeNull();
  });
});

describe('item pages', () => {
  for (const l of LESSONS) {
    it(`lesson ${l.id}`, async () => {
      const main = await mount('lesson', `/lesson.html?id=${l.id}`);
      expect(document.querySelector('.error-detail')).toBeNull();
      expect(main.querySelectorAll('.exercise').length).toBe(l.exercises.length);
      expect(main.querySelector('h1').textContent).toBe(l.title);
      checkLinks();
    });
  }
  for (const s of STORIES) {
    it(`story ${s.id}`, async () => {
      const main = await mount('story', `/story.html?id=${s.id}`);
      expect(document.querySelector('.error-detail')).toBeNull();
      expect(main.querySelectorAll('.sentence').length).toBe(s.paragraphs.flat().length);
      expect(main.querySelectorAll('.word--unknown').length).toBe(0);
      checkLinks();
    });
  }
  for (const r of RHYMES) {
    it(`song ${r.id}`, async () => {
      const main = await mount('song', `/song.html?id=${r.id}`);
      expect(document.querySelector('.error-detail')).toBeNull();
      expect(main.querySelectorAll('.lyric-line').length).toBe(r.lines.length);
      checkLinks();
    });
  }
  it('review variants', async () => {
    for (const url of ['/review.html?lesson=present-are', `/review.html?set=${PRACTICE_SETS[0].id}`, '/review.html?mode=mistakes', '/review.html?word=noun_gatto']) {
      const main = await mount('review', url);
      expect(document.querySelector('.error-detail'), url).toBeNull();
      expect(main.textContent.length).toBeGreaterThan(50);
    }
  });
  it('grammar tabs', async () => {
    for (const tab of ['reference', 'system', 'verbs', 'compare', 'nouns', 'analyser']) {
      const main = await mount('grammar', `/grammar.html#${tab}`);
      expect(document.querySelector('.error-detail'), tab).toBeNull();
      expect(main.querySelector('[role="tab"][aria-selected="true"]').id).toBe(`tab-${tab}`);
    }
  });
});

describe('missing items show a friendly message', () => {
  for (const [page, url] of [['lesson', '/lesson.html?id=nope'], ['lesson', '/lesson.html'], ['story', '/story.html?id=nope'], ['song', '/song.html?id=nope'], ['review', '/review.html?lesson=nope']]) {
    it(url, async () => {
      const main = await mount(page, url);
      expect(main.querySelector('.empty-state')).not.toBeNull();
      expect(main.querySelector('.empty-state a.btn')).not.toBeNull();
    });
  }
});

describe('interaction', () => {
  it('checks an exercise and records the result', async () => {
    const main = await mount('lesson', '/lesson.html?id=definite-articles');
    const ex = main.querySelector('[data-exercise-id="definite-articles.1"]');
    ex.querySelector('input[value="il"]').checked = true;
    ex.querySelector('.btn--primary').click();
    expect(ex.querySelector('.feedback').textContent).toMatch(/Not quite/);
    expect(ex.querySelector('.feedback').textContent).toMatch(/requires lo/);
    const { getStore } = await import('../src/core/storage.js');
    const rec = getStore().get().exercises['definite-articles.1'];
    expect(rec.attempts).toBe(1);
    expect(rec.lastCorrect).toBe(false);
    ex.querySelector('.exercise__actions .btn:not(.btn--primary)').click();
    ex.querySelector('input[value="lo"]').checked = true;
    ex.querySelector('.btn--primary').click();
    expect(ex.querySelector('.feedback').textContent).toMatch(/Correct/);
  });
  it('runs a flashcard session', async () => {
    const main = await mount('review', '/review.html');
    const show = main.querySelector('.review-controls .btn--primary');
    expect(show).not.toBeNull();
    show.click();
    const good = main.querySelector('.grade--good');
    expect(good.textContent).toMatch(/1 day/);
    good.click();
    const { getStore } = await import('../src/core/storage.js');
    const cards = Object.values(getStore().get().srs.cards);
    expect(cards.some((c) => c.reps === 1 && c.box === 1)).toBe(true);
  });
  it('opens the analysis of a clicked story word', async () => {
    const main = await mount('story', '/story.html?id=il-gatto-e-la-luna');
    const word = [...main.querySelectorAll('.word')].find((b) => b.textContent === 'dorme');
    word.click();
    const dialog = document.querySelector('dialog.modal');
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toMatch(/dormire/);
  });
  it('a verb form in an advanced story explains its tense and links to the lesson', async () => {
    const main = await mount('story', '/story.html?id=il-segreto-del-faro');
    const word = [...main.querySelectorAll('.word')].find((b) => b.textContent === 'vide');
    word.click();
    const dialog = document.querySelector('dialog.modal');
    expect(dialog.textContent).toMatch(/vedere/);
    expect(dialog.textContent).toMatch(/passato remoto/);
    expect(dialog.querySelector('a[href*="lesson.html?id=passato-remoto"]')).not.toBeNull();
  });
  it('a story lists the verb forms it uses, grouped by tense', async () => {
    const main = await mount('story', '/story.html?id=una-lettera-dalla-nonna');
    const panel = main.querySelector('.verb-forms');
    expect(panel).not.toBeNull();
    expect(panel.textContent).toMatch(/congiuntivo/);
    expect(panel.textContent).toMatch(/condizionale/);
  });
  it('lessons show their verification status and the sources page shows the register', async () => {
    const main = await mount('lesson', '/lesson.html?id=ausiliari-accordo');
    expect(main.querySelector('.verification').textContent).toMatch(/Not reviewed by a native speaker/);
    const src = await mount('sources', '/sources.html');
    expect(src.querySelector('#verification')).not.toBeNull();
    expect(src.querySelectorAll('#verification tbody tr').length).toBeGreaterThan(10);
  });
  it('lesson links written as [[id|label]] become working links', async () => {
    const main = await mount('lesson', '/lesson.html?id=passato-prossimo-avere');
    const link = main.querySelector('a.lesson-ref[href="lesson.html?id=ausiliari-accordo"]');
    expect(link).not.toBeNull();
  });
  it('the verb-system map in the overview lesson lists every tense', async () => {
    const main = await mount('lesson', '/lesson.html?id=verb-system-overview');
    expect(main.querySelectorAll('.table--overview tbody tr').length).toBe(15);
  });
});
