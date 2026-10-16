import { describe, it, expect } from 'vitest';
import { analyseSentence, classifyHypothetical } from '../src/grammar/sentence-analysis.js';
import { lookupForm } from '../src/vocabulary/dictionary.js';

const readings = (form) => lookupForm(form).filter((a) => a.features && a.features.tenseKey).map((a) => `${a.lemma}|${a.features.tenseKey}|${a.features.person}`);
const verbOf = (r, i = 0) => r.clauses[i].verb;
const relationKinds = (r) => r.relations.map((x) => x.kind);

describe('form lookup lists every plausible analysis', () => {
  it('parli: indicativo tu, congiuntivo io/tu/lui, imperativo Lei', () => {
    const r = readings('parli');
    expect(r).toEqual(
      expect.arrayContaining([
        'parlare|presente|tu',
        'parlare|congiuntivoPresente|io',
        'parlare|congiuntivoPresente|tu',
        'parlare|congiuntivoPresente|lui/lei',
        'parlare|imperativo|Lei'
      ])
    );
  });
  it('sono: io or loro', () => {
    expect(readings('sono')).toEqual(expect.arrayContaining(['essere|presente|io', 'essere|presente|loro']));
  });
  it('sia: three congiuntivo persons and the formal imperative', () => {
    expect(readings('sia')).toEqual(expect.arrayContaining(['essere|congiuntivoPresente|io', 'essere|congiuntivoPresente|tu', 'essere|congiuntivoPresente|lui/lei', 'essere|imperativo|Lei']));
  });
  it('canta: indicativo lui/lei or imperativo tu', () => {
    expect(readings('canta')).toEqual(expect.arrayContaining(['cantare|presente|lui/lei', 'cantare|imperativo|tu']));
  });
  it('prese: passato remoto of prendere, and also a participle form', () => {
    const all = lookupForm('prese');
    expect(all.some((a) => a.features && a.features.tenseKey === 'passatoRemoto' && a.lemma === 'prendere')).toBe(true);
    expect(all.length).toBeGreaterThan(1);
  });
  it('alternative passato remoto forms are both recognised', () => {
    expect(readings('credei')).toContain('credere|passatoRemoto|io');
    expect(readings('credetti')).toContain('credere|passatoRemoto|io');
  });
  it('parlò and parlo are distinguished by the accent', () => {
    expect(readings('parlò')).toEqual(['parlare|passatoRemoto|lui/lei']);
    expect(readings('parlo')).toEqual(['parlare|presente|io']);
  });
  it('unknown forms return nothing rather than a guess', () => {
    expect(lookupForm('blorf')).toEqual([]);
    expect(lookupForm('parlerebbiamo')).toEqual([]);
  });
});

describe('context chooses a reading and reports the others', () => {
  it('parli after "penso che" is congiuntivo; after "tu" it is indicativo', () => {
    const a = analyseSentence('Penso che Marco parli italiano.');
    expect(a.supported).toBe(true);
    expect(verbOf(a, 1).mood).toBe('congiuntivo');
    expect(a.messages.join(' ')).toMatch(/Other possible readings/);
    const b = analyseSentence('Tu parli italiano.');
    expect(verbOf(b).mood).toBe('indicativo');
  });
  it('a clitic before the verb rules out the tu imperative', () => {
    const a = analyseSentence('Si mangia bene qui.');
    expect(a.messages.join(' ')).not.toMatch(/imperativo, tu/);
  });
});

describe('complex sentences', () => {
  it('periodo ipotetico of possibility', () => {
    const a = analyseSentence('Se avessi tempo, verrei con te.');
    expect(a.supported).toBe(true);
    expect(relationKinds(a)).toContain('hypothetical');
    expect(a.relations.find((r) => r.kind === 'hypothetical').text).toMatch(/possibilità/);
  });
  it('counterfactual past hypothesis', () => {
    const a = analyseSentence('Se avessi saputo, sarei venuto.');
    expect(a.relations.find((r) => r.kind === 'hypothetical').text).toMatch(/irrealtà/);
  });
  it('real hypothesis', () => {
    const a = analyseSentence('Se piove, resto a casa.');
    expect(a.supported).toBe(true);
    expect(relationKinds(a)).toContain('hypothetical');
  });
  it('classifyHypothetical labels the substandard double imperfetto as such', () => {
    expect(classifyHypothetical('imperfetto', 'imperfetto').text).toMatch(/substandard/);
    expect(classifyHypothetical('condizionale', 'condizionale').type).toBe('nonstandard');
    expect(classifyHypothetical('congiuntivoTrapassato', 'condizionale').type).toBe('unreality-mixed');
    expect(classifyHypothetical('presente', 'futuro').type).toBe('reality');
    expect(classifyHypothetical('congiuntivoPresente', 'presente')).toBeNull();
  });
  it('future in the past after a past reporting verb', () => {
    const a = analyseSentence('Marco disse che sarebbe venuto.');
    expect(a.supported).toBe(true);
    expect(a.relations.some((r) => r.kind === 'sequence' && /future in the past/.test(r.text))).toBe(true);
  });
  it('trapassato after a passato remoto', () => {
    const a = analyseSentence('Quando arrivai, il treno era già partito.');
    expect(a.supported).toBe(true);
    const tenses = a.clauses.map((c) => c.verb && c.verb.tenseKey);
    expect(tenses).toEqual(expect.arrayContaining(['passatoRemoto', 'trapassatoProssimo']));
  });
  it('relative clause: che as direct object', () => {
    const a = analyseSentence('Il ragazzo che ho visto è alto.');
    expect(a.supported).toBe(true);
    expect(JSON.stringify(a.clauses)).toMatch(/relative pronoun che \(direct object/);
  });
});

describe('passive and si', () => {
  it('essere + stato + participle', () => {
    const a = analyseSentence('La casa è stata venduta.');
    expect(a.supported).toBe(true);
    expect(verbOf(a).voice).toBe('passive');
  });
  it('venire + participle', () => {
    const a = analyseSentence('La lettera viene scritta da Sara.');
    expect(verbOf(a).voice).toBe('passive');
    expect(JSON.stringify(a.clauses)).toMatch(/agent/);
  });
  it('si + 3rd person without a subject lists the reflexive, impersonal and passive readings', () => {
    const a = analyseSentence('Si vendono case.');
    expect(verbOf(a).siReadings).toEqual(['impersonal', 'passive', 'reflexive']);
    expect(JSON.stringify(a.clauses)).toMatch(/subject in the passive-si reading/);
  });
  it('si with an explicit subject stays reflexive', () => {
    const a = analyseSentence('Marco si lava.');
    expect(verbOf(a).siReadings).toBeUndefined();
    expect(verbOf(a).reflexive).toBe(true);
  });
});

describe('unsupported input is reported, not guessed', () => {
  it('an unknown word blocks role assignment', () => {
    const a = analyseSentence('Il gatto mangia il blorf.');
    expect(a.supported).toBe(false);
    expect(a.messages.join(' ')).toMatch(/blorf/);
  });
  it('two finite verbs without a conjunction', () => {
    const a = analyseSentence('Il gatto mangia dorme.');
    expect(a.supported).toBe(false);
    expect(a.messages.join(' ')).toMatch(/could not be divided into clauses/);
  });
  it('a capitalised unknown word at the start is not taken for a name', () => {
    const a = analyseSentence('Blorfo mangia una mela.');
    expect(a.supported).toBe(false);
  });
});

describe('site search finds inflected forms', async () => {
  const { siteSearch } = await import('../src/core/search.js');
  it('andrò → andare and the futuro lesson', () => {
    const r = siteSearch('andrò');
    expect(r.some((x) => x.type === 'word' && x.id === 'verb_andare')).toBe(true);
    expect(r.some((x) => x.type === 'lesson' && x.id === 'futuro-semplice')).toBe(true);
  });
  it('fosse → essere and the congiuntivo imperfetto lesson', () => {
    const r = siteSearch('fosse');
    expect(r.some((x) => x.type === 'lesson' && x.id === 'congiuntivo-imperfetto-trapassato')).toBe(true);
  });
});

describe('fa = "ago" after an expression of time', () => {
  it('is an adverb in "tre giorni fa" and a verb in "fa caldo"', () => {
    const a = analyseSentence('Tre giorni fa ho visto Marco.');
    expect(a.words.find((w) => w.text === 'fa').tag).toBe('ADV');
    expect(a.clauses.length).toBe(1);
    const b = analyseSentence('Fa caldo.');
    expect(b.words.find((w) => w.text === 'Fa').tag).toBe('VERB');
  });
});
