/**
 * The learner's relationship with vocabulary: review cards, favourites,
 * notes and custom words. Pure functions operate on a store draft.
 */

import { toDayKey } from '../core/dates.js';
import { LESSONS } from '../core/data-loader.js';
import { BUILT_IN, getWord } from './dictionary.js';
import { newCard, review, buildQueue, newIntroducedToday } from './spaced-repetition.js';
import { definiteArticle, pluralise, adjectiveForms, paradigm, familyOf } from '../grammar/grammar-engine.js';

const LEVEL_ORDER = { A0: 0, A1: 1, A2: 2, B1: 3, B2: 4 };

/* ------------------------------------------------------------------ */
/* Review cards                                                        */
/* ------------------------------------------------------------------ */

export function isInReview(state, wordId) {
  return Boolean(state.srs.cards[wordId]);
}

export function addToReview(draft, wordId, today = toDayKey()) {
  if (!draft.srs.cards[wordId]) draft.srs.cards[wordId] = newCard(wordId, today);
  return draft.srs.cards[wordId];
}

export function removeFromReview(draft, wordId) {
  delete draft.srs.cards[wordId];
}

export function gradeCard(draft, wordId, grade, today = toDayKey()) {
  const card = draft.srs.cards[wordId] || newCard(wordId, today);
  const updated = review(card, grade, today);
  draft.srs.cards[wordId] = updated;
  draft.srs.log.push({ id: wordId, grade, day: today });
  return updated;
}

/**
 * Order in which new built-in words are introduced: words from lessons the
 * learner has opened come first (in course order), then everything else by
 * level and category.
 */
export function newWordOrder(state) {
  const seen = new Set(Object.keys(state.srs.cards));
  const ordered = [];
  const add = (id) => {
    if (!seen.has(id) && getWord(id)) {
      seen.add(id);
      ordered.push(id);
    }
  };
  for (const l of LESSONS) if (state.lessons[l.id]) l.relatedVocabulary.forEach(add);
  const rest = BUILT_IN.filter((w) => !seen.has(w.id)).sort(
    (a, b) => (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9) || a.category.localeCompare(b.category) || a.lemma.localeCompare(b.lemma, 'it')
  );
  rest.forEach((w) => add(w.id));
  return ordered;
}

export function newWordsAvailable(state) {
  return BUILT_IN.length + state.vocabulary.custom.length - Object.keys(state.srs.cards).length;
}

/**
 * Prepare today's session: top up new cards (within the daily allowance)
 * and return the queue of word IDs. Mutates `draft` when new cards are added.
 */
export function prepareSession(draft, today = toDayKey()) {
  const { newCardsPerDay, maxReviewsPerDay } = draft.settings;
  const cards = draft.srs.cards;
  const unseenNow = Object.values(cards).filter((c) => c.reps === 0).length;
  const allowance = Math.max(0, newCardsPerDay - newIntroducedToday(cards, today));
  const need = Math.max(0, allowance - unseenNow);
  if (need > 0) {
    for (const id of newWordOrder(draft).slice(0, need)) addToReview(draft, id, today);
  }
  return buildQueue(draft.srs.cards, { today, newPerDay: newCardsPerDay, maxReviews: maxReviewsPerDay }).map((c) => c.id);
}

/* ------------------------------------------------------------------ */
/* Favourites and notes                                                */
/* ------------------------------------------------------------------ */

export function toggleFavourite(draft, wordId) {
  const f = draft.vocabulary.favourites;
  const i = f.indexOf(wordId);
  if (i >= 0) f.splice(i, 1);
  else f.push(wordId);
  return i < 0;
}

export function setNote(draft, wordId, text) {
  const t = String(text || '').trim();
  if (t) draft.vocabulary.notes[wordId] = t.slice(0, 2000);
  else delete draft.vocabulary.notes[wordId];
}

/* ------------------------------------------------------------------ */
/* Custom words                                                        */
/* ------------------------------------------------------------------ */

function slug(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
}

/**
 * Build a custom vocabulary record from form input.
 * input: { lemma, partOfSpeech, meaning, gender?, plural?, example?, exampleEnglish?, notes?, source? }
 * Returns { ok, word?, errors[], generated[] } — `generated` lists fields
 * filled in by rule, so the UI can tell the learner to check them.
 */
export function buildCustomWord(input, existingIds = [], random = Math.random) {
  const errors = [];
  const generated = [];
  const lemma = String(input.lemma || '').trim().toLowerCase();
  const meaning = String(input.meaning || '').trim();
  const pos = input.partOfSpeech || 'noun';
  if (!lemma) errors.push('Write the Italian word.');
  if (!/^[a-zàèéìòóù' ]+$/i.test(lemma)) errors.push('Use Italian letters only.');
  if (!meaning) errors.push('Write the English meaning.');
  if (pos === 'noun' && !['m', 'f'].includes(input.gender)) errors.push('Choose the gender of the noun.');
  if (errors.length) return { ok: false, errors, generated };

  let id = `custom_${slug(lemma)}`;
  while (existingIds.includes(id)) id = `custom_${slug(lemma)}_${Math.floor(random() * 1e6).toString(36)}`;
  const base = {
    id,
    lemma,
    partOfSpeech: pos,
    meaning,
    category: input.category || 'my words',
    level: input.level || 'A1',
    exampleItalian: String(input.example || '').trim(),
    exampleEnglish: String(input.exampleEnglish || '').trim(),
    tags: ['custom', ...(input.source ? [input.source] : [])],
    sourceId: 'learner',
    custom: true,
    createdAt: new Date().toISOString()
  };
  if (pos === 'noun') {
    const g = input.gender;
    let plural = String(input.plural || '').trim().toLowerCase();
    if (!plural) {
      const p = pluralise(lemma, g);
      plural = p.plural || '';
      generated.push(`plural “${plural}” (${p.basis}: ${p.explanation})`);
    }
    return {
      ok: true,
      errors,
      generated,
      word: {
        ...base,
        article: definiteArticle(lemma, g),
        gender: g === 'm' ? 'masculine' : 'feminine',
        singular: lemma,
        plural: plural || null,
        pluralArticle: plural ? definiteArticle(plural, g, 'pl') : null
      }
    };
  }
  if (pos === 'adjective') {
    const a = adjectiveForms(lemma);
    generated.push(`agreement forms (${a.type === 'o' ? 'four-form -o adjective' : a.type === 'e' ? 'two-form -e adjective' : 'treated as invariable'})`);
    return { ok: true, errors, generated, word: { ...base, forms: a.forms } };
  }
  if (pos === 'verb') {
    if (!familyOf(lemma)) return { ok: false, errors: ['A verb should be entered as an infinitive ending in -are, -ere or -ire (or -arsi, -ersi, -irsi).'], generated };
    const p = paradigm(lemma, { isc: input.isc ? true : undefined });
    generated.push(
      p.irregular
        ? 'forms taken from the irregular-verb table'
        : 'present, imperfetto and participle generated by the regular rules — check them if the verb might be irregular'
    );
    return {
      ok: true,
      errors,
      generated,
      word: {
        ...base,
        infinitive: lemma,
        conjugationGroup: `-${p.split.ending}${input.isc ? ' (-isc-)' : ''}`,
        regularity: p.irregular ? 'irregular' : 'regular (generated)',
        reflexive: p.reflexive,
        isc: Boolean(input.isc),
        auxiliary: p.auxiliary,
        present: p.present,
        imperfect: p.imperfect,
        participle: p.participle,
        irregularForms: []
      }
    };
  }
  return { ok: true, errors, generated, word: base };
}

export function addCustomWord(draft, word) {
  draft.vocabulary.custom.push(word);
}

export function deleteCustomWord(draft, id) {
  draft.vocabulary.custom = draft.vocabulary.custom.filter((w) => w.id !== id);
  delete draft.srs.cards[id];
  delete draft.vocabulary.notes[id];
  draft.vocabulary.favourites = draft.vocabulary.favourites.filter((x) => x !== id);
}

/** Learning status of a word for display. */
export function wordStatus(state, wordId) {
  const c = state.srs.cards[wordId];
  if (!c) return { label: 'not in review', key: 'none' };
  if (c.reps === 0) return { label: 'new (queued)', key: 'new' };
  if (c.box >= 4) return { label: `known (box ${c.box})`, key: 'known' };
  if (c.box === 0) return { label: 'relearning', key: 'learning' };
  return { label: `learning (box ${c.box})`, key: 'learning' };
}
