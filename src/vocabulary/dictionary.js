/**
 * Dictionary: vocabulary lookup, inflected-form index and search.
 *
 * The form index maps every inflected form that the course knows about
 * (noun singular/plural, adjective forms, every present/imperfetto/
 * participle form of every verb, articles, articulated prepositions,
 * pronouns, possessives, …) to one or more analyses. It is generated from
 * curated data, never guessed from suffixes, so a form that is not in the
 * index is reported as unknown rather than analysed wrongly.
 */

import vocabularyData from '../data/vocabulary.json';
import functionWords from '../data/function-words.json';
import {
  PERSONS,
  PERSON_LABELS,
  agreeParticiple,
  articulatedPreposition,
  ARTICLE_ORDER,
  baseInfinitive
} from '../grammar/grammar-engine.js';
import { conjugate, tenseInfo, alternatives, gerundio, IMPERATIVE_PERSONS, fullTenseLabel } from '../grammar/verb-system.js';

export const BUILT_IN = vocabularyData.entries;

const byId = new Map(BUILT_IN.map((w) => [w.id, w]));

export function getWord(id, custom = []) {
  return byId.get(id) || custom.find((w) => w.id === id) || null;
}

export function allWords(custom = []) {
  return custom.length ? [...BUILT_IN, ...custom] : BUILT_IN;
}

/** "il gatto", "l'acqua", "lo zaino" — nouns are always shown with the article. */
export function displayLemma(word) {
  if (!word) return '';
  if (word.partOfSpeech === 'noun' && word.article) {
    return word.article.endsWith("'") ? `${word.article}${word.lemma}` : `${word.article} ${word.lemma}`;
  }
  return word.lemma;
}

export function displayPlural(word) {
  if (!word || word.partOfSpeech !== 'noun' || !word.plural) return '';
  const a = word.pluralArticle || '';
  return a.endsWith("'") ? `${a}${word.plural}` : `${a} ${word.plural}`.trim();
}

/* ------------------------------------------------------------------ */
/* Normalisation for lookup and search                                 */
/* ------------------------------------------------------------------ */

export function foldAccents(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
}

export function normaliseToken(t) {
  return String(t)
    .normalize('NFC')
    .replace(/[‘’ʼ`´]/g, "'")
    .toLowerCase()
    .trim();
}

/* ------------------------------------------------------------------ */
/* Form index                                                          */
/* ------------------------------------------------------------------ */

const GENDER_WORD = { m: 'masculine', f: 'feminine', masculine: 'masculine', feminine: 'feminine' };
const NUMBER_WORD = { sg: 'singular', pl: 'plural' };

function add(index, form, analysis) {
  if (!form) return;
  const key = normaliseToken(form);
  if (!index.has(key)) index.set(key, []);
  const list = index.get(key);
  const sig = `${analysis.wordId || analysis.lemma}|${analysis.pos}|${analysis.description}`;
  if (!list.some((a) => a.sig === sig)) list.push({ ...analysis, sig });
}

function indexWord(index, w) {
  switch (w.partOfSpeech) {
    case 'noun': {
      const g = GENDER_WORD[w.gender];
      add(index, w.lemma, {
        wordId: w.id,
        lemma: w.lemma,
        pos: 'noun',
        features: { gender: g, number: 'singular' },
        description: `noun, ${g} singular`,
        meaning: w.meaning
      });
      if (w.plural && w.plural !== w.lemma) {
        const pg = GENDER_WORD[w.pluralGender || w.gender];
        add(index, w.plural, {
          wordId: w.id,
          lemma: w.lemma,
          pos: 'noun',
          features: { gender: pg, number: 'plural' },
          description: `noun, ${pg} plural of ${w.lemma}`,
          meaning: w.meaning
        });
      } else if (w.plural === w.lemma) {
        // invariable: same form is also plural
        const list = index.get(normaliseToken(w.lemma));
        const a = list && list.find((x) => x.wordId === w.id);
        if (a) {
          a.features = { ...a.features, number: 'singular or plural' };
          a.description = `noun, ${g}, invariable (singular or plural)`;
        }
      }
      break;
    }
    case 'adjective': {
      const f = w.forms || { ms: w.lemma };
      const labels = { ms: ['masculine', 'singular'], fs: ['feminine', 'singular'], mp: ['masculine', 'plural'], fp: ['feminine', 'plural'] };
      const groups = new Map();
      for (const [k, form] of Object.entries(f)) {
        if (!groups.has(form)) groups.set(form, []);
        groups.get(form).push(labels[k]);
      }
      for (const [form, ls] of groups) {
        const desc =
          ls.length === 4
            ? 'adjective, invariable'
            : ls.length === 2 && ls[0][1] === ls[1][1]
              ? `adjective, masculine or feminine ${ls[0][1]}`
              : `adjective, ${ls.map((l) => l.join(' ')).join(' or ')}`;
        add(index, form, {
          wordId: w.id,
          lemma: w.lemma,
          pos: 'adjective',
          features: ls.length === 1 ? { gender: ls[0][0], number: ls[0][1] } : { number: ls[0][1] },
          description: desc,
          meaning: w.meaning
        });
      }
      break;
    }
    case 'verb':
      indexVerb(index, w);
      break;
    default: {
      // Multi-word expressions are not single tokens; index the first word only if it is the whole lemma.
      if (/\s/.test(w.lemma) || w.lemma.includes("'")) break;
      add(index, w.lemma, {
        wordId: w.id,
        lemma: w.lemma,
        pos: w.partOfSpeech,
        features: {},
        description: w.partOfSpeech,
        meaning: w.meaning
      });
    }
  }
}

/** Finite simple tenses indexed as single words, in order of preference for display. */
const INDEXED_TENSES = ['presente', 'imperfetto', 'passatoRemoto', 'futuro', 'condizionale', 'congiuntivoPresente', 'congiuntivoImperfetto', 'imperativo'];

function indexVerb(index, w) {
  const { reflexive, base: baseInf } = baseInfinitive(w.lemma);
  const strip = (f) => (reflexive && f ? f.replace(/^(mi|ti|si|ci|vi) /, '') : f);
  const base = { wordId: w.id, lemma: w.lemma, pos: 'verb', meaning: w.meaning, auxiliary: reflexive ? 'essere' : w.auxiliary };
  const reflNote = reflexive ? ' (reflexive: used with mi, ti, si…)' : '';
  add(index, w.lemma, { ...base, features: { form: 'infinitive', mood: 'infinito' }, description: `verb, infinito presente${reflNote}` });
  if (!reflexive && /[lnr]e$/.test(w.lemma)) {
    // Truncated infinitive (aver mangiato, esser partito, far vedere, andar via): common before a consonant.
    add(index, w.lemma.slice(0, -1), { ...base, features: { form: 'infinitive', mood: 'infinito', truncated: true }, description: `verb, infinito presente (truncated form of ${w.lemma}, used before a consonant: aver fatto, far vedere)` });
  }
  if (reflexive) {
    add(index, baseInf, { ...base, features: { form: 'infinitive', mood: 'infinito' }, description: `verb, infinitive (non-reflexive base of ${w.lemma})` });
    const stem = baseInf.slice(0, -1);
    ['mi', 'ti', 'si', 'ci', 'vi'].forEach((pr) => {
      if (`${stem}${pr}` !== w.lemma) add(index, `${stem}${pr}`, { ...base, features: { form: 'infinitive', mood: 'infinito', enclitic: pr }, description: `verb, infinito with the reflexive pronoun ${pr} attached` });
    });
  }
  const opts = { isc: w.isc ? true : undefined, record: w };
  for (const key of INDEXED_TENSES) {
    const info = tenseInfo(key);
    let forms;
    try {
      forms = key === 'presente' && w.present ? w.present : key === 'imperfetto' && w.imperfect ? w.imperfect : conjugate(w.lemma, key, opts);
    } catch {
      continue;
    }
    forms.forEach((cell, i) => {
      for (const form of alternatives(cell)) {
        const bare = key === 'imperativo' ? form.replace(/^si /, '') : strip(form);
        const person = key === 'imperativo' ? IMPERATIVE_PERSONS[i] : PERSONS[i];
        const plabel = key === 'imperativo' ? (i === 2 || i === 5 ? `formal ${person}` : person) : `${PERSON_LABELS[i]} (${PERSONS[i]})`;
        add(index, bare, {
          ...base,
          features: { tense: fullTenseLabel(info), tenseKey: key, mood: info.mood, person, personIndex: i },
          description: `verb, ${fullTenseLabel(info)}, ${plabel}${key === 'imperativo' ? '' : reflNote}`
        });
      }
    });
  }
  const ger = gerundio(w.lemma);
  add(index, ger, { ...base, features: { form: 'gerund', mood: 'gerundio' }, description: `verb, gerundio presente${reflexive ? ' with the reflexive pronoun si attached' : ''}` });
  if (reflexive) {
    const g = ger.replace(/si$/, '');
    ['mi', 'ti', 'ci', 'vi'].forEach((pr) => add(index, `${g}${pr}`, { ...base, features: { form: 'gerund', mood: 'gerundio', enclitic: pr }, description: `verb, gerundio with the reflexive pronoun ${pr} attached` }));
  }
  if (w.participle) {
    const p = w.participle;
    const forms = [
      [p, 'masculine singular'],
      [agreeParticiple(p, 'f', 'sg'), 'feminine singular'],
      [agreeParticiple(p, 'm', 'pl'), 'masculine plural'],
      [agreeParticiple(p, 'f', 'pl'), 'feminine plural']
    ];
    for (const [form, label] of forms) {
      add(index, form, {
        ...base,
        features: { form: 'past participle', mood: 'participio', agreement: label },
        description: `verb, participio passato (${label}) — compound tenses take ${reflexive ? 'essere' : w.auxiliary}; also passive and adjectival use`
      });
    }
  }
}

function indexFunctionWords(index) {
  for (const e of functionWords.entries) {
    const f = e.features || {};
    const bits = [f.gender && GENDER_WORD[f.gender], f.number && NUMBER_WORD[f.number]].filter(Boolean).join(' ');
    add(index, e.form, {
      wordId: null,
      lemma: e.lemma,
      pos: e.pos,
      features: f,
      description: bits ? `${e.pos}, ${bits}` : e.pos,
      meaning: e.meaning,
      note: e.note
    });
  }
  const prepMeaning = { di: 'of the', a: 'to the; at the', da: 'from the', in: 'in the', su: 'on the' };
  const artInfo = {
    il: ['masculine', 'singular'],
    lo: ['masculine', 'singular'],
    "l'": ['', 'singular'],
    la: ['feminine', 'singular'],
    i: ['masculine', 'plural'],
    gli: ['masculine', 'plural'],
    le: ['feminine', 'plural']
  };
  for (const prep of Object.keys(prepMeaning)) {
    for (const art of ARTICLE_ORDER) {
      const form = articulatedPreposition(prep, art);
      const [g, n] = artInfo[art];
      add(index, form, {
        wordId: null,
        lemma: prep,
        pos: 'articulated preposition',
        features: { preposition: prep, article: art, gender: g, number: n },
        description: `articulated preposition: ${prep} + ${art}${g ? ` (${g} ${n})` : ` (${n})`}`,
        meaning: prepMeaning[prep],
        note: `${form} = ${prep} + ${art}`
      });
    }
  }
}

let cachedIndex = null;
let cachedCustomKey = '';

/** Build (and cache) the form index, optionally including the learner's own words. */
export function formIndex(custom = []) {
  const key = custom.map((w) => w.id).join(',');
  if (cachedIndex && cachedCustomKey === key) return cachedIndex;
  const index = new Map();
  indexFunctionWords(index);
  for (const w of BUILT_IN) indexWord(index, w);
  for (const w of custom) indexWord(index, { ...w, custom: true });
  cachedIndex = index;
  cachedCustomKey = key;
  return index;
}

/** All analyses of a single token (already split from punctuation). */
export function lookupForm(token, custom = []) {
  const index = formIndex(custom);
  const t = normaliseToken(token);
  return index.get(t) || [];
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

const FORM_CACHE = new WeakMap();
function wordForms(w) {
  if (FORM_CACHE.has(w)) return FORM_CACHE.get(w);
  const result = computeWordForms(w);
  FORM_CACHE.set(w, result);
  return result;
}

function computeWordForms(w) {
  const forms = [w.lemma];
  if (w.plural) forms.push(w.plural);
  if (w.forms) forms.push(...Object.values(w.forms));
  if (w.partOfSpeech === 'verb') {
    for (const key of INDEXED_TENSES) {
      try {
        for (const cell of conjugate(w.lemma, key, { isc: w.isc ? true : undefined, record: w })) for (const f of alternatives(cell)) forms.push(f.replace(/^(mi|ti|si|ci|vi) /, ''));
      } catch {
        /* not conjugable (malformed custom entry) */
      }
    }
  }
  if (w.participle) forms.push(w.participle);
  return forms.map((f) => foldAccents(f.toLowerCase()));
}

/**
 * Search vocabulary.
 * filters: { query, category, pos, level, favourites (array of ids), onlyIds }
 * Ranking: exact Italian lemma > Italian prefix > inflected form > English
 * whole-word match > English substring.
 */
export function searchVocabulary(words, { query = '', category = '', pos = '', level = '', ids = null } = {}) {
  const q = foldAccents(query.trim().toLowerCase()).replace(/^(il|lo|la|l'|i|gli|le|un|uno|una|un'|to)\s+/, '');
  const results = [];
  for (const w of words) {
    if (category && w.category !== category) continue;
    if (pos && w.partOfSpeech !== pos) continue;
    if (level && w.level !== level) continue;
    if (ids && !ids.includes(w.id)) continue;
    if (!q) {
      results.push({ word: w, score: 0 });
      continue;
    }
    const lemma = foldAccents(w.lemma.toLowerCase());
    const meaning = foldAccents(String(w.meaning).toLowerCase());
    let score = -1;
    if (lemma === q) score = 100;
    else if (wordForms(w).includes(q)) score = 80;
    else if (new RegExp(`(^|[^a-z])${escapeRe(q)}([^a-z]|$)`).test(meaning)) score = 70;
    else if (lemma.startsWith(q)) score = 60 - Math.min(20, lemma.length - q.length);
    else if (q.length >= 3 && meaning.includes(q)) score = 40;
    else if (q.length >= 3 && wordForms(w).some((f) => f.startsWith(q))) score = 30;
    if (score >= 0) results.push({ word: w, score });
  }
  results.sort((a, b) => b.score - a.score || a.word.lemma.localeCompare(b.word.lemma, 'it'));
  return results.map((r) => r.word);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function categories(words = BUILT_IN) {
  return [...new Set(words.map((w) => w.category))].sort();
}

export function partsOfSpeech(words = BUILT_IN) {
  return [...new Set(words.map((w) => w.partOfSpeech))].sort();
}
