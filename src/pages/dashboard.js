import { h, pct, plural, progressBar, formatDateTime, append } from '../components/dom.js';
import { icon } from '../components/icons.js';
import { pageHeader } from '../components/page-layout.js';
import { getStore } from '../core/storage.js';
import { currentPosition, overallStats, revisionPriorities } from '../core/progress.js';
import { STORIES, getStory } from '../core/data-loader.js';
import { pageUrl } from '../core/pages.js';
import { dueCards, boxDistribution, KNOWN_FROM_BOX } from '../vocabulary/spaced-repetition.js';
import { newWordsAvailable } from '../vocabulary/vocabulary-manager.js';
import { toDayKey } from '../core/dates.js';

export function context() {
  return { title: 'Dashboard' };
}

/** Split the daily target into the suggested routine (default 30 min = 5/10/10/5). */
export function studyPlan(minutes) {
  const weights = [
    ['Review vocabulary', 1, 'review.html', 'Repeat'],
    ['Study grammar', 2, 'learning-path.html', 'BookOpen'],
    ['Read or do exercises', 2, 'reading.html', 'BookText'],
    ['Listen to or analyse a song', 1, 'songs.html', 'Music']
  ];
  const total = weights.reduce((n, w) => n + w[1], 0);
  let assigned = 0;
  return weights.map(([label, w, href, ic], i) => {
    const m = i === weights.length - 1 ? minutes - assigned : Math.max(1, Math.round((minutes * w) / total));
    assigned += m;
    return { label, minutes: m, href, icon: ic };
  });
}

function stat(label, value, detail) {
  return h('div', { class: 'stat' }, h('p', { class: 'stat__value' }, value), h('p', { class: 'stat__label' }, label), detail ? h('p', { class: 'stat__detail' }, detail) : null);
}

function activityLabel(a) {
  const kind = { lesson: 'Lesson', story: 'Story', song: 'Song', review: 'Review', exercise: 'Exercises', diagnostic: 'Diagnostic' }[a.type] || a.type;
  return `${kind}: ${a.label}`;
}

function activityHref(a) {
  if (a.type === 'lesson') return pageUrl('lesson', { id: a.id });
  if (a.type === 'story') return pageUrl('story', { id: a.id });
  if (a.type === 'song') return pageUrl('song', { id: a.id });
  if (a.type === 'review') return pageUrl('review');
  if (a.type === 'diagnostic') return pageUrl('diagnostic');
  return null;
}

export function render(main) {
  const store = getStore();
  const state = store.get();
  const today = toDayKey();
  const pos = currentPosition(state);
  const stats = overallStats(state);
  const due = dueCards(state.srs.cards, today).filter((c) => c.reps > 0).length;
  const dist = boxDistribution(state.srs.cards);
  const known = dist.slice(KNOWN_FROM_BOX).reduce((a, b) => a + b, 0);
  const learning = Object.keys(state.srs.cards).length - known;
  const newAvailable = newWordsAvailable(state);
  const lastSong = Object.entries(state.songs.studied).sort((a, b) => (b[1].at || '').localeCompare(a[1].at || ''))[0];
  const lastStory = state.reading.history[0];
  const nextStory = STORIES.find((s) => !state.reading.read[s.id]) || STORIES[0];
  const isNewLearner = Object.keys(state.lessons).length === 0 && Object.keys(state.srs.cards).length === 0;

  append(main, 
    pageHeader(
      isNewLearner ? 'Benvenuto! Welcome.' : 'Bentornato! Welcome back.',
      isNewLearner
        ? 'An interactive grammar textbook, vocabulary trainer and graded reader for Italian, from A0 to the complete verb system (about B1–B2). Start with the first lesson, or take the short diagnostic test to find your level.'
        : `You are working on Module ${pos.module.number}: ${pos.module.title} (approximately ${pos.level}).`
    )
  );

  // Continue
  const next = pos.nextLesson;
  const continueCard = h(
    'section',
    { class: 'panel panel--highlight', 'aria-labelledby': 'continue-h' },
    h('h2', { id: 'continue-h' }, pos.finished ? 'Course complete' : 'Recommended next'),
    pos.finished
      ? h('p', {}, 'You have marked every lesson complete. Keep reviewing vocabulary, revisit weaker topics on the Progress page, and read the stories again.')
      : [
          h('p', { class: 'panel__title' }, h('a', { href: pageUrl('lesson', { id: next.id }) }, next.title)),
          h('p', { class: 'muted' }, `Module ${next.moduleNumber} · ${next.moduleTitle} · ${next.level}`),
          h('p', {}, next.description)
        ],
    h(
      'div',
      { class: 'button-row' },
      !pos.finished ? h('a', { class: 'btn btn--primary', href: pageUrl('lesson', { id: next.id }) }, icon('GraduationCap'), 'Continue learning') : null,
      h('a', { class: 'btn', href: 'grammar.html' }, icon('BookOpen'), 'Open grammar'),
      h('a', { class: 'btn', href: 'review.html' }, icon('Repeat'), due ? `Review vocabulary (${due} due)` : 'Review vocabulary'),
      h('a', { class: 'btn', href: pageUrl('story', { id: (lastStory && getStory(lastStory.id) ? lastStory.id : nextStory.id) }) }, icon('BookText'), 'Read a story'),
      h('a', { class: 'btn', href: lastSong ? pageUrl('song', { id: lastSong[0] }) : 'songs.html' }, icon('Music'), lastSong ? 'Continue a song' : 'Study a song'),
      h('a', { class: 'btn btn--ghost', href: 'diagnostic.html' }, icon('ListChecks'), state.diagnostic ? 'Retake diagnostic test' : 'Take a short diagnostic test')
    )
  );

  // Stats
  const statsSection = h(
    'section',
    { class: 'stats', 'aria-label': 'Summary' },
    stat('Current level', pos.level, `Module ${pos.module.number} of 12`),
    stat('Reviews due', String(due), due ? 'Ready now' : 'Nothing due — well done'),
    stat('New words available', String(newAvailable), `${state.settings.newCardsPerDay} introduced per day`),
    stat('Lessons completed', `${stats.lessonsCompleted}/${stats.lessonsTotal}`, `${stats.lessonsSecure} secure`),
    stat('Vocabulary', `${known} known`, `${learning} learning`),
    stat('Stories read', `${stats.storiesRead}/${stats.storiesTotal}`),
    stat('Songs studied', String(stats.songsStudied)),
    stat('Exercise accuracy', pct(stats.exerciseAccuracy), `${plural(stats.exerciseAttempts, 'attempt')}`)
  );

  // Planner
  const plan = studyPlan(state.settings.dailyMinutes);
  const planner = h(
    'section',
    { class: 'panel', 'aria-labelledby': 'plan-h' },
    h('h2', { id: 'plan-h' }, `Today's suggestion · ${state.settings.dailyMinutes} minutes`),
    h('p', { class: 'muted' }, 'A flexible plan, not a schedule. Study on any day you like; nothing is lost if you skip a day. Change the target in ', h('a', { href: 'settings.html' }, 'Settings'), '.'),
    h('ol', { class: 'plan' }, plan.map((p) => h('li', {}, h('a', { href: p.href }, icon(p.icon), h('span', {}, p.label)), h('span', { class: 'plan__min' }, `${p.minutes} min`))))
  );

  // Revision
  const priorities = revisionPriorities(state, 3);
  const revision = priorities.length
    ? h(
        'section',
        { class: 'panel', 'aria-labelledby': 'rev-h' },
        h('h2', { id: 'rev-h' }, 'Worth revising'),
        h('ul', { class: 'list' }, priorities.map((p) => h('li', {}, h('a', { href: pageUrl('review', { lesson: p.lesson.id }) }, p.lesson.title), h('span', { class: 'muted' }, ` — ${p.reason}`))))
      )
    : null;

  // Recent activity
  const recent = state.activity.slice(-8).reverse();
  const activity = h(
    'section',
    { class: 'panel', 'aria-labelledby': 'act-h' },
    h('h2', { id: 'act-h' }, 'Recent activity'),
    recent.length
      ? h(
          'ul',
          { class: 'list' },
          recent.map((a) => {
            const href = activityHref(a);
            return h('li', {}, href ? h('a', { href }, activityLabel(a)) : activityLabel(a), h('span', { class: 'muted' }, ` · ${formatDateTime(a.at)}`));
          })
        )
      : h('p', { class: 'muted' }, 'Nothing yet. Your lessons, stories, songs and reviews will appear here.')
  );

  // Module progress at a glance
  const moduleProgress = h(
    'section',
    { class: 'panel', 'aria-labelledby': 'path-h' },
    h('h2', { id: 'path-h' }, 'Course progress'),
    progressBar(stats.lessonsCompleted, stats.lessonsTotal, 'Lessons completed'),
    h('p', { class: 'muted' }, `${stats.lessonsCompleted} of ${stats.lessonsTotal} lessons completed · ${stats.lessonsSecure} secure in practice. `, h('a', { href: 'learning-path.html' }, 'See the learning path')),
    state.diagnostic ? h('p', { class: 'muted' }, `Diagnostic test (${formatDateTime(state.diagnostic.takenAt)}): ${state.diagnostic.score}/${state.diagnostic.total}. ${state.diagnostic.recommendation}`) : null
  );

  append(main, h('div', { class: 'dashboard' }, continueCard, statsSection, h('div', { class: 'grid-2' }, planner, activity), revision, moduleProgress));
}
