import { describe, it, expect } from 'vitest';
import * as G from '../src/grammar/grammar-engine.js';
import * as S from '../src/grammar/sentence-analysis.js';
import vocabulary from '../src/data/vocabulary.json';

describe('present tense', () => {
  it('conjugates the three regular families', () => {
    expect(G.present('parlare')).toEqual(['parlo', 'parli', 'parla', 'parliamo', 'parlate', 'parlano']);
    expect(G.present('vedere')).toEqual(['vedo', 'vedi', 'vede', 'vediamo', 'vedete', 'vedono']);
    expect(G.present('dormire')).toEqual(['dormo', 'dormi', 'dorme', 'dormiamo', 'dormite', 'dormono']);
  });
  it('handles -isc- verbs', () => {
    expect(G.present('capire', { isc: true })).toEqual(['capisco', 'capisci', 'capisce', 'capiamo', 'capite', 'capiscono']);
  });
  it('inserts h in -care/-gare verbs', () => {
    expect(G.present('cercare')).toEqual(['cerco', 'cerchi', 'cerca', 'cerchiamo', 'cercate', 'cercano']);
    expect(G.present('giocare')[3]).toBe('giochiamo');
  });
  it('does not double the i of -iare verbs', () => {
    expect(G.present('mangiare')).toEqual(['mangio', 'mangi', 'mangia', 'mangiamo', 'mangiate', 'mangiano']);
    expect(G.present('studiare')[1]).toBe('studi');
    expect(G.regularPresent('inviare', { stressedI: true })[1]).toBe('invii');
  });
  it('uses the irregular tables', () => {
    expect(G.present('essere')).toEqual(['sono', 'sei', 'è', 'siamo', 'siete', 'sono']);
    expect(G.present('andare')).toEqual(['vado', 'vai', 'va', 'andiamo', 'andate', 'vanno']);
    expect(G.present('fare')[0]).toBe('faccio');
    expect(G.present('potere')[2]).toBe('può');
  });
  it('conjugates reflexive verbs with pronouns', () => {
    expect(G.present('svegliarsi')).toEqual(['mi sveglio', 'ti svegli', 'si sveglia', 'ci svegliamo', 'vi svegliate', 'si svegliano']);
    expect(G.present('sedersi')[0]).toBe('mi siedo');
  });
});

describe('imperfetto, participles and passato prossimo', () => {
  it('forms the regular imperfetto', () => {
    expect(G.imperfect('parlare')).toEqual(['parlavo', 'parlavi', 'parlava', 'parlavamo', 'parlavate', 'parlavano']);
    expect(G.imperfect('dormire')[5]).toBe('dormivano');
  });
  it('uses irregular imperfetto stems', () => {
    expect(G.imperfect('essere')[0]).toBe('ero');
    expect(G.imperfect('fare')[2]).toBe('faceva');
    expect(G.imperfect('dire')[5]).toBe('dicevano');
    expect(G.imperfect('bere')[0]).toBe('bevevo');
  });
  it('forms participles', () => {
    expect(G.participle('parlare')).toBe('parlato');
    expect(G.participle('credere')).toBe('creduto');
    expect(G.participle('dormire')).toBe('dormito');
    expect(G.participle('vedere')).toBe('visto');
    expect(G.participle('venire')).toBe('venuto');
    expect(G.participle('conoscere')).toBe('conosciuto');
    expect(G.participle('piacere')).toBe('piaciuto');
  });
  it('chooses the auxiliary', () => {
    expect(G.auxiliary('mangiare')).toBe('avere');
    expect(G.auxiliary('andare')).toBe('essere');
    expect(G.auxiliary('alzarsi')).toBe('essere');
  });
  it('agrees the participle with essere', () => {
    expect(G.passatoProssimo('andare', { gender: 'f' })).toEqual([
      'sono andata', 'sei andata', 'è andata', 'siamo andate', 'siete andate', 'sono andate'
    ]);
    expect(G.passatoProssimo('mangiare')[3]).toBe('abbiamo mangiato');
    expect(G.passatoProssimo('svegliarsi')[0]).toBe('mi sono svegliato');
  });
});

describe('articles', () => {
  const cases = [
    ['gatto', 'm', 'il', 'i', 'un'],
    ['zaino', 'm', 'lo', 'gli', 'uno'],
    ['specchio', 'm', 'lo', 'gli', 'uno'],
    ['gnomo', 'm', 'lo', 'gli', 'uno'],
    ['albero', 'm', "l'", 'gli', 'un'],
    ['casa', 'f', 'la', 'le', 'una'],
    ['ape', 'f', "l'", 'le', "un'"]
  ];
  for (const [w, g, sg, pl, ind] of cases) {
    it(`${w}: ${sg} / ${pl} / ${ind}`, () => {
      expect(G.definiteArticle(w, g)).toBe(sg);
      expect(G.definiteArticle(w, g, 'pl')).toBe(pl);
      expect(G.indefiniteArticle(w, g)).toBe(ind);
    });
  }
  it('builds articulated prepositions', () => {
    expect(G.articulatedPreposition('in', 'il')).toBe('nel');
    expect(G.articulatedPreposition('di', 'gli')).toBe('degli');
    expect(G.articulatedPreposition('a', "l'")).toBe("all'");
    expect(G.articulatedPreposition('su', 'la')).toBe('sulla');
    expect(G.articulatedPreposition('da', 'i')).toBe('dai');
    expect(G.articulatedPreposition('con', 'il')).toBeNull();
  });
});

describe('plurals and adjectives', () => {
  it('applies plural rules and marks their basis', () => {
    expect(G.pluralise('libro', 'm')).toMatchObject({ plural: 'libri', basis: 'rule' });
    expect(G.pluralise('casa', 'f')).toMatchObject({ plural: 'case', basis: 'rule' });
    expect(G.pluralise('barca', 'f')).toMatchObject({ plural: 'barche', basis: 'rule' });
    expect(G.pluralise('città', 'f')).toMatchObject({ plural: 'città' });
    expect(G.pluralise('bosco', 'm')).toMatchObject({ plural: 'boschi', basis: 'tendency' });
    expect(G.pluralise('amico', 'm')).toMatchObject({ plural: 'amici', basis: 'exception' });
    expect(G.pluralise('uovo', 'm')).toMatchObject({ plural: 'uova', basis: 'exception' });
    expect(G.pluralise('arancia', 'f').plural).toBe('arance');
  });
  it('generates adjective forms', () => {
    expect(G.adjectiveForms('rosso').forms).toEqual({ ms: 'rosso', fs: 'rossa', mp: 'rossi', fp: 'rosse' });
    expect(G.adjectiveForms('verde').forms).toEqual({ ms: 'verde', fs: 'verde', mp: 'verdi', fp: 'verdi' });
    expect(G.adjectiveForms('blu').type).toBe('invariable');
    expect(G.adjectiveForms('bianco').forms.fp).toBe('bianche');
  });
});

describe('vocabulary data agrees with the engine', () => {
  it('stores the generated paradigm for every verb', () => {
    for (const v of vocabulary.entries.filter((e) => e.partOfSpeech === 'verb')) {
      expect(v.present, v.lemma).toEqual(G.present(v.lemma, { isc: v.isc }));
      expect(v.participle, v.lemma).toBe(G.participle(v.lemma));
    }
  });
  it('stores articles that match the article rules', () => {
    for (const n of vocabulary.entries.filter((e) => e.partOfSpeech === 'noun')) {
      expect(n.article, n.lemma).toBe(G.definiteArticle(n.lemma, n.gender === 'feminine' ? 'f' : 'm'));
    }
  });
});

describe('sentence analysis', () => {
  it('analyses the reference sentence', () => {
    const a = S.analyseSentence('La bambina mangia una mela.');
    expect(a.supported).toBe(true);
    const roles = a.phrases.map((p) => p.role);
    expect(roles).toEqual(['subject', 'verb', 'direct object']);
    const mangia = a.words.find((w) => w.text === 'mangia');
    expect(mangia.chosen.lemma).toBe('mangiare');
    expect(mangia.chosen.features.personIndex).toBe(2);
  });
  it('refuses to assign roles when a word is unknown', () => {
    const a = S.analyseSentence('Il blorpo mangia.');
    expect(a.supported).toBe(false);
    expect(a.words.find((w) => w.text === 'blorpo').tag).toBe('UNKNOWN');
  });
  it('reports omitted subjects', () => {
    const a = S.analyseSentence('Mi sveglio presto.');
    expect(a.subject.explicit).toBe(false);
    expect(a.verb.reflexive).toBe(true);
  });
  it('tokenises elisions', () => {
    expect(S.tokenize("C'era l'orso.").map((t) => t.text)).toEqual(["C'", 'era', "l'", 'orso', '.']);
  });
  it('transforms sentences', () => {
    expect(S.negate('La bambina mangia una mela.').result).toBe('La bambina non mangia una mela.');
    expect(S.toPlural('Il gatto dorme sul letto.').result).toBe('I gatti dormono sul letto.');
    expect(S.toPlural("L'orso è stanco.").result).toBe('Gli orsi sono stanchi.');
    expect(S.toPlural('Mia sorella è felice.').result).toBe('Le mie sorelle sono felici.');
    expect(S.toFeminine('Il bambino è stanco.').result).toBe('La bambina è stanca.');
    expect(S.toPassatoProssimo('La bambina va a scuola.').result).toBe('La bambina è andata a scuola.');
    expect(S.toPassatoProssimo('La vedo.').result).toBe("L'ho vista.");
    expect(S.toImperfetto('Il bambino fa una torta.').result).toBe('Il bambino faceva una torta.');
    expect(S.toggleSubjectPronoun('Parlo italiano.').result).toBe('Io parlo italiano.');
  });
  it('fails honestly outside its scope', () => {
    const r = S.toPlural('Il blorpo mangia.');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/outside/);
  });
});
