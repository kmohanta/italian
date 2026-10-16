/**
 * The complete verb system. Expected forms are standard paradigms as given
 * in reference grammars (e.g. Serianni, Grammatica italiana; Treccani).
 */
import { describe, it, expect } from 'vitest';
import * as V from '../src/grammar/verb-system.js';
import vocabulary from '../src/data/vocabulary.json';

const c = (lemma, key, opts) => V.conjugate(lemma, key, opts);

describe('futuro and condizionale', () => {
  it('regular futures with spelling adjustments', () => {
    expect(c('parlare', 'futuro')).toEqual(['parlerò', 'parlerai', 'parlerà', 'parleremo', 'parlerete', 'parleranno']);
    expect(c('cercare', 'futuro')[0]).toBe('cercherò');
    expect(c('pagare', 'futuro')[3]).toBe('pagheremo');
    expect(c('mangiare', 'futuro')[0]).toBe('mangerò');
    expect(c('cominciare', 'futuro')[2]).toBe('comincerà');
    expect(c('studiare', 'futuro')[0]).toBe('studierò');
    expect(c('credere', 'futuro')[5]).toBe('crederanno');
    expect(c('dormire', 'futuro')[1]).toBe('dormirai');
  });
  it('irregular future stems are shared by the conditional', () => {
    const pairs = { essere: 'sarò', avere: 'avrò', andare: 'andrò', venire: 'verrò', bere: 'berrò', volere: 'vorrò', vedere: 'vedrò', vivere: 'vivrò', rimanere: 'rimarrò', sapere: 'saprò', dovere: 'dovrò', potere: 'potrò', fare: 'farò', dare: 'darò', stare: 'starò', tenere: 'terrò' };
    for (const [v, f] of Object.entries(pairs)) expect(c(v, 'futuro')[0], v).toBe(f);
    expect(c('essere', 'condizionale')).toEqual(['sarei', 'saresti', 'sarebbe', 'saremmo', 'sareste', 'sarebbero']);
    expect(c('volere', 'condizionale')[0]).toBe('vorrei');
    expect(c('dovere', 'condizionale')[1]).toBe('dovresti');
    expect(c('morire', 'futuro')[0]).toBe('morirò/morrò');
  });
});

describe('passato remoto', () => {
  it('regular conjugations, with both -ere series', () => {
    expect(c('parlare', 'passatoRemoto')).toEqual(['parlai', 'parlasti', 'parlò', 'parlammo', 'parlaste', 'parlarono']);
    expect(c('credere', 'passatoRemoto')).toEqual(['credei/credetti', 'credesti', 'credé/credette', 'credemmo', 'credeste', 'crederono/credettero']);
    expect(c('dormire', 'passatoRemoto')).toEqual(['dormii', 'dormisti', 'dormì', 'dormimmo', 'dormiste', 'dormirono']);
    expect(c('capire', 'passatoRemoto')[0]).toBe('capii');
  });
  it('strong ("1-3-3") verbs', () => {
    expect(c('avere', 'passatoRemoto')).toEqual(['ebbi', 'avesti', 'ebbe', 'avemmo', 'aveste', 'ebbero']);
    expect(c('fare', 'passatoRemoto')).toEqual(['feci', 'facesti', 'fece', 'facemmo', 'faceste', 'fecero']);
    expect(c('dire', 'passatoRemoto')).toEqual(['dissi', 'dicesti', 'disse', 'dicemmo', 'diceste', 'dissero']);
    expect(c('venire', 'passatoRemoto')).toEqual(['venni', 'venisti', 'venne', 'venimmo', 'veniste', 'vennero']);
    expect(c('vedere', 'passatoRemoto')).toEqual(['vidi', 'vedesti', 'vide', 'vedemmo', 'vedeste', 'videro']);
    expect(c('conoscere', 'passatoRemoto')[2]).toBe('conobbe');
    expect(c('nascere', 'passatoRemoto')[2]).toBe('nacque');
    expect(c('bere', 'passatoRemoto')[0]).toBe('bevvi');
    expect(c('sapere', 'passatoRemoto')[5]).toBe('seppero');
    expect(c('rimanere', 'passatoRemoto')[1]).toBe('rimanesti');
  });
  it('fully irregular verbs', () => {
    expect(c('essere', 'passatoRemoto')).toEqual(['fui', 'fosti', 'fu', 'fummo', 'foste', 'furono']);
    expect(c('stare', 'passatoRemoto')[2]).toBe('stette');
    expect(c('dare', 'passatoRemoto')[0]).toBe('diedi/detti');
  });
});

describe('congiuntivo', () => {
  it('presente, regular and irregular', () => {
    expect(c('parlare', 'congiuntivoPresente')).toEqual(['parli', 'parli', 'parli', 'parliamo', 'parliate', 'parlino']);
    expect(c('cercare', 'congiuntivoPresente')[0]).toBe('cerchi');
    expect(c('mangiare', 'congiuntivoPresente')[5]).toBe('mangino');
    expect(c('vedere', 'congiuntivoPresente')).toEqual(['veda', 'veda', 'veda', 'vediamo', 'vediate', 'vedano']);
    expect(c('capire', 'congiuntivoPresente')).toEqual(['capisca', 'capisca', 'capisca', 'capiamo', 'capiate', 'capiscano']);
    const irr = { essere: 'sia', avere: 'abbia', andare: 'vada', fare: 'faccia', stare: 'stia', dare: 'dia', dire: 'dica', venire: 'venga', uscire: 'esca', potere: 'possa', volere: 'voglia', sapere: 'sappia', bere: 'beva', rimanere: 'rimanga', piacere: 'piaccia', morire: 'muoia', riuscire: 'riesca', scegliere: 'scelga' };
    for (const [v, f] of Object.entries(irr)) expect(c(v, 'congiuntivoPresente')[2], v).toBe(f);
    expect(c('andare', 'congiuntivoPresente')[4]).toBe('andiate');
    expect(c('dovere', 'congiuntivoPresente')[0]).toBe('debba/deva');
  });
  it('imperfetto', () => {
    expect(c('parlare', 'congiuntivoImperfetto')).toEqual(['parlassi', 'parlassi', 'parlasse', 'parlassimo', 'parlaste', 'parlassero']);
    expect(c('fare', 'congiuntivoImperfetto')[0]).toBe('facessi');
    expect(c('dire', 'congiuntivoImperfetto')[2]).toBe('dicesse');
    expect(c('essere', 'congiuntivoImperfetto')[0]).toBe('fossi');
    expect(c('dare', 'congiuntivoImperfetto')[2]).toBe('desse');
    expect(c('stare', 'congiuntivoImperfetto')[5]).toBe('stessero');
  });
  it('compound tenses', () => {
    expect(c('partire', 'congiuntivoPassato', { gender: 'f' })[2]).toBe('sia partita');
    expect(c('mangiare', 'congiuntivoTrapassato')[0]).toBe('avessi mangiato');
    expect(c('svegliarsi', 'congiuntivoTrapassato')[3]).toBe('ci fossimo svegliati');
  });
});

describe('imperativo', () => {
  it('regular and irregular forms', () => {
    expect(c('parlare', 'imperativo')).toEqual([null, 'parla', 'parli', 'parliamo', 'parlate', 'parlino']);
    expect(c('prendere', 'imperativo')).toEqual([null, 'prendi', 'prenda', 'prendiamo', 'prendete', 'prendano']);
    expect(c('finire', 'imperativo')[1]).toBe('finisci');
    expect(c('andare', 'imperativo')[1]).toBe("va'/vai");
    expect(c('dire', 'imperativo')[1]).toBe("di'");
    expect(c('essere', 'imperativo')).toEqual([null, 'sii', 'sia', 'siamo', 'siate', 'siano']);
    expect(c('avere', 'imperativo')[4]).toBe('abbiate');
    expect(c('potere', 'imperativo').every((x) => x === null)).toBe(true);
  });
  it('reflexive verbs attach the pronoun to tu, noi, voi', () => {
    expect(c('alzarsi', 'imperativo')).toEqual([null, 'alzati', 'si alzi', 'alziamoci', 'alzatevi', 'si alzino']);
    expect(c('sedersi', 'imperativo')[1]).toBe('siediti');
    expect(V.imperativoNegativoTu('parlare')).toBe('non parlare');
    expect(V.imperativoNegativoTu('alzarsi')).toBe('non alzarti/non ti alzare');
  });
});

describe('non-finite and compound forms', () => {
  it('gerundio', () => {
    expect(V.gerundio('parlare')).toBe('parlando');
    expect(V.gerundio('vedere')).toBe('vedendo');
    expect(V.gerundio('dormire')).toBe('dormendo');
    expect(V.gerundio('fare')).toBe('facendo');
    expect(V.gerundio('dire')).toBe('dicendo');
    expect(V.gerundio('bere')).toBe('bevendo');
    expect(V.gerundio('essere')).toBe('essendo');
    expect(V.gerundio('alzarsi')).toBe('alzandosi');
  });
  it('infinito and gerundio passato', () => {
    expect(V.infinitoPassato('mangiare')).toBe('avere mangiato');
    expect(V.infinitoPassato('partire', { gender: 'f' })).toBe('essere partita');
    expect(V.gerundioPassato('arrivare', { number: 'pl' })).toBe('essendo arrivati');
    expect(V.infinitoPassato('alzarsi')).toBe('essersi alzato');
  });
  it('every compound tense uses the right auxiliary tense', () => {
    expect(c('mangiare', 'trapassatoProssimo')[0]).toBe('avevo mangiato');
    expect(c('andare', 'trapassatoRemoto')[2]).toBe('fu andato');
    expect(c('mangiare', 'futuroAnteriore')[5]).toBe('avranno mangiato');
    expect(c('venire', 'condizionalePassato', { gender: 'f' })[2]).toBe('sarebbe venuta');
    expect(c('dare', 'trapassatoRemoto')[0]).toBe('ebbi dato');
  });
  it('impersonal verbs have only third-person forms', () => {
    expect(c('piovere', 'futuro')).toEqual([null, null, 'pioverà', null, null, 'pioveranno']);
    expect(c('bisognare', 'congiuntivoPresente')[2]).toBe('bisogni');
  });
});

describe('metadata', () => {
  it('covers every indicative, subjunctive and conditional tense', () => {
    const keys = V.TENSES.map((t) => t.key);
    for (const k of ['presente', 'passatoProssimo', 'imperfetto', 'trapassatoProssimo', 'passatoRemoto', 'trapassatoRemoto', 'futuro', 'futuroAnteriore', 'congiuntivoPresente', 'congiuntivoPassato', 'congiuntivoImperfetto', 'congiuntivoTrapassato', 'condizionale', 'condizionalePassato', 'imperativo']) expect(keys).toContain(k);
  });
  it('conjugates every vocabulary verb in every tense without errors', () => {
    for (const w of vocabulary.entries.filter((e) => e.partOfSpeech === 'verb')) {
      const all = V.allTenses(w.lemma, { record: w });
      for (const [k, forms] of Object.entries(all)) {
        expect(forms, `${w.lemma} ${k}`).toHaveLength(6);
        for (const f of forms) if (f) expect(f, `${w.lemma} ${k}`).toMatch(/^[a-zàèéìòù' /]+$/);
      }
      expect(V.gerundio(w.lemma), w.lemma).toMatch(/ndo(si)?$/);
    }
  });
});
