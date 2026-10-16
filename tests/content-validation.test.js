import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LESSONS, MODULES, STORIES, RHYMES, DIAGNOSTIC, PRACTICE_SETS, SOURCES, ALL_EXERCISES, VERIFICATION, getLesson, getStory, getRhyme } from '../src/core/data-loader.js';
import { BUILT_IN, getWord, lookupForm } from '../src/vocabulary/dictionary.js';
import { tokenize } from '../src/grammar/sentence-analysis.js';
import { checkExercise } from '../src/core/validation.js';
import { lessonRefs } from '../src/components/dom.js';
import { PAGES, NAV_PAGES } from '../src/core/pages.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'A0–A1', 'A1–A2', 'A2–B1', 'B1–B2'];
const KINDS = ['choice', 'text', 'cloze', 'table', 'match', 'order'];

/** Feed the stored answer back into the checker: every key must accept itself. */
function selfCheck(ex) {
  switch (ex.kind) {
    case 'choice':
    case 'text':
      return checkExercise(ex, ex.answer);
    case 'cloze':
      return checkExercise(ex, ex.blanks.map((b) => b.answer));
    case 'table':
      return checkExercise(ex, ex.rows.map((r) => r.answer));
    case 'match':
      return checkExercise(ex, Object.fromEntries(ex.pairs));
    case 'order':
      return checkExercise(ex, ex.answer);
    default:
      throw new Error(ex.kind);
  }
}

function validateExercise(ex, where) {
  expect(ex.id, where).toBeTruthy();
  expect(KINDS, `${ex.id} kind`).toContain(ex.kind);
  expect(ex.prompt, `${ex.id} prompt`).toBeTruthy();
  expect(ex.explanation, `${ex.id} explanation`).toBeTruthy();
  if (ex.kind === 'choice') {
    expect(ex.options, ex.id).toContain(ex.answer);
    expect(new Set(ex.options).size, `${ex.id} duplicate options`).toBe(ex.options.length);
  }
  if (ex.kind === 'cloze') {
    const n = (ex.text.match(/\{\d+\}/g) || []).length;
    expect(n, `${ex.id} placeholders`).toBe(ex.blanks.length);
  }
  if (ex.kind === 'match') {
    expect(new Set(ex.pairs.map((p) => p[0])).size, `${ex.id} duplicate left items`).toBe(ex.pairs.length);
  }
  if (ex.kind === 'order') {
    expect([...ex.tokens].sort(), `${ex.id} tokens`).toEqual([...ex.answer].sort());
  }
  for (const m of ex.mistakes || []) {
    expect(selfCheck({ ...ex, answer: ex.answer }).correct).toBe(true);
    if (ex.kind === 'text') expect(checkExercise(ex, m.answer).correct, `${ex.id}: anticipated mistake “${m.answer}” must be marked wrong`).toBe(false);
  }
  const r = selfCheck(ex);
  expect(r.correct, `${ex.id}: the answer key must accept its own answer`).toBe(true);
}

describe('curriculum', () => {
  it('has at least 20 modules and 45 lessons', () => {
    expect(MODULES.length).toBeGreaterThanOrEqual(20);
    expect(LESSONS.length).toBeGreaterThanOrEqual(45);
  });
  it('module numbers run 1…n in order', () => {
    expect(MODULES.map((m) => m.number)).toEqual(MODULES.map((_, i) => i + 1));
  });
  it('every tense and non-finite form in the verb-system map links to an existing lesson', async () => {
    const { TENSES, NONFINITE } = await import('../src/grammar/verb-system.js');
    for (const t of [...TENSES, ...NONFINITE]) expect(getLesson(t.lesson), `${t.key} → ${t.lesson}`).not.toBeNull();
  });
  it('each exercise ruleRef and lesson link is resolvable everywhere', () => {
    const texts = [...LESSONS.map((l) => JSON.stringify(l)), JSON.stringify(STORIES), JSON.stringify(RHYMES), JSON.stringify(PRACTICE_SETS), JSON.stringify(DIAGNOSTIC)];
    for (const t of texts) for (const ref of lessonRefs(t)) expect(getLesson(ref), ref).not.toBeNull();
  });
  it('lists every lesson exactly once', () => {
    const listed = MODULES.flatMap((m) => m.lessons);
    expect(new Set(listed).size).toBe(listed.length);
    for (const id of listed) expect(getLesson(id), id).not.toBeNull();
  });
  it('every lesson is complete', () => {
    for (const l of LESSONS) {
      expect(LEVELS, l.id).toContain(l.level);
      expect(l.objectives.length, `${l.id} objectives`).toBeGreaterThan(0);
      expect(l.sections.length, `${l.id} sections`).toBeGreaterThan(0);
      expect(l.examples.length, `${l.id} examples`).toBeGreaterThanOrEqual(5);
      for (const e of l.examples) expect(e.en, `${l.id} example translation`).toBeTruthy();
      expect(l.exercises.length, `${l.id} exercises`).toBeGreaterThanOrEqual(5);
      expect(l.summary.length, `${l.id} summary`).toBeGreaterThan(0);
      expect(l.relatedVocabulary.length, `${l.id} vocabulary`).toBeGreaterThan(0);
      for (const v of l.relatedVocabulary) expect(getWord(v), `${l.id}: ${v}`).not.toBeNull();
      for (const s of l.relatedStories) expect(getStory(s), `${l.id}: story ${s}`).not.toBeNull();
      for (const s of l.relatedSongs || []) expect(getRhyme(s), `${l.id}: song ${s}`).not.toBeNull();
      const sectionIds = l.sections.map((s) => s.id);
      for (const ex of l.exercises) {
        validateExercise(ex, l.id);
        if (ex.ruleRef) expect(sectionIds, `${ex.id} ruleRef`).toContain(ex.ruleRef);
        for (const v of ex.vocabRef || []) expect(getWord(v), `${ex.id}: ${v}`).not.toBeNull();
      }
      for (const s of l.sections) {
        for (const b of s.blocks) {
          if (b.type === 'paradigm') expect(getWord(b.verb), `${l.id}: paradigm ${b.verb}`).not.toBeNull();
          if (b.type === 'compare') for (const v of b.verbs) expect(getWord(v), `${l.id}: compare ${v}`).not.toBeNull();
          if (b.type === 'table') for (const row of b.rows) expect(row.length, `${l.id}: table row width`).toBe(b.headers.length);
          if (b.type === 'conjugation-set') expect(getWord(b.verb), `${l.id}: conjugation-set ${b.verb}`).not.toBeNull();
          for (const ref of lessonRefs(JSON.stringify(b))) expect(getLesson(ref), `${l.id}: link to lesson ${ref}`).not.toBeNull();
        }
      }
    }
  });
  it('exercise IDs are unique across the whole course', () => {
    const ids = [
      ...LESSONS.flatMap((l) => l.exercises.map((e) => e.id)),
      ...STORIES.flatMap((s) => s.questions.map((e) => e.id)),
      ...RHYMES.flatMap((r) => r.exercises.map((e) => e.id)),
      ...PRACTICE_SETS.flatMap((p) => p.exercises.map((e) => e.id)),
      ...DIAGNOSTIC.questions.map((e) => e.id)
    ];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ALL_EXERCISES.size).toBe(ids.length);
  });
  it('covers the required exercise types', () => {
    const types = new Set([...ALL_EXERCISES.values()].map((e) => e.type));
    for (const t of [
      'multiple-choice', 'fill-blank', 'translate-it-en', 'translate-en-it', 'article', 'plural', 'conjugation',
      'classification', 'matching', 'sentence-order', 'infinitive', 'grammatical-role', 'reading-comprehension',
      'song-interpretation', 'competing-forms'
    ]) expect(types, t).toContain(t);
    expect([...ALL_EXERCISES.values()].some((e) => e.kind === 'cloze')).toBe(true);
  });
  it('diagnostic and practice exercises are valid', () => {
    for (const q of DIAGNOSTIC.questions) {
      validateExercise(q, 'diagnostic');
      expect(MODULES.map((m) => m.id)).toContain(q.module);
    }
    for (const set of PRACTICE_SETS) {
      for (const id of set.lessons) expect(getLesson(id), id).not.toBeNull();
      for (const ex of set.exercises) validateExercise(ex, set.id);
    }
  });
});

describe('vocabulary', () => {
  it('has at least 250 entries with unique IDs', () => {
    expect(BUILT_IN.length).toBeGreaterThanOrEqual(250);
    expect(new Set(BUILT_IN.map((w) => w.id)).size).toBe(BUILT_IN.length);
  });
  it('every entry has the fields its part of speech needs', () => {
    const sourceIds = SOURCES.sources.map((s) => s.id);
    for (const w of BUILT_IN) {
      for (const f of ['id', 'lemma', 'partOfSpeech', 'meaning', 'category', 'level', 'exampleItalian', 'exampleEnglish', 'sourceId']) {
        expect(w[f], `${w.id}.${f}`).toBeTruthy();
      }
      expect(['A0', 'A1', 'A2', 'B1', 'B2'], w.id).toContain(w.level);
      expect(sourceIds, w.id).toContain(w.sourceId);
      if (w.partOfSpeech === 'noun') {
        expect(['il', 'lo', "l'", 'la'], w.id).toContain(w.article);
        expect(['masculine', 'feminine'], w.id).toContain(w.gender);
        expect('plural' in w, w.id).toBe(true);
        if (w.plural) expect(['i', 'gli', 'le'], w.id).toContain(w.pluralArticle);
      }
      if (w.partOfSpeech === 'verb') {
        expect(w.present, w.id).toHaveLength(6);
        expect(w.imperfect, w.id).toHaveLength(6);
        expect(w.participle, w.id).toBeTruthy();
        expect(['avere', 'essere'], w.id).toContain(w.auxiliary);
      }
      if (w.partOfSpeech === 'adjective') {
        expect(Object.keys(w.forms).sort(), w.id).toEqual(['fp', 'fs', 'mp', 'ms']);
      }
      for (const r of w.related || []) expect(getWord(r), `${w.id} related ${r}`).not.toBeNull();
    }
  });
  it('covers the required categories', () => {
    const cats = new Set(BUILT_IN.map((w) => w.category));
    for (const c of ['animals', 'family', 'people', 'food', 'home', 'nature', 'weather', 'feelings', 'time', 'descriptions', 'prepositions', 'conjunctions']) {
      expect(cats, c).toContain(c);
    }
  });
});

function unknownTokens(text, names) {
  return tokenize(text)
    .filter((t) => t.kind === 'word' && !names.includes(t.text))
    .filter((t) => lookupForm(t.text).length === 0)
    .map((t) => t.text);
}

describe('stories', () => {
  it('has the required graded set', () => {
    expect(STORIES.length).toBeGreaterThanOrEqual(8);
    const count = (lvl) => STORIES.filter((s) => s.level === lvl).length;
    expect(count('A0–A1')).toBeGreaterThanOrEqual(4);
    expect(count('A1')).toBeGreaterThanOrEqual(3);
    expect(count('A1–A2')).toBeGreaterThanOrEqual(1);
  });
  it('every story is complete and every word can be inspected', () => {
    for (const s of STORIES) {
      expect(s.title && s.titleEnglish && s.summary, s.id).toBeTruthy();
      const sentences = s.paragraphs.flat();
      expect(sentences.length, s.id).toBeGreaterThan(5);
      for (const x of sentences) {
        expect(x.en, `${s.id}: translation`).toBeTruthy();
        expect(unknownTokens(x.it, s.names), `${s.id}: “${x.it}”`).toEqual([]);
      }
      expect(s.questions.length, s.id).toBeGreaterThanOrEqual(3);
      for (const q of s.questions) validateExercise(q, s.id);
      for (const v of s.vocabulary) expect(getWord(v), `${s.id}: ${v}`).not.toBeNull();
      for (const n of s.grammarNotes) if (n.lesson) expect(getLesson(n.lesson), `${s.id}: ${n.lesson}`).not.toBeNull();
    }
  });
  it('graded levels never decrease in length: A0–A1 stories are shorter than the A1–A2 and A2–B1 ones', () => {
    const len = (s) => s.paragraphs.flat().length;
    const max = (lvl) => Math.max(...STORIES.filter((s) => s.level === lvl).map(len));
    const min = (lvl) => Math.min(...STORIES.filter((s) => s.level === lvl).map(len));
    expect(max('A0–A1')).toBeLessThan(min('A1–A2'));
    expect(max('A0–A1')).toBeLessThan(min('A2–B1'));
  });
  it('has at least two A2–B1 narratives that use the passato remoto, futuro, condizionale and congiuntivo', () => {
    const advanced = STORIES.filter((s) => s.level === 'A2–B1');
    expect(advanced.length).toBeGreaterThanOrEqual(2);
    const tenses = new Set();
    for (const s of advanced) for (const x of s.paragraphs.flat()) for (const t of tokenize(x.it)) {
      if (t.kind !== 'word') continue;
      for (const a of lookupForm(t.text)) if (a.features && a.features.tenseKey) tenses.add(a.features.tenseKey);
    }
    for (const k of ['passatoRemoto', 'futuro', 'condizionale', 'congiuntivoPresente', 'congiuntivoImperfetto']) expect(tenses, k).toContain(k);
  });
});

describe('rhymes', () => {
  it('has at least three original rhymes with full annotations', () => {
    expect(RHYMES.length).toBeGreaterThanOrEqual(3);
    for (const r of RHYMES) {
      for (const l of r.lines) {
        expect(l.literal && l.natural, `${r.id}: ${l.it}`).toBeTruthy();
        expect(unknownTokens(l.it, r.names), `${r.id}: “${l.it}”`).toEqual([]);
      }
      expect(r.exercises.length).toBeGreaterThanOrEqual(3);
      for (const ex of r.exercises) validateExercise(ex, r.id);
      for (const v of r.vocabulary) expect(getWord(v), `${r.id}: ${v}`).not.toBeNull();
    }
  });
});

describe('pages and navigation', () => {
  it('every page has an HTML entry file in the project root', () => {
    for (const p of PAGES) expect(existsSync(resolve(root, p.file)), p.file).toBe(true);
  });
  it('navigation includes the ten required destinations', () => {
    expect(NAV_PAGES.map((p) => p.id)).toEqual(['index', 'learning-path', 'grammar', 'vocabulary', 'reading', 'songs', 'review', 'progress', 'settings', 'sources']);
  });
  it('every HTML page loads the shared entry script and declares its page id', () => {
    for (const p of PAGES) {
      const html = readFileSync(resolve(root, p.file), 'utf8');
      expect(html, p.file).toContain('src="/src/main.js"');
      expect(html, p.file).toContain(`data-page="${p.id}"`);
      expect(existsSync(resolve(root, 'src/pages', `${p.id === 'index' ? 'dashboard' : p.id}.js`)), `${p.id} page module`).toBe(true);
    }
  });
});

describe('verification register', () => {
  it('covers every lesson exactly once, with a known status', () => {
    const covered = VERIFICATION.topics.flatMap((t) => t.lessons);
    expect(new Set(covered).size).toBe(covered.length);
    for (const l of LESSONS) expect(covered, l.id).toContain(l.id);
    for (const id of covered) expect(getLesson(id), id).not.toBeNull();
    for (const t of VERIFICATION.topics) expect(['reference-checked', 'engine-tested', 'author-written', 'needs-review'], t.topic).toContain(t.status);
  });
  it('every cited reference exists and says what was checked', () => {
    const ids = VERIFICATION.references.map((r) => r.id);
    for (const t of VERIFICATION.topics) for (const s of t.sources || []) expect(ids, `${t.topic}: ${s}`).toContain(s);
    for (const r of VERIFICATION.references) expect(r.checked, r.id).toBeTruthy();
    for (const t of VERIFICATION.topics.filter((x) => x.status === 'reference-checked')) expect((t.sources || []).length, t.topic).toBeGreaterThan(0);
  });
  it('does not claim a native-speaker review', () => {
    expect(VERIFICATION.nativeSpeakerReview).toBe(false);
    expect(VERIFICATION.statement).toMatch(/No native speaker/);
  });
});
