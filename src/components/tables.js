/**
 * Grammatical tables: conjugation paradigms (with stem/ending and
 * irregularity highlighting), side-by-side comparisons, articulated
 * prepositions and generic tables from lesson data.
 */
import { h, rich } from './dom.js';
import { PERSONS, splitInfinitive, baseInfinitive, articulatedTable, ARTICLE_ORDER, isIrregular } from '../grammar/grammar-engine.js';
import {
  TENSES,
  MOODS,
  IMPERATIVE_PERSONS,
  FUTURE_ENDINGS,
  CONDITIONAL_ENDINGS,
  conjugate,
  tenseInfo,
  fullTenseLabel,
  normaliseTenseKey,
  irregularCells,
  displayCell,
  futureStem,
  passatoRemotoNote,
  imperativoNegativoTu,
  nonFinite
} from '../grammar/verb-system.js';

/* ------------------------------------------------------------------ */
/* English glosses for the present tense                                */
/* ------------------------------------------------------------------ */

const SPECIAL_ENGLISH = {
  essere: ['I am', 'you are', 'he/she is', 'we are', 'you (pl.) are', 'they are'],
  avere: ['I have', 'you have', 'he/she has', 'we have', 'you (pl.) have', 'they have'],
  potere: ['I can', 'you can', 'he/she can', 'we can', 'you (pl.) can', 'they can'],
  dovere: ['I must', 'you must', 'he/she must', 'we must', 'you (pl.) must', 'they must'],
  piacere: ['I please', 'you please', 'he/she/it pleases', 'we please', 'you (pl.) please', 'they please'],
  chiamarsi: ['I am called', 'you are called', 'he/she is called', 'we are called', 'you (pl.) are called', 'they are called'],
  sapere: ['I know', 'you know', 'he/she knows', 'we know', 'you (pl.) know', 'they know'],
  piovere: [null, null, 'it rains', null, null, 'they rain (pour down)'],
  nevicare: [null, null, 'it snows', null, null, null]
};
const SUBJECTS = ['I', 'you', 'he/she', 'we', 'you (pl.)', 'they'];

function thirdPerson(verb) {
  if (verb === 'have') return 'has';
  if (/(s|sh|ch|x|z|o)$/.test(verb)) return `${verb}es`;
  if (/[^aeiou]y$/.test(verb)) return `${verb.slice(0, -1)}ies`;
  return `${verb}s`;
}

/** English gloss of a present-tense form, or null if not derivable. */
export function englishPresent(word, i) {
  const special = SPECIAL_ENGLISH[baseInfinitive(word.lemma).base] || SPECIAL_ENGLISH[word.lemma];
  if (special) return special[i];
  const first = String(word.meaning).split(';')[0].trim();
  const m = /^to\s+(.+)$/.exec(first);
  if (!m) return null;
  const words = m[1].replace(/\s*\(.*?\)\s*/g, ' ').trim().split(/\s+/);
  if (i === 2) words[0] = thirdPerson(words[0]);
  return `${SUBJECTS[i]} ${words.join(' ')}`;
}

/* ------------------------------------------------------------------ */
/* Paradigms                                                           */
/* ------------------------------------------------------------------ */

function formsFor(word, tense, gender) {
  const key = normaliseTenseKey(tense);
  if (key === 'presente' && word.present) return word.present;
  if (key === 'imperfetto' && word.imperfect) return word.imperfect;
  return conjugate(word.lemma, key, { gender: gender || 'm', record: word, isc: word.isc ? true : undefined });
}

/** Split a conjugated form into [prefix (pronouns), stem, ending] for highlighting. */
function splitForm(form, stem) {
  const m = /^((?:(?:mi|ti|si|ci|vi) )?)(.*)$/.exec(form);
  const pre = m[1];
  const body = m[2];
  if (stem && body.startsWith(stem) && body.length > stem.length) return [pre, stem, body.slice(stem.length)];
  if (stem && body.startsWith(`${stem}h`)) return [pre, stem, body.slice(stem.length)];
  if (stem && stem.endsWith('i') && body.startsWith(stem.slice(0, -1))) return [pre, stem.slice(0, -1), body.slice(stem.length - 1)];
  return [pre, body, ''];
}

function caption(word, key, opts) {
  const info = tenseInfo(key);
  const label = info ? fullTenseLabel(info) : key;
  const aux = word.reflexive ? 'essere' : word.auxiliary;
  let extra = '';
  if (info && info.aux) {
    const agrees = aux === 'essere';
    extra = ` (with ${aux}${agrees ? (opts.gender === 'f' ? ', feminine subject' : ', masculine subject') : ''})`;
  }
  return opts.caption || (opts.compact ? `${label}${extra}` : `${word.lemma} — ${word.meaning} · ${label}${extra}`);
}

/**
 * opts: { highlightEndings, gender: 'm'|'f', caption, showEnglish, compact }
 * `tense` may be any key of TENSES (presente, futuro, congiuntivoPresente…)
 * or one of the older keys present / imperfect / passato.
 */
export function renderParadigm(word, tense = 'presente', opts = {}) {
  const key = normaliseTenseKey(tense);
  const info = tenseInfo(key);
  const forms = formsFor(word, key, opts.gender);
  const split = splitInfinitive(word.lemma);
  const irregular = info && !info.aux ? irregularCells(word.lemma, key) : forms.map(() => false);
  const showEnglish = opts.showEnglish !== false && key === 'presente' && !opts.compact;
  const stem = split ? split.stem : '';
  const anyIrregular = irregular.some(Boolean);
  const persons = key === 'imperativo' ? IMPERATIVE_PERSONS : PERSONS;
  const highlight = opts.highlightEndings && ['presente', 'imperfetto', 'futuro', 'condizionale', 'passatoRemoto', 'congiuntivoPresente', 'congiuntivoImperfetto'].includes(key);

  const rows = forms
    .map((form, i) => {
      if (key === 'imperativo' && i === 0) return null;
      let cell;
      if (!form) cell = h('td', { class: 'paradigm__form muted' }, '—');
      else if (highlight && !irregular[i] && !['futuro', 'condizionale'].includes(key)) {
        const variants = form.split('/').map((f) => splitForm(f, stem));
        cell = h(
          'td',
          { class: 'paradigm__form', lang: 'it' },
          variants.map(([pre, st, end], k) => [k ? ' / ' : '', pre, st, end ? h('b', { class: 'ending' }, end) : null])
        );
      } else if (highlight && !irregular[i] && ['futuro', 'condizionale'].includes(key)) {
        const ends = key === 'futuro' ? FUTURE_ENDINGS : CONDITIONAL_ENDINGS;
        const variants = form.split('/').map((f) => {
          const m = /^((?:(?:mi|ti|si|ci|vi) )?)(.*)$/.exec(f);
          const e = ends[i];
          return [m[1], m[2].slice(0, -e.length), e];
        });
        cell = h('td', { class: 'paradigm__form', lang: 'it' }, variants.map(([pre, st, end], k) => [k ? ' / ' : '', pre, st, h('b', { class: 'ending' }, end)]));
      } else {
        cell = h(
          'td',
          { class: ['paradigm__form', irregular[i] && 'is-irregular'], lang: 'it', title: irregular[i] ? 'irregular form' : null },
          displayCell(form),
          irregular[i] ? h('span', { class: 'sr-only' }, ' (irregular)') : null
        );
      }
      return h('tr', {}, h('th', { scope: 'row', lang: 'it' }, persons[i]), cell, showEnglish ? h('td', { class: 'paradigm__en' }, (form && englishPresent(word, i)) || '') : null);
    })
    .filter(Boolean);

  const notes = [];
  if (highlight && split && !isIrregular(word.lemma) && !anyIrregular)
    notes.push(h('span', {}, 'Stem ', h('span', { lang: 'it' }, key === 'futuro' || key === 'condizionale' ? `${futureStem(word.lemma)}-` : `${stem}-`), ' + ', h('b', { class: 'ending' }, 'ending'), '.'));
  if (anyIrregular) notes.push(h('span', {}, h('span', { class: 'legend-irregular' }, 'Highlighted'), ' forms differ from the regular pattern of the infinitive’s family.'));
  if (forms.some((f) => f && f.includes('/'))) notes.push(h('span', {}, 'Where two forms are given, both are standard.'));
  if (key === 'passatoRemoto' && passatoRemotoNote(word.lemma)) notes.push(h('span', {}, passatoRemotoNote(word.lemma)));
  if (key === 'imperativo') {
    const neg = imperativoNegativoTu(word.lemma);
    if (neg) notes.push(h('span', {}, 'Negative tu: ', h('span', { lang: 'it' }, displayCell(neg)), '. Lei and Loro are the congiuntivo forms.'));
    else notes.push(h('span', {}, 'This verb has no imperative in normal use.'));
  }

  return h(
    'figure',
    { class: ['paradigm', opts.compact && 'paradigm--compact'] },
    h(
      'table',
      { class: 'table table--paradigm' },
      h('caption', {}, caption(word, key, opts)),
      opts.compact ? null : h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Person'), h('th', { scope: 'col' }, 'Form'), showEnglish ? h('th', { scope: 'col' }, 'English') : null)),
      h('tbody', {}, rows)
    ),
    notes.length ? h('figcaption', { class: 'paradigm__notes' }, notes) : null
  );
}

/** The complete conjugation of a verb, grouped by mood. opts: { gender } */
export function renderConjugationSet(word, opts = {}) {
  const groups = MOODS.map((mood) => ({ mood, tenses: TENSES.filter((t) => t.mood === mood) }));
  const nf = nonFinite(word.lemma, { gender: opts.gender, record: word });
  return h(
    'div',
    { class: 'conjugation-set' },
    groups.map((g) =>
      h(
        'section',
        { class: 'conjugation-set__mood' },
        h('h3', {}, g.mood),
        h('div', { class: 'paradigm-grid paradigm-grid--compact' }, g.tenses.map((t) => renderParadigm(word, t.key, { compact: true, gender: opts.gender, highlightEndings: opts.highlightEndings })))
      )
    ),
    h(
      'section',
      { class: 'conjugation-set__mood' },
      h('h3', {}, 'forme non finite'),
      h(
        'table',
        { class: 'table table--small' },
        h(
          'tbody',
          {},
          [
            ['infinito presente', nf.infinito],
            ['infinito passato', nf.infinitoPassato],
            ['gerundio presente', nf.gerundio],
            ['gerundio passato', nf.gerundioPassato],
            ['participio passato', nf.participioPassato]
          ].map(([l, f]) => h('tr', {}, h('th', { scope: 'row' }, l), h('td', { lang: 'it' }, displayCell(f))))
        )
      )
    )
  );
}

/** Two or more verbs side by side in one tense. */
export function renderComparison(words, tense = 'presente') {
  const key = normaliseTenseKey(tense);
  const info = tenseInfo(key);
  const forms = words.map((w) => formsFor(w, key));
  const masks = words.map((w) => (info && !info.aux ? irregularCells(w.lemma, key) : [false, false, false, false, false, false]));
  const persons = key === 'imperativo' ? IMPERATIVE_PERSONS : PERSONS;
  return h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      { class: 'table table--compare' },
      h('caption', {}, `${words.map((w) => w.lemma).join(' · ')} — ${info ? fullTenseLabel(info) : key}`),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Person'), words.map((w) => h('th', { scope: 'col', lang: 'it' }, w.lemma)))),
      h(
        'tbody',
        {},
        persons
          .map((p, i) => (p === null ? null : h('tr', {}, h('th', { scope: 'row', lang: 'it' }, p), words.map((w, k) => h('td', { lang: 'it', class: masks[k][i] ? 'is-irregular' : null }, displayCell(forms[k][i]))))))
          .filter(Boolean)
      )
    )
  );
}

/** Overview of the whole verb system: every tense with its formation and use. */
export function renderTenseOverview({ example = null, lessonLink = (id) => `lesson.html?id=${id}` } = {}) {
  const sample = example || { lemma: 'parlare', meaning: 'to speak', auxiliary: 'avere', present: null };
  const sample2 = { lemma: 'andare', meaning: 'to go', auxiliary: 'essere' };
  return h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      { class: 'table table--overview' },
      h('caption', {}, 'The Italian verb system'),
      h('thead', {}, h('tr', {}, ['Mood', 'Tense', 'parlare (io)', 'andare (io)', 'Main use', 'Level', 'Lesson'].map((c) => h('th', { scope: 'col' }, c)))),
      h(
        'tbody',
        {},
        TENSES.map((t) => {
          const person = t.key === 'imperativo' ? 1 : 0;
          const f1 = conjugate(sample.lemma, t.key, { record: sample })[person];
          const f2 = conjugate(sample2.lemma, t.key, { record: sample2 })[person];
          return h(
            'tr',
            {},
            h('td', {}, t.mood),
            h('th', { scope: 'row', lang: 'it' }, t.label, t.aux ? h('span', { class: 'muted small' }, ' (compound)') : null),
            h('td', { lang: 'it' }, `${displayCell(f1)}${t.key === 'imperativo' ? ' (tu)' : ''}`),
            h('td', { lang: 'it' }, `${displayCell(f2)}${t.key === 'imperativo' ? ' (tu)' : ''}`),
            h('td', { class: 'small' }, t.summary),
            h('td', {}, t.level),
            h('td', {}, h('a', { href: lessonLink(t.lesson) }, 'Lesson'))
          );
        })
      )
    )
  );
}

export function renderArticulatedTable() {
  const rows = articulatedTable();
  return h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      { class: 'table table--grid' },
      h('caption', {}, 'Preposition + definite article'),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, ''), ARTICLE_ORDER.map((a) => h('th', { scope: 'col', lang: 'it' }, a)))),
      h('tbody', {}, rows.map((r) => h('tr', {}, h('th', { scope: 'row', lang: 'it' }, r.prep), r.forms.map((f) => h('td', { lang: 'it' }, f)))))
    )
  );
}

/** A table block from lesson data: { caption, headers, rows } (cells may use *inline* formatting). */
export function renderDataTable(block) {
  return h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      { class: 'table' },
      block.caption ? h('caption', {}, block.caption) : null,
      h('thead', {}, h('tr', {}, block.headers.map((c) => h('th', { scope: 'col' }, c)))),
      h('tbody', {}, block.rows.map((row) => h('tr', {}, row.map((c, i) => (i === 0 ? rich('th', String(c), { scope: 'row' }) : rich('td', String(c)))))))
    )
  );
}
