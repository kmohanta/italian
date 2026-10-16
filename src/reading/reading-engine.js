/**
 * Reading studio: turns story sentences into clickable tokens and keeps
 * the learner's reading record.
 */

import { tokenize, analyseSentence } from '../grammar/sentence-analysis.js';
import { tenseInfo, fullTenseLabel } from '../grammar/verb-system.js';
import { lookupForm } from '../vocabulary/dictionary.js';

/**
 * Prepare a sentence for display: an array of tokens with their analyses.
 * Each word token is { text, kind: 'word', analyses: [...], known: boolean, name: boolean }.
 */
export function prepareSentence(text, { names = [], custom = [] } = {}) {
  return tokenize(text).map((t) => {
    if (t.kind !== 'word') return t;
    const isName = names.includes(t.text);
    const analyses = isName ? [] : lookupForm(t.text, custom);
    return { ...t, analyses, known: analyses.length > 0, name: isName };
  });
}

/** Unique word IDs that occur in a text (for 'add all to review'). */
export function wordIdsInText(text, opts = {}) {
  const ids = new Set();
  for (const t of prepareSentence(text, opts)) {
    if (t.kind === 'word') for (const a of t.analyses) if (a.wordId) ids.add(a.wordId);
  }
  return [...ids];
}

export function storyText(story) {
  return story.paragraphs.flat().map((s) => s.it).join(' ');
}

export function storyWordCount(story) {
  return tokenize(storyText(story)).filter((t) => t.kind === 'word').length;
}

/* Record keeping (mutates a store draft) */

export function markRead(draft, storyId, read = true) {
  if (read) draft.reading.read[storyId] = draft.reading.read[storyId] || new Date().toISOString();
  else delete draft.reading.read[storyId];
}

export function recordVisit(draft, storyId) {
  const now = new Date().toISOString();
  draft.reading.history = [{ id: storyId, at: now }, ...draft.reading.history.filter((h) => h.id !== storyId)].slice(0, 30);
}

export function toggleStoryFavourite(draft, storyId) {
  const f = draft.reading.favourites;
  const i = f.indexOf(storyId);
  if (i >= 0) f.splice(i, 1);
  else f.push(storyId);
}

export function recordComprehension(draft, storyId, correct, total) {
  const prev = draft.reading.comprehension[storyId];
  draft.reading.comprehension[storyId] = {
    best: Math.max(prev ? prev.best : 0, correct),
    last: correct,
    total,
    at: new Date().toISOString()
  };
}

/* ------------------------------------------------------------------ */
/* Verb forms in context                                               */
/* ------------------------------------------------------------------ */

const NONFINITE_LESSON = { gerund: 'infinito-gerundio', infinitive: 'infinito-gerundio', 'past participle': 'participio' };

/**
 * For each token of a sentence, the reading of its verb group in context
 * (e.g. "è uscito" → passato prossimo of uscire), when the analyser can
 * determine it. Returns an array aligned with tokenize(text): null where
 * there is nothing to add.
 */
export function verbContexts(text, opts = {}) {
  const a = analyseSentence(text, opts);
  const out = a.tokens.map(() => null);
  if (!a.supported) return out;
  for (const c of a.clauses) {
    if (!c.verb || !c.vp) continue;
    const group = c.vp.tokens.filter((t) => ['VERB', 'PART', 'INF', 'GER'].includes(t.tag)).map((t) => t.text).join(' ');
    const info = tenseInfo(c.verb.tenseKey);
    const kind = c.kind === 'relative' ? 'relative clause' : c.kind === 'subordinate' ? `subordinate clause (${c.introducer.text.toLowerCase()})` : 'main clause';
    const voice = c.verb.voice === 'passive' ? ', passive' : '';
    const construction = c.verb.construction !== 'simple' && c.verb.construction !== 'compound' && c.verb.construction !== 'passive' ? `, ${c.verb.construction}` : '';
    const ctx = {
      text: `“${group}” = ${c.verb.tense} of ${c.verb.lemma}${voice}${construction}, ${c.verb.person}; ${kind}.`,
      lesson: info ? info.lesson : null,
      tenseKey: c.verb.tenseKey
    };
    for (const t of c.vp.tokens) {
      if (['VERB', 'PART', 'INF', 'GER'].includes(t.tag)) out[a.tokens.indexOf(t)] = ctx;
    }
  }
  return out;
}

/**
 * Summarise the verb tenses and moods used in a set of sentences.
 * Returns [{ key, label, lesson, examples: [form…] }] for tenses, plus
 * non-finite forms, using the analyser where possible and unambiguous word
 * readings otherwise.
 */
export function verbFormsUsed(sentences, opts = {}) {
  const found = new Map();
  const note = (key, label, lesson, form) => {
    if (!found.has(key)) found.set(key, { key, label, lesson, examples: [] });
    const e = found.get(key);
    if (!e.examples.includes(form) && e.examples.length < 6) e.examples.push(form);
  };
  for (const text of sentences) {
    const a = analyseSentence(text, opts);
    const covered = new Set();
    if (a.supported) {
      for (const c of a.clauses) {
        if (!c.verb || !c.vp) continue;
        const info = tenseInfo(c.verb.tenseKey);
        const form = c.vp.tokens.filter((t) => ['VERB', 'PART', 'INF', 'GER'].includes(t.tag)).map((t) => t.text).join(' ');
        if (info) note(info.key + (c.verb.voice === 'passive' ? ':passive' : ''), `${fullTenseLabel(info)}${c.verb.voice === 'passive' ? ' (passive)' : ''}`, c.verb.voice === 'passive' ? 'forma-passiva' : info.lesson, form);
        c.vp.tokens.forEach((t) => covered.add(t));
      }
    }
    for (const t of a.words) {
      if (covered.has(t)) continue;
      const verbs = t.analyses.filter((x) => x.pos === 'verb');
      if (!verbs.length) continue;
      const forms = new Set(verbs.map((x) => x.features.form || x.features.tenseKey));
      if (forms.size !== 1) continue; // ambiguous out of context: not counted
      const v = verbs[0];
      if (v.features.tenseKey) {
        const info = tenseInfo(v.features.tenseKey);
        note(info.key, fullTenseLabel(info), info.lesson, t.text);
      } else if (NONFINITE_LESSON[v.features.form]) {
        note(v.features.form, v.features.form === 'past participle' ? 'participio passato' : v.features.form === 'gerund' ? 'gerundio' : 'infinito', NONFINITE_LESSON[v.features.form], t.text);
      }
    }
  }
  return [...found.values()];
}
