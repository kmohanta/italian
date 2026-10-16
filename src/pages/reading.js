import { h, formatDateTime, append } from '../components/dom.js';
import { icon } from '../components/icons.js';
import { pageHeader } from '../components/page-layout.js';
import { getStore } from '../core/storage.js';
import { STORIES, getStory } from '../core/data-loader.js';
import { pageUrl } from '../core/pages.js';
import { storyWordCount } from '../reading/reading-engine.js';

export function context() {
  return { title: 'Reading' };
}

export function render(main) {
  const state = getStore().get();
  append(main, 
    pageHeader('Reading', `${STORIES.length} original graded stories, from very short A0 texts to A2–B1 narratives that use the whole tense system. Every word can be clicked for its meaning and grammar; every verb form shows its tense, mood and person, and links to the lesson that explains it — even if you have not studied that lesson yet.`)
  );
  const history = state.reading.history.map((x) => getStory(x.id)).filter(Boolean).slice(0, 3);
  if (history.length) {
    append(main, h('p', { class: 'muted' }, 'Recently opened: ', history.map((s, i) => [i ? ' · ' : '', h('a', { href: pageUrl('story', { id: s.id }), lang: 'it' }, s.title)])));
  }
  const groups = [
    ['Very short stories (A0–A1)', 'A0–A1'],
    ['Short stories (A1)', 'A1'],
    ['A longer story (A1–A2)', 'A1–A2'],
    ['Narratives with the full tense system (A2–B1)', 'A2–B1']
  ];
  for (const [title, level] of groups) {
    const stories = STORIES.filter((s) => s.level === level);
    if (!stories.length) continue;
    append(main, 
      h(
        'section',
        { class: 'story-group', 'aria-label': title },
        h('h2', {}, title),
        h(
          'ul',
          { class: 'story-list' },
          stories.map((s) => {
            const read = state.reading.read[s.id];
            const fav = state.reading.favourites.includes(s.id);
            const comp = state.reading.comprehension[s.id];
            return h(
              'li',
              { class: 'story-item' },
              h('a', { class: 'story-item__link', href: pageUrl('story', { id: s.id }) }, h('span', { class: 'story-item__title', lang: 'it' }, s.title), h('span', { class: 'story-item__en' }, s.titleEnglish)),
              h('p', { class: 'story-item__summary' }, s.summary),
              h(
                'p',
                { class: 'story-item__meta' },
                h('span', { class: 'tag tag--level' }, s.level),
                h('span', { class: 'tag' }, `${storyWordCount(s)} words`),
                read ? h('span', { class: 'badge badge--completed' }, icon('Check', { size: 14 }), ` Read ${formatDateTime(read)}`) : null,
                comp ? h('span', { class: 'badge' }, `Questions: ${comp.best}/${comp.total}`) : null,
                fav ? h('span', { class: 'tag tag--fav' }, icon('Star', { size: 14, label: 'favourite' })) : null
              )
            );
          })
        )
      )
    );
  }
}
