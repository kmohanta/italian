/**
 * Curated sentence analysis and transformation.
 *
 * SCOPE — read this before extending the module.
 * This is not a general Italian parser. It analyses:
 *   1. every word form that exists in the course's form index (see
 *      vocabulary/dictionary.js), listing *all* its possible analyses, and
 *   2. the grammatical roles in sentences that can be split into clauses
 *      with one verb group each (simple or compound tense, passive,
 *      modal + infinitive, stare + gerundio), joined by a subordinator,
 *      a coordinator, a relative pronoun or a comma. For each clause it
 *      chooses one reading of the finite verb using simple contextual
 *      cues (the conjunction or governing verb, the subject's person) and
 *      reports the other readings; it then names the tense relation between
 *      clauses (sequence of tenses, periodo ipotetico).
 *
 * Anything outside that scope is reported as unsupported instead of being
 * guessed: unknown words are flagged, and a sentence that cannot be split
 * into one-verb clauses gets a word-by-word analysis only.
 */

import { lookupForm, getWord, normaliseToken } from '../vocabulary/dictionary.js';
import { tenseInfo, conjugate, fullTenseLabel } from './verb-system.js';
import {
  PERSONS,
  PERSON_ENGLISH,
  REFLEXIVE_PRONOUNS,
  definiteArticle,
  indefiniteArticle,
  articulatedPreposition,
  agreeParticiple,
  irregularData,
  withArticle
} from './grammar-engine.js';

/* ------------------------------------------------------------------ */
/* Tokenising                                                          */
/* ------------------------------------------------------------------ */

const LETTER = "A-Za-zÀ-ÖØ-öø-ÿ";
const TOKEN_RE = new RegExp(`([${LETTER}]+')(?=[${LETTER}])|[${LETTER}]+'?|[0-9]+|[^\\s${LETTER}0-9]+`, 'gu');
const KNOWN_TRUNCATIONS = new Set(["po'", "va'", "fa'", "da'", "sta'", "di'"]);

/**
 * Split text into word and punctuation tokens, separating elided forms:
 * "L'orso c'era" -> ["L'", "orso", "c'", "era"].
 */
export function tokenize(text) {
  const src = String(text).normalize('NFC').replace(/[‘’ʼ]/g, "'");
  const tokens = [];
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(src)) !== null) {
    let t = m[0];
    const isWord = new RegExp(`^[${LETTER}]`, 'u').test(t);
    // A trailing apostrophe that is not an elision (e.g. a closing quote) is punctuation,
    // except for known truncations like po'.
    if (isWord && t.endsWith("'") && !m[1] && !KNOWN_TRUNCATIONS.has(t.toLowerCase())) {
      tokens.push({ text: t.slice(0, -1), kind: 'word', start: m.index });
      tokens.push({ text: "'", kind: 'punct', start: m.index + t.length - 1 });
      continue;
    }
    tokens.push({ text: t, kind: isWord ? 'word' : /^[0-9]+$/.test(t) ? 'number' : 'punct', start: m.index });
  }
  return tokens;
}

/** Rebuild text from tokens with Italian spacing (no space after an elision). */
export function detokenize(tokens) {
  let out = '';
  tokens.forEach((t, i) => {
    const prev = tokens[i - 1];
    if (i === 0) {
      out = t.text;
      return;
    }
    const noSpaceBefore = t.kind === 'punct' && /^[.,;:!?…)»]/.test(t.text);
    const prevElided = prev && prev.kind === 'word' && prev.text.endsWith("'") && !KNOWN_TRUNCATIONS.has(prev.text.toLowerCase());
    const prevOpen = prev && prev.kind === 'punct' && /[(«¿¡]$/.test(prev.text);
    out += noSpaceBefore || prevElided || prevOpen ? t.text : ` ${t.text}`;
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Tagging                                                             */
/* ------------------------------------------------------------------ */

/** Names used in the course's examples and stories. */
const COMMON_NAMES = new Set(['marco', 'sara', 'luca', 'giulia', 'anna', 'paolo', 'bruno', 'tobia', 'pippo', 'maria', 'giovanni', 'roma', 'milano', 'napoli', 'torino', 'firenze', 'venezia', 'italia', 'sicilia', 'toscana', 'elena', 'nina', 'teo']);

const SUBJECT_PRONOUNS = { io: 0, tu: 1, lui: 2, lei: 2, noi: 3, voi: 4, loro: 5 };
const TIME_WORDS = new Set(['anno', 'anni', 'mese', 'mesi', 'giorno', 'giorni', 'settimana', 'settimane', 'ora', 'ore', 'minuto', 'minuti', 'secondo', 'secondi', 'tempo', 'poco', 'momento', 'secolo', 'secoli', 'sera', 'notte', 'mattina', 'estate', 'inverno']);
const CLITICS = new Set(['mi', 'ti', 'si', 'ci', 'vi', 'lo', 'la', 'li', 'le', 'gli', 'ne', "l'", "c'"]);
const MODALS = new Set(['potere', 'volere', 'dovere', 'sapere']);
/** Verbs followed directly by an infinitive without a preposition (besides modals). */
const INF_GOVERNORS = new Set(['piacere', 'preferire', 'fare', 'lasciare', 'sentire', 'vedere', 'desiderare', 'osare']);
const DET_POS = new Set(['definite article', 'indefinite article', 'demonstrative', 'possessive', 'determiner', 'numeral']);

function tagCandidates(analyses) {
  const tags = new Set();
  for (const a of analyses) {
    if (DET_POS.has(a.pos)) tags.add('DET');
    if (a.pos === 'articulated preposition') tags.add('APREP');
    if (a.pos === 'preposition') tags.add('PREP');
    if (a.pos === 'noun') tags.add('NOUN');
    if (a.pos === 'adjective') tags.add('ADJ');
    if (a.pos === 'conjunction') tags.add('CONJ');
    if (a.pos === 'adverb' || a.pos === 'interjection') tags.add('ADV');
    if (/pronoun/.test(a.pos)) tags.add('PRON');
    if (a.pos === 'verb') {
      if (a.features.tense) tags.add('VERB');
      else if (a.features.form === 'infinitive') tags.add('INF');
      else if (a.features.form === 'past participle') tags.add('PART');
      else if (a.features.form === 'gerund') tags.add('GER');
    }
  }
  return tags;
}

function pick(analyses, predicate) {
  return analyses.find(predicate) || null;
}

/**
 * Analyse each token in context and choose one reading where the context
 * makes it clear. Returns tokens with { analyses, tag, chosen, note }.
 */
export function tagSentence(text, { custom = [], names = [] } = {}) {
  const tokens = tokenize(text).map((t) => ({ ...t, norm: normaliseToken(t.text) }));
  const nameSet = new Set(names.map((n) => n.toLowerCase()));
  tokens.forEach((t, k) => {
    t.analyses = t.kind === 'word' ? lookupForm(t.text, custom) : [];
    const prevTok = tokens[k - 1];
    t.afterPunct = Boolean(prevTok && prevTok.kind === 'punct' && /[,;:«»"“”]/.test(prevTok.text));
  });
  const words = tokens.filter((t) => t.kind === 'word');
  let finiteVerbs = 0;
  words.forEach((t, i) => {
    const prev = words[i - 1];
    const next = words[i + 1];
    const next2 = words[i + 2];
    const cand = tagCandidates(t.analyses);
    const nextCand = next ? tagCandidates(next.analyses) : new Set();
    const next2Cand = next2 ? tagCandidates(next2.analyses) : new Set();
    t.candidates = cand;

    if (!t.analyses.length) {
      const capital = /^[A-ZÀ-Ý]/.test(t.text);
      // A capitalised unknown word inside the sentence is probably a name. At
      // the start of a sentence capitals prove nothing, so only known names
      // are accepted there; anything else is reported as unknown.
      if (nameSet.has(t.norm) || COMMON_NAMES.has(t.norm) || (capital && i > 0)) {
        t.tag = 'NAME';
        t.note = nameSet.has(t.norm) || COMMON_NAMES.has(t.norm) ? 'proper name' : 'probably a proper name (not in the dictionary)';
      } else {
        t.tag = 'UNKNOWN';
      }
      return;
    }
    const prevTag = prev && prev.tag;
    // Negation
    if (t.norm === 'non') {
      t.tag = 'NEG';
      t.chosen = t.analyses[0];
      return;
    }
    // Subject pronoun (io, tu, lui…) unless it is clearly something else
    if (t.norm in SUBJECT_PRONOUNS && !(t.norm === 'lei' && prevTag === 'PREP')) {
      t.tag = prevTag === 'PREP' || prevTag === 'APREP' ? 'PRON' : 'SUBJ';
      t.chosen = t.analyses[0];
      return;
    }
    // Determiner before a noun/adjective
    const nextIsPossessive = next && next.analyses.some((a) => a.pos === 'possessive' || a.pos === 'numeral');
    if (cand.has('DET') && (nextCand.has('NOUN') || nextCand.has('ADJ') || nextIsPossessive || (next && next.analyses.length === 0 && /^[a-zà-ý]/.test(next.text)))) {
      t.tag = 'DET';
      t.chosen = pick(t.analyses, (a) => DET_POS.has(a.pos));
      return;
    }
    // Articulated preposition
    if (cand.has('APREP')) {
      t.tag = 'APREP';
      t.chosen = pick(t.analyses, (a) => a.pos === 'articulated preposition');
      return;
    }
    // Clitic pronoun before a verb (possibly after another clitic)
    if (CLITICS.has(t.norm) && (nextCand.has('VERB') || nextCand.has('INF') || (next && CLITICS.has(next.norm) && next2Cand.has('VERB')))) {
      t.tag = 'CLITIC';
      t.chosen = pick(t.analyses, (a) => /pronoun|adverb/.test(a.pos)) || t.analyses[0];
      return;
    }
    // Participle after an auxiliary (essere, avere, venire), possibly with
    // adverbs in between (ho già mangiato), or after "stato" (è stato fatto).
    if (cand.has('PART')) {
      let j = i - 1;
      while (j >= 0 && words[j].tag === 'ADV') j--;
      const host = words[j];
      const isAux = host && host.tag === 'VERB' && host.chosen && ['essere', 'avere', 'venire', 'andare'].includes(host.chosen.lemma);
      const afterStato = host && host.tag === 'PART' && host.chosen && host.chosen.lemma === 'essere';
      const afterAuxInfinitive = host && host.tag === 'INF' && host.chosen && ['essere', 'avere'].includes(host.chosen.lemma);
      const afterAuxGerund = host && host.tag === 'GER' && host.chosen && ['essere', 'avere'].includes(host.chosen.lemma);
      if (isAux || afterStato || afterAuxInfinitive || afterAuxGerund) {
        t.tag = 'PART';
        t.chosen = pick(t.analyses, (a) => a.features.form === 'past participle');
        return;
      }
    }
    // Gerund (stare + gerundio, or a gerund clause)
    if (cand.has('GER')) {
      t.tag = 'GER';
      t.chosen = pick(t.analyses, (a) => a.features.form === 'gerund');
      return;
    }
    // Infinitive after a modal or a preposition
    if (cand.has('INF') && (prevTag === 'PREP' || prevTag === 'APREP' || (prev && prev.tag === 'VERB' && prev.chosen && (MODALS.has(prev.chosen.lemma) || INF_GOVERNORS.has(prev.chosen.lemma))) || (prev && prev.tag === 'CLITIC' && words[i - 2] && words[i - 2].chosen && MODALS.has(words[i - 2].chosen.lemma)))) {
      t.tag = 'INF';
      t.chosen = pick(t.analyses, (a) => a.features.form === 'infinitive');
      return;
    }
    // Noun/adjective after a determiner or articulated preposition
    if ((prevTag === 'DET' || prevTag === 'APREP' || prevTag === 'ADJ' || prevTag === 'NOUN') && (cand.has('NOUN') || cand.has('ADJ'))) {
      if (cand.has('NOUN') && !(prevTag === 'NOUN' && cand.has('ADJ'))) {
        // an adjective before a noun (un bel fiore) — prefer ADJ if next is a noun
        if (cand.has('ADJ') && nextCand.has('NOUN') && prevTag !== 'NOUN') {
          t.tag = 'ADJ';
          t.chosen = pick(t.analyses, (a) => a.pos === 'adjective');
          return;
        }
        t.tag = 'NOUN';
        t.chosen = pick(t.analyses, (a) => a.pos === 'noun');
        return;
      }
      t.tag = 'ADJ';
      t.chosen = pick(t.analyses, (a) => a.pos === 'adjective');
      return;
    }
    // "fa" after an expression of time means "ago" (tre giorni fa, poco fa), not the verb fare.
    if (t.norm === 'fa' && cand.has('ADV') && prev && (TIME_WORDS.has(prev.chosen ? prev.chosen.lemma : prev.norm) || TIME_WORDS.has(prev.norm))) {
      t.tag = 'ADV';
      t.chosen = pick(t.analyses, (a) => a.pos === 'adverb');
      return;
    }
    // Finite verb
    if (cand.has('VERB') && !(prevTag === 'DET' || prevTag === 'APREP')) {
      t.tag = 'VERB';
      t.chosen = pick(t.analyses, (a) => a.pos === 'verb' && a.features.tense);
      finiteVerbs++;
      return;
    }
    const order = ['PREP', 'NOUN', 'ADJ', 'ADV', 'CONJ', 'INF', 'PART', 'PRON', 'DET', 'VERB'];
    for (const tag of order) {
      if (cand.has(tag)) {
        t.tag = tag;
        t.chosen =
          tag === 'PREP'
            ? pick(t.analyses, (a) => a.pos === 'preposition')
            : tag === 'NOUN'
              ? pick(t.analyses, (a) => a.pos === 'noun')
              : tag === 'ADJ'
                ? pick(t.analyses, (a) => a.pos === 'adjective')
                : tag === 'ADV'
                  ? pick(t.analyses, (a) => a.pos === 'adverb' || a.pos === 'interjection')
                  : tag === 'CONJ'
                    ? pick(t.analyses, (a) => a.pos === 'conjunction')
                    : tag === 'PRON'
                      ? pick(t.analyses, (a) => /pronoun/.test(a.pos))
                      : tag === 'DET'
                        ? pick(t.analyses, (a) => DET_POS.has(a.pos))
                        : t.analyses[0];
        return;
      }
    }
    t.tag = 'OTHER';
    t.chosen = t.analyses[0];
  });
  return { tokens, words, finiteVerbs };
}

/* ------------------------------------------------------------------ */
/* Chunking and roles                                                  */
/* ------------------------------------------------------------------ */

function nounPhraseInfo(phraseTokens, phrase) {
  if (phrase && phrase.coordinated) {
    const genders = phrase.parts.map((p) => nounPhraseInfo(p.tokens).gender);
    return { gender: genders.every((g) => g === 'feminine') ? 'feminine' : 'masculine', number: 'plural', person: 5, coordinated: true };
  }
  const head = [...phraseTokens].reverse().find((t) => t.tag === 'NOUN' || t.tag === 'NAME' || t.tag === 'SUBJ' || t.tag === 'PRON');
  if (!head) return { gender: null, number: null, person: 2 };
  if (head.tag === 'SUBJ') {
    const p = SUBJECT_PRONOUNS[head.norm];
    return { gender: head.norm === 'lei' ? 'feminine' : head.norm === 'lui' ? 'masculine' : null, number: p >= 3 ? 'plural' : 'singular', person: p };
  }
  if (head.tag === 'NAME') return { gender: null, number: 'singular', person: 2 };
  const f = head.chosen ? head.chosen.features : {};
  let number = f.number === 'plural' ? 'plural' : f.number === 'singular' ? 'singular' : null;
  if (!number || number === 'singular or plural') {
    const det = phraseTokens.find((t) => t.tag === 'DET' || t.tag === 'APREP');
    const df = det && det.chosen ? det.chosen.features : {};
    number = df.number === 'pl' || df.number === 'plural' ? 'plural' : 'singular';
  }
  return { gender: f.gender || null, number, person: number === 'plural' ? 5 : 2 };
}

const TIME_EXPRESSIONS = new Set(['una volta', 'ogni giorno', 'ogni mattina', 'ogni sera', 'tutto il giorno', 'tutta la notte', 'tutti i giorni', 'la mattina', 'la sera', 'stanotte']);

const PREP_ROLES = {
  di: 'specification / possession (di)',
  a: 'destination, location or indirect object (a)',
  da: 'origin, someone’s place or agent (da)',
  in: 'place or means (in)',
  con: 'company or instrument (con)',
  su: 'position on / topic (su)',
  per: 'purpose, destination or duration (per)',
  tra: 'position between / among (tra)',
  fra: 'position between / among (fra)',
  sotto: 'position under (sotto)',
  sopra: 'position above (sopra)'
};

/* ------------------------------------------------------------------ */
/* Verb groups: tense, mood, voice                                     */
/* ------------------------------------------------------------------ */

const COMPOUND_OF = {
  presente: 'passatoProssimo',
  imperfetto: 'trapassatoProssimo',
  passatoRemoto: 'trapassatoRemoto',
  futuro: 'futuroAnteriore',
  condizionale: 'condizionalePassato',
  congiuntivoPresente: 'congiuntivoPassato',
  congiuntivoImperfetto: 'congiuntivoTrapassato'
};

/** Subordinators that normally (or often) govern the congiuntivo. */
const SUBJUNCTIVE_TRIGGERS = new Set(['benché', 'sebbene', 'affinché', 'purché', 'qualora', 'nonostante', 'malgrado']);
/** che: the congiuntivo is preferred only if the main verb is one that governs it. */
const SUBJUNCTIVE_GOVERNORS = new Set(['pensare', 'credere', 'volere', 'sperare', 'preferire', 'temere', 'dubitare', 'piacere', 'sembrare', 'immaginare', 'desiderare', 'aspettare', 'bisognare']);
const SUBORDINATORS = new Set(['che', 'se', 'quando', 'mentre', 'perché', 'benché', 'sebbene', 'affinché', 'purché', 'qualora', 'finché', 'appena', 'come', 'dove', 'nonostante', 'malgrado', 'siccome', 'poiché', 'cui']);
const COORDINATORS = new Set(['e', 'ed', 'ma', 'o', 'oppure', 'però', 'quindi']);

function finiteReadings(tok) {
  return tok.analyses.filter((a) => a.pos === 'verb' && a.features.tenseKey);
}

function readingLabel(a) {
  return `${a.features.tense}, ${a.features.person}`;
}

/**
 * Choose the most plausible reading of a finite verb given its clause.
 * Returns { chosen, others } — `others` are the remaining plausible readings,
 * which are always reported: context narrows, it does not prove.
 */
function chooseReading(tok, { introducer, subjectPerson, exclamation, clauseInitial, governor }) {
  const readings = finiteReadings(tok);
  if (readings.length <= 1) return { chosen: readings[0] || tok.chosen, others: [] };
  const intro = introducer ? introducer.norm : null;
  const score = (a) => {
    let sc = 0;
    const m = a.features.mood;
    if (intro && (SUBJUNCTIVE_TRIGGERS.has(intro) || (intro === 'che' && governor))) sc += m === 'congiuntivo' ? 3 : m === 'indicativo' ? 1 : 0;
    else if (intro === 'se') sc += m === 'congiuntivo' ? 2 : m === 'indicativo' ? 1 : -2;
    else if (exclamation && clauseInitial && subjectPerson === undefined) sc += m === 'imperativo' ? 3 : m === 'indicativo' ? 1 : 0;
    else sc += m === 'indicativo' ? 3 : m === 'condizionale' ? 2 : m === 'imperativo' ? 1 : 0;
    if (subjectPerson !== undefined) {
      if (a.features.personIndex === subjectPerson && m !== 'imperativo') sc += 4;
      else if (m === 'imperativo') sc -= 3;
    }
    return sc;
  };
  const ranked = [...readings].sort((a, b) => score(b) - score(a));
  return { chosen: ranked[0], others: ranked.slice(1) };
}

/**
 * Describe the verb group of one VP: simple tense, compound tense, passive,
 * modal + infinitive or stare + gerund.
 */
function describeVerbGroup(vp, finite) {
  const parts = vp.tokens.filter((t) => t.tag === 'PART');
  const inf = vp.tokens.find((t) => t.tag === 'INF');
  const ger = vp.tokens.find((t) => t.tag === 'GER');
  const f = finite.chosen;
  const auxKey = f.features.tenseKey;
  const info = { lemma: f.lemma, tenseKey: auxKey, voice: 'active', construction: 'simple', auxiliary: null, notes: [] };
  if (parts.length) {
    const lastPart = parts[parts.length - 1].chosen;
    const partWord = lastPart.wordId ? getWord(lastPart.wordId) : null;
    const partAux = lastPart.auxiliary || (partWord && partWord.auxiliary);
    const reflexive = vp.tokens.some((t) => t.tag === 'CLITIC' && REFLEXIVE_PRONOUNS.includes(t.norm));
    if (f.lemma === 'avere') {
      Object.assign(info, { lemma: lastPart.lemma, tenseKey: COMPOUND_OF[auxKey], construction: 'compound', auxiliary: 'avere' });
    } else if (f.lemma === 'essere' && parts.length === 2 && parts[0].chosen.lemma === 'essere') {
      Object.assign(info, { lemma: lastPart.lemma, tenseKey: COMPOUND_OF[auxKey], construction: 'compound', voice: 'passive', auxiliary: 'essere' });
      info.notes.push(`Passive: essere (${COMPOUND_OF[auxKey] ? tenseInfo(COMPOUND_OF[auxKey]).label : auxKey}) + stato + participle of ${lastPart.lemma}.`);
    } else if (f.lemma === 'essere' && (partAux === 'essere' || reflexive || lastPart.lemma === 'essere')) {
      Object.assign(info, { lemma: lastPart.lemma, tenseKey: COMPOUND_OF[auxKey], construction: 'compound', auxiliary: 'essere' });
    } else if (f.lemma === 'essere') {
      Object.assign(info, { lemma: lastPart.lemma, tenseKey: auxKey, construction: 'passive', voice: 'passive', auxiliary: 'essere' });
      info.notes.push(`${lastPart.lemma} takes avere in its active compound tenses, so essere + participle is read as a passive (${tenseInfo(auxKey).label}). It may also be a participle used as an adjective describing a state (la porta è chiusa = the door is closed).`);
    } else if (f.lemma === 'venire') {
      Object.assign(info, { lemma: lastPart.lemma, tenseKey: auxKey, construction: 'passive', voice: 'passive', auxiliary: 'venire' });
      info.notes.push('venire + participle is a passive that stresses the action rather than the resulting state; it is used only in simple tenses.');
    } else if (f.lemma === 'andare') {
      Object.assign(info, { lemma: lastPart.lemma, tenseKey: auxKey, construction: 'passive', voice: 'passive', auxiliary: 'andare' });
      info.notes.push('andare + participle is a passive of obligation (va fatto = it must be done) or, with verbs of loss, simply passive (è andato perso).');
    }
  } else if (inf && MODALS.has(f.lemma)) {
    Object.assign(info, { lemma: `${f.lemma} + ${inf.chosen.lemma}`, construction: 'modal + infinitive' });
  } else if (inf) {
    Object.assign(info, { lemma: `${f.lemma} + ${inf.chosen.lemma}`, construction: 'verb + infinitive' });
  } else if (ger && f.lemma === 'stare') {
    Object.assign(info, { lemma: `stare + ${ger.chosen.lemma}`, construction: 'progressive (stare + gerundio)' });
  }
  const ti = tenseInfo(info.tenseKey);
  info.tense = ti ? fullTenseLabel(ti) : f.features.tense;
  info.mood = ti ? ti.mood : f.features.mood;
  info.tenseLabel = ti ? ti.label : '';
  return info;
}

/* ------------------------------------------------------------------ */
/* Chunking                                                            */
/* ------------------------------------------------------------------ */

function chunk(W) {
  const phrases = [];
  let i = 0;
  while (i < W.length) {
    const t = W[i];
    if (t.tag === 'DET' || t.tag === 'NOUN' || t.tag === 'NAME' || (t.tag === 'ADJ' && W[i + 1] && W[i + 1].tag === 'NOUN')) {
      const start = i;
      const isPossOrNum = (x) => x.chosen && ['possessive', 'numeral'].includes(x.chosen.pos);
      while (i < W.length && ['DET', 'ADJ', 'NOUN', 'NAME'].includes(W[i].tag) && !(i > start && W[i].tag === 'DET' && !isPossOrNum(W[i])) && !(i > start && W[i].afterPunct)) {
        if (i > start && ['NOUN', 'NAME'].includes(W[i - 1].tag) && W[i].tag !== 'ADJ') break;
        i++;
      }
      phrases.push({ type: 'NP', tokens: W.slice(start, i) });
      continue;
    }
    if (t.tag === 'PREP' || t.tag === 'APREP') {
      const start = i;
      i++;
      if (W[i] && W[i].tag === 'INF') {
        i++;
        while (W[i] && W[i].tag === 'PART') i++; // dopo aver mangiato
        phrases.push({ type: 'PP', subtype: 'infinitive', tokens: W.slice(start, i) });
        continue;
      }
      while (i < W.length && ['DET', 'ADJ', 'NOUN', 'NAME', 'PRON', 'SUBJ'].includes(W[i].tag)) {
        if (i > start + 1 && ['NOUN', 'NAME', 'PRON', 'SUBJ'].includes(W[i - 1].tag) && W[i].tag !== 'ADJ') break;
        i++;
      }
      phrases.push({ type: 'PP', tokens: W.slice(start, i) });
      continue;
    }
    if (t.tag === 'NEG' || t.tag === 'CLITIC' || t.tag === 'VERB') {
      const start = i;
      while (i < W.length && ['NEG', 'CLITIC'].includes(W[i].tag)) i++;
      if (W[i] && W[i].tag === 'VERB') {
        i++;
        while (W[i] && W[i].tag === 'ADV' && W[i + 1] && ['PART', 'INF', 'GER'].includes(W[i + 1].tag)) i++;
        if (W[i] && W[i].tag === 'PART') {
          i++;
          if (W[i] && W[i].tag === 'PART') i++;
        } else if (W[i] && W[i].tag === 'CLITIC' && W[i + 1] && W[i + 1].tag === 'INF') i += 2;
        else if (W[i] && (W[i].tag === 'INF' || W[i].tag === 'GER')) i++;
        phrases.push({ type: 'VP', tokens: W.slice(start, i) });
      } else {
        phrases.push({ type: 'OTHER', tokens: W.slice(start, i || start + 1) });
        if (i === start) i++;
      }
      continue;
    }
    if (t.tag === 'SUBJ') {
      phrases.push({ type: 'NP', pronoun: true, tokens: [t] });
      i++;
      continue;
    }
    if (t.tag === 'GER') {
      phrases.push({ type: 'GERP', tokens: [t] });
      i++;
      continue;
    }
    const type = { ADJ: 'ADJP', ADV: 'ADVP', CONJ: 'CONJ', INF: 'INF', UNKNOWN: 'UNKNOWN' }[t.tag] || (t.chosen && t.chosen.lemma === 'che' ? 'CONJ' : 'OTHER');
    phrases.push({ type, tokens: [t] });
    i++;
  }
  // Coordinated noun phrases: "il gatto e il cane" -> one plural subject/object.
  for (let k = phrases.length - 3; k >= 0; k--) {
    const [a1, c, a2] = [phrases[k], phrases[k + 1], phrases[k + 2]];
    if (a1.type === 'NP' && c.type === 'CONJ' && ['e', 'ed', 'o'].includes(c.tokens[0].norm) && a2.type === 'NP') {
      phrases.splice(k, 3, { type: 'NP', coordinated: true, tokens: [...a1.tokens, ...c.tokens, ...a2.tokens], parts: [a1, a2] });
    }
  }
  for (const ph of phrases) {
    const s = ph.tokens.map((t) => t.norm).join(' ');
    if (ph.type === 'NP' && TIME_EXPRESSIONS.has(s)) ph.timeExpression = true;
  }
  return phrases;
}

/** Split a phrase list into clauses at subordinators, coordinators and commas. */
function isRelativeIntroducer(ph, prev) {
  if (!prev) return false;
  const last = ph.tokens[ph.tokens.length - 1];
  if (ph.type === 'PP' && last.norm === 'cui') return true;
  return last.norm === 'che' && ph.tokens.length === 1 && (prev.type === 'NP' || prev.type === 'PP');
}

/**
 * Pull out relative clauses embedded inside another clause:
 *   [Il ragazzo] [che] [canta] [è] [mio fratello]
 * → main: Il ragazzo … è mio fratello; relative: che canta.
 * The relative clause runs from its introducer to the phrase before the next
 * verb that has no introducer of its own.
 */
function extractRelatives(phrases) {
  const out = [];
  const relatives = [];
  let i = 0;
  while (i < phrases.length) {
    const ph = phrases[i];
    const prev = out[out.length - 1];
    if (isRelativeIntroducer(ph, prev) && !out.some((p) => p.type === 'VP')) {
      // embedded: the main verb follows the relative clause
      const rel = { introducer: ph.tokens[ph.tokens.length - 1], introducerPhrase: ph, phrases: [], relative: true, antecedent: prev };
      let j = i + 1;
      let seenVP = false;
      while (j < phrases.length) {
        if (phrases[j].type === 'VP') {
          if (seenVP) break;
          seenVP = true;
        }
        rel.phrases.push(phrases[j]);
        j++;
      }
      // complements after the relative verb belong to it only if another verb follows
      if (j < phrases.length && seenVP) {
        relatives.push(rel);
        i = j;
        continue;
      }
    }
    out.push(ph);
    i++;
  }
  return { phrases: out, relatives };
}

function splitClauses(phrasesIn) {
  const { phrases, relatives } = extractRelatives(phrasesIn);
  const clauses = [];
  let current = { introducer: null, phrases: [] };
  const isBoundary = (ph) => {
    const t = ph.tokens[0];
    if (ph.type === 'CONJ' && (SUBORDINATORS.has(t.norm) || COORDINATORS.has(t.norm))) return true;
    if (t.norm === 'che' || t.norm === 'cui') return true;
    if (ph.type === 'PP' && ph.tokens[ph.tokens.length - 1].norm === 'cui') return true;
    return false;
  };
  let prevPhrase = null;
  for (const ph of phrases) {
    if (isBoundary(ph) && isRelativeIntroducer(ph, prevPhrase)) {
      ph.relativeIntroducer = true;
      ph.antecedent = prevPhrase;
    }
    prevPhrase = ph;
    if (isBoundary(ph) && current.phrases.length) {
      clauses.push(current);
      current = { introducer: ph.tokens[ph.tokens.length - 1], introducerPhrase: ph, phrases: [], relative: Boolean(ph.relativeIntroducer), antecedent: ph.antecedent };
      continue;
    }
    if (isBoundary(ph)) {
      current.introducer = ph.tokens[ph.tokens.length - 1];
      current.introducerPhrase = ph;
      continue;
    }
    if (ph.tokens[0].afterPunct && current.phrases.some((p) => p.type === 'VP')) {
      clauses.push(current);
      current = { introducer: null, phrases: [] };
    }
    current.phrases.push(ph);
  }
  clauses.push(current);
  // A segment without a verb cannot be a clause: merge it with a neighbour.
  for (let k = clauses.length - 1; k >= 0 && clauses.length > 1; k--) {
    const c = clauses[k];
    if (!c.phrases.some((p) => p.type === 'VP')) {
      const target = clauses[k + 1] || clauses[k - 1];
      const merged = [...(c.introducerPhrase ? [c.introducerPhrase] : []), ...c.phrases];
      if (clauses[k + 1]) {
        if (!target.introducer && c.introducer) {
          target.introducer = c.introducer;
          target.introducerPhrase = c.introducerPhrase;
          target.phrases = [...c.phrases, ...target.phrases];
        } else target.phrases = [...merged, ...(target.introducerPhrase ? [target.introducerPhrase] : []), ...target.phrases];
        if (target.introducerPhrase && target.phrases.includes(target.introducerPhrase)) {
          target.introducer = null;
          target.introducerPhrase = null;
        }
      } else target.phrases.push(...merged);
      clauses.splice(k, 1);
    }
  }
  return [...clauses, ...relatives];
}

/* ------------------------------------------------------------------ */
/* Roles inside one clause                                             */
/* ------------------------------------------------------------------ */

function assignClause(clause, { messages, exclamation }) {
  const phrases = clause.phrases;
  const vpIndex = phrases.findIndex((p) => p.type === 'VP');
  const vp = phrases[vpIndex];
  const finite = vp.tokens.find((t) => t.tag === 'VERB');
  const before = phrases.slice(0, vpIndex);
  const after = phrases.slice(vpIndex + 1);
  for (const ph of phrases) if (ph.timeExpression) ph.role = 'time expression';
  const subjectNP = before.filter((p) => p.type === 'NP' && !p.timeExpression).pop();
  const subjectInfo = subjectNP ? nounPhraseInfo(subjectNP.tokens, subjectNP) : null;
  const clauseInitial = vpIndex === 0 && !clause.introducer;
  const { chosen, others } = chooseReading(finite, {
    governor: clause.governor,
    introducer: clause.introducer,
    subjectPerson: subjectInfo ? subjectInfo.person : undefined,
    exclamation,
    clauseInitial
  });
  if (chosen) finite.chosen = chosen;
  let personIndex = finite.chosen.features.personIndex;
  const verb = describeVerbGroup(vp, finite);
  const isCopula = finite.chosen.lemma === 'essere' && verb.construction === 'simple';
  const reflexiveClitic = vp.tokens.find((t) => t.tag === 'CLITIC' && REFLEXIVE_PRONOUNS[personIndex] === t.norm);
  vp.role = 'verb';
  Object.assign(verb, {
    personIndex,
    person: finite.chosen.features.person,
    finiteText: finite.text,
    negated: vp.tokens.some((t) => t.tag === 'NEG'),
    reflexive: Boolean(reflexiveClitic),
    copula: isCopula
  });
  // Deduplicate alternative labels and drop the chosen one.
  const isPeriphrastic = verb.construction !== 'simple';
  // A clitic written before the verb rules out the affirmative imperative of tu/noi/voi (which attaches it: mangiati), but not formal Lei/Loro (si accomodi).
  const procliticBefore = vp.tokens.indexOf(finite) > 0 && vp.tokens.slice(0, vp.tokens.indexOf(finite)).some((t) => t.tag === 'CLITIC');
  const keep = others.filter((a) => {
    if (a.features.mood !== 'imperativo') return true;
    if (isPeriphrastic) return false;
    return !(procliticBefore && [1, 3, 4].includes(a.features.personIndex));
  });
  verb.alternatives = [...new Set(keep.map(readingLabel))].filter((x) => x !== readingLabel(finite.chosen));
  if (verb.alternatives.length) {
    const what = verb.construction === 'compound' || verb.voice === 'passive' ? `The auxiliary “${finite.text}”` : `“${finite.text}”`;
    messages.push(`${what} is read as ${readingLabel(finite.chosen)}. Other possible readings of this form: ${verb.alternatives.join('; ')}.`);
  }
  for (const t of vp.tokens) {
    if (t.tag === 'CLITIC') {
      t.role = reflexiveClitic === t ? 'reflexive pronoun' : t.norm === "c'" || (t.norm === 'ci' && finite.chosen.lemma === 'essere') ? '“there” (ci): c’è / ci sono' : 'object pronoun';
    }
    if (t.tag === 'NEG') t.role = 'negation';
    if (t.tag === 'PART') t.role = verb.voice === 'passive' ? 'past participle (passive)' : 'past participle (compound tense)';
  }
  let subject;
  if (subjectNP) {
    subjectNP.role = verb.voice === 'passive' ? 'subject (of a passive verb)' : 'subject';
    subject = { ...subjectInfo, explicit: true, text: subjectNP.tokens.map((t) => t.text).join(' ') };
    if (subjectInfo.person !== personIndex && !(subjectNP.pronoun && subjectInfo.person === personIndex) && finite.chosen.features.mood !== 'imperativo') {
      messages.push(`Agreement check: the subject “${subject.text}” is ${subjectInfo.number}, but the verb “${finite.text}” is ${finite.chosen.features.person} form.`);
    }
  } else {
    const thereIs = vp.tokens.some((t) => t.role && t.role.startsWith('“there”'));
    subject = { explicit: false, person: personIndex, number: personIndex >= 3 ? 'plural' : 'singular', gender: null };
    if (finite.chosen.features.mood === 'imperativo') {
      messages.push(`“${finite.text}” is an imperative (${finite.chosen.features.person}): the addressee is the subject and is not written.`);
    } else if (clause.relative) {
      subject.relative = true;
    } else if (reflexiveClitic && reflexiveClitic.norm === 'si' && verb.voice !== 'passive') {
      // si + 3rd person with no written subject: reflexive, impersonal or passive.
      const lexicalReflexive = Boolean(getWord(`verb_${finite.chosen.lemma.replace(/e$/, '')}si`));
      verb.siReadings = lexicalReflexive ? ['reflexive', 'impersonal', 'passive'] : ['impersonal', 'passive', 'reflexive'];
      reflexiveClitic.role = lexicalReflexive ? 'si: reflexive pronoun, or impersonal/passive si' : 'si: impersonal or passive si (or reflexive)';
      messages.push(
        `“si” + 3rd-person verb without a written subject has several possible readings: reflexive (someone does it to himself/herself), impersonal si (“one / people …”: si mangia bene) or passive si (si vendono case = houses are sold, with the verb agreeing with the noun).` +
          (lexicalReflexive ? ` Because the dictionary lists a reflexive verb ${finite.chosen.lemma.replace(/e$/, '')}si, the reflexive reading with an unwritten subject is also likely here.` : ` Here the impersonal or passive reading is the most likely.`) +
          ' See the lesson on si impersonale.'
      );
    } else if (!thereIs) {
      messages.push(`The subject of “${finite.text}” is not written: the ending shows ${PERSONS[personIndex]} (${PERSON_ENGLISH[personIndex]}). Italian usually omits subject pronouns.`);
    }
  }
  let objectAssigned = false;
  for (const p of after) {
    if (p.role) continue;
    if (p.type === 'NP') {
      if (vp.tokens.some((t) => t.role && t.role.startsWith('“there”'))) p.role = 'subject (of c’è / ci sono / c’era)';
      else if (verb.siReadings && !objectAssigned) {
        const np = nounPhraseInfo(p.tokens, p);
        p.role =
          personIndex === 5 && np.number === 'plural'
            ? 'subject in the passive-si reading (the plural verb agrees with it)'
            : 'subject (passive si) or direct object (impersonal si)';
        objectAssigned = true;
      }
      else if (isCopula) p.role = 'predicate noun (complement of essere)';
      else if (!subjectNP && verb.voice === 'active' && UNACCUSATIVE_SUBJECT.has(verb.lemma) && !objectAssigned) {
        p.role = 'subject (placed after the verb)';
        subject = { ...nounPhraseInfo(p.tokens, p), explicit: true, text: p.tokens.map((t) => t.text).join(' ') };
        objectAssigned = true;
      } else if (!objectAssigned && verb.voice === 'active') {
        p.role = 'direct object';
        objectAssigned = true;
      } else p.role = 'noun phrase';
    } else if (p.type === 'ADJP') {
      p.role = isCopula ? 'predicate adjective (complement of essere)' : 'adjective';
    } else if (p.type === 'PP') {
      const prep = p.tokens[0].chosen;
      const key = prep.pos === 'articulated preposition' ? prep.features.preposition : prep.lemma;
      if (verb.voice === 'passive' && key === 'da') p.role = 'agent (da + noun: by whom the action is done)';
      else p.role = p.subtype === 'infinitive' ? `infinitive phrase introduced by ${key}` : `prepositional phrase — ${PREP_ROLES[key] || key}`;
    } else if (p.type === 'ADVP') p.role = 'adverb';
    else if (p.type === 'GERP') p.role = 'gerund (manner, means, time or cause)';
  }
  for (const p of before) {
    if (p.role) continue;
    if (p.type === 'PP') {
      const prep = p.tokens[0].chosen;
      const key = prep.pos === 'articulated preposition' ? prep.features.preposition : prep.lemma;
      p.role = p.subtype === 'infinitive' ? `infinitive phrase introduced by ${key}` : `prepositional phrase — ${PREP_ROLES[key] || key}`;
    } else if (p.type === 'ADVP') p.role = 'adverb';
    else if (p.type === 'NP') p.role = 'noun phrase';
    else if (p.type === 'GERP') p.role = 'gerund (manner, means, time or cause)';
  }
  if (isCopula && subject && subject.explicit) {
    const adj = after.find((p) => p.type === 'ADJP');
    if (adj && adj.tokens[0].chosen) {
      const f = adj.tokens[0].chosen.features;
      if (f.number && subject.number && f.number !== subject.number) messages.push(`Agreement check: “${adj.tokens[0].text}” is ${f.number}, but the subject is ${subject.number}.`);
      else if (f.gender && subject.gender && f.gender !== subject.gender) messages.push(`Agreement check: “${adj.tokens[0].text}” is ${f.gender}, but the subject is ${subject.gender}.`);
    }
  }
  for (const n of verb.notes) messages.push(n);
  return { verb, subject, vp, finite };
}

/** Verbs whose subject commonly follows them (arrivare, venire, cadere…). */
const UNACCUSATIVE_SUBJECT = new Set(['arrivare', 'venire', 'cadere', 'partire', 'entrare', 'uscire', 'tornare', 'nascere', 'morire', 'piovere', 'mancare', 'succedere', 'piacere', 'restare', 'rimanere']);

/* ------------------------------------------------------------------ */
/* Relations between clauses                                           */
/* ------------------------------------------------------------------ */

const PAST_MAIN = new Set(['passatoProssimo', 'imperfetto', 'passatoRemoto', 'trapassatoProssimo', 'trapassatoRemoto', 'condizionale', 'condizionalePassato']);
const PRESENT_MAIN = new Set(['presente', 'futuro', 'futuroAnteriore', 'imperativo']);

/**
 * Curated description of the temporal relation expressed by a subordinate
 * tense after a main tense (consecutio temporum). Returns null when the pair
 * is not one of the standard combinations — the analyser then reports the
 * tenses without interpreting them.
 */
export function tenseRelation(mainKey, subKey) {
  const presentMain = PRESENT_MAIN.has(mainKey);
  const pastMain = PAST_MAIN.has(mainKey);
  const table = presentMain
    ? {
        congiuntivoPresente: 'simultaneous with (or later than) the main verb — congiuntivo presente after a present or future main verb',
        congiuntivoPassato: 'earlier than the main verb — congiuntivo passato after a present or future main verb',
        presente: 'simultaneous with the main verb (indicative)',
        passatoProssimo: 'earlier than the main verb (indicative)',
        imperfetto: 'earlier than the main verb, presented as background (indicative)',
        futuro: 'later than the main verb (indicative futuro)',
        congiuntivoImperfetto: 'a past situation seen from the present (penso che fosse stanco = I think he was tired)'
      }
    : pastMain
      ? {
          congiuntivoImperfetto: 'simultaneous with the main verb — congiuntivo imperfetto after a past or conditional main verb',
          congiuntivoTrapassato: 'earlier than the main verb — congiuntivo trapassato after a past or conditional main verb',
          condizionalePassato: 'later than the main verb — the “future in the past” is the condizionale passato',
          imperfetto: 'simultaneous with the main verb (indicative)',
          trapassatoProssimo: 'earlier than the main verb (indicative trapassato prossimo)',
          passatoProssimo: 'earlier than the main verb (indicative)'
        }
      : {};
  return table[subKey] || null;
}

/** Classify a hypothetical sentence (periodo ipotetico) from its two verbs. */
export function classifyHypothetical(protasisKey, apodosisKey) {
  const ind = new Set(['presente', 'futuro', 'passatoProssimo', 'imperfetto', 'passatoRemoto', 'futuroAnteriore']);
  if (protasisKey === 'congiuntivoImperfetto' && apodosisKey === 'condizionale') return { type: 'possibility', label: 'periodo ipotetico della possibilità', text: 'se + congiuntivo imperfetto, condizionale presente: a possible or imagined situation in the present or future.' };
  if (protasisKey === 'congiuntivoTrapassato' && apodosisKey === 'condizionalePassato') return { type: 'unreality-past', label: 'periodo ipotetico dell’irrealtà (past)', text: 'se + congiuntivo trapassato, condizionale passato: a past condition that was not fulfilled.' };
  if (protasisKey === 'congiuntivoTrapassato' && apodosisKey === 'condizionale') return { type: 'unreality-mixed', label: 'periodo ipotetico dell’irrealtà (mixed)', text: 'se + congiuntivo trapassato, condizionale presente: an unfulfilled past condition with a consequence in the present.' };
  if (protasisKey === 'congiuntivoImperfetto' && apodosisKey === 'condizionalePassato') return { type: 'unreality-mixed', label: 'periodo ipotetico dell’irrealtà (mixed)', text: 'se + congiuntivo imperfetto, condizionale passato: a permanent or present unreal condition with a past consequence.' };
  if (protasisKey === 'imperfetto' && apodosisKey === 'imperfetto') return { type: 'colloquial-unreality', label: 'colloquial counterfactual (doppio imperfetto)', text: 'se + imperfetto, imperfetto: very common in informal speech for an unfulfilled condition, and attested in literary Italian since Dante, but classed as substandard; the standard form is se + congiuntivo trapassato, condizionale passato.' };
  if (protasisKey === 'imperfetto' && (apodosisKey === 'condizionale' || apodosisKey === 'condizionalePassato')) return { type: 'colloquial-mixed', label: 'mixed colloquial type', text: 'se + imperfetto, condizionale (se potevo, lo farei): occasionally heard but not standard; use se + congiuntivo (se avessi potuto, l’avrei fatto / se potessi, lo farei).' };
  if ((protasisKey === 'condizionale' || protasisKey === 'condizionalePassato')) return { type: 'nonstandard', label: 'nonstandard', text: 'A conditional in the se-clause (se avrei…) is not standard Italian; use the congiuntivo (se avessi…).' };
  if (ind.has(protasisKey) && (ind.has(apodosisKey) || apodosisKey === 'imperativo')) return { type: 'reality', label: 'periodo ipotetico della realtà', text: 'se + indicative, indicative (or imperative): a real or likely condition.' };
  return null;
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                    */
/* ------------------------------------------------------------------ */

/**
 * Analyse a sentence. Returns
 *   { text, tokens, words, phrases, clauses, supported, messages, verb, subject, relations }
 * `verb` and `subject` describe the main clause.
 */
export function analyseSentence(text, opts = {}) {
  const { tokens, words } = tagSentence(text, opts);
  const messages = [];
  const phrases = chunk(words);
  const exclamation = /!\s*[»"”]?\s*$/.test(text.trim());
  const unknown = words.filter((w) => w.tag === 'UNKNOWN');
  const result = { text, tokens, words, phrases, clauses: [], supported: false, messages, verb: null, subject: null, relations: [] };
  if (unknown.length) {
    messages.push(`Not in the dictionary: ${unknown.map((u) => `“${u.text}”`).join(', ')}. These words are not analysed, so grammatical roles are not assigned.`);
  }
  const vps = phrases.filter((p) => p.type === 'VP');
  if (vps.length === 0) {
    messages.push('No conjugated verb was recognised, so this is analysed as a phrase, not a clause.');
    for (const p of phrases) p.role = null;
    return result;
  }
  const clauses = splitClauses(phrases);
  result.clauses = clauses;
  const badClause = clauses.find((c) => c.phrases.filter((p) => p.type === 'VP').length !== 1);
  if (unknown.length || badClause) {
    if (badClause && !unknown.length) {
      messages.push('This sentence could not be divided into clauses with exactly one verb each (for example, two verbs without a conjunction between them). Each word is analysed, but roles are not assigned.');
    }
    for (const p of phrases) p.role = null;
    return result;
  }
  result.supported = true;
  // Assign main clauses first so that a che-clause knows its governing verb.
  const ordered = [...clauses].sort((a, b) => (a.introducer ? 1 : 0) - (b.introducer ? 1 : 0));
  for (const c of ordered) {
    if (c.introducer && c.introducer.norm === 'che' && !c.relative) {
      const idx = clauses.indexOf(c);
      const gov = clauses.slice(0, idx).reverse().find((x) => x.verb);
      c.governor = Boolean(gov && SUBJUNCTIVE_GOVERNORS.has(String(gov.verb.lemma).split(' + ')[0]));
    }
    const r = assignClause(c, { messages, exclamation });
    Object.assign(c, r);
    const intro = c.introducer ? c.introducer.norm : null;
    c.kind = c.relative ? 'relative' : !intro || COORDINATORS.has(intro) ? 'main' : 'subordinate';
    if (c.introducer && c.introducerPhrase) {
      if (c.kind === 'relative') {
        if (intro === 'cui') c.introducerPhrase.role = 'relative pronoun cui after a preposition';
        else {
          // che is the subject of the relative verb unless the clause has its own subject
          const ante = c.antecedent ? nounPhraseInfo(c.antecedent.tokens, c.antecedent) : null;
          const agrees = ante && c.verb && ante.person === c.verb.personIndex;
          const ownSubject = (c.subject && c.subject.explicit) || (ante && c.verb && !agrees);
          c.introducerPhrase.role = ownSubject ? 'relative pronoun che (direct object of the relative verb)' : 'relative pronoun che (subject of the relative verb)';
        }
      } else c.introducerPhrase.role = c.kind === 'main' ? 'coordinating conjunction' : `subordinating conjunction (${intro})`;
    }
  }
  const main = clauses.find((c) => c.kind === 'main') || clauses[0];
  result.verb = main.verb;
  result.subject = main.subject;
  if (clauses.length > 1) {
    for (const c of clauses) {
      if (c.kind === 'relative') {
        result.relations.push({ clause: c, kind: 'relative', text: `Relative clause (${c.introducer.text} ${c.phrases.filter((p) => p.type === 'VP').map((p) => p.tokens.map((t) => t.text).join(' ')).join(' ')}): ${c.verb.tense}. A relative clause usually takes the indicative; the congiuntivo is used when the antecedent is hypothetical (cerco qualcuno che sappia…).` });
        continue;
      }
      if (c === main || c.kind !== 'subordinate') continue;
      const intro = c.introducer.norm;
      if (intro === 'se') {
        const h = classifyHypothetical(c.verb.tenseKey, main.verb.tenseKey);
        result.relations.push({
          clause: c,
          kind: 'hypothetical',
          text: h
            ? `${h.label}: ${h.text}`
            : `se-clause with ${c.verb.tense}; main clause with ${main.verb.tense}. This combination is not one of the patterns the analyser classifies.`
        });
        if (h && h.type === 'nonstandard') messages.push(h.text);
      } else {
        const rel = tenseRelation(main.verb.tenseKey, c.verb.tenseKey);
        const introNote = intro === 'che' ? 'che-clause' : `clause introduced by “${intro}”`;
        result.relations.push({
          clause: c,
          kind: 'sequence',
          text: `${introNote}: ${c.verb.tense}${rel ? ` — ${rel}` : ''} (main verb: ${main.verb.tense}).`
        });
      }
    }
  }
  for (const p of phrases) for (const t of p.tokens) if (!t.role && p.role) t.phraseRole = p.role;
  return result;
}

/** Plain-language summary line for one token. */
export function describeToken(t) {
  if (t.tag === 'UNKNOWN') return 'not in the dictionary — not analysed';
  if (t.tag === 'NAME') return t.note;
  if (!t.chosen) return t.analyses.length ? t.analyses.map((a) => a.description).join(' / ') : '';
  return t.chosen.description;
}

/* ------------------------------------------------------------------ */
/* Transformations                                                     */
/* ------------------------------------------------------------------ */

const FEMININE_COUNTERPART = {
  bambino: 'bambina',
  ragazzo: 'ragazza',
  amico: 'amica',
  nonno: 'nonna',
  zio: 'zia',
  figlio: 'figlia',
  re: 'regina',
  fratello: 'sorella',
  padre: 'madre',
  papà: 'mamma',
  cugino: 'cugina',
  maestro: 'maestra',
  uomo: 'donna',
  lui: 'lei'
};
const SINGULAR_FAMILY_NO_ARTICLE = new Set(['madre', 'padre', 'fratello', 'sorella', 'figlio', 'figlia', 'nonno', 'nonna', 'zio', 'zia', 'cugino', 'cugina', 'marito', 'moglie']);
const MASCULINE_COUNTERPART = Object.fromEntries(Object.entries(FEMININE_COUNTERPART).map(([m, f]) => [f, m]));

function capitaliseLike(original, replacement) {
  if (/^[A-ZÀ-Ý]/.test(original)) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  return replacement;
}

function wordRecord(tok) {
  return tok && tok.chosen && tok.chosen.wordId ? getWord(tok.chosen.wordId) : null;
}

/** Article form for a noun after it changes gender/number. */
function retagDeterminer(detTok, nounForm, gender, number) {
  const f = detTok.chosen;
  if (!f) return null;
  if (f.pos === 'definite article') return definiteArticle(nounForm, gender === 'feminine' ? 'f' : 'm', number === 'plural' ? 'pl' : 'sg');
  if (f.pos === 'indefinite article') {
    if (number === 'plural') return null; // un gatto -> (dei) gatti: not handled at this level
    return indefiniteArticle(nounForm, gender === 'feminine' ? 'f' : 'm');
  }
  if (f.pos === 'possessive' || f.pos === 'demonstrative') {
    const lemma = f.lemma;
    const table = {
      mio: { ms: 'mio', fs: 'mia', mp: 'miei', fp: 'mie' },
      tuo: { ms: 'tuo', fs: 'tua', mp: 'tuoi', fp: 'tue' },
      suo: { ms: 'suo', fs: 'sua', mp: 'suoi', fp: 'sue' },
      nostro: { ms: 'nostro', fs: 'nostra', mp: 'nostri', fp: 'nostre' },
      vostro: { ms: 'vostro', fs: 'vostra', mp: 'vostri', fp: 'vostre' },
      questo: { ms: 'questo', fs: 'questa', mp: 'questi', fp: 'queste' }
    }[lemma];
    if (!table) return null;
    return table[`${gender === 'feminine' ? 'f' : 'm'}${number === 'plural' ? 'p' : 's'}`];
  }
  return null;
}

function adjectiveForm(tok, gender, number) {
  const w = wordRecord(tok);
  if (!w || !w.forms) return null;
  return w.forms[`${gender === 'feminine' ? 'f' : 'm'}${number === 'plural' ? 'p' : 's'}`];
}

/** Rewrite one NP or PP's tokens to a new gender/number. Returns false if impossible. */
function inflectPhrase(phrase, { toNumber, toGender }, steps) {
  const toks = phrase.tokens;
  const noun = toks.find((t) => t.tag === 'NOUN');
  const subj = toks.find((t) => t.tag === 'SUBJ');
  if (subj) {
    if (toGender) {
      const map = toGender === 'feminine' ? FEMININE_COUNTERPART : MASCULINE_COUNTERPART;
      if (map[subj.norm]) {
        steps.push(`${subj.text} → ${map[subj.norm]}`);
        subj.text = capitaliseLike(subj.text, map[subj.norm]);
      }
    }
    if (toNumber === 'plural') {
      const plural = { io: 'noi', tu: 'voi', lui: 'loro', lei: 'loro' }[subj.norm];
      if (plural) {
        steps.push(`${subj.text} → ${plural}`);
        subj.text = capitaliseLike(subj.text, plural);
      }
    }
    return true;
  }
  if (!noun) return toks.every((t) => t.tag !== 'NAME') ? true : false;
  const w = wordRecord(noun);
  if (!w) return false;
  let gender = w.gender;
  let number = noun.chosen.features.number === 'plural' ? 'plural' : 'singular';
  let lemma = w.lemma;
  let record = w;
  if (toGender && toGender !== gender) {
    const map = toGender === 'feminine' ? FEMININE_COUNTERPART : MASCULINE_COUNTERPART;
    const other = map[lemma];
    if (!other) {
      steps.push(`“${lemma}” has no ${toGender} counterpart in the course vocabulary.`);
      return false;
    }
    record = lookupForm(other).map((a) => a.wordId && getWord(a.wordId)).find((x) => x && x.partOfSpeech === 'noun');
    if (!record) return false;
    gender = record.gender;
    lemma = record.lemma;
  }
  if (toNumber) number = toNumber;
  const newNoun = number === 'plural' ? record.plural : record.lemma;
  if (!newNoun) {
    steps.push(`“${lemma}” is not normally used in the plural.`);
    return false;
  }
  const effectiveGender = number === 'plural' && record.pluralGender ? record.pluralGender : gender;
  if (newNoun !== noun.norm) steps.push(`${noun.text} → ${newNoun}`);
  noun.text = capitaliseLike(noun.text, newNoun);
  noun.norm = newNoun;
  for (const t of toks) {
    if (t.tag === 'ADJ') {
      const form = adjectiveForm(t, effectiveGender, number);
      if (!form) return false;
      if (form !== t.norm) steps.push(`${t.text} → ${form} (agreement)`);
      t.text = capitaliseLike(t.text, form);
      t.norm = form;
    }
  }
  // Determiners are updated from right to left, because an article's form
  // depends on the word that follows it (il mio amico -> i miei amici).
  const dets = toks.filter((t) => t.tag === 'DET');
  for (let k = dets.length - 1; k >= 0; k--) {
    const det = dets[k];
    const following = toks[toks.indexOf(det) + 1];
    const art = retagDeterminer(det, following ? following.norm : newNoun, effectiveGender, number);
    if (!art) {
      steps.push(`Cannot change “${det.text}” automatically (for example, the plural of un is dei/degli/delle, which the course has not introduced yet).`);
      return false;
    }
    if (art !== det.norm) steps.push(`${det.text} → ${art}`);
    det.text = capitaliseLike(det.text, art);
    det.norm = art;
  }
  const aprep = toks.find((t) => t.tag === 'APREP');
  const firstAfter = toks[toks.indexOf(aprep) + 1] || noun;
  if (aprep) {
    const art = definiteArticle(firstAfter.norm, effectiveGender === 'feminine' ? 'f' : 'm', number === 'plural' ? 'pl' : 'sg');
    const form = articulatedPreposition(aprep.chosen.features.preposition, art);
    if (form !== aprep.norm) steps.push(`${aprep.text} → ${form} (${aprep.chosen.features.preposition} + ${art})`);
    aprep.text = capitaliseLike(aprep.text, form);
    aprep.norm = form;
  }
  phrase.gender = effectiveGender;
  phrase.number = number;
  return true;
}

function verbRecordFor(tok) {
  return wordRecord(tok);
}

function finalise(analysis, steps) {
  return { ok: true, result: detokenize(analysis.tokens), steps };
}

function fail(reason) {
  return { ok: false, reason };
}

function requireSupported(analysis) {
  if (!analysis.supported) {
    return fail(
      `This sentence is outside what the transformer supports (one simple clause, all words in the dictionary). ${analysis.messages.join(' ')}`
    );
  }
  if (analysis.clauses.length > 1) {
    return fail('Transformations work on one clause at a time. This sentence has several clauses; transform each clause separately.');
  }
  return null;
}

export function negate(text, opts) {
  const a = analyseSentence(text, opts);
  const bad = requireSupported(a);
  if (bad) return bad;
  const vp = a.phrases.find((p) => p.type === 'VP');
  const steps = [];
  const neg = vp.tokens.find((t) => t.tag === 'NEG');
  if (neg) {
    a.tokens.splice(a.tokens.indexOf(neg), 1);
    steps.push('Removed non: the sentence is now affirmative.');
    const first = a.tokens.find((t) => t.kind === 'word');
    if (first && /^[A-ZÀ-Ý]/.test(neg.text)) first.text = capitaliseLike('X', first.text);
  } else {
    const first = vp.tokens[0];
    const pos = a.tokens.indexOf(first);
    const atStart = a.tokens.findIndex((t) => t.kind === 'word') === pos;
    a.tokens.splice(pos, 0, { text: atStart ? 'Non' : 'non', kind: 'word', tag: 'NEG' });
    if (atStart) first.text = first.text.charAt(0).toLowerCase() + first.text.slice(1);
    steps.push('Inserted non immediately before the verb' + (vp.tokens[0].tag === 'CLITIC' ? ' and its object/reflexive pronoun' : '') + '.');
  }
  return finalise(a, steps);
}

function changeVerbPerson(vp, newPerson, steps, { gender = 'masculine' } = {}) {
  const finite = vp.tokens.find((t) => t.tag === 'VERB');
  const part = vp.tokens.find((t) => t.tag === 'PART');
  const rec = verbRecordFor(finite);
  if (!rec || !rec.present) return false;
  const tenseKey = finite.chosen.features.tenseKey;
  if (!tenseKey || tenseKey === 'imperativo') return false;
  const cell = conjugate(rec.lemma, tenseKey, { record: rec, isc: rec.isc ? true : undefined })[newPerson];
  const form = cell ? cell.split('/')[0] : null;
  if (!form) return false;
  const bare = form.replace(/^(mi|ti|si|ci|vi) /, '');
  if (bare !== finite.norm) steps.push(`${finite.text} → ${bare} (${PERSONS[newPerson]})`);
  finite.text = capitaliseLike(finite.text, bare);
  finite.norm = bare;
  const clitic = vp.tokens.find((t) => t.role === 'reflexive pronoun');
  if (clitic) {
    const pr = REFLEXIVE_PRONOUNS[newPerson];
    if (pr !== clitic.norm) steps.push(`${clitic.text} → ${pr} (reflexive pronoun follows the person)`);
    clitic.text = capitaliseLike(clitic.text, pr);
    clitic.norm = pr;
  }
  if (part && rec.lemma === 'essere') {
    const p = part.chosen && getWord(part.chosen.wordId);
    if (p && p.participle) {
      const agreed = agreeParticiple(p.participle, gender === 'feminine' ? 'f' : 'm', newPerson >= 3 ? 'pl' : 'sg');
      if (agreed !== part.norm) steps.push(`${part.text} → ${agreed} (participle agrees with the subject after essere)`);
      part.text = agreed;
      part.norm = agreed;
    }
  }
  return true;
}

export function toPlural(text, opts) {
  const a = analyseSentence(text, opts);
  const bad = requireSupported(a);
  if (bad) return bad;
  const steps = [];
  const vp = a.phrases.find((p) => p.type === 'VP');
  const p = a.verb.personIndex;
  if (p >= 3) return fail('The verb is already plural.');
  for (const ph of a.phrases) {
    if (ph.role === 'subject' || ph.role === 'predicate noun (complement of essere)') {
      const original = ph.tokens.map((t) => t.text).join(' ');
      if (!inflectPhrase(ph, { toNumber: 'plural' }, steps)) return fail(`Could not make this phrase plural: “${original}”. ${steps.slice(-1)[0] || ''}`);
      const first = ph.tokens[0];
      if (first.chosen && first.chosen.pos === 'possessive') {
        // mia sorella -> le mie sorelle: the article is omitted only with singular family nouns.
        const art = definiteArticle(first.norm, ph.gender === 'feminine' ? 'f' : 'm', 'pl');
        const capital = /^[A-ZÀ-Ý]/.test(first.text);
        a.tokens.splice(a.tokens.indexOf(first), 0, { text: capital ? art.charAt(0).toUpperCase() + art.slice(1) : art, kind: 'word' });
        if (capital) first.text = first.text.toLowerCase();
        steps.push(`Added the article ${art}: with family nouns the possessive drops the article only in the singular (mia sorella → le mie sorelle).`);
      }
    }
    if (ph.type === 'ADJP' && ph.role && ph.role.startsWith('predicate')) {
      const t = ph.tokens[0];
      const g = a.subject.gender || 'masculine';
      const form = adjectiveForm(t, g, 'plural');
      if (!form) return fail(`No plural form known for “${t.text}”.`);
      if (form !== t.norm) steps.push(`${t.text} → ${form} (agreement)`);
      t.text = form;
      t.norm = form;
    }
  }
  if (!changeVerbPerson(vp, p + 3, steps, { gender: a.subject.gender || 'masculine' })) return fail('No plural form of this verb is available.');
  steps.push('Only the subject, its agreeing words and the verb change; objects keep their number.');
  return finalise(a, steps);
}

export function toSingular(text, opts) {
  const a = analyseSentence(text, opts);
  const bad = requireSupported(a);
  if (bad) return bad;
  const steps = [];
  const vp = a.phrases.find((p) => p.type === 'VP');
  const p = a.verb.personIndex;
  if (p < 3) return fail('The verb is already singular.');
  for (const ph of a.phrases) {
    if (ph.role === 'subject' || ph.role === 'predicate noun (complement of essere)') {
      if (ph.pronoun) {
        const t = ph.tokens[0];
        const sing = { noi: 'io', voi: 'tu', loro: 'lui' }[t.norm];
        steps.push(`${t.text} → ${sing}`);
        t.text = capitaliseLike(t.text, sing);
        continue;
      }
      const original = ph.tokens.map((t) => t.text).join(' ');
      if (!inflectPhrase(ph, { toNumber: 'singular' }, steps)) return fail(`Could not make this phrase singular: “${original}”.`);
      const [d0, d1, d2] = ph.tokens;
      if (d0 && d1 && d2 && d0.chosen && d0.chosen.pos === 'definite article' && d1.chosen && d1.chosen.pos === 'possessive' && d1.chosen.lemma !== 'loro' && SINGULAR_FAMILY_NO_ARTICLE.has(d2.norm) && ph.tokens.length === 3) {
        const capital = /^[A-ZÀ-Ý]/.test(d0.text);
        a.tokens.splice(a.tokens.indexOf(d0), 1);
        if (capital) d1.text = d1.text.charAt(0).toUpperCase() + d1.text.slice(1);
        steps.push(`Removed the article: a possessive before a singular family noun takes no article (mia sorella, mio padre).`);
      }
    }
    if (ph.type === 'ADJP' && ph.role && ph.role.startsWith('predicate')) {
      const t = ph.tokens[0];
      const form = adjectiveForm(t, a.subject.gender || 'masculine', 'singular');
      if (!form) return fail(`No singular form known for “${t.text}”.`);
      if (form !== t.norm) steps.push(`${t.text} → ${form} (agreement)`);
      t.text = form;
      t.norm = form;
    }
  }
  if (!changeVerbPerson(vp, p - 3, steps, { gender: a.subject.gender || 'masculine' })) return fail('No singular form of this verb is available.');
  return finalise(a, steps);
}

export function toFeminine(text, opts) {
  return switchGender(text, 'feminine', opts);
}
export function toMasculine(text, opts) {
  return switchGender(text, 'masculine', opts);
}

function switchGender(text, toGender, opts) {
  const a = analyseSentence(text, opts);
  const bad = requireSupported(a);
  if (bad) return bad;
  const steps = [];
  const subj = a.phrases.find((p) => p.role === 'subject');
  if (!subj) return fail('There is no explicit subject to change. Write the subject (for example il bambino or lui) first.');
  const before = steps.length;
  if (!inflectPhrase(subj, { toGender }, steps)) return fail(steps.slice(-1)[0] || 'This subject cannot change gender.');
  if (steps.length === before) return fail(`The subject is already ${toGender}, or it has no ${toGender} counterpart.`);
  const number = subj.number || a.subject.number;
  for (const ph of a.phrases) {
    if (ph.type === 'ADJP' && ph.role && ph.role.startsWith('predicate')) {
      const t = ph.tokens[0];
      const form = adjectiveForm(t, toGender, number);
      if (form && form !== t.norm) {
        steps.push(`${t.text} → ${form} (agreement)`);
        t.text = form;
        t.norm = form;
      }
    }
  }
  const vp = a.phrases.find((p) => p.type === 'VP');
  const part = vp.tokens.find((t) => t.tag === 'PART');
  const finite = vp.tokens.find((t) => t.tag === 'VERB');
  if (part && finite.chosen.lemma === 'essere') {
    const w = getWord(part.chosen.wordId);
    const agreed = agreeParticiple(w.participle, toGender === 'feminine' ? 'f' : 'm', number === 'plural' ? 'pl' : 'sg');
    if (agreed !== part.norm) steps.push(`${part.text} → ${agreed} (participle agrees with the subject after essere)`);
    part.text = agreed;
  }
  return finalise(a, steps);
}

export function toggleSubjectPronoun(text, opts) {
  const a = analyseSentence(text, opts);
  const bad = requireSupported(a);
  if (bad) return bad;
  const steps = [];
  const subj = a.phrases.find((p) => p.role === 'subject');
  if (subj && subj.pronoun) {
    const t = subj.tokens[0];
    const i = a.tokens.indexOf(t);
    const capital = /^[A-ZÀ-Ý]/.test(t.text);
    a.tokens.splice(i, 1);
    if (capital) {
      const next = a.tokens.slice(i).find((x) => x.kind === 'word');
      if (next) next.text = next.text.charAt(0).toUpperCase() + next.text.slice(1);
    }
    steps.push(`Removed the subject pronoun “${t.text}”: the verb ending already shows the person.`);
    return finalise(a, steps);
  }
  if (subj) return fail('The subject is a noun phrase, not a pronoun; there is no pronoun to add or remove.');
  if (!a.subject || a.subject.explicit) return fail('No omitted subject found.');
  const p = a.verb.personIndex;
  const pronoun = ['io', 'tu', 'lui', 'noi', 'voi', 'loro'][p];
  const vp = a.phrases.find((x) => x.type === 'VP');
  const first = vp.tokens[0];
  const i = a.tokens.indexOf(first);
  const atStart = a.tokens.findIndex((t) => t.kind === 'word') === i;
  a.tokens.splice(i, 0, { text: atStart ? pronoun.charAt(0).toUpperCase() + pronoun.slice(1) : pronoun, kind: 'word' });
  if (atStart) first.text = first.text.charAt(0).toLowerCase() + first.text.slice(1);
  steps.push(
    p === 2
      ? 'Added lui (he). The same verb form also works with lei (she) or a noun subject; Italian adds the pronoun only for emphasis or contrast.'
      : `Added the subject pronoun ${pronoun}. This adds emphasis or contrast; it is not needed for meaning.`
  );
  return finalise(a, steps);
}

/** Present → passato prossimo (avere or essere + participle with agreement). */
export function toPassatoProssimo(text, opts) {
  const a = analyseSentence(text, opts);
  const bad = requireSupported(a);
  if (bad) return bad;
  const vp = a.phrases.find((p) => p.type === 'VP');
  const finite = vp.tokens.find((t) => t.tag === 'VERB');
  if (vp.tokens.some((t) => t.tag === 'PART' || t.tag === 'INF')) return fail('Only simple present-tense verbs (no compound or modal verbs) are converted.');
  if (finite.chosen.features.tenseKey !== 'presente') return fail('The verb is not in the present indicative.');
  const rec = verbRecordFor(finite);
  if (!rec) return fail('This verb is not in the course dictionary.');
  const p = finite.chosen.features.personIndex;
  const reflexive = a.verb.reflexive || rec.reflexive;
  const aux = reflexive ? 'essere' : rec.auxiliary;
  const auxForm = irregularData(aux).present[p];
  const gender = a.subject.gender === 'feminine' ? 'f' : 'm';
  const number = p >= 3 ? 'pl' : 'sg';
  const part = aux === 'essere' ? agreeParticiple(rec.participle, gender, number) : rec.participle;
  const steps = [
    `${rec.lemma} takes ${aux} in compound tenses${reflexive ? ' (all reflexive verbs do)' : ''}.`,
    `${aux} → ${auxForm} (${PERSONS[p]}, present).`,
    `Past participle of ${rec.lemma}: ${rec.participle}${rec.irregularForms && rec.irregularForms.some((f) => f.startsWith('participle')) ? ' (irregular)' : ''}.`
  ];
  if (aux === 'essere') steps.push(`With essere the participle agrees with the subject: ${part}${a.subject.gender ? '' : ' (masculine assumed — the subject’s gender is not visible)'}.`);
  const idx = a.tokens.indexOf(finite);
  const capital = /^[A-ZÀ-Ý]/.test(finite.text);
  a.tokens.splice(idx, 1, { text: capital ? auxForm.charAt(0).toUpperCase() + auxForm.slice(1) : auxForm, kind: 'word' }, { text: part, kind: 'word' });
  // object pronoun lo/la before avere elides: lo ho -> l'ho
  const prevTok = a.tokens[idx - 1];
  const objClitic = vp.tokens.find((t) => t.tag === 'CLITIC' && ['lo', 'la', 'li', 'le'].includes(t.norm) && t.role === 'object pronoun');
  if (objClitic && aux === 'avere') {
    const agr = { lo: ['m', 'sg'], la: ['f', 'sg'], li: ['m', 'pl'], le: ['f', 'pl'] }[objClitic.norm];
    const agreed = agreeParticiple(rec.participle, agr[0], agr[1]);
    a.tokens[idx + 1].text = agreed;
    steps.push(`With a direct object pronoun (${objClitic.norm}) before avere, the participle agrees with it: ${agreed}.`);
  }
  if (prevTok && (prevTok.norm === 'lo' || prevTok.norm === 'la') && prevTok.tag === 'CLITIC' && /^h/.test(auxForm)) {
    prevTok.text = prevTok.text.slice(0, 1) + "'";
    steps.push("lo and la elide before forms of avere beginning with h: l'ho, l'hai, l'ha, l'hanno.");
  }
  return finalise(a, steps);
}

/** Present indicative → another simple tense of the indicative or conditional. */
function toSimpleTense(targetKey) {
  return (text, opts) => {
    const a = analyseSentence(text, opts);
    const bad = requireSupported(a);
    if (bad) return bad;
    const vp = a.phrases.find((p) => p.type === 'VP');
    const finite = vp.tokens.find((t) => t.tag === 'VERB');
    if (vp.tokens.some((t) => ['PART', 'INF', 'GER'].includes(t.tag))) return fail('Only simple (one-word) verb forms are converted.');
    if (finite.chosen.features.tenseKey !== 'presente') return fail('The verb is not in the present indicative.');
    const rec = verbRecordFor(finite);
    if (!rec) return fail('This verb is not in the course dictionary.');
    const p = finite.chosen.features.personIndex;
    const cell = conjugate(rec.lemma, targetKey, { record: rec, isc: rec.isc ? true : undefined })[p];
    if (!cell) return fail('This person has no form in that tense.');
    const variants = cell.split('/').map((x) => x.replace(/^(mi|ti|si|ci|vi) /, ''));
    const form = variants[0];
    const info = tenseInfo(targetKey);
    const steps = [`${finite.text} → ${form} (${info.mood} ${info.label}, ${PERSONS[p]})`];
    if (variants.length > 1) steps.push(`Also correct: ${variants.slice(1).join(', ')}.`);
    if (targetKey === 'imperfetto' && irregularData(rec.lemma) && irregularData(rec.lemma).imperfect) steps.push(`${rec.lemma} has an irregular imperfetto stem.`);
    steps.push(info.summary);
    finite.text = capitaliseLike(finite.text, form);
    return finalise(a, steps);
  };
}

export const toImperfetto = toSimpleTense('imperfetto');
export const toFuturo = toSimpleTense('futuro');
export const toCondizionale = toSimpleTense('condizionale');
export const toPassatoRemoto = toSimpleTense('passatoRemoto');

export const TRANSFORMATIONS = [
  { id: 'negate', label: 'Affirmative ↔ negative', fn: negate },
  { id: 'plural', label: 'Singular → plural', fn: toPlural },
  { id: 'singular', label: 'Plural → singular', fn: toSingular },
  { id: 'feminine', label: 'Masculine → feminine subject', fn: toFeminine },
  { id: 'masculine', label: 'Feminine → masculine subject', fn: toMasculine },
  { id: 'pronoun', label: 'Add / remove subject pronoun', fn: toggleSubjectPronoun },
  { id: 'passato', label: 'Present → passato prossimo', fn: toPassatoProssimo },
  { id: 'imperfetto', label: 'Present → imperfetto', fn: toImperfetto },
  { id: 'passato-remoto', label: 'Present → passato remoto', fn: toPassatoRemoto },
  { id: 'futuro', label: 'Present → futuro', fn: toFuturo },
  { id: 'condizionale', label: 'Present → condizionale', fn: toCondizionale }
];

export { withArticle };
