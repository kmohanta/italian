/**
 * Progress tracking and mastery estimates.
 *
 * Opening a lesson, marking it complete and performing well in its
 * exercises are tracked separately. A lesson counts as "secure" only when
 * the evidence is reasonably strong:
 *
 *   - at least 80% of the lesson's exercises were answered correctly on the
 *     most recent attempt, and
 *   - overall accuracy across all attempts is at least 70%, and
 *   - the lesson was practised on at least two different days.
 *
 * A single correct answer is never treated as mastery.
 */

import { toDayKey } from './dates.js';
import { LESSONS, MODULES, STORIES, RHYMES, getExercise, getLesson } from './data-loader.js';

export const SECURE_LATEST = 0.8;
export const SECURE_ACCURACY = 0.7;
export const SECURE_DAYS = 2;

/** Update exercise statistics after a check. Mutates `draft` (a store draft). */
export function recordExerciseResult(draft, exercise, response, result, today = toDayKey()) {
  const rec = draft.exercises[exercise.id] || { attempts: 0, correct: 0, score: 0, lastCorrect: false, days: [], recent: [] };
  rec.attempts += 1;
  if (result.correct) rec.correct += 1;
  rec.score = Math.round(((rec.score * (rec.attempts - 1) + result.score) / rec.attempts) * 1000) / 1000;
  rec.lastCorrect = Boolean(result.correct);
  rec.lastAt = new Date().toISOString();
  if (!rec.days.includes(today)) rec.days = [...rec.days, today].slice(-30);
  rec.recent = [...(rec.recent || []), Boolean(result.correct)].slice(-5);
  draft.exercises[exercise.id] = rec;
  if (!result.correct) {
    draft.errors.push({
      exerciseId: exercise.id,
      answer: typeof response === 'string' ? response : JSON.stringify(response),
      expected: Array.isArray(result.expected) ? result.expected.join('; ') : String(result.expected ?? ''),
      at: new Date().toISOString(),
      day: today
    });
  }
  return rec;
}

export function markLessonOpened(draft, lessonId) {
  const now = new Date().toISOString();
  const rec = draft.lessons[lessonId] || { openedAt: now };
  rec.lastVisited = now;
  draft.lessons[lessonId] = rec;
}

export function setLessonCompleted(draft, lessonId, completed = true) {
  const rec = draft.lessons[lessonId] || { openedAt: new Date().toISOString() };
  rec.completedAt = completed ? new Date().toISOString() : null;
  draft.lessons[lessonId] = rec;
}

/** Performance summary for a list of exercise IDs. */
export function performance(state, exerciseIds) {
  let attemptedCount = 0;
  let latestCorrect = 0;
  let attempts = 0;
  let correct = 0;
  const days = new Set();
  for (const id of exerciseIds) {
    const r = state.exercises[id];
    if (!r) continue;
    attemptedCount++;
    attempts += r.attempts;
    correct += r.correct;
    if (r.lastCorrect) latestCorrect++;
    (r.days || []).forEach((d) => days.add(d));
  }
  return {
    total: exerciseIds.length,
    attempted: attemptedCount,
    latestCorrect,
    attempts,
    correct,
    accuracy: attempts ? correct / attempts : null,
    latestShare: exerciseIds.length ? latestCorrect / exerciseIds.length : 0,
    days: days.size
  };
}

/**
 * Status of one lesson:
 *   state:   'not-started' | 'opened' | 'completed'  (what the learner did)
 *   mastery: 'none' | 'practising' | 'secure'         (what the evidence shows)
 */
export function lessonStatus(state, lessonOrId) {
  const lesson = typeof lessonOrId === 'string' ? getLesson(lessonOrId) : lessonOrId;
  if (!lesson) return null;
  const rec = state.lessons[lesson.id];
  const perf = performance(state, lesson.exercises.map((e) => e.id));
  let mastery = 'none';
  if (perf.attempted > 0) {
    mastery =
      perf.latestShare >= SECURE_LATEST && perf.accuracy >= SECURE_ACCURACY && perf.days >= SECURE_DAYS ? 'secure' : 'practising';
  }
  return {
    lessonId: lesson.id,
    state: rec && rec.completedAt ? 'completed' : rec ? 'opened' : 'not-started',
    completedAt: rec ? rec.completedAt || null : null,
    lastVisited: rec ? rec.lastVisited || null : null,
    mastery,
    ...perf
  };
}

export function masteryExplanation(status) {
  if (status.mastery === 'secure') return 'Secure: most exercises right on the latest attempt, good overall accuracy, practised on more than one day.';
  if (status.mastery === 'practising') {
    const needs = [];
    if (status.latestShare < SECURE_LATEST) needs.push(`get ${Math.ceil(SECURE_LATEST * status.total)} of ${status.total} exercises right`);
    if (status.accuracy !== null && status.accuracy < SECURE_ACCURACY) needs.push('raise overall accuracy to 70%');
    if (status.days < SECURE_DAYS) needs.push('practise again on another day');
    return `Practising. To make it secure: ${needs.join('; ')}.`;
  }
  return 'No exercises attempted yet.';
}

export function moduleProgress(state, module) {
  const lessons = LESSONS.filter((l) => l.moduleId === module.id);
  const statuses = lessons.map((l) => lessonStatus(state, l));
  return {
    module,
    lessons: statuses,
    completed: statuses.filter((s) => s.state === 'completed').length,
    secure: statuses.filter((s) => s.mastery === 'secure').length,
    total: lessons.length
  };
}

/** Recommended next lesson: the first lesson in course order not yet completed. */
export function recommendedLesson(state) {
  return LESSONS.find((l) => !(state.lessons[l.id] && state.lessons[l.id].completedAt)) || null;
}

export function currentPosition(state) {
  const next = recommendedLesson(state);
  const module = next ? MODULES.find((m) => m.id === next.moduleId) : MODULES[MODULES.length - 1];
  return {
    nextLesson: next,
    module,
    level: next ? next.level : 'A2',
    finished: !next
  };
}

export function overallStats(state) {
  const statuses = LESSONS.map((l) => lessonStatus(state, l));
  const ex = Object.values(state.exercises);
  const attempts = ex.reduce((n, r) => n + r.attempts, 0);
  const correct = ex.reduce((n, r) => n + r.correct, 0);
  return {
    lessonsTotal: LESSONS.length,
    lessonsCompleted: statuses.filter((s) => s.state === 'completed').length,
    lessonsSecure: statuses.filter((s) => s.mastery === 'secure').length,
    lessonsOpened: statuses.filter((s) => s.state !== 'not-started').length,
    exerciseAttempts: attempts,
    exerciseAccuracy: attempts ? correct / attempts : null,
    storiesTotal: STORIES.length,
    storiesRead: Object.keys(state.reading.read).filter((id) => STORIES.some((s) => s.id === id)).length,
    songsStudied: Object.keys(state.songs.studied).length,
    songsTotal: RHYMES.length + state.songs.user.length
  };
}

/** Accuracy by grammatical topic (from lesson tags). */
export function topicPerformance(state) {
  const topics = new Map();
  for (const l of LESSONS) {
    for (const t of l.tags.topics) {
      if (!topics.has(t)) topics.set(t, []);
      topics.get(t).push(...l.exercises.map((e) => e.id));
    }
  }
  return [...topics.entries()]
    .map(([topic, ids]) => ({ topic, ...performance(state, ids) }))
    .filter((t) => t.attempted > 0)
    .sort((a, b) => (a.accuracy ?? 1) - (b.accuracy ?? 1));
}

/**
 * Suggestions for what to revise, most urgent first:
 *  - lessons with weak accuracy or recent mistakes,
 *  - lessons completed long ago but never practised,
 */
export function revisionPriorities(state, limit = 6) {
  const out = [];
  const recentErrors = new Map();
  for (const e of state.errors.slice(-50)) {
    const ex = getExercise(e.exerciseId);
    if (ex && ex.source.type === 'lesson') recentErrors.set(ex.source.id, (recentErrors.get(ex.source.id) || 0) + 1);
  }
  for (const l of LESSONS) {
    const s = lessonStatus(state, l);
    if (s.attempted === 0) {
      if (s.state === 'completed') out.push({ lesson: l, score: 50, reason: 'Marked complete but no exercises attempted yet.' });
      continue;
    }
    const errs = recentErrors.get(l.id) || 0;
    if (s.mastery === 'secure' && errs === 0) continue;
    const acc = s.accuracy ?? 0;
    const score = (1 - acc) * 100 + errs * 8 + (s.latestShare < SECURE_LATEST ? 15 : 0);
    const reasons = [];
    if (acc < SECURE_ACCURACY) reasons.push(`accuracy ${Math.round(acc * 100)}%`);
    if (errs) reasons.push(`${errs} recent mistake${errs > 1 ? 's' : ''}`);
    if (s.latestShare < SECURE_LATEST) reasons.push(`${s.latestCorrect}/${s.total} right on the latest attempt`);
    if (s.days < SECURE_DAYS) reasons.push('practised on only one day');
    out.push({ lesson: l, score, reason: reasons.join(', ') || 'keep practising' });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function recentErrors(state, limit = 10) {
  return state.errors
    .slice(-limit)
    .reverse()
    .map((e) => ({ ...e, exercise: getExercise(e.exerciseId) }))
    .filter((e) => e.exercise);
}
