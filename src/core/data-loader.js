/**
 * Built-in course content.
 *
 * All content is bundled at build time (static imports), so the site works
 * offline and never fetches course data from a server. Lessons are split
 * into one JSON file per module in src/data/lessons/ for easier editing;
 * this module merges them and exposes lookup helpers.
 */

import curriculumData from '../data/curriculum.json';
import storiesData from '../data/stories.json';
import rhymesData from '../data/rhymes.json';
import exercisesData from '../data/exercises.json';
import sourcesData from '../data/sources.json';
import verificationData from '../data/verification.json';

const lessonFiles = import.meta.glob('../data/lessons/*.json', { eager: true, import: 'default' });

export const MODULES = curriculumData.modules;

/** Lessons in curriculum order, each annotated with its module and position. */
export const LESSONS = (() => {
  const all = new Map();
  for (const file of Object.values(lessonFiles)) for (const lesson of file) all.set(lesson.id, lesson);
  const ordered = [];
  MODULES.forEach((m) => {
    m.lessons.forEach((id, i) => {
      const lesson = all.get(id);
      if (lesson) ordered.push({ ...lesson, moduleId: m.id, moduleNumber: m.number, moduleTitle: m.title, positionInModule: i + 1, order: ordered.length });
    });
  });
  return ordered;
})();

const lessonById = new Map(LESSONS.map((l) => [l.id, l]));
export const STORIES = storiesData.stories;
const storyById = new Map(STORIES.map((s) => [s.id, s]));
export const RHYMES = rhymesData.rhymes;
const rhymeById = new Map(RHYMES.map((r) => [r.id, r]));
export const DIAGNOSTIC = exercisesData.diagnostic;
export const PRACTICE_SETS = exercisesData.practiceSets;
export const SOURCES = sourcesData;
export const VERIFICATION = verificationData;

/** The verification-register entry covering a lesson, or null. */
export function verificationFor(lessonId) {
  return VERIFICATION.topics.find((t) => t.lessons.includes(lessonId)) || null;
}

export function verificationReference(id) {
  return VERIFICATION.references.find((r) => r.id === id) || null;
}

export function getLesson(id) {
  return lessonById.get(id) || null;
}
export function getModule(id) {
  return MODULES.find((m) => m.id === id) || null;
}
export function lessonsInModule(moduleId) {
  return LESSONS.filter((l) => l.moduleId === moduleId);
}
export function getStory(id) {
  return storyById.get(id) || null;
}
export function getRhyme(id) {
  return rhymeById.get(id) || null;
}
export function nextLesson(id) {
  const l = getLesson(id);
  return l ? LESSONS[l.order + 1] || null : null;
}
export function previousLesson(id) {
  const l = getLesson(id);
  return l && l.order > 0 ? LESSONS[l.order - 1] : null;
}

/** Every exercise in the course, keyed by ID, with where it lives. */
export const ALL_EXERCISES = (() => {
  const map = new Map();
  for (const l of LESSONS) for (const ex of l.exercises) map.set(ex.id, { ...ex, source: { type: 'lesson', id: l.id, title: l.title } });
  for (const s of STORIES) for (const ex of s.questions) map.set(ex.id, { ...ex, source: { type: 'story', id: s.id, title: s.title } });
  for (const r of RHYMES) for (const ex of r.exercises) map.set(ex.id, { ...ex, source: { type: 'song', id: r.id, title: r.title } });
  for (const set of PRACTICE_SETS) for (const ex of set.exercises) map.set(ex.id, { ...ex, source: { type: 'practice', id: set.id, title: set.title } });
  for (const ex of DIAGNOSTIC.questions) map.set(ex.id, { ...ex, source: { type: 'diagnostic', id: 'diagnostic', title: 'Diagnostic test' } });
  return map;
})();

export function getExercise(id) {
  return ALL_EXERCISES.get(id) || null;
}

/** Translations of every Italian sentence the course contains (for the analyser). */
export const KNOWN_TRANSLATIONS = (() => {
  const map = new Map();
  const key = (s) => s.normalize('NFC').replace(/[‘’]/g, "'").replace(/[«»"“”]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const add = (it, en, source) => {
    if (it && en && !map.has(key(it))) map.set(key(it), { en, source });
  };
  for (const l of LESSONS) for (const ex of l.examples) add(ex.it, ex.en, `Lesson: ${l.title}`);
  for (const s of STORIES) for (const p of s.paragraphs) for (const x of p) add(x.it, x.en, `Story: ${s.title}`);
  return { lookup: (s) => map.get(key(s)) || null, size: map.size };
})();

/** Sample sentences offered in the sentence analyser. */
export const ANALYSER_SAMPLES = [
  'La bambina mangia una mela.',
  'Il gatto dorme sul letto.',
  "L'orso è stanco.",
  'Mia sorella ama i gatti.',
  'I bambini giocano in giardino.',
  'Non mi sveglio presto.',
  'La mamma ha preparato la colazione.',
  'Sara è andata al mare.',
  "C'era una volta un piccolo orso.",
  'Posso entrare?',
  'Lo scoiattolo sale sull’albero.',
  'Il nonno racconta una storia.',
  'Penso che Marco parli italiano.',
  'Se avessi tempo, verrei con te.',
  'Marco disse che sarebbe venuto.',
  'Quando arrivai, il treno era già partito.',
  'La casa è stata venduta.',
  'Si vendono case.'
];
