import { h, pct, progressBar, append } from '../components/dom.js';
import { icon } from '../components/icons.js';
import { pageHeader } from '../components/page-layout.js';
import { getStore } from '../core/storage.js';
import { MODULES, PRACTICE_SETS, getLesson } from '../core/data-loader.js';
import { moduleProgress, recommendedLesson, masteryExplanation } from '../core/progress.js';
import { pageUrl } from '../core/pages.js';

export function context() {
  return { title: 'Learning path' };
}

const STATE_LABEL = { 'not-started': 'Not started', opened: 'Opened', completed: 'Completed' };
const MASTERY_LABEL = { none: '', practising: 'Practising', secure: 'Secure' };

function statusBadges(s) {
  return h(
    'span',
    { class: 'badges' },
    h('span', { class: ['badge', `badge--${s.state}`] }, STATE_LABEL[s.state]),
    s.mastery !== 'none' ? h('span', { class: ['badge', `badge--${s.mastery}`], title: masteryExplanation(s) }, `${MASTERY_LABEL[s.mastery]} · ${pct(s.accuracy)}`) : null
  );
}

export function render(main) {
  const state = getStore().get();
  const next = recommendedLesson(state);
  append(main, 
    pageHeader(
      'Learning path',
      'Twenty modules in a graded order, from pronunciation to the complete tense and mood system. Accurate rules are taught from the start; difficulty is controlled through vocabulary and sentence length. Every lesson stays open: revisit anything at any time.',
      h('a', { class: 'btn btn--ghost', href: 'diagnostic.html' }, icon('ListChecks'), 'Diagnostic test')
    ),
    h(
      'p',
      { class: 'note' },
      'Two kinds of progress are shown. ',
      h('strong', {}, 'Completed'),
      ' means you marked the lesson as finished. ',
      h('strong', {}, 'Secure'),
      ' means your exercise results show it: most answers right on your latest attempt, at least 70% accuracy overall, and practice on more than one day. Opening a lesson is not counted as mastery.'
    )
  );

  for (const m of MODULES) {
    const p = moduleProgress(state, m);
    const practice = PRACTICE_SETS.filter((set) => set.lessons.some((id) => m.lessons.includes(id)));
    append(main, 
      h(
        'section',
        { class: 'module', id: m.id, 'aria-labelledby': `${m.id}-h` },
        h(
          'header',
          { class: 'module__header' },
          h('div', {}, h('p', { class: 'eyebrow' }, `Module ${m.number} · ${m.level}`), h('h2', { id: `${m.id}-h` }, m.title), h('p', { class: 'muted' }, m.description)),
          h('div', { class: 'module__progress' }, progressBar(p.completed, p.total, `${m.title}: lessons completed`), h('p', { class: 'muted small' }, `${p.completed}/${p.total} completed · ${p.secure} secure`))
        ),
        h(
          'ol',
          { class: 'lesson-list' },
          p.lessons.map((l) => {
            const lesson = l.lessonId;
            const isNext = next && next.id === lesson;
            return h(
              'li',
              { class: ['lesson-item', isNext && 'is-next'] },
              h('a', { href: pageUrl('lesson', { id: lesson }), class: 'lesson-item__link' }, h('span', { class: 'lesson-item__title' }, titleOf(lesson)), isNext ? h('span', { class: 'badge badge--next' }, 'Next') : null),
              h('span', { class: 'lesson-item__meta' }, statusBadges(l), l.attempted ? h('a', { class: 'small', href: pageUrl('review', { lesson }) }, 'Practise') : null)
            );
          })
        ),
        practice.length
          ? h('p', { class: 'small' }, 'Mixed practice: ', practice.map((set, i) => [i ? ' · ' : '', h('a', { href: pageUrl('review', { set: set.id }) }, set.title)]))
          : null
      )
    );
  }
}

function titleOf(id) {
  const l = getLesson(id);
  return l ? l.title : id;
}
