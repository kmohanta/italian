/**
 * Personal data store.
 *
 * Built-in course content (lessons, vocabulary, stories, rhymes) is bundled
 * with the site and never stored here. This module holds only what belongs
 * to the learner: settings, progress, review scheduling, notes and
 * user-created content. Everything is kept in the browser's localStorage
 * under a single versioned key. Nothing is ever transmitted.
 *
 * The store is deliberately small and synchronous:
 *   const store = createStore();          // uses window.localStorage
 *   store.get()                           // current state (do not mutate)
 *   store.update((draft) => { ... })      // mutate a copy, then persist
 *   store.subscribe((state) => { ... })
 *
 * Tests inject a memory adapter: createStore({ adapter: memoryAdapter() }).
 */

import { toDayKey } from './dates.js';

export const STORAGE_KEY = 'italian-learning-lab';
export const BACKUP_KEY = 'italian-learning-lab:corrupt-backup';
export const SCHEMA_VERSION = 2;

export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'auto', // 'auto' | 'light' | 'dark'
  textSize: 'medium', // 'small' | 'medium' | 'large' | 'x-large'
  dailyMinutes: 30,
  newCardsPerDay: 10,
  maxReviewsPerDay: 100,
  reviewDirection: 'it-en', // 'it-en' | 'en-it' | 'mixed'
  speechRate: 0.9,
  speechVoice: '', // voiceURI; '' = browser default Italian voice
  showHintsByDefault: true
});

export function createDefaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    settings: { ...DEFAULT_SETTINGS },
    lessons: {}, //   lessonId -> { openedAt, completedAt, lastVisited }
    exercises: {}, // exerciseId -> { attempts, correct, lastCorrect, lastAnswer, days: [], recent: [] }
    srs: { cards: {}, log: [] }, // wordId -> card (see spaced-repetition.js)
    vocabulary: { custom: [], notes: {}, favourites: [] },
    reading: { read: {}, favourites: [], history: [], comprehension: {}, progress: {} },
    songs: { user: [], lineNotes: {}, userTranslations: {}, studied: {} },
    errors: [], // recent wrong answers [{ exerciseId, answer, expected, at }]
    activity: [], // [{ type, id, label, at }]
    diagnostic: null // { takenAt, score, total, byModule, recommendation }
  };
}

/* ------------------------------------------------------------------ */
/* Adapters                                                            */
/* ------------------------------------------------------------------ */

export function memoryAdapter(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
    dump: () => Object.fromEntries(data)
  };
}

function browserAdapter() {
  try {
    const ls = globalThis.localStorage;
    const probe = '__ill_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null; // private mode, disabled storage, or not in a browser
  }
}

/* ------------------------------------------------------------------ */
/* Sanitising and migrating                                            */
/* ------------------------------------------------------------------ */

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function pickObject(value, fallback) {
  return isObject(value) ? value : fallback;
}

function pickArray(value) {
  return Array.isArray(value) ? value : [];
}

function sanitiseSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...pickObject(raw, {}) };
  const clampInt = (v, lo, hi, d) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
  };
  if (!['auto', 'light', 'dark'].includes(s.theme)) s.theme = 'auto';
  if (!['small', 'medium', 'large', 'x-large'].includes(s.textSize)) s.textSize = 'medium';
  if (!['it-en', 'en-it', 'mixed'].includes(s.reviewDirection)) s.reviewDirection = 'it-en';
  s.dailyMinutes = clampInt(s.dailyMinutes, 5, 240, DEFAULT_SETTINGS.dailyMinutes);
  s.newCardsPerDay = clampInt(s.newCardsPerDay, 0, 100, DEFAULT_SETTINGS.newCardsPerDay);
  s.maxReviewsPerDay = clampInt(s.maxReviewsPerDay, 5, 1000, DEFAULT_SETTINGS.maxReviewsPerDay);
  const rate = Number(s.speechRate);
  s.speechRate = Number.isFinite(rate) ? Math.min(1.5, Math.max(0.5, rate)) : 0.9;
  s.speechVoice = typeof s.speechVoice === 'string' ? s.speechVoice : '';
  s.showHintsByDefault = Boolean(s.showHintsByDefault);
  return s;
}

/**
 * Bring any (possibly older, possibly damaged) object into the current
 * shape. Unknown top-level keys are dropped; missing ones get defaults.
 */
export function normaliseState(raw) {
  const base = createDefaultState();
  if (!isObject(raw)) return base;
  let state = { ...raw };

  // v1 -> v2: v1 stored custom words at top level as `customWords`.
  if (!state.schemaVersion || state.schemaVersion < 2) {
    if (Array.isArray(state.customWords)) {
      state.vocabulary = pickObject(state.vocabulary, {});
      state.vocabulary.custom = [...pickArray(state.vocabulary.custom), ...state.customWords];
    }
    delete state.customWords;
  }

  const vocab = pickObject(state.vocabulary, {});
  const reading = pickObject(state.reading, {});
  const songs = pickObject(state.songs, {});
  const srs = pickObject(state.srs, {});

  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: typeof state.createdAt === 'string' ? state.createdAt : base.createdAt,
    settings: sanitiseSettings(state.settings),
    lessons: pickObject(state.lessons, {}),
    exercises: pickObject(state.exercises, {}),
    srs: { cards: pickObject(srs.cards, {}), log: pickArray(srs.log) },
    vocabulary: {
      custom: pickArray(vocab.custom).filter((w) => isObject(w) && typeof w.id === 'string'),
      notes: pickObject(vocab.notes, {}),
      favourites: pickArray(vocab.favourites).filter((x) => typeof x === 'string')
    },
    reading: {
      read: pickObject(reading.read, {}),
      favourites: pickArray(reading.favourites).filter((x) => typeof x === 'string'),
      history: pickArray(reading.history),
      comprehension: pickObject(reading.comprehension, {}),
      progress: pickObject(reading.progress, {})
    },
    songs: {
      user: pickArray(songs.user).filter((s) => isObject(s) && typeof s.id === 'string'),
      lineNotes: pickObject(songs.lineNotes, {}),
      userTranslations: pickObject(songs.userTranslations, {}),
      studied: pickObject(songs.studied, {})
    },
    errors: pickArray(state.errors),
    activity: pickArray(state.activity),
    diagnostic: isObject(state.diagnostic) ? state.diagnostic : null
  };
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

const MAX_ACTIVITY = 60;
const MAX_ERRORS = 100;
const MAX_SRS_LOG = 5000;

export function createStore({ adapter } = {}) {
  const backend = adapter || browserAdapter();
  const persistent = Boolean(backend);
  const listeners = new Set();
  const warnings = [];
  let state = load();

  function load() {
    if (!backend) {
      warnings.push('Browser storage is unavailable (private mode or disabled). Progress will be lost when you close this tab.');
      return createDefaultState();
    }
    let raw;
    try {
      raw = backend.getItem(STORAGE_KEY);
    } catch {
      warnings.push('Could not read saved data from browser storage.');
      return createDefaultState();
    }
    if (raw == null) return createDefaultState();
    try {
      return normaliseState(JSON.parse(raw));
    } catch {
      // Keep the damaged data so it can be inspected or recovered manually.
      try {
        backend.setItem(BACKUP_KEY, raw);
      } catch {
        /* ignore */
      }
      warnings.push('Saved data was damaged and could not be read. A copy was kept and a fresh profile was started.');
      return createDefaultState();
    }
  }

  function persist() {
    if (!backend) return false;
    try {
      backend.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch {
      warnings.push('Saving failed — browser storage may be full.');
      return false;
    }
  }

  function trim(s) {
    if (s.activity.length > MAX_ACTIVITY) s.activity = s.activity.slice(-MAX_ACTIVITY);
    if (s.errors.length > MAX_ERRORS) s.errors = s.errors.slice(-MAX_ERRORS);
    if (s.srs.log.length > MAX_SRS_LOG) s.srs.log = s.srs.log.slice(-MAX_SRS_LOG);
  }

  return {
    persistent,
    warnings,
    get: () => state,
    /** Apply `mutator` to a deep copy of the state, then save and notify. */
    update(mutator) {
      const draft = structuredClone(state);
      const result = mutator(draft);
      state = normaliseState(result && typeof result === 'object' && 'schemaVersion' in result ? result : draft);
      trim(state);
      persist();
      listeners.forEach((fn) => fn(state));
      return state;
    },
    /** Replace everything (used by import). */
    replace(next) {
      state = normaliseState(next);
      persist();
      listeners.forEach((fn) => fn(state));
      return state;
    },
    /** Reset learning progress; optionally keep custom content and settings. */
    reset({ keepCustomContent = true, keepSettings = true } = {}) {
      const fresh = createDefaultState();
      if (keepSettings) fresh.settings = { ...state.settings };
      if (keepCustomContent) {
        fresh.vocabulary.custom = state.vocabulary.custom;
        fresh.vocabulary.notes = state.vocabulary.notes;
        fresh.songs.user = state.songs.user;
        fresh.songs.lineNotes = state.songs.lineNotes;
        fresh.songs.userTranslations = state.songs.userTranslations;
      }
      return this.replace(fresh);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Record something the learner did, for the dashboard's recent activity. */
    logActivity(draft, type, id, label) {
      const now = new Date().toISOString();
      const last = draft.activity[draft.activity.length - 1];
      if (last && last.type === type && last.id === id && last.at.slice(0, 10) === now.slice(0, 10)) {
        last.at = now; // collapse repeats on the same day
      } else {
        draft.activity.push({ type, id, label, at: now, day: toDayKey() });
      }
    }
  };
}

/* A lazily-created shared store for the pages. */
let shared = null;
export function getStore() {
  if (!shared) shared = createStore();
  return shared;
}
/** Test hook: replace the shared store. */
export function setStore(store) {
  shared = store;
}
