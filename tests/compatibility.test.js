/**
 * Progress saved by the first release (schema v2, 12 modules, A0–A2) must keep
 * working after the curriculum expansion: no lesson, exercise or word ID was
 * removed, and custom verbs saved before the new tenses existed are
 * conjugated and indexed in every tense.
 */
import { describe, it, expect } from 'vitest';
import { createStore, memoryAdapter, STORAGE_KEY, normaliseState } from '../src/core/storage.js';
import { lessonStatus, recommendedLesson, moduleProgress } from '../src/core/progress.js';
import { MODULES, getLesson, getExercise } from '../src/core/data-loader.js';
import { getWord, lookupForm } from '../src/vocabulary/dictionary.js';
import { conjugate } from '../src/grammar/verb-system.js';

/** A custom verb exactly as the first release stored it (no tense data beyond present/imperfetto). */
const OLD_CUSTOM_VERB = {
  id: 'custom_zappare',
  lemma: 'zappare',
  partOfSpeech: 'verb',
  meaning: 'to hoe',
  category: 'my words',
  level: 'A1',
  exampleItalian: 'Il nonno zappa l’orto.',
  exampleEnglish: 'Grandpa hoes the vegetable garden.',
  tags: ['custom'],
  sourceId: 'learner',
  custom: true,
  createdAt: '2026-05-01T10:00:00.000Z',
  infinitive: 'zappare',
  conjugationGroup: '-are',
  regularity: 'regular (generated)',
  reflexive: false,
  isc: false,
  auxiliary: 'avere',
  present: ['zappo', 'zappi', 'zappa', 'zappiamo', 'zappate', 'zappano'],
  imperfect: ['zappavo', 'zappavi', 'zappava', 'zappavamo', 'zappavate', 'zappavano'],
  participle: 'zappato',
  irregularForms: []
};

const OLD_STATE = {
  schemaVersion: 2,
  createdAt: '2026-04-01T09:00:00.000Z',
  settings: { dailyMinutes: 20, newWordsPerDay: 8, theme: 'dark' },
  lessons: {
    'alphabet-vowels': { openedAt: '2026-04-01T09:01:00.000Z', completedAt: '2026-04-01T09:30:00.000Z', lastVisited: '2026-04-01T09:30:00.000Z' },
    'c-and-g': { openedAt: '2026-04-02T09:00:00.000Z', completedAt: '2026-04-02T09:20:00.000Z', lastVisited: '2026-04-02T09:20:00.000Z' },
    'stress-doubles-accents': { openedAt: '2026-04-03T09:00:00.000Z', completedAt: '2026-04-03T09:20:00.000Z', lastVisited: '2026-04-03T09:20:00.000Z' },
    'passato-prossimo-avere': { openedAt: '2026-04-10T09:00:00.000Z', lastVisited: '2026-04-10T09:00:00.000Z' }
  },
  exercises: {
    'passato-prossimo-avere.1': { attempts: 2, correct: 1, lastCorrect: true, lastAnswer: ['giocato'], days: ['2026-04-10', '2026-04-11'], recent: [false, true] },
    'definite-articles.1': { attempts: 1, correct: 1, lastCorrect: true, lastAnswer: 'il', days: ['2026-04-05'], recent: [true] }
  },
  srs: { cards: { noun_gatto: { interval: 3, ease: 2.5, due: '2026-04-20', reps: 2, lapses: 0 }, custom_zappare: { interval: 1, ease: 2.5, due: '2026-04-12', reps: 1, lapses: 0 } }, log: [] },
  vocabulary: { custom: [OLD_CUSTOM_VERB], notes: { noun_gatto: 'like “cat”' }, favourites: ['noun_gatto'] },
  reading: { read: { 'il-gatto-e-la-luna': '2026-04-04' }, favourites: [], history: [{ id: 'il-gatto-e-la-luna', at: '2026-04-04' }], comprehension: {}, progress: {} },
  songs: { user: [], lineNotes: {}, userTranslations: {}, studied: {} },
  errors: [],
  activity: [],
  diagnostic: null
};

describe('progress saved by the first release', () => {
  it('loads unchanged through the store', () => {
    const adapter = memoryAdapter({ [STORAGE_KEY]: JSON.stringify(OLD_STATE) });
    const s = createStore({ adapter }).get();
    expect(s.lessons).toEqual(OLD_STATE.lessons);
    expect(s.exercises).toEqual(OLD_STATE.exercises);
    expect(s.srs.cards).toEqual(OLD_STATE.srs.cards);
    expect(s.vocabulary.custom).toEqual([OLD_CUSTOM_VERB]);
    expect(s.vocabulary.notes).toEqual(OLD_STATE.vocabulary.notes);
    expect(s.reading.read).toEqual(OLD_STATE.reading.read);
  });
  it('every stored lesson, exercise and word ID still exists', () => {
    for (const id of Object.keys(OLD_STATE.lessons)) expect(getLesson(id), id).not.toBeNull();
    for (const id of Object.keys(OLD_STATE.exercises)) expect(getExercise(id), id).not.toBeNull();
    expect(getWord('noun_gatto')).not.toBeNull();
  });
  it('lesson status and module progress are computed from the old records', () => {
    const s = normaliseState(OLD_STATE);
    expect(lessonStatus(s, 'alphabet-vowels').state).toBe('completed');
    expect(lessonStatus(s, 'passato-prossimo-avere').state).toBe('opened');
    expect(lessonStatus(s, 'passato-prossimo-avere').attempted).toBe(1);
    const m1 = moduleProgress(s, MODULES[0]);
    expect(m1.completed).toBe(m1.total);
  });
  it('the next recommended lesson is the first unfinished one in the new order', () => {
    const s = normaliseState(OLD_STATE);
    expect(recommendedLesson(s).id).toBe('noun-gender-number');
  });
  it('a v1 state with top-level customWords is still migrated', () => {
    const v1 = { schemaVersion: 1, customWords: [OLD_CUSTOM_VERB], lessons: { 'c-and-g': { openedAt: 'x' } } };
    const s = normaliseState(v1);
    expect(s.vocabulary.custom).toEqual([OLD_CUSTOM_VERB]);
    expect(s.lessons['c-and-g']).toEqual({ openedAt: 'x' });
  });
});

describe('custom verbs saved before the new tenses', () => {
  const custom = [OLD_CUSTOM_VERB];
  it('are conjugated in every new tense', () => {
    expect(conjugate('zappare', 'futuro', { record: OLD_CUSTOM_VERB })[0]).toBe('zapperò');
    expect(conjugate('zappare', 'condizionale', { record: OLD_CUSTOM_VERB })[2]).toBe('zapperebbe');
    expect(conjugate('zappare', 'passatoRemoto', { record: OLD_CUSTOM_VERB })[2]).toBe('zappò');
    expect(conjugate('zappare', 'congiuntivoPresente', { record: OLD_CUSTOM_VERB })[0]).toBe('zappi');
    expect(conjugate('zappare', 'congiuntivoImperfetto', { record: OLD_CUSTOM_VERB })[3]).toBe('zappassimo');
    expect(conjugate('zappare', 'trapassatoProssimo', { record: OLD_CUSTOM_VERB })[0]).toBe('avevo zappato');
  });
  it('their forms in the new tenses are found by the word inspector', () => {
    for (const [form, tenseKey] of [['zapperò', 'futuro'], ['zappò', 'passatoRemoto'], ['zappassimo', 'congiuntivoImperfetto'], ['zapperebbero', 'condizionale']]) {
      const hits = lookupForm(form, custom);
      expect(hits.some((a) => a.lemma === 'zappare' && a.features.tenseKey === tenseKey), form).toBe(true);
    }
    expect(lookupForm('zapperò')).toEqual([]);
  });
});
