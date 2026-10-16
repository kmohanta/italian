import { h, clear, append } from '../components/dom.js';
import { icon } from '../components/icons.js';
import { pageHeader } from '../components/page-layout.js';
import { openWordModal } from '../components/word-detail.js';
import { notify } from '../components/notifications.js';
import { confirmDialog } from '../components/modal.js';
import { getStore } from '../core/storage.js';
import { getParam, setParams } from '../core/router.js';
import { allWords, searchVocabulary, displayLemma, categories, partsOfSpeech, getWord } from '../vocabulary/dictionary.js';
import { buildCustomWord, addCustomWord, deleteCustomWord, addToReview, wordStatus } from '../vocabulary/vocabulary-manager.js';

export function context() {
  return { title: 'Vocabulary' };
}

const PAGE_SIZE = 60;

export function render(main) {
  const store = getStore();
  const filters = { query: getParam('q') || '', category: '', pos: '', level: '', list: 'all' };
  let limit = PAGE_SIZE;

  append(main, pageHeader('Vocabulary', 'A searchable dictionary of every word in the course — nouns with their articles, verbs with their forms — plus your own words, notes and favourites.'));

  const results = h('div', { class: 'word-list', role: 'list' });
  const count = h('p', { class: 'muted', 'aria-live': 'polite' });
  const more = h('button', { type: 'button', class: 'btn btn--ghost', hidden: true, onclick: () => { limit += PAGE_SIZE; paint(); } }, 'Show more');

  const words = () => allWords(store.get().vocabulary.custom);
  const fieldSelect = (id, label, options, key, labels = {}) =>
    h('div', { class: 'field' }, h('label', { for: id }, label), h('select', { id, class: 'input', onchange: (e) => { filters[key] = e.target.value; limit = PAGE_SIZE; paint(); } }, h('option', { value: '' }, 'All'), options.map((o) => h('option', { value: o }, labels[o] || o))));

  const search = h('input', { type: 'search', id: 'voc-q', class: 'input', value: filters.query, placeholder: 'Italian or English, any form (e.g. vanno, cat, uova)…', autocomplete: 'off', oninput: (e) => { filters.query = e.target.value; limit = PAGE_SIZE; paint(); } });
  const listSel = h(
    'div',
    { class: 'field' },
    h('label', { for: 'voc-list' }, 'Show'),
    h(
      'select',
      { id: 'voc-list', class: 'input', onchange: (e) => { filters.list = e.target.value; limit = PAGE_SIZE; paint(); } },
      [['all', 'All words'], ['favourites', 'Favourites'], ['custom', 'My words'], ['review', 'In my review'], ['not-review', 'Not yet in review'], ['notes', 'With my notes']].map(([v, l]) => h('option', { value: v }, l))
    )
  );
  const filterBar = h(
    'div',
    { class: 'filters' },
    h('div', { class: 'field field--wide' }, h('label', { for: 'voc-q' }, 'Search'), search),
    fieldSelect('voc-cat', 'Category', categories(words()), 'category'),
    fieldSelect('voc-pos', 'Type', partsOfSpeech(words()), 'pos'),
    fieldSelect('voc-level', 'Level', ['A0', 'A1', 'A2', 'B1', 'B2'], 'level'),
    listSel
  );

  function paint() {
    const state = store.get();
    let ids = null;
    if (filters.list === 'favourites') ids = state.vocabulary.favourites;
    if (filters.list === 'custom') ids = state.vocabulary.custom.map((w) => w.id);
    if (filters.list === 'review') ids = Object.keys(state.srs.cards);
    if (filters.list === 'notes') ids = Object.keys(state.vocabulary.notes);
    let list = searchVocabulary(words(), { ...filters, ids });
    if (filters.list === 'not-review') list = list.filter((w) => !state.srs.cards[w.id]);
    count.textContent = `${list.length} ${list.length === 1 ? 'entry' : 'entries'}`;
    clear(results);
    if (!list.length) append(results, h('p', { class: 'empty-state__text' }, filters.list === 'favourites' ? 'No favourites yet — open a word and press “Add to favourites”.' : 'No words match.'));
    for (const w of list.slice(0, limit)) {
      const status = wordStatus(state, w.id);
      append(results, 
        h(
          'div',
          { class: 'word-row', role: 'listitem' },
          h('button', { type: 'button', class: 'word-row__main', onclick: () => openWordModal(w, { onChange: paint }) }, h('span', { class: 'word-row__lemma', lang: 'it' }, displayLemma(w)), h('span', { class: 'word-row__meaning' }, w.meaning)),
          h('span', { class: 'word-row__meta' }, h('span', { class: 'tag' }, w.partOfSpeech), h('span', { class: 'tag tag--level' }, w.level), state.vocabulary.favourites.includes(w.id) ? h('span', { class: 'tag tag--fav', title: 'Favourite' }, icon('Star', { size: 14, label: 'favourite' })) : null, w.custom ? h('span', { class: 'tag tag--custom' }, 'mine') : null, h('span', { class: ['status-dot', `status-dot--${status.key}`], title: status.label }, h('span', { class: 'sr-only' }, status.label)))
        )
      );
    }
    more.hidden = list.length <= limit;
  }

  // Custom word form
  const form = customWordForm(() => {
    paint();
    paintMine();
  });
  const mine = h('div');
  function paintMine() {
    clear(mine);
    const custom = store.get().vocabulary.custom;
    if (!custom.length) {
      append(mine, h('p', { class: 'muted' }, 'You have not added any words yet. Words you click in stories and songs can be added here too.'));
      return;
    }
    append(mine, 
      h(
        'ul',
        { class: 'list' },
        custom.map((w) =>
          h(
            'li',
            { class: 'mine-row' },
            h('button', { type: 'button', class: 'link-btn', lang: 'it', onclick: () => openWordModal(w, { onChange: paint }) }, displayLemma(w)),
            ` — ${w.meaning} `,
            h(
              'button',
              {
                type: 'button',
                class: 'icon-btn icon-btn--small',
                'aria-label': `Delete ${w.lemma}`,
                onclick: async () => {
                  if (await confirmDialog({ title: 'Delete word?', message: `Delete “${w.lemma}” and its review history? This cannot be undone.`, confirmLabel: 'Delete', danger: true })) {
                    store.update((d) => deleteCustomWord(d, w.id));
                    notify('Word deleted.');
                    paint();
                    paintMine();
                  }
                }
              },
              icon('Trash2', { size: 16 })
            )
          )
        )
      )
    );
  }

  append(main, 
    h('section', { 'aria-labelledby': 'dict-h' }, h('h2', { id: 'dict-h', class: 'sr-only' }, 'Dictionary'), filterBar, count, results, more),
    h('section', { class: 'panel', id: 'add-word', 'aria-labelledby': 'add-h' }, h('h2', { id: 'add-h' }, 'Add your own word'), form),
    h('section', { class: 'panel', 'aria-labelledby': 'mine-h' }, h('h2', { id: 'mine-h' }, 'My words'), mine)
  );
  paint();
  paintMine();

  const wordId = getParam('word');
  if (wordId) {
    const w = getWord(wordId, store.get().vocabulary.custom);
    if (w) openWordModal(w, { onChange: paint });
    else notify(`No word with the ID “${wordId}” was found.`, { type: 'warning' });
    setParams({ word: null });
  }
  if (getParam('add')) {
    document.getElementById('add-word')?.scrollIntoView?.();
    form.querySelector('#cw-lemma')?.focus();
  }
}

function customWordForm(onAdded) {
  const store = getStore();
  const msg = h('div', { 'aria-live': 'polite' });
  const lemma = h('input', { id: 'cw-lemma', class: 'input', lang: 'it', required: true, value: getParam('add') || '', autocomplete: 'off' });
  const pos = h('select', { id: 'cw-pos', class: 'input' }, ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'expression', 'other'].map((p) => h('option', { value: p }, p)));
  const gender = h('select', { id: 'cw-gender', class: 'input' }, h('option', { value: '' }, '—'), h('option', { value: 'm' }, 'masculine'), h('option', { value: 'f' }, 'feminine'));
  const pluralIn = h('input', { id: 'cw-plural', class: 'input', lang: 'it', placeholder: 'leave empty to predict', autocomplete: 'off' });
  const isc = h('input', { id: 'cw-isc', type: 'checkbox' });
  const meaning = h('input', { id: 'cw-meaning', class: 'input', required: true, autocomplete: 'off' });
  const example = h('input', { id: 'cw-ex', class: 'input', lang: 'it', autocomplete: 'off' });
  const exampleEn = h('input', { id: 'cw-ex-en', class: 'input', autocomplete: 'off' });
  const addReview = h('input', { id: 'cw-review', type: 'checkbox', checked: true });
  const nounFields = h('div', { class: 'form-row' }, h('div', { class: 'field' }, h('label', { for: 'cw-gender' }, 'Gender'), gender), h('div', { class: 'field' }, h('label', { for: 'cw-plural' }, 'Plural'), pluralIn));
  const verbFields = h('div', { class: 'form-row', hidden: true }, h('label', { class: 'check' }, isc, ' -isc- verb (like capire: capisco)'));
  pos.addEventListener('change', () => {
    nounFields.hidden = pos.value !== 'noun';
    verbFields.hidden = pos.value !== 'verb';
  });
  const form = h(
    'form',
    {
      class: 'form',
      novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        clear(msg);
        const existing = store.get().vocabulary.custom.map((w) => w.id);
        const r = buildCustomWord(
          { lemma: lemma.value, partOfSpeech: pos.value === 'other' ? 'other' : pos.value, gender: gender.value, plural: pluralIn.value, meaning: meaning.value, example: example.value, exampleEnglish: exampleEn.value, isc: isc.checked },
          existing
        );
        if (!r.ok) {
          append(msg, h('div', { class: 'banner banner--error', role: 'alert' }, h('ul', { class: 'plain' }, r.errors.map((e2) => h('li', {}, e2)))));
          return;
        }
        store.update((d) => {
          addCustomWord(d, r.word);
          if (addReview.checked) addToReview(d, r.word.id);
        });
        append(msg, 
          h('div', { class: 'banner banner--success', role: 'status' }, `Added “${displayLemma(r.word)}”.`, r.generated.length ? h('p', { class: 'small' }, `Generated by rule (please check): ${r.generated.join('; ')}.`) : null)
        );
        form.reset();
        lemma.value = '';
        onAdded();
      }
    },
    h('div', { class: 'form-row' }, h('div', { class: 'field' }, h('label', { for: 'cw-lemma' }, 'Italian word (singular / infinitive)'), lemma), h('div', { class: 'field' }, h('label', { for: 'cw-pos' }, 'Type'), pos)),
    nounFields,
    verbFields,
    h('div', { class: 'field field--wide' }, h('label', { for: 'cw-meaning' }, 'English meaning'), meaning),
    h('div', { class: 'form-row' }, h('div', { class: 'field' }, h('label', { for: 'cw-ex' }, 'Example (optional)'), example), h('div', { class: 'field' }, h('label', { for: 'cw-ex-en' }, 'Translation (optional)'), exampleEn)),
    h('label', { class: 'check' }, addReview, ' Add to my review queue'),
    h('div', { class: 'button-row' }, h('button', { type: 'submit', class: 'btn btn--primary' }, icon('Plus'), 'Add word')),
    msg
  );
  return form;
}
