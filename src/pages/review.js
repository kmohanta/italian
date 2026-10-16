import { h, clear, plural, append } from '../components/dom.js';
import { icon } from '../components/icons.js';
import { pageHeader, renderNotFound } from '../components/page-layout.js';
import { renderFlashcard } from '../components/flashcard.js';
import { renderExerciseSet } from '../components/exercise-renderer.js';
import { getStore } from '../core/storage.js';
import { getParam } from '../core/router.js';
import { pageUrl } from '../core/pages.js';
import { getLesson, PRACTICE_SETS, getExercise } from '../core/data-loader.js';
import { recordExerciseResult, recentErrors } from '../core/progress.js';
import { getWord, displayLemma } from '../vocabulary/dictionary.js';
import { prepareSession, gradeCard, addToReview } from '../vocabulary/vocabulary-manager.js';
import { INTERVALS, GRADES, previewLabel, newCard, forecast } from '../vocabulary/spaced-repetition.js';
import { toDayKey, describeDay, addDays } from '../core/dates.js';

export function context() {
  const lesson = getParam('lesson') ? getLesson(getParam('lesson')) : null;
  const set = getParam('set') ? PRACTICE_SETS.find((s) => s.id === getParam('set')) : null;
  const word = getParam('word');
  const mode = getParam('mode');
  let title = 'Review';
  const crumbs = [{ label: 'Review', href: 'review.html' }];
  if (lesson) title = `Revise: ${lesson.title}`;
  else if (set) title = set.title;
  else if (word) title = 'Study a word';
  else if (mode === 'mistakes') title = 'Recent mistakes';
  if (title !== 'Review') crumbs.push({ label: title });
  return { title, breadcrumbs: crumbs.length > 1 ? crumbs : null, lesson, set, word, mode, lessonParam: getParam('lesson'), setParam: getParam('set') };
}

const GRADE_LABEL = { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' };

function policy() {
  return h(
    'details',
    { class: 'policy' },
    h('summary', {}, 'How scheduling works'),
    h('p', {}, `Leitner boxes with intervals of ${INTERVALS.join(', ')} days (boxes 1–6). New and forgotten cards are in box 0.`),
    h(
      'ul',
      { class: 'bullets' },
      h('li', {}, h('strong', {}, 'Again'), ' — back to box 0; the card returns later in this session.'),
      h('li', {}, h('strong', {}, 'Hard'), ' — stays in its box, but comes back after the previous box’s (shorter) interval.'),
      h('li', {}, h('strong', {}, 'Good'), ' — moves up one box.'),
      h('li', {}, h('strong', {}, 'Easy'), ' — moves up two boxes.')
    ),
    h('p', { class: 'muted' }, 'Days are counted by your local calendar. Missing a day is fine: overdue cards simply wait for you, most overdue first. Daily limits are set in ', h('a', { href: 'settings.html' }, 'Settings'), '.')
  );
}

export function render(main, ctx) {
  if (ctx.lessonParam || ctx.setParam) return renderExerciseRevision(main, ctx);
  if (ctx.mode === 'mistakes') return renderMistakes(main);
  if (ctx.word) return renderSingleWord(main, ctx.word);
  return renderSession(main);
}

/* ------------------------------------------------------------------ */
/* Flashcard session                                                    */
/* ------------------------------------------------------------------ */

function runCards(container, store, queue, { onFinish, single = false } = {}) {
  const settings = store.get().settings;
  const today = toDayKey();
  const session = { queue: [...queue], done: 0, grades: { again: 0, hard: 0, good: 0, easy: 0 } };
  let revealed = false;
  let direction = settings.reviewDirection;
  const pickDirection = () => (settings.reviewDirection === 'mixed' ? (Math.random() < 0.5 ? 'it-en' : 'en-it') : settings.reviewDirection);

  const progress = h('p', { class: 'review-progress', 'aria-live': 'polite' });
  const cardHost = h('div', { class: 'review-card', tabindex: '-1', 'aria-live': 'polite' });
  const controls = h('div', { class: 'review-controls' });

  function current() {
    return getWord(session.queue[0], store.get().vocabulary.custom);
  }

  function paint() {
    clear(cardHost);
    clear(controls);
    // Skip IDs whose word no longer exists (e.g. a deleted custom word).
    while (session.queue.length && !current()) session.queue.shift();
    if (!session.queue.length) return onFinish(session);
    const word = current();
    progress.textContent = single ? '' : `${plural(session.queue.length, 'card')} left · ${session.done} reviewed`;
    append(cardHost, renderFlashcard(word, { direction, revealed }));
    if (!revealed) {
      append(controls, h('button', { type: 'button', class: 'btn btn--primary btn--large', onclick: reveal }, icon('Eye'), 'Show answer', h('kbd', {}, 'Space')));
    } else {
      const card = store.get().srs.cards[word.id] || newCard(word.id, today);
      append(controls, 
        h(
          'div',
          { class: 'grade-buttons', role: 'group', 'aria-label': 'How well did you remember?' },
          GRADES.map((g, i) =>
            h('button', { type: 'button', class: ['btn', 'grade', `grade--${g}`], onclick: () => grade(g) }, h('span', { class: 'grade__label' }, GRADE_LABEL[g]), h('span', { class: 'grade__interval' }, previewLabel(card, g, today)), h('kbd', {}, String(i + 1)))
          )
        )
      );
    }
    // Focus the card itself, not a button: with Space as a shortcut, a focused
    // grade button would be activated by the same key's keyup event.
    cardHost.focus({ preventScroll: true });
  }

  function reveal() {
    revealed = true;
    paint();
  }

  function grade(g) {
    const id = session.queue.shift();
    store.update((d) => {
      gradeCard(d, id, g, today);
      store.logActivity(d, 'review', 'srs', 'Vocabulary review');
    });
    session.done++;
    session.grades[g]++;
    if (g === 'again' && !single) session.queue.push(id); // see it again this session
    revealed = false;
    direction = pickDirection();
    paint();
  }

  const onKey = (e) => {
    if (!document.body.contains(container)) return document.removeEventListener('keydown', onKey);
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      reveal();
    } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
      e.preventDefault();
      grade(GRADES[Number(e.key) - 1]);
    }
  };
  document.addEventListener('keydown', onKey);
  direction = pickDirection();
  append(container, progress, cardHost, controls);
  paint();
}

function renderSession(main) {
  const store = getStore();
  const today = toDayKey();
  let queue = [];
  store.update((d) => {
    queue = prepareSession(d, today);
  });
  const state = store.get();
  const fc = forecast(state.srs.cards, today, 7);
  append(main, 
    pageHeader(
      'Review',
      'Spaced-repetition flashcards for your vocabulary, plus targeted exercise revision.',
      h('a', { class: 'btn btn--ghost', href: pageUrl('review', { mode: 'mistakes' }) }, icon('RotateCcw'), 'Recent mistakes')
    ),
    policy()
  );
  const host = h('section', { class: 'panel review', 'aria-label': 'Flashcards' });
  append(main, host);
  const finish = (session) => {
    clear(host);
    const st = store.get();
    const nextDue = Object.values(st.srs.cards).map((c) => c.due).sort()[0];
    append(host, 
      h('h2', {}, session.done ? 'Session complete' : 'Nothing to review right now'),
      session.done
        ? h('p', {}, `${plural(session.done, 'review')}: ${GRADES.map((g) => `${GRADE_LABEL[g]} ${session.grades[g]}`).join(' · ')}.`)
        : h('p', {}, Object.keys(st.srs.cards).length ? 'All your cards are scheduled for later.' : 'Your review queue is empty. Words are added automatically each day (within your new-card limit), or you can add them from lessons, stories and the dictionary.'),
      nextDue ? h('p', { class: 'muted' }, `Next card due ${describeDay(nextDue, today)}.`) : null,
      h(
        'div',
        { class: 'button-row' },
        h('a', { class: 'btn', href: 'vocabulary.html' }, icon('Languages'), 'Browse vocabulary'),
        h('a', { class: 'btn', href: 'index.html' }, icon('House'), 'Dashboard'),
        h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => window.location.reload() }, icon('RotateCcw'), 'Check again')
      )
    );
  };
  if (queue.length) runCards(host, store, queue, { onFinish: finish });
  else finish({ done: 0, grades: {} });

  append(main, 
    h(
      'section',
      { class: 'panel', 'aria-labelledby': 'fc-h' },
      h('h2', { id: 'fc-h' }, 'Coming up'),
      h('ol', { class: 'forecast' }, fc.map((n, i) => h('li', {}, h('span', {}, i === 0 ? 'Today' : describeDay(addDays(today, i), today)), h('span', { class: 'forecast__bar', style: { width: `${Math.min(100, n * 4)}%` } }), h('strong', {}, String(n)))))
    ),
    h(
      'section',
      { class: 'panel', 'aria-labelledby': 'ex-rev-h' },
      h('h2', { id: 'ex-rev-h' }, 'Exercise revision'),
      h('p', { class: 'muted' }, 'Repeat the exercises of any lesson, or a mixed set.'),
      h('ul', { class: 'list' }, PRACTICE_SETS.map((s) => h('li', {}, h('a', { href: pageUrl('review', { set: s.id }) }, s.title)))),
      h('p', {}, 'For a single lesson, use “Practise” on the ', h('a', { href: 'learning-path.html' }, 'learning path'), '.')
    )
  );
}


function renderSingleWord(main, wordId) {
  const store = getStore();
  const word = getWord(wordId, store.get().vocabulary.custom);
  if (!word) {
    renderNotFound(main, { what: 'word', backHref: 'vocabulary.html', backLabel: 'Go to the vocabulary', detail: `There is no word with the ID “${wordId}”.` });
    return;
  }
  store.update((d) => addToReview(d, word.id));
  append(main, pageHeader(`Study: ${displayLemma(word)}`, 'Study this word now. Your grade updates its schedule as in a normal session.'), policy());
  const host = h('section', { class: 'panel review' });
  append(main, host);
  runCards(host, store, [word.id], {
    single: true,
    onFinish: () => {
      clear(host);
      const card = store.get().srs.cards[word.id];
      append(host, 
        h('h2', {}, 'Done'),
        h('p', {}, `Next review of “${displayLemma(word)}”: ${describeDay(card.due)}.`),
        h('div', { class: 'button-row' }, h('a', { class: 'btn', href: pageUrl('vocabulary') }, 'Back to vocabulary'), h('a', { class: 'btn btn--primary', href: 'review.html' }, 'Review session'))
      );
    }
  });
}

/* ------------------------------------------------------------------ */
/* Exercise revision                                                   */
/* ------------------------------------------------------------------ */

function renderExerciseRevision(main, ctx) {
  const store = getStore();
  let exercises;
  let intro;
  let lessonId;
  if (ctx.lessonParam) {
    if (!ctx.lesson) {
      renderNotFound(main, { what: 'lesson', backHref: 'learning-path.html', backLabel: 'Go to the learning path', detail: `There is no lesson with the ID “${ctx.lessonParam}”.` });
      return;
    }
    lessonId = ctx.lesson.id;
    exercises = ctx.lesson.exercises.map((e) => getExercise(e.id));
    intro = h('p', { class: 'lead' }, 'All exercises from this lesson, in a new order. ', h('a', { href: pageUrl('lesson', { id: lessonId }) }, 'Open the lesson'), ' to reread the rules.');
  } else {
    if (!ctx.set) {
      renderNotFound(main, { what: 'practice set', backHref: 'review.html', backLabel: 'Go to Review' });
      return;
    }
    exercises = ctx.set.exercises.map((e) => getExercise(e.id));
    intro = h('p', { class: 'lead' }, 'Mixed practice drawing on: ', ctx.set.lessons.map((id, i) => [i ? ', ' : '', h('a', { href: pageUrl('lesson', { id }) }, getLesson(id).title)]));
  }
  append(main, 
    h('header', { class: 'page-header' }, h('h1', {}, ctx.title), intro),
    renderExerciseSet(exercises, {
      shuffle: true,
      lessonId,
      onChecked: (result, response, ex) =>
        store.update((d) => {
          recordExerciseResult(d, ex, response, result);
          store.logActivity(d, 'exercise', lessonId || ctx.set.id, ctx.title);
        })
    })
  );
}

function renderMistakes(main) {
  const store = getStore();
  const errs = recentErrors(store.get(), 40);
  const seen = new Set();
  const exercises = [];
  for (const e of errs) {
    if (!seen.has(e.exerciseId)) {
      seen.add(e.exerciseId);
      exercises.push(e.exercise);
    }
  }
  append(main, pageHeader('Recent mistakes', 'Exercises you recently answered incorrectly, so you can try them again.'));
  if (!exercises.length) {
    append(main, h('p', { class: 'empty-state__text' }, 'No recent mistakes recorded. Well done — or try some exercises first.'), h('a', { class: 'btn', href: 'learning-path.html' }, 'Learning path'));
    return;
  }
  append(main, renderExerciseSet(exercises.slice(0, 15), { onChecked: (result, response, ex) => store.update((d) => recordExerciseResult(d, ex, response, result)) }));
}

