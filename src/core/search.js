/**
 * Search over lessons (for the grammar reference) and across the whole
 * site (lessons, vocabulary, stories, songs).
 */

import { LESSONS, STORIES, RHYMES } from './data-loader.js';
import { BUILT_IN, searchVocabulary, displayLemma, foldAccents, lookupForm } from '../vocabulary/dictionary.js';
import { tenseInfo } from '../grammar/verb-system.js';

const fold = (s) => foldAccents(String(s).toLowerCase());

function lessonText(l) {
  const parts = [l.title, l.description, ...l.objectives, ...l.summary, ...l.tags.topics, ...l.tags.pos, ...l.tags.tenses, ...l.tags.families];
  for (const s of l.sections) {
    parts.push(s.heading);
    for (const b of s.blocks) {
      if (b.text) parts.push(b.text);
      if (b.title) parts.push(b.title);
      if (b.items) parts.push(...b.items);
      if (b.rows) parts.push(...b.rows.flat());
    }
  }
  return fold(parts.join(' '));
}

const LESSON_INDEX = LESSONS.map((l) => ({ lesson: l, text: lessonText(l), title: fold(l.title) }));

/** Facets available for filtering the grammar reference. */
export function lessonFacets() {
  const facet = (key) => [...new Set(LESSONS.flatMap((l) => l.tags[key]))].sort();
  return {
    pos: facet('pos'),
    topics: facet('topics'),
    tenses: facet('tenses'),
    families: facet('families'),
    levels: [...new Set(LESSONS.map((l) => l.level))].sort()
  };
}

/**
 * filters: { query, pos, topic, tense, family, level }
 */
export function searchLessons({ query = '', pos = '', topic = '', tense = '', family = '', level = '' } = {}) {
  const q = fold(query.trim());
  const terms = q.split(/\s+/).filter(Boolean);
  return LESSON_INDEX.filter(({ lesson: l, text }) => {
    if (pos && !l.tags.pos.includes(pos)) return false;
    if (topic && !l.tags.topics.includes(topic)) return false;
    if (tense && !l.tags.tenses.includes(tense)) return false;
    if (family && !l.tags.families.includes(family)) return false;
    if (level && l.level !== level) return false;
    return terms.every((t) => text.includes(t));
  })
    .map(({ lesson, title }) => ({ lesson, score: terms.length && terms.every((t) => title.includes(t)) ? 2 : 1 }))
    .sort((a, b) => b.score - a.score || a.lesson.order - b.lesson.order)
    .map((r) => r.lesson);
}

/** Mixed search for the header box. */
export function siteSearch(query, custom = []) {
  const q = fold(query.trim());
  if (q.length < 2) return [];
  const results = [];
  // An inflected form (andrò, fosse, vide …) finds its dictionary word and the lesson for its tense.
  if (!/\s/.test(query.trim())) {
    const seen = new Set();
    for (const a of lookupForm(query.trim(), custom)) {
      if (!a.wordId || seen.has(a.wordId + a.description)) continue;
      seen.add(a.wordId + a.description);
      results.push({ type: 'word', id: a.wordId, title: `${query.trim()} → ${a.lemma}`, detail: `Form · ${a.description}` });
      const info = a.features && a.features.tenseKey ? tenseInfo(a.features.tenseKey) : null;
      if (info && !results.some((r) => r.type === 'lesson' && r.id === info.lesson)) {
        const l = LESSONS.find((x) => x.id === info.lesson);
        if (l) results.push({ type: 'lesson', id: l.id, title: l.title, detail: `Lesson · ${info.label}` });
      }
      if (results.length > 8) break;
    }
  }
  for (const l of searchLessons({ query })) if (!results.some((r) => r.type === 'lesson' && r.id === l.id)) results.push({ type: 'lesson', id: l.id, title: l.title, detail: `Lesson · ${l.moduleTitle}` });
  for (const w of searchVocabulary([...BUILT_IN, ...custom], { query }).slice(0, 8)) {
    results.push({ type: 'word', id: w.id, title: displayLemma(w), detail: `${w.partOfSpeech} · ${w.meaning}` });
  }
  for (const s of STORIES) {
    const hay = fold([s.title, s.titleEnglish, s.summary, ...s.paragraphs.flat().map((x) => x.it)].join(' '));
    if (hay.includes(q)) results.push({ type: 'story', id: s.id, title: s.title, detail: `Story · ${s.level}` });
  }
  for (const r of RHYMES) {
    const hay = fold([r.title, r.titleEnglish, ...r.lines.map((x) => x.it)].join(' '));
    if (hay.includes(q)) results.push({ type: 'song', id: r.id, title: r.title, detail: `Rhyme · ${r.level}` });
  }
  return results.slice(0, 20);
}
