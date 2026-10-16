import { h, pct, progressBar, formatDateTime, append } from '../components/dom.js';
import { pageHeader } from '../components/page-layout.js';
import { getStore } from '../core/storage.js';
import { MODULES, STORIES } from '../core/data-loader.js';
import { pageUrl } from '../core/pages.js';
import { moduleProgress, overallStats, topicPerformance, revisionPriorities, recentErrors, SECURE_ACCURACY } from '../core/progress.js';
import { boxDistribution, forecast, retention, INTERVALS, KNOWN_FROM_BOX } from '../vocabulary/spaced-repetition.js';
import { getWord, displayLemma } from '../vocabulary/dictionary.js';
import { toDayKey, describeDay, addDays } from '../core/dates.js';
import { allSongs } from '../songs/song-manager.js';

export function context() {
  return { title: 'Progress' };
}

function bars(values, labels, caption) {
  const max = Math.max(1, ...values);
  return h(
    'figure',
    { class: 'barchart' },
    h('figcaption', {}, caption),
    h(
      'table',
      { class: 'barchart__table' },
      h('tbody', {}, values.map((v, i) => h('tr', {}, h('th', { scope: 'row' }, labels[i]), h('td', {}, h('span', { class: 'barchart__bar', style: { width: `${(v / max) * 100}%` } })), h('td', { class: 'barchart__value' }, String(v)))))
    )
  );
}

export function render(main) {
  const state = getStore().get();
  const today = toDayKey();
  const stats = overallStats(state);
  append(main, pageHeader('Progress', 'What you have done, what your results show, and what to revise next.'));

  // Summary
  append(main, 
    h(
      'section',
      { class: 'stats' },
      h('div', { class: 'stat' }, h('p', { class: 'stat__value' }, `${stats.lessonsCompleted}/${stats.lessonsTotal}`), h('p', { class: 'stat__label' }, 'lessons completed')),
      h('div', { class: 'stat' }, h('p', { class: 'stat__value' }, String(stats.lessonsSecure)), h('p', { class: 'stat__label' }, 'lessons secure')),
      h('div', { class: 'stat' }, h('p', { class: 'stat__value' }, pct(stats.exerciseAccuracy)), h('p', { class: 'stat__label' }, `exercise accuracy (${stats.exerciseAttempts} attempts)`)),
      h('div', { class: 'stat' }, h('p', { class: 'stat__value' }, pct(retention(state.srs.cards, today))), h('p', { class: 'stat__label' }, 'vocabulary retention, last 30 days')),
      h('div', { class: 'stat' }, h('p', { class: 'stat__value' }, `${stats.storiesRead}/${stats.storiesTotal}`), h('p', { class: 'stat__label' }, 'stories read')),
      h('div', { class: 'stat' }, h('p', { class: 'stat__value' }, String(stats.songsStudied)), h('p', { class: 'stat__label' }, 'songs studied'))
    )
  );

  // Revision priorities
  const pri = revisionPriorities(state, 8);
  append(main, 
    h(
      'section',
      { class: 'panel', 'aria-labelledby': 'pri-h' },
      h('h2', { id: 'pri-h' }, 'Suggested revision'),
      pri.length
        ? h('ol', { class: 'list' }, pri.map((p) => h('li', {}, h('a', { href: pageUrl('review', { lesson: p.lesson.id }) }, p.lesson.title), h('span', { class: 'muted' }, ` — ${p.reason}`))))
        : h('p', { class: 'muted' }, 'Nothing urgent. Suggestions appear once you have attempted some exercises.'),
      h('p', { class: 'small' }, h('a', { href: pageUrl('review', { mode: 'mistakes' }) }, 'Practise recent mistakes'))
    )
  );

  // Modules
  append(main, 
    h(
      'section',
      { class: 'panel', 'aria-labelledby': 'mod-h' },
      h('h2', { id: 'mod-h' }, 'By module'),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'table' },
          h('thead', {}, h('tr', {}, ['Module', 'Completed', 'Secure', 'Accuracy'].map((c) => h('th', { scope: 'col' }, c)))),
          h(
            'tbody',
            {},
            MODULES.map((m) => {
              const p = moduleProgress(state, m);
              const attempts = p.lessons.reduce((n, s) => n + s.attempts, 0);
              const correct = p.lessons.reduce((n, s) => n + s.correct, 0);
              return h(
                'tr',
                {},
                h('th', { scope: 'row' }, h('a', { href: `learning-path.html#${m.id}` }, `${m.number}. ${m.title}`)),
                h('td', {}, progressBar(p.completed, p.total, `${m.title} completed`), ` ${p.completed}/${p.total}`),
                h('td', {}, `${p.secure}/${p.total}`),
                h('td', {}, attempts ? pct(correct / attempts) : '—')
              );
            })
          )
        )
      )
    )
  );

  // Topics
  const topics = topicPerformance(state);
  append(main, 
    h(
      'section',
      { class: 'panel', 'aria-labelledby': 'top-h' },
      h('h2', { id: 'top-h' }, 'By grammatical topic'),
      topics.length
        ? h(
            'ul',
            { class: 'topic-list' },
            topics.map((t) =>
              h('li', { class: t.accuracy < SECURE_ACCURACY ? 'is-weak' : null }, h('span', { class: 'topic-list__name' }, t.topic), progressBar(Math.round((t.accuracy || 0) * 100), 100, `${t.topic} accuracy`), h('span', { class: 'topic-list__value' }, `${pct(t.accuracy)} · ${t.attempted}/${t.total} exercises`))
            )
          )
        : h('p', { class: 'muted' }, 'Topic accuracy appears after you try some exercises.')
    )
  );

  // Vocabulary
  const dist = boxDistribution(state.srs.cards);
  const fc = forecast(state.srs.cards, today, 7);
  const lapses = Object.values(state.srs.cards)
    .filter((c) => c.lapses >= 2)
    .sort((a, b) => b.lapses - a.lapses)
    .slice(0, 12)
    .map((c) => ({ c, w: getWord(c.id, state.vocabulary.custom) }))
    .filter((x) => x.w);
  append(main, 
    h(
      'section',
      { class: 'panel', 'aria-labelledby': 'voc-h' },
      h('h2', { id: 'voc-h' }, 'Vocabulary'),
      h('p', { class: 'muted' }, `${Object.keys(state.srs.cards).length} words in review; ${dist.slice(KNOWN_FROM_BOX).reduce((a, b) => a + b, 0)} known (box ${KNOWN_FROM_BOX} or higher, i.e. an interval of ${INTERVALS[KNOWN_FROM_BOX - 1]}+ days).`),
      h(
        'div',
        { class: 'grid-2' },
        bars(dist, ['box 0 (learning)', ...INTERVALS.map((d, i) => `box ${i + 1} (${d} d)`)], 'Cards per box'),
        bars(fc, fc.map((_, i) => (i === 0 ? 'today' : describeDay(addDays(today, i), today))), 'Reviews due')
      ),
      lapses.length ? h('div', {}, h('h3', {}, 'Words you often forget'), h('p', {}, lapses.map(({ c, w }, i) => [i ? ', ' : '', h('a', { href: pageUrl('review', { word: w.id }), lang: 'it' }, displayLemma(w)), h('span', { class: 'muted' }, ` (${c.lapses}×)`)]))) : null
    )
  );

  // Reading and songs
  append(main, 
    h(
      'div',
      { class: 'grid-2' },
      h(
        'section',
        { class: 'panel', 'aria-labelledby': 'read-h' },
        h('h2', { id: 'read-h' }, 'Reading'),
        h(
          'ul',
          { class: 'list' },
          STORIES.map((s) => {
            const r = state.reading.read[s.id];
            const c = state.reading.comprehension[s.id];
            return h('li', {}, h('a', { href: pageUrl('story', { id: s.id }), lang: 'it' }, s.title), h('span', { class: 'muted' }, ` — ${r ? `read ${formatDateTime(r)}` : 'not read'}${c ? ` · questions ${c.best}/${c.total}` : ''}`));
          })
        )
      ),
      h(
        'section',
        { class: 'panel', 'aria-labelledby': 'song-h' },
        h('h2', { id: 'song-h' }, 'Songs'),
        h(
          'ul',
          { class: 'list' },
          allSongs(state).map((s) => {
            const st = state.songs.studied[s.id];
            return h('li', {}, h('a', { href: pageUrl('song', { id: s.id }), lang: 'it' }, s.title), h('span', { class: 'muted' }, st ? ` — ${st.lines.length}/${st.total} lines studied` : ' — not started'));
          })
        )
      )
    )
  );

  // Recent errors
  const errs = recentErrors(state, 10);
  append(main, 
    h(
      'section',
      { class: 'panel', 'aria-labelledby': 'err-h' },
      h('h2', { id: 'err-h' }, 'Recent mistakes'),
      errs.length
        ? h(
            'div',
            { class: 'table-wrap' },
            h(
              'table',
              { class: 'table' },
              h('thead', {}, h('tr', {}, ['Exercise', 'Your answer', 'Expected'].map((c) => h('th', { scope: 'col' }, c)))),
              h('tbody', {}, errs.map((e) => h('tr', {}, h('td', {}, e.exercise.source.title), h('td', { lang: 'it' }, e.answer), h('td', { lang: 'it' }, e.expected))))
            )
          )
        : h('p', { class: 'muted' }, 'No mistakes recorded yet.')
    )
  );
}
