import { h, clear, rich, append } from '../components/dom.js';
import { icon } from '../components/icons.js';
import { pageHeader } from '../components/page-layout.js';
import { renderParadigm, renderComparison, renderArticulatedTable, renderConjugationSet, renderTenseOverview } from '../components/tables.js';
import { TENSES, fullTenseLabel } from '../grammar/verb-system.js';
import { openWordModal, openTokenModal, speakButton } from '../components/word-detail.js';
import { renderBlock } from './lesson.js';
import { getStore } from '../core/storage.js';
import { getParam, getHash, setHash } from '../core/router.js';
import { pageUrl } from '../core/pages.js';
import { searchLessons, lessonFacets } from '../core/search.js';
import { KNOWN_TRANSLATIONS, ANALYSER_SAMPLES } from '../core/data-loader.js';
import { allWords, getWord, displayLemma, lookupForm } from '../vocabulary/dictionary.js';
import { analyseSentence, describeToken, TRANSFORMATIONS } from '../grammar/sentence-analysis.js';
import { definiteArticle, indefiniteArticle, pluralise, withArticle, explainDefiniteArticle, PERSONS } from '../grammar/grammar-engine.js';

export function context() {
  return { title: 'Grammar' };
}

const TABS = [
  { id: 'reference', label: 'Reference' },
  { id: 'system', label: 'Tenses & moods' },
  { id: 'verbs', label: 'Verb tables' },
  { id: 'compare', label: 'Comparisons' },
  { id: 'nouns', label: 'Nouns & articles' },
  { id: 'analyser', label: 'Sentence analyser' }
];

export function render(main) {
  append(main, pageHeader('Grammar', 'A reference you can use independently of the course: rules, paradigms, comparisons, and a sentence analyser for the forms the course knows.'));
  const tablist = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Grammar sections' });
  const panel = h('div', { class: 'tab-panel', role: 'tabpanel', tabindex: '0' });
  const buttons = TABS.map((t) =>
    h('button', { type: 'button', role: 'tab', id: `tab-${t.id}`, 'aria-controls': 'grammar-panel', class: 'tab', onclick: () => select(t.id, true) }, t.label)
  );
  panel.id = 'grammar-panel';
  append(tablist, ...buttons);
  tablist.addEventListener('keydown', (e) => {
    const i = buttons.indexOf(document.activeElement);
    if (i < 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const j = (i + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[j].focus();
      select(TABS[j].id, true);
    }
  });

  function select(id, updateHash) {
    const tab = TABS.find((t) => t.id === id) || TABS[0];
    buttons.forEach((b, i) => {
      const on = TABS[i].id === tab.id;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      b.classList.toggle('is-active', on);
    });
    panel.setAttribute('aria-labelledby', `tab-${tab.id}`);
    clear(panel);
    ({ reference: referenceView, system: systemView, verbs: verbsView, compare: compareView, nouns: nounsView, analyser: analyserView })[tab.id](panel);
    if (updateHash) setHash(tab.id);
  }

  append(main, tablist, panel);
  const initial = getHash() || (getParam('s') ? 'analyser' : getParam('verb') ? 'verbs' : 'reference');
  select(initial, false);
  window.addEventListener?.('hashchange', () => select(getHash(), false));
}

/* ------------------------------------------------------------------ */
/* Reference                                                           */
/* ------------------------------------------------------------------ */

function filterSelect(label, options, value, onchange) {
  const id = `f-${label.replace(/\W+/g, '-').toLowerCase()}`;
  const el = h('select', { id, class: 'input', onchange: (e) => onchange(e.target.value) }, h('option', { value: '' }, 'All'), options.map((o) => h('option', { value: o, selected: o === value }, o)));
  return h('div', { class: 'field' }, h('label', { for: id }, label), el);
}

function referenceView(panel) {
  const facets = lessonFacets();
  const filters = { query: '', pos: '', topic: '', tense: '', family: '', level: '' };
  const focusLesson = getParam('lesson');
  const results = h('div', { class: 'reference-results' });
  const count = h('p', { class: 'muted', 'aria-live': 'polite' });
  const search = h('input', { type: 'search', class: 'input', id: 'ref-search', placeholder: 'e.g. articles, imperfetto, lo/gli, agreement…', oninput: (e) => { filters.query = e.target.value; paint(); } });
  const form = h(
    'div',
    { class: 'filters' },
    h('div', { class: 'field field--wide' }, h('label', { for: 'ref-search' }, 'Search topics'), search),
    filterSelect('Part of speech', facets.pos, '', (v) => { filters.pos = v; paint(); }),
    filterSelect('Topic', facets.topics, '', (v) => { filters.topic = v; paint(); }),
    filterSelect('Tense', facets.tenses, '', (v) => { filters.tense = v; paint(); }),
    filterSelect('Conjugation family', facets.families, '', (v) => { filters.family = v; paint(); }),
    filterSelect('Level', facets.levels, '', (v) => { filters.level = v; paint(); })
  );
  function paint() {
    const list = searchLessons(filters);
    count.textContent = `${list.length} topic${list.length === 1 ? '' : 's'}`;
    clear(results);
    if (!list.length) append(results, h('p', { class: 'empty-state__text' }, 'No topics match these filters.'));
    for (const l of list) {
      const details = h('details', { class: 'ref-topic', id: `ref-${l.id}`, open: l.id === focusLesson });
      const body = h('div', { class: 'ref-topic__body' });
      append(details, 
        h('summary', {}, h('span', { class: 'ref-topic__title' }, l.title), h('span', { class: 'muted small' }, ` · Module ${l.moduleNumber} · ${l.level}`)),
        body
      );
      const fill = () => {
        if (body.childNodes.length) return;
        append(body, 
          h('ul', { class: 'bullets' }, l.summary.map((s) => rich('li', s))),
          ...l.sections.map((s) => h('section', {}, h('h3', {}, s.heading), s.blocks.map(renderBlock))),
          h('p', {}, h('a', { class: 'btn btn--ghost', href: pageUrl('lesson', { id: l.id }) }, 'Open the full lesson with exercises'))
        );
      };
      details.addEventListener('toggle', () => details.open && fill());
      if (details.open) fill();
      append(results, details);
    }
  }
  append(panel, form, count, results);
  paint();
  if (focusLesson) setTimeout(() => document.getElementById(`ref-${focusLesson}`)?.scrollIntoView?.({ block: 'start' }), 0);
}

/* ------------------------------------------------------------------ */
/* Tenses and moods                                                    */
/* ------------------------------------------------------------------ */

function systemView(panel) {
  const relRows = [
    ['present / future / imperative', 'congiuntivo presente', 'congiuntivo passato', 'congiuntivo presente or futuro', 'Penso che parta / sia partito / partirà.'],
    ['past (passato prossimo, imperfetto, passato remoto, trapassato)', 'congiuntivo imperfetto', 'congiuntivo trapassato', 'condizionale passato', 'Pensavo che partisse / fosse partito / sarebbe partito.'],
    ['condizionale (vorrei, preferirei…)', 'congiuntivo imperfetto', 'congiuntivo trapassato', 'congiuntivo imperfetto', 'Vorrei che tu venissi. Avrei voluto che tu fossi venuto.']
  ];
  const hypRows = [
    ['realtà', 'se + indicativo', 'indicativo / imperativo', 'Se piove, resto a casa.'],
    ['possibilità', 'se + congiuntivo imperfetto', 'condizionale presente', 'Se avessi tempo, leggerei di più.'],
    ['irrealtà (passato)', 'se + congiuntivo trapassato', 'condizionale passato', 'Se fossi partito prima, sarei arrivato in tempo.'],
    ['irrealtà (mista)', 'se + congiuntivo trapassato', 'condizionale presente', 'Se avessi studiato, ora sarei più tranquillo.'],
    ['colloquiale (informal)', 'se + imperfetto', 'imperfetto', 'Se lo sapevo, venivo. (speech; not used in formal writing)']
  ];
  const table = (caption, headers, rows) =>
    h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('caption', {}, caption), h('thead', {}, h('tr', {}, headers.map((x) => h('th', { scope: 'col' }, x)))), h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c, i) => (i === r.length - 1 ? h('td', { lang: 'it' }, c) : h('td', {}, c))))))));
  append(
    panel,
    h('section', {}, h('h2', {}, 'Moods and tenses'), h('p', { class: 'muted' }, 'Four finite moods (indicativo, congiuntivo, condizionale, imperativo) and three non-finite ones (infinito, gerundio, participio). Every compound tense is the corresponding simple tense of avere or essere plus the past participle. The level column is an approximate teaching order, not a statement about frequency.'), renderTenseOverview()),
    h('section', {}, h('h2', {}, 'Sequence of tenses (concordanza dei tempi)'), h('p', { class: 'muted' }, 'In a subordinate clause that requires the congiuntivo, the tense depends on the main verb and on whether the subordinate action is simultaneous, earlier or later.'), table('Choosing the subordinate tense', ['Main verb', 'Simultaneous', 'Earlier', 'Later', 'Example'], relRows), h('p', {}, h('a', { href: pageUrl('lesson', { id: 'concordanza-dei-tempi' }) }, 'Lesson: sequence of tenses'))),
    h('section', {}, h('h2', {}, 'Hypothetical sentences (periodo ipotetico)'), table('Types', ['Type', 'se-clause (protasi)', 'Main clause (apodosi)', 'Example'], hypRows), h('p', { class: 'note' }, 'The conditional is not used in the se-clause in standard Italian (se avrei is nonstandard). The double imperfetto is common in conversation but belongs to an informal register.'), h('p', {}, h('a', { href: pageUrl('lesson', { id: 'periodo-ipotetico' }) }, 'Lesson: hypothetical sentences')))
  );
}

/* ------------------------------------------------------------------ */
/* Verb tables                                                         */
/* ------------------------------------------------------------------ */

function verbList() {
  return allWords(getStore().get().vocabulary.custom).filter((w) => w.partOfSpeech === 'verb').sort((a, b) => a.lemma.localeCompare(b.lemma, 'it'));
}

function verbPicker(id, initial, onPick) {
  const verbs = verbList();
  const listId = `${id}-list`;
  const input = h('input', { class: 'input', id, list: listId, value: initial || '', placeholder: 'Type an infinitive…', autocomplete: 'off', lang: 'it' });
  const datalist = h('datalist', { id: listId }, verbs.map((v) => h('option', { value: v.lemma }, v.meaning)));
  const choose = () => {
    const v = verbs.find((x) => x.lemma === input.value.trim().toLowerCase());
    if (v) onPick(v);
  };
  input.addEventListener('change', choose);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && choose());
  return { field: h('div', { class: 'field' }, h('label', { for: id }, 'Verb'), input, datalist), input };
}

function verbsView(panel) {
  const verbs = verbList();
  let verb = getWord(`verb_${getParam('verb') || ''}`) || verbs.find((v) => v.lemma === 'parlare');
  let gender = 'm';
  const out = h('div', { class: 'verb-tables' });
  const picker = verbPicker('verb-pick', verb.lemma, (v) => {
    verb = v;
    paint();
  });
  const genderSel = h(
    'fieldset',
    { class: 'inline-radios' },
    h('legend', {}, 'Subject gender (for essere agreement)'),
    ['m', 'f'].map((g) =>
      h('label', {}, h('input', { type: 'radio', name: 'gender', value: g, checked: g === gender, onchange: () => { gender = g; paint(); } }), g === 'm' ? ' masculine' : ' feminine')
    )
  );
  function paint() {
    clear(out);
    append(out, 
      h('div', { class: 'verb-facts' }, h('p', { class: 'verb-facts__lemma', lang: 'it' }, verb.lemma, ' ', speakButton(verb.lemma)), h('p', {}, `${verb.meaning} · ${verb.conjugationGroup} · ${verb.regularity} · auxiliary ${verb.reflexive ? 'essere' : verb.auxiliary}`), verb.usage ? rich('p', verb.usage, { class: 'note' }) : null, h('button', { type: 'button', class: 'btn btn--ghost btn--small', onclick: () => openWordModal(verb) }, 'Dictionary entry')),
      renderParadigm(verb, 'presente', { highlightEndings: true }),
      renderConjugationSet(verb, { gender, highlightEndings: true })
    );
  }
  append(panel, 
    h('section', {}, h('h2', {}, 'Regular patterns'), h('p', { class: 'muted' }, 'The three model verbs side by side. Endings that differ between families are the ones to learn first: lui/lei -a versus -e, and voi -ate/-ete/-ite.'), renderComparison(['verb_parlare', 'verb_vedere', 'verb_dormire', 'verb_capire'].map((id) => getWord(id)))),
    h('section', {}, h('h2', {}, 'Look up any verb'), h('p', { class: 'muted' }, `${verbs.length} verbs available, including your own. Highlighted cells are irregular; bold letters are endings added to the stem.`), h('div', { class: 'filters' }, picker.field, genderSel), out)
  );
  paint();
}

/* ------------------------------------------------------------------ */
/* Comparisons                                                         */
/* ------------------------------------------------------------------ */

function compareView(panel) {
  const w = (id) => getWord(id);
  const section = (title, intro, ...content) => h('section', { class: 'compare-section' }, h('h2', {}, title), intro ? h('p', { class: 'muted' }, intro) : null, ...content);

  // Custom pair
  let a = w('verb_essere');
  let b = w('verb_avere');
  let tense = 'presente';
  const customOut = h('div');
  const pa = verbPicker('cmp-a', a.lemma, (v) => { a = v; paintCustom(); });
  const pb = verbPicker('cmp-b', b.lemma, (v) => { b = v; paintCustom(); });
  pa.field.querySelector('label').textContent = 'First verb';
  pb.field.querySelector('label').textContent = 'Second verb';
  const tenseSel = h(
    'div',
    { class: 'field' },
    h('label', { for: 'cmp-tense' }, 'Tense'),
    h('select', { id: 'cmp-tense', class: 'input', onchange: (e) => { tense = e.target.value; paintCustom(); } }, TENSES.map((t) => h('option', { value: t.key }, fullTenseLabel(t))))
  );
  function paintCustom() {
    clear(customOut);
    append(customOut, renderComparison([a, b], tense));
  }
  paintCustom();

  // Passato vs imperfetto for one verb
  let ppVerb = w('verb_andare');
  const ppOut = h('div');
  const pp = verbPicker('pp-verb', ppVerb.lemma, (v) => { ppVerb = v; paintPP(); });
  function paintPP() {
    clear(ppOut);
    append(ppOut, h('div', { class: 'paradigm-grid' }, renderParadigm(ppVerb, 'passatoProssimo'), renderParadigm(ppVerb, 'imperfetto'), renderParadigm(ppVerb, 'passatoRemoto'), renderParadigm(ppVerb, 'trapassatoProssimo')));
  }
  paintPP();

  const genderTable = h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      { class: 'table' },
      h('caption', {}, 'Masculine and feminine, singular and plural: noun + adjective agreement'),
      h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', { scope: 'col' }, 'singular'), h('th', { scope: 'col' }, 'plural'))),
      h(
        'tbody',
        {},
        h('tr', {}, h('th', { scope: 'row' }, 'masculine (-o adjective)'), h('td', { lang: 'it' }, 'il bambino piccolo'), h('td', { lang: 'it' }, 'i bambini piccoli')),
        h('tr', {}, h('th', { scope: 'row' }, 'feminine (-o adjective)'), h('td', { lang: 'it' }, 'la bambina piccola'), h('td', { lang: 'it' }, 'le bambine piccole')),
        h('tr', {}, h('th', { scope: 'row' }, 'masculine (-e adjective)'), h('td', { lang: 'it' }, 'il cane felice'), h('td', { lang: 'it' }, 'i cani felici')),
        h('tr', {}, h('th', { scope: 'row' }, 'feminine (-e adjective)'), h('td', { lang: 'it' }, 'la volpe felice'), h('td', { lang: 'it' }, 'le volpi felici')),
        h('tr', {}, h('th', { scope: 'row' }, 'masculine, lo/gli'), h('td', { lang: 'it' }, 'lo zaino nuovo'), h('td', { lang: 'it' }, 'gli zaini nuovi')),
        h('tr', {}, h('th', { scope: 'row' }, "elided l'"), h('td', { lang: 'it' }, "l'albero alto · l'ape piccola"), h('td', { lang: 'it' }, 'gli alberi alti · le api piccole'))
      )
    )
  );

  append(panel, 
    section('parlare · vedere · dormire', 'The three regular families.', renderComparison([w('verb_parlare'), w('verb_vedere'), w('verb_dormire')])),
    section('essere · avere', 'The two auxiliaries. Both are fully irregular in the present.', renderComparison([w('verb_essere'), w('verb_avere')])),
    section('Regular versus irregular', 'parlare is regular; andare and fare share its -are endings in noi and voi but not elsewhere.', renderComparison([w('verb_parlare'), w('verb_andare'), w('verb_fare')])),
    section('Masculine versus feminine · singular versus plural', null, genderTable),
    section('The past tenses of one verb', 'Passato prossimo and passato remoto both present completed events (the choice depends on the link to the present, on register and on region); the imperfetto gives background, habits and descriptions; the trapassato prossimo places an event before another past moment.', h('div', { class: 'filters' }, pp.field), ppOut),
    section('Compare any two verbs', null, h('div', { class: 'filters' }, pa.field, pb.field, tenseSel), customOut)
  );
}

/* ------------------------------------------------------------------ */
/* Nouns and articles                                                  */
/* ------------------------------------------------------------------ */

function nounsView(panel) {
  const input = h('input', { class: 'input', id: 'noun-in', lang: 'it', placeholder: 'e.g. zaino, albero, città', autocomplete: 'off' });
  let gender = 'm';
  const out = h('div', { class: 'noun-result', 'aria-live': 'polite' });
  const genderSel = h(
    'fieldset',
    { class: 'inline-radios' },
    h('legend', {}, 'Gender (if the word is not in the dictionary)'),
    ['m', 'f'].map((g) => h('label', {}, h('input', { type: 'radio', name: 'ngender', value: g, checked: g === gender, onchange: () => { gender = g; paint(); } }), g === 'm' ? ' masculine' : ' feminine'))
  );
  function paint() {
    clear(out);
    const raw = input.value.trim().toLowerCase();
    if (!raw) return;
    const known = lookupForm(raw)
      .filter((a) => a.pos === 'noun' && a.wordId)
      .map((a) => getWord(a.wordId, getStore().get().vocabulary.custom))
      .find(Boolean);
    if (known) {
      const g = known.gender === 'feminine' ? 'f' : 'm';
      append(out, 
        h('p', {}, h('strong', {}, 'In the dictionary: '), h('button', { type: 'button', class: 'link-btn', lang: 'it', onclick: () => openWordModal(known) }, displayLemma(known)), ` — ${known.meaning}`),
        h(
          'table',
          { class: 'table table--small' },
          h('tbody', {},
            h('tr', {}, h('th', { scope: 'row' }, 'Definite'), h('td', { lang: 'it' }, withArticle(known.article, known.lemma)), h('td', { lang: 'it' }, known.plural ? withArticle(known.pluralArticle, known.plural) : '—')),
            h('tr', {}, h('th', { scope: 'row' }, 'Indefinite'), h('td', { lang: 'it' }, withArticle(indefiniteArticle(known.lemma, g), known.lemma)), h('td', { class: 'muted' }, known.plural ? `(some) ${withArticle(articleForSome(known), known.plural)}` : '—'))
          )
        ),
        h('p', { class: 'muted' }, explainDefiniteArticle(known.lemma, g)),
        known.pluralBasis && known.pluralBasis !== 'rule' && known.pluralBasis !== 'none' ? h('p', { class: 'note' }, `Plural: ${pluralise(known.lemma, g).explanation}`) : null
      );
      return;
    }
    const p = pluralise(raw, gender);
    const sg = definiteArticle(raw, gender);
    append(out, 
      h('p', { class: 'note' }, `“${raw}” is not in the course dictionary. The forms below are predicted by rule from the gender you selected — check them in a dictionary.`),
      h(
        'table',
        { class: 'table table--small' },
        h('tbody', {},
          h('tr', {}, h('th', { scope: 'row' }, 'Definite'), h('td', { lang: 'it' }, withArticle(sg, raw)), h('td', { lang: 'it' }, p.plural ? withArticle(definiteArticle(p.plural, gender, 'pl'), p.plural) : '—')),
          h('tr', {}, h('th', { scope: 'row' }, 'Indefinite'), h('td', { lang: 'it' }, withArticle(indefiniteArticle(raw, gender), raw)), h('td'))
        )
      ),
      h('p', { class: 'muted' }, explainDefiniteArticle(raw, gender)),
      h('p', { class: 'muted' }, `Plural (${p.basis}): ${p.explanation}`)
    );
  }
  input.addEventListener('input', paint);
  append(panel, 
    h('section', {}, h('h2', {}, 'Article and plural finder'), h('div', { class: 'filters' }, h('div', { class: 'field' }, h('label', { for: 'noun-in' }, 'Noun (singular)'), input), genderSel), out),
    h('section', {}, h('h2', {}, 'Articulated prepositions'), renderArticulatedTable()),
    h('section', {}, h('h2', {}, 'Lessons'), h('p', {}, h('a', { href: pageUrl('lesson', { id: 'definite-articles' }) }, 'The definite article'), ' · ', h('a', { href: pageUrl('lesson', { id: 'irregular-nouns' }) }, 'Irregular plurals'), ' · ', h('a', { href: pageUrl('lesson', { id: 'articulated-prepositions' }) }, 'Articulated prepositions')))
  );
}

function articleForSome(word) {
  const art = word.pluralArticle;
  return { i: 'dei', gli: 'degli', le: 'delle' }[art] || art;
}

/* ------------------------------------------------------------------ */
/* Sentence analyser                                                   */
/* ------------------------------------------------------------------ */

function analyserView(panel) {
  const store = getStore();
  const textarea = h('textarea', { class: 'input', id: 'an-input', rows: 2, lang: 'it', spellcheck: 'false' });
  textarea.value = getParam('s') || ANALYSER_SAMPLES[0];
  const out = h('div', { class: 'analysis', 'aria-live': 'polite' });
  const run = () => paint(textarea.value);
  const samples = h('p', { class: 'samples' }, 'Try: ', ANALYSER_SAMPLES.map((s) => h('button', { type: 'button', class: 'chip chip--small', lang: 'it', onclick: () => { textarea.value = s; run(); } }, s)));

  function paint(text) {
    clear(out);
    const t = text.trim();
    if (!t) return;
    const custom = store.get().vocabulary.custom;
    const a = analyseSentence(t, { custom });
    const translation = KNOWN_TRANSLATIONS.lookup(t);
    append(out, 
      h(
        'div',
        { class: 'analysis__sentence' },
        h('p', { lang: 'it', class: 'analysis__it' }, t, ' ', speakButton(t)),
        translation ? h('p', { class: 'analysis__en' }, translation.en, h('span', { class: 'muted small' }, ` — from ${translation.source}`)) : h('p', { class: 'muted small' }, 'No stored translation for this sentence; see the word meanings below. (The analyser does not machine-translate.)')
      )
    );
    for (const m of a.messages) append(out, h('p', { class: 'note' }, m));
    const rows = a.words.map((w) => {
      const role = w.role || w.phraseRole || (a.supported ? '' : '—');
      return h(
        'tr',
        { class: w.tag === 'UNKNOWN' ? 'is-unknown' : null },
        h('th', { scope: 'row', lang: 'it' }, h('button', { type: 'button', class: 'link-btn', onclick: () => openTokenModal(w.text, w.analyses, { sentence: t }) }, w.text)),
        h('td', {}, describeToken(w), w.analyses.length > 1 ? h('span', { class: 'muted small' }, ` (${w.analyses.length} readings — click the word)`) : null),
        h('td', { lang: 'it' }, w.chosen ? (w.chosen.wordId ? displayLemma(getWord(w.chosen.wordId, custom)) : w.chosen.lemma) : ''),
        h('td', {}, w.chosen ? w.chosen.meaning : ''),
        h('td', {}, role)
      );
    });
    append(out, 
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'table table--analysis' },
          h('caption', {}, 'Word-by-word analysis'),
          h('thead', {}, h('tr', {}, ['Word', 'Analysis', 'Dictionary form', 'Meaning', 'Role in the sentence'].map((c) => h('th', { scope: 'col' }, c)))),
          h('tbody', {}, rows)
        )
      )
    );
    if (a.supported && a.clauses.length) {
      append(
        out,
        h(
          'div',
          { class: 'table-wrap' },
          h(
            'table',
            { class: 'table table--small' },
            h('caption', {}, a.clauses.length > 1 ? 'Clauses' : 'Verb'),
            h('thead', {}, h('tr', {}, ['Clause', 'Verb group', 'Lemma', 'Mood and tense', 'Person', 'Voice / construction'].map((c) => h('th', { scope: 'col' }, c)))),
            h(
              'tbody',
              {},
              a.clauses.map((c) =>
                h(
                  'tr',
                  {},
                  h('td', {}, c.kind === 'main' ? 'main' : c.kind === 'relative' ? `relative (${c.introducer.text})` : `subordinate (${c.introducer.text})`),
                  h('td', { lang: 'it' }, c.vp.tokens.map((t) => t.text).join(' ')),
                  h('td', { lang: 'it' }, c.verb.lemma),
                  h('td', {}, c.verb.tense),
                  h('td', {}, PERSONS[c.verb.personIndex] || c.verb.person),
                  h('td', {}, [c.verb.voice, c.verb.construction !== 'simple' ? c.verb.construction : null, c.verb.negated ? 'negative' : null, c.verb.reflexive ? 'reflexive' : null].filter(Boolean).join(' · '))
                )
              )
            )
          )
        )
      );
      for (const r of a.relations) append(out, h('p', { class: 'note' }, h('strong', {}, r.kind === 'hypothetical' ? 'Hypothetical sentence: ' : r.kind === 'relative' ? 'Relative clause: ' : 'Sequence of tenses: '), r.text));
    }
    // Transformations
    const tOut = h('div', { class: 'transform-result', 'aria-live': 'polite' });
    const tButtons = h(
      'div',
      { class: 'button-row' },
      TRANSFORMATIONS.map((tr) =>
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn--small',
            onclick: () => {
              clear(tOut);
              const r = tr.fn(t, { custom });
              if (!r.ok) {
                append(tOut, h('p', { class: 'note' }, h('strong', {}, `${tr.label}: not possible. `), r.reason));
                return;
              }
              append(tOut, 
                h('p', { class: 'transform-result__text', lang: 'it' }, r.result, ' ', speakButton(r.result)),
                h('ol', { class: 'steps' }, r.steps.map((s) => h('li', {}, s))),
                h('button', { type: 'button', class: 'btn btn--ghost btn--small', onclick: () => { textarea.value = r.result; run(); } }, 'Analyse the result')
              );
            }
          },
          tr.label
        )
      )
    );
    append(out, h('section', { class: 'transformations' }, h('h3', {}, 'Transform'), tButtons, tOut));
  }

  append(panel, 
    h('section', {}, h('h2', {}, 'Sentence analyser'), h('p', { class: 'muted' }, 'Analyses every word that the course dictionary knows and lists all the readings of ambiguous forms. It splits a sentence into clauses (after che, se, quando, relative pronouns, commas …), chooses a reading for each verb from the context, and names the tense relations between clauses (sequence of tenses, periodo ipotetico, passive, si). It is a curated tool, not a general parser: its choice of reading is a heuristic, and anything it cannot analyse is reported as unsupported rather than guessed.'), h('div', { class: 'field field--wide' }, h('label', { for: 'an-input' }, 'Italian sentence'), textarea), h('div', { class: 'button-row' }, h('button', { type: 'button', class: 'btn btn--primary', onclick: run }, icon('Microscope'), 'Analyse')), samples, out)
  );
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      run();
    }
  });
  run();
}
