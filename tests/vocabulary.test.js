import { describe, it, expect } from 'vitest';
import { BUILT_IN, searchVocabulary, lookupForm, displayLemma, displayPlural, getWord } from '../src/vocabulary/dictionary.js';
import { buildCustomWord, prepareSession, newWordOrder, gradeCard, toggleFavourite, setNote, deleteCustomWord, addCustomWord } from '../src/vocabulary/vocabulary-manager.js';
import { createDefaultState } from '../src/core/storage.js';
import { checkText, checkExercise, normalise, normaliseEnglish, diagnose } from '../src/core/validation.js';

describe('dictionary display', () => {
  it('shows nouns with their articles', () => {
    expect(displayLemma(getWord('noun_gatto'))).toBe('il gatto');
    expect(displayLemma(getWord('noun_acqua'))).toBe("l'acqua");
    expect(displayLemma(getWord('noun_zaino'))).toBe('lo zaino');
    expect(displayPlural(getWord('noun_uovo'))).toBe('le uova');
    expect(displayPlural(getWord('noun_albero'))).toBe('gli alberi');
  });
});

describe('form lookup', () => {
  it('finds inflected forms with their analyses', () => {
    const vado = lookupForm('vado');
    expect(vado[0]).toMatchObject({ lemma: 'andare', pos: 'verb' });
    expect(vado[0].features.personIndex).toBe(0);
    expect(lookupForm('gatti')[0]).toMatchObject({ lemma: 'gatto', features: { number: 'plural' } });
    expect(lookupForm('nella')[0]).toMatchObject({ pos: 'articulated preposition' });
    expect(lookupForm('rosse')[0].description).toMatch(/feminine plural/);
  });
  it('lists every reading of an ambiguous form', () => {
    const la = lookupForm('la').map((a) => a.pos);
    expect(la).toContain('definite article');
    expect(la).toContain('direct object pronoun');
    const sono = lookupForm('sono').filter((a) => a.pos === 'verb').map((a) => a.features.person);
    expect(sono).toEqual(['io', 'loro']);
  });
  it('does not invent analyses for unknown words', () => {
    expect(lookupForm('blorpo')).toEqual([]);
  });
  it('accepts typographic apostrophes', () => {
    expect(lookupForm('l’').length).toBeGreaterThan(0);
  });
});

describe('search', () => {
  it('finds by Italian lemma, form, English meaning and filters', () => {
    expect(searchVocabulary(BUILT_IN, { query: 'gatto' })[0].id).toBe('noun_gatto');
    expect(searchVocabulary(BUILT_IN, { query: 'il gatto' })[0].id).toBe('noun_gatto');
    expect(searchVocabulary(BUILT_IN, { query: 'vanno' })[0].id).toBe('verb_andare');
    expect(searchVocabulary(BUILT_IN, { query: 'cat' })[0].id).toBe('noun_gatto');
    expect(searchVocabulary(BUILT_IN, { query: 'citta' })[0].id).toBe('noun_citta');
    const animals = searchVocabulary(BUILT_IN, { category: 'animals', pos: 'noun' });
    expect(animals.length).toBeGreaterThan(20);
    expect(animals.every((w) => w.category === 'animals')).toBe(true);
    expect(searchVocabulary(BUILT_IN, { level: 'A0', pos: 'verb' }).every((w) => w.level === 'A0')).toBe(true);
  });
  it('ranks English whole-word matches above Italian prefixes', () => {
    const r = searchVocabulary(BUILT_IN, { query: 'cat' }).map((w) => w.id);
    expect(r.indexOf('noun_gatto')).toBeLessThan(r.indexOf('adj_cattivo'));
  });
});

describe('custom words', () => {
  it('builds a noun with article and predicted plural', () => {
    const r = buildCustomWord({ lemma: 'Zucca', partOfSpeech: 'noun', gender: 'f', meaning: 'pumpkin' });
    expect(r.ok).toBe(true);
    expect(r.word).toMatchObject({ lemma: 'zucca', article: 'la', plural: 'zucche', pluralArticle: 'le' });
    expect(r.generated.join(' ')).toMatch(/rule/);
  });
  it('builds a verb paradigm and flags it as generated', () => {
    const r = buildCustomWord({ lemma: 'pescare', partOfSpeech: 'verb', meaning: 'to fish' });
    expect(r.word.present[1]).toBe('peschi');
    expect(r.generated[0]).toMatch(/check/);
  });
  it('validates input', () => {
    expect(buildCustomWord({ lemma: '', meaning: '' }).ok).toBe(false);
    expect(buildCustomWord({ lemma: 'casa', partOfSpeech: 'noun', meaning: 'house' }).errors[0]).toMatch(/gender/);
    expect(buildCustomWord({ lemma: 'blu', partOfSpeech: 'verb', meaning: 'x' }).ok).toBe(false);
  });
  it('avoids ID collisions and deletes cleanly', () => {
    const s = createDefaultState();
    const a = buildCustomWord({ lemma: 'zucca', partOfSpeech: 'noun', gender: 'f', meaning: 'pumpkin' }).word;
    addCustomWord(s, a);
    const b = buildCustomWord({ lemma: 'zucca', partOfSpeech: 'noun', gender: 'f', meaning: 'squash' }, [a.id], () => 0.5).word;
    expect(b.id).not.toBe(a.id);
    toggleFavourite(s, a.id);
    setNote(s, a.id, 'Halloween');
    deleteCustomWord(s, a.id);
    expect(s.vocabulary.custom).toHaveLength(0);
    expect(s.vocabulary.favourites).toHaveLength(0);
    expect(s.vocabulary.notes).toEqual({});
  });
});

describe('review session preparation', () => {
  it('introduces at most the daily number of new words', () => {
    const s = createDefaultState();
    s.settings.newCardsPerDay = 5;
    const q = prepareSession(s, '2026-10-11');
    expect(q).toHaveLength(5);
    gradeCard(s, q[0], 'good', '2026-10-11');
    const q2 = prepareSession(s, '2026-10-11');
    expect(q2).toHaveLength(4);
    expect(Object.keys(s.srs.cards)).toHaveLength(5);
  });
  it('introduces words from opened lessons first', () => {
    const s = createDefaultState();
    s.lessons['essere-avere'] = { openedAt: 'x' };
    expect(newWordOrder(s)[0]).toBe('verb_essere');
  });
});

describe('answer validation', () => {
  it('normalises harmless differences only', () => {
    expect(normalise('  Il  Gatto dorme. ')).toBe('il gatto dorme');
    expect(normalise('l’acqua')).toBe("l'acqua");
    expect(normalise("l' acqua")).toBe("l'acqua");
    expect(normaliseEnglish("I'm tired.")).toBe('i am tired');
  });
  it('requires accents', () => {
    const r = checkText('e', { answer: 'è' });
    expect(r.correct).toBe(false);
    expect(r.message).toMatch(/accent/i);
    expect(checkText('perche', { answer: 'perché' }).correct).toBe(false);
  });
  it('does not accept substrings', () => {
    expect(checkText('gatto', { answer: 'il gatto' }).correct).toBe(false);
    expect(checkText('il gatto nero', { answer: 'il gatto' }).correct).toBe(false);
  });
  it('explains article and ending mistakes', () => {
    expect(checkText('il zaino', { answer: 'lo zaino' }).message).toMatch(/article/);
    expect(checkText('parlono', { answer: 'parlano' }).message).toMatch(/ending/);
    expect(diagnose('nono', 'nonno')).toMatch(/double/);
  });
  it('accepts listed alternatives and English contractions', () => {
    expect(checkText("We're from Milan", { answer: 'We are from Milan.', lang: 'en' }).correct).toBe(true);
    expect(checkText('veduto', { answer: 'visto', accept: ['veduto'] }).correct).toBe(true);
  });
  it('uses tailored feedback for anticipated mistakes', () => {
    const r = checkText('ha andato', { answer: 'è andata', mistakes: [{ answer: 'ha andato', message: 'Use essere.' }] });
    expect(r.message).toBe('Use essere.');
  });
  it('checks every exercise kind', () => {
    expect(checkExercise({ kind: 'choice', answer: 'lo' }, 'lo').correct).toBe(true);
    expect(checkExercise({ kind: 'cloze', blanks: [{ answer: 'c’è' }, { answer: 'ci sono' }] }, ["c'è", 'ci sono']).correct).toBe(true);
    const t = checkExercise({ kind: 'table', rows: [{ answer: 'vado' }, { answer: 'vai' }] }, ['vado', 'va']);
    expect(t.correct).toBe(false);
    expect(t.score).toBe(0.5);
    expect(checkExercise({ kind: 'match', pairs: [['a', '1'], ['b', '2']] }, { a: '1', b: '2' }).correct).toBe(true);
    expect(checkExercise({ kind: 'order', answer: ['Il', 'gatto', 'dorme'] }, ['Il', 'gatto', 'dorme']).correct).toBe(true);
    expect(checkExercise({ kind: 'order', answer: ['Il', 'gatto', 'dorme'] }, ['gatto', 'Il', 'dorme']).correct).toBe(false);
  });
});
