/**
 * Grammar engine: morphology for the forms taught in this course.
 *
 * Everything here is deterministic and covered by tests. Where Italian has
 * genuine unpredictability (stress-dependent plurals of -co/-go and -io
 * nouns, irregular participles, irregular verbs), the engine either looks
 * the form up in curated data or returns an explicit `basis` saying that the
 * result follows a tendency rather than a rule.
 */

import conjugationData from '../data/conjugations.json';

export const PERSONS = ['io', 'tu', 'lui/lei', 'noi', 'voi', 'loro'];
export const PERSON_LABELS = [
  '1st person singular',
  '2nd person singular',
  '3rd person singular',
  '1st person plural',
  '2nd person plural',
  '3rd person plural'
];
export const PERSON_ENGLISH = ['I', 'you', 'he/she', 'we', 'you (pl.)', 'they'];
export const REFLEXIVE_PRONOUNS = ['mi', 'ti', 'si', 'ci', 'vi', 'si'];

const IRREGULAR = conjugationData.irregular;
const IRREGULAR_PARTICIPLES = conjugationData.irregularParticiples;
const ESSERE_VERBS = new Set(conjugationData.essereVerbs);
const ISC_VERBS = new Set(conjugationData.iscVerbs || []);

/** True for -ire verbs of the capire type (capisco). */
export function isIscVerb(infinitive) {
  return ISC_VERBS.has(baseInfinitive(infinitive).base);
}

export const ENDINGS = {
  present: {
    are: ['o', 'i', 'a', 'iamo', 'ate', 'ano'],
    ere: ['o', 'i', 'e', 'iamo', 'ete', 'ono'],
    ire: ['o', 'i', 'e', 'iamo', 'ite', 'ono'],
    isc: ['isco', 'isci', 'isce', 'iamo', 'ite', 'iscono']
  },
  imperfect: {
    are: ['avo', 'avi', 'ava', 'avamo', 'avate', 'avano'],
    ere: ['evo', 'evi', 'eva', 'evamo', 'evate', 'evano'],
    ire: ['ivo', 'ivi', 'iva', 'ivamo', 'ivate', 'ivano']
  },
  participle: { are: 'ato', ere: 'uto', ire: 'ito' }
};

/* ------------------------------------------------------------------ */
/* Infinitives                                                         */
/* ------------------------------------------------------------------ */

/** 'svegliarsi' -> { base: 'svegliare', reflexive: true } */
export function baseInfinitive(infinitive) {
  const m = /^(.*)(ar|er|ir)si$/.exec(infinitive);
  if (m) return { base: `${m[1]}${m[2]}e`, reflexive: true };
  return { base: infinitive, reflexive: false };
}

/** Conjugation family of an infinitive: 'are' | 'ere' | 'ire' | null. */
export function familyOf(infinitive) {
  const { base } = baseInfinitive(infinitive);
  if (base.endsWith('are')) return 'are';
  if (base.endsWith('ere')) return 'ere';
  if (base.endsWith('ire')) return 'ire';
  return null;
}

/** Split an infinitive into stem and ending: parlare -> parl + are. */
export function splitInfinitive(infinitive) {
  const { base } = baseInfinitive(infinitive);
  const m = /^(.+)(are|ere|ire)$/.exec(base);
  if (!m) return null;
  return { stem: m[1], ending: m[2] };
}

export function isIrregular(infinitive) {
  return Boolean(IRREGULAR[baseInfinitive(infinitive).base]);
}

export function irregularData(infinitive) {
  return IRREGULAR[baseInfinitive(infinitive).base] || null;
}

/* ------------------------------------------------------------------ */
/* Present indicative                                                  */
/* ------------------------------------------------------------------ */

/**
 * Regular present tense, including the predictable spelling adjustments:
 *  - -care/-gare insert h before i to keep the hard sound: cerchi, paghiamo
 *  - -iare verbs do not double the i: mangi (not *mangii), mangiamo;
 *    unless the i is stressed (opts.stressedI): invii, scii
 *  - -ire verbs of the -isc- type: capisco, capisci, …
 */
export function regularPresent(infinitive, opts = {}) {
  const parts = splitInfinitive(infinitive);
  if (!parts) throw new Error(`Not an infinitive: ${infinitive}`);
  const { stem, ending } = parts;
  const key = ending === 'ire' && opts.isc ? 'isc' : ending;
  return ENDINGS.present[key].map((end) => joinStem(stem, end, opts));
}

function joinStem(stem, end, opts = {}) {
  // -care/-gare: insert h before i to keep the hard sound (cerchi, paghiamo).
  if (opts.hardStem && /[cg]$/.test(stem) && /^[ie]/.test(end)) return `${stem}h${end}`;
  // -iare: do not double the i (mangi, mangiamo) unless the i is stressed (invii).
  if (stem.endsWith('i') && end.startsWith('i')) {
    if (opts.stressedI && end === 'i') return `${stem}i`;
    return stem + end.slice(1);
  }
  return stem + end;
}

/** Present tense for any verb: irregular table if available, otherwise generated. */
export function present(infinitive, opts = {}) {
  const { base, reflexive } = baseInfinitive(infinitive);
  let forms;
  if (IRREGULAR[base]) {
    forms = [...IRREGULAR[base].present];
  } else {
    const parts = splitInfinitive(base);
    const hardStem = parts && parts.ending === 'are' && /[cg]$/.test(parts.stem);
    const isc = opts.isc === undefined ? ISC_VERBS.has(base) : opts.isc;
    forms = regularPresent(base, { ...opts, isc, hardStem });
  }
  if (reflexive || opts.reflexive) forms = forms.map((f, i) => (f ? `${REFLEXIVE_PRONOUNS[i]} ${f}` : f));
  return forms;
}

/* ------------------------------------------------------------------ */
/* Imperfetto                                                          */
/* ------------------------------------------------------------------ */

export function imperfect(infinitive) {
  const { base, reflexive } = baseInfinitive(infinitive);
  let forms;
  const irr = IRREGULAR[base];
  if (irr && irr.imperfect) {
    forms = [...irr.imperfect];
  } else {
    const parts = splitInfinitive(base);
    if (!parts) throw new Error(`Not an infinitive: ${infinitive}`);
    forms = ENDINGS.imperfect[parts.ending].map((e) => parts.stem + e);
  }
  if (reflexive) forms = forms.map((f, i) => (f ? `${REFLEXIVE_PRONOUNS[i]} ${f}` : f));
  return forms;
}

/* ------------------------------------------------------------------ */
/* Participle and passato prossimo                                     */
/* ------------------------------------------------------------------ */

export function regularParticiple(infinitive) {
  const parts = splitInfinitive(infinitive);
  if (!parts) throw new Error(`Not an infinitive: ${infinitive}`);
  const { stem, ending } = parts;
  // -cere / -scere keep the soft sound: piacere -> piaciuto, conoscere -> conosciuto
  if (ending === 'ere' && stem.endsWith('c')) return `${stem}iuto`;
  return stem + ENDINGS.participle[ending];
}

export function participle(infinitive) {
  const { base } = baseInfinitive(infinitive);
  if (IRREGULAR[base] && IRREGULAR[base].participle) return IRREGULAR[base].participle;
  if (IRREGULAR_PARTICIPLES[base]) return IRREGULAR_PARTICIPLES[base];
  return regularParticiple(base);
}

export function hasIrregularParticiple(infinitive) {
  const { base } = baseInfinitive(infinitive);
  if (IRREGULAR_PARTICIPLES[base]) return true;
  if (IRREGULAR[base] && IRREGULAR[base].participle) {
    const parts = splitInfinitive(base);
    return !parts || IRREGULAR[base].participle !== regularParticiple(base);
  }
  return false;
}

/** 'avere' | 'essere' — reflexive verbs always take essere. */
export function auxiliary(infinitive, record) {
  const { base, reflexive } = baseInfinitive(infinitive);
  if (reflexive) return 'essere';
  if (record && record.auxiliary) return record.auxiliary;
  if (IRREGULAR[base] && IRREGULAR[base].auxiliary) return IRREGULAR[base].auxiliary;
  return ESSERE_VERBS.has(base) ? 'essere' : 'avere';
}

/** Agree a participle in -o with gender/number: andato -> andata/andati/andate. */
export function agreeParticiple(p, gender = 'm', number = 'sg') {
  const stem = p.slice(0, -1);
  if (gender === 'f') return stem + (number === 'pl' ? 'e' : 'a');
  return stem + (number === 'pl' ? 'i' : 'o');
}

/**
 * Passato prossimo for all six persons.
 * gender: 'm' | 'f' — only matters with essere (agreement with the subject).
 */
export function passatoProssimo(infinitive, { gender = 'm', record } = {}) {
  const { reflexive } = baseInfinitive(infinitive);
  const aux = auxiliary(infinitive, record);
  const auxForms = IRREGULAR[aux].present;
  const p = participle(infinitive);
  return auxForms.map((a, i) => {
    const number = i >= 3 ? 'pl' : 'sg';
    const part = aux === 'essere' ? agreeParticiple(p, gender, number) : p;
    const form = `${a} ${part}`;
    return reflexive ? `${REFLEXIVE_PRONOUNS[i]} ${form}` : form;
  });
}

/** Full paradigm summary used by tables and the vocabulary database. */
export function paradigm(infinitive, record = {}) {
  const irr = irregularData(infinitive);
  return {
    infinitive,
    family: familyOf(infinitive),
    split: splitInfinitive(infinitive),
    reflexive: baseInfinitive(infinitive).reflexive,
    irregular: Boolean(irr),
    present: present(infinitive, { isc: record.isc }),
    imperfect: imperfect(infinitive),
    participle: participle(infinitive),
    irregularParticiple: hasIrregularParticiple(infinitive),
    auxiliary: auxiliary(infinitive, record),
    passatoProssimo: passatoProssimo(infinitive, { record }),
    note: irr ? irr.note : null
  };
}

/**
 * Mark which forms of a present paradigm differ from the regular pattern,
 * for highlighting irregularities in tables.
 */
export function irregularMask(infinitive, forms, opts = {}) {
  const { base } = baseInfinitive(infinitive);
  const parts = splitInfinitive(base);
  if (!parts) return forms.map(() => true);
  const hardStem = parts.ending === 'are' && /[cg]$/.test(parts.stem);
  const isc = opts.isc === undefined ? ISC_VERBS.has(base) : opts.isc;
  const regular = regularPresent(base, { ...opts, isc, hardStem });
  // fare, dire, bere: compare against the historical stem's pattern is not meaningful
  // for highlighting; a form counts as irregular if it differs from the regular output.
  const strip = (f) => (f ? f.replace(/^(mi|ti|si|ci|vi) /, '') : f);
  return forms.map((f, i) => f !== null && strip(f) !== regular[i]);
}

/* ------------------------------------------------------------------ */
/* Articles                                                            */
/* ------------------------------------------------------------------ */

const VOWEL_START = /^[aeiouàèéìòùh]/i;
/** Masculine words taking lo / gli / uno. */
const LO_START = /^(s[^aeiouàèéìòù]|z|gn|ps|pn|x|y|i[aeiou])/i;

export function articleClass(word, gender) {
  const w = word.trim();
  if (gender === 'f') return VOWEL_START.test(w) ? 'f-vowel' : 'f';
  if (LO_START.test(w)) return 'm-lo';
  if (VOWEL_START.test(w)) return 'm-vowel';
  return 'm';
}

export function definiteArticle(word, gender, number = 'sg') {
  const cls = articleClass(word, gender);
  const table = {
    m: ['il', 'i'],
    'm-lo': ['lo', 'gli'],
    'm-vowel': ["l'", 'gli'],
    f: ['la', 'le'],
    'f-vowel': ["l'", 'le']
  };
  return table[cls][number === 'pl' ? 1 : 0];
}

export function indefiniteArticle(word, gender) {
  const cls = articleClass(word, gender);
  return { m: 'un', 'm-lo': 'uno', 'm-vowel': 'un', f: 'una', 'f-vowel': "un'" }[cls];
}

/** Join an article and a word, handling elision: l' + albero -> l'albero. */
export function withArticle(article, word) {
  return article.endsWith("'") ? `${article}${word}` : `${article} ${word}`;
}

export function explainDefiniteArticle(word, gender, number = 'sg') {
  const cls = articleClass(word, gender);
  const art = definiteArticle(word, gender, number);
  const why = {
    m: 'masculine noun beginning with an ordinary consonant',
    'm-lo': 'masculine noun beginning with s + consonant, z, gn, ps, pn, x, y or i + vowel',
    'm-vowel': 'masculine noun beginning with a vowel',
    f: 'feminine noun beginning with a consonant',
    'f-vowel': 'feminine noun beginning with a vowel'
  }[cls];
  return `${art}: ${why}${number === 'pl' ? ', plural' : ', singular'}.`;
}

/* ------------------------------------------------------------------ */
/* Articulated prepositions                                            */
/* ------------------------------------------------------------------ */

export const ARTICLE_ORDER = ['il', 'lo', "l'", 'la', 'i', 'gli', 'le'];

const PREP_STEMS = { di: 'de', a: 'a', da: 'da', in: 'ne', su: 'su' };

/** di + il -> del, in + gli -> negli, a + l' -> all' */
export function articulatedPreposition(prep, article) {
  const stem = PREP_STEMS[prep];
  if (!stem) return null; // con, per, tra, fra: not normally contracted
  switch (article) {
    case 'il':
      return `${stem}l`;
    case 'lo':
      return `${stem}llo`;
    case "l'":
      return `${stem}ll'`;
    case 'la':
      return `${stem}lla`;
    case 'i':
      return `${stem}i`;
    case 'gli':
      return `${stem}gli`;
    case 'le':
      return `${stem}lle`;
    default:
      return null;
  }
}

export function articulatedTable() {
  return Object.keys(PREP_STEMS).map((prep) => ({
    prep,
    forms: ARTICLE_ORDER.map((a) => articulatedPreposition(prep, a))
  }));
}

/* ------------------------------------------------------------------ */
/* Noun plurals                                                        */
/* ------------------------------------------------------------------ */

const PLURAL_EXCEPTIONS = {
  uomo: ['uomini', 'Irregular: uomo → uomini.'],
  uovo: ['uova', 'Irregular: masculine singular uovo, feminine plural le uova.'],
  braccio: ['braccia', 'Irregular: il braccio → le braccia (feminine plural in -a).'],
  dito: ['dita', 'Irregular: il dito → le dita.'],
  ginocchio: ['ginocchia', 'Irregular: il ginocchio → le ginocchia.'],
  labbro: ['labbra', 'Irregular: il labbro → le labbra.'],
  mano: ['mani', 'Feminine noun in -o: la mano → le mani.'],
  dio: ['dei', 'Irregular: il dio → gli dei.'],
  bue: ['buoi', 'Irregular: il bue → i buoi.'],
  ala: ['ali', 'Irregular: l’ala → le ali.'],
  arma: ['armi', 'Irregular: l’arma → le armi.'],
  amico: ['amici', 'Exception to the -co → -chi tendency: amico → amici.'],
  nemico: ['nemici', 'Exception to the -co → -chi tendency: nemico → nemici.'],
  greco: ['greci', 'Exception to the -co → -chi tendency: greco → greci.'],
  porco: ['porci', 'Exception to the -co → -chi tendency: porco → porci.'],
  zio: ['zii', 'Stressed -ìo keeps both i: zio → zii.'],
  pendio: ['pendii', 'Stressed -ìo keeps both i: pendio → pendii.'],
  gente: [null, 'Collective noun, used in the singular: la gente.']
};

/** Common nouns that do not change in the plural for reasons not visible in the spelling. */
const INVARIABLE = new Set(['foto', 'moto', 'auto', 'radio', 'bici', 'cinema', 're', 'gru', 'specie', 'serie', 'sport', 'film', 'bar']);

/**
 * Predict the plural of a noun.
 * Returns { plural, basis, explanation } where basis is one of
 *   'rule' | 'tendency' | 'exception' | 'invariable'.
 * Curated vocabulary entries always store their real plural; this function
 * is for explanation and for nouns the learner adds.
 */
export function pluralise(noun, gender) {
  const w = noun.toLowerCase();
  if (PLURAL_EXCEPTIONS[w]) {
    const [plural, explanation] = PLURAL_EXCEPTIONS[w];
    return { plural, basis: 'exception', explanation };
  }
  if (INVARIABLE.has(w)) return { plural: w, basis: 'invariable', explanation: 'Invariable: abbreviations, monosyllables and some loanwords do not change.' };
  if (/[àèéìòù]$/.test(w)) return { plural: w, basis: 'rule', explanation: 'Nouns ending in a stressed (accented) vowel do not change in the plural.' };
  if (/[^aeiou]$/.test(w)) return { plural: w, basis: 'rule', explanation: 'Nouns ending in a consonant (usually loanwords) do not change in the plural.' };
  if (w.endsWith('ie') && gender === 'f') return { plural: w, basis: 'rule', explanation: 'Feminine nouns in -ie do not change (la specie → le specie).' };

  if (gender === 'f') {
    if (/[cg]a$/.test(w)) return { plural: `${w.slice(0, -1)}he`, basis: 'rule', explanation: 'Feminine -ca/-ga → -che/-ghe: the h keeps the hard sound.' };
    if (/[cg]ia$/.test(w)) {
      const before = w.slice(-4, -3);
      if (/[aeiou]/.test(before)) return { plural: `${w.slice(0, -1)}e`, basis: 'tendency', explanation: '-cia/-gia after a vowel usually keeps the i: camicia → camicie.' };
      return { plural: `${w.slice(0, -2)}e`, basis: 'tendency', explanation: '-cia/-gia after a consonant usually drops the i: arancia → arance, spiaggia → spiagge.' };
    }
    if (w.endsWith('a')) return { plural: `${w.slice(0, -1)}e`, basis: 'rule', explanation: 'Feminine -a → -e.' };
    if (w.endsWith('e')) return { plural: `${w.slice(0, -1)}i`, basis: 'rule', explanation: 'Nouns in -e (either gender) → -i.' };
    if (w.endsWith('o')) return { plural: w, basis: 'tendency', explanation: 'Feminine nouns in -o are usually shortened words and do not change (la foto → le foto).' };
  }
  // masculine
  if (w.endsWith('io')) return { plural: w.slice(0, -1), basis: 'tendency', explanation: 'Unstressed -io → -i (figlio → figli). If the i is stressed, both are kept (zio → zii).' };
  if (/[cg]o$/.test(w)) return { plural: `${w.slice(0, -1)}hi`, basis: 'tendency', explanation: '-co/-go usually → -chi/-ghi when the stress falls on the second-to-last syllable (gioco → giochi, lago → laghi), but → -ci/-gi when it falls earlier (medico → medici). Learn each word.' };
  if (w.endsWith('o')) return { plural: `${w.slice(0, -1)}i`, basis: 'rule', explanation: 'Masculine -o → -i.' };
  if (w.endsWith('e')) return { plural: `${w.slice(0, -1)}i`, basis: 'rule', explanation: 'Nouns in -e (either gender) → -i.' };
  if (w.endsWith('a')) return { plural: `${w.slice(0, -1)}i`, basis: 'rule', explanation: 'Masculine nouns in -a (often of Greek origin) → -i: il problema → i problemi.' };
  return { plural: null, basis: 'tendency', explanation: 'No rule applies.' };
}

/* ------------------------------------------------------------------ */
/* Adjectives                                                          */
/* ------------------------------------------------------------------ */

const INVARIABLE_ADJ = new Set(['blu', 'rosa', 'viola', 'beige', 'pari', 'dispari']);

/**
 * Four agreement forms { ms, fs, mp, fp } for an adjective lemma.
 * Returns { forms, type, basis }.
 */
export function adjectiveForms(lemma) {
  const w = lemma.toLowerCase();
  if (INVARIABLE_ADJ.has(w)) return { forms: { ms: w, fs: w, mp: w, fp: w }, type: 'invariable', basis: 'rule' };
  if (w.endsWith('e')) {
    const pl = `${w.slice(0, -1)}i`;
    return { forms: { ms: w, fs: w, mp: pl, fp: pl }, type: 'e', basis: 'rule' };
  }
  if (w.endsWith('o')) {
    const stem = w.slice(0, -1);
    if (/[cg]$/.test(stem)) {
      // -co/-go: feminine plural always -che/-ghe; masculine plural depends on stress.
      return {
        forms: { ms: w, fs: `${stem}a`, mp: `${stem}hi`, fp: `${stem}he` },
        type: 'o',
        basis: 'tendency'
      };
    }
    if (stem.endsWith('i')) {
      // vecchio -> vecchi; grigio -> grigi
      return { forms: { ms: w, fs: `${stem}a`, mp: stem, fp: `${stem}e` }, type: 'o', basis: 'rule' };
    }
    return { forms: { ms: w, fs: `${stem}a`, mp: `${stem}i`, fp: `${stem}e` }, type: 'o', basis: 'rule' };
  }
  return { forms: { ms: w, fs: w, mp: w, fp: w }, type: 'invariable', basis: 'tendency' };
}

export function agreeAdjective(forms, gender, number) {
  const key = `${gender === 'f' ? 'f' : 'm'}${number === 'pl' ? 'p' : 's'}`;
  return forms[key];
}

/* ------------------------------------------------------------------ */
/* Pronouns                                                            */
/* ------------------------------------------------------------------ */

export const SUBJECT_PRONOUNS = ['io', 'tu', 'lui', 'noi', 'voi', 'loro'];
export const DIRECT_OBJECT_PRONOUNS = ['mi', 'ti', 'lo/la', 'ci', 'vi', 'li/le'];
export const INDIRECT_OBJECT_PRONOUNS = ['mi', 'ti', 'gli/le', 'ci', 'vi', 'gli'];

/** Index of the person for a subject pronoun. */
export function personIndex(pronoun) {
  const map = { io: 0, tu: 1, lui: 2, lei: 2, noi: 3, voi: 4, loro: 5 };
  return pronoun.toLowerCase() in map ? map[pronoun.toLowerCase()] : -1;
}
