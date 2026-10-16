/**
 * Word inspector: full dictionary entry for a word, and the analysis of a
 * clicked token in a story or song (with every possible reading listed).
 */
import { h, clear, rich, append } from './dom.js';
import { icon } from './icons.js';
import { openModal } from './modal.js';
import { notify } from './notifications.js';
import { renderConjugationSet } from './tables.js';
import { tenseInfo, fullTenseLabel } from '../grammar/verb-system.js';
import { getLesson } from '../core/data-loader.js';
import { getStore } from '../core/storage.js';
import { getWord, displayLemma, displayPlural } from '../vocabulary/dictionary.js';
import { addToReview, removeFromReview, toggleFavourite, setNote, wordStatus } from '../vocabulary/vocabulary-manager.js';
import { speak, speechAvailable } from '../songs/audio-player.js';
import { pageUrl } from '../core/pages.js';
import { explainDefiniteArticle } from '../grammar/grammar-engine.js';

/** A read-aloud button; renders nothing if speech synthesis is unavailable. */
export function speakButton(text, { label = 'Listen', compact = true } = {}) {
  if (!speechAvailable()) return null;
  const settings = getStore().get().settings;
  return h(
    'button',
    {
      type: 'button',
      class: compact ? 'icon-btn icon-btn--small' : 'btn btn--ghost',
      'aria-label': `${label}: ${text}`,
      title: label,
      onclick: () => speak(text, { rate: settings.speechRate, voiceURI: settings.speechVoice })
    },
    icon('Volume2', { size: 16 }),
    compact ? null : label
  );
}

function fact(term, value) {
  if (value === undefined || value === null || value === '') return null;
  return [h('dt', {}, term), h('dd', {}, value)];
}

function adjectiveTable(word) {
  const f = word.forms;
  return h(
    'table',
    { class: 'table table--small' },
    h('caption', {}, 'Agreement'),
    h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', { scope: 'col' }, 'singular'), h('th', { scope: 'col' }, 'plural'))),
    h(
      'tbody',
      {},
      h('tr', {}, h('th', { scope: 'row' }, 'masculine'), h('td', { lang: 'it' }, f.ms), h('td', { lang: 'it' }, f.mp)),
      h('tr', {}, h('th', { scope: 'row' }, 'feminine'), h('td', { lang: 'it' }, f.fs), h('td', { lang: 'it' }, f.fp))
    )
  );
}

/**
 * Full entry for a word, with learner actions.
 * opts: { onChange }
 */
export function renderWordPanel(word, opts = {}) {
  const store = getStore();
  const panel = h('div', { class: 'word-panel' });
  const paint = () => {
    const state = store.get();
    const inReview = Boolean(state.srs.cards[word.id]);
    const fav = state.vocabulary.favourites.includes(word.id);
    const status = wordStatus(state, word.id);
    clear(panel);

    const headword = h(
      'div',
      { class: 'word-panel__head' },
      h('p', { class: 'word-panel__lemma', lang: 'it' }, displayLemma(word)),
      speakButton(displayLemma(word)),
      h('span', { class: 'tag' }, word.partOfSpeech),
      h('span', { class: 'tag tag--level' }, word.level || ''),
      word.custom ? h('span', { class: 'tag tag--custom' }, 'my word') : null
    );
    const facts = [];
    facts.push(fact('Meaning', word.meaning));
    if (word.partOfSpeech === 'noun') {
      facts.push(fact('Gender', word.gender));
      facts.push(fact('Plural', word.plural ? h('span', { lang: 'it' }, displayPlural(word)) : 'not normally used in the plural'));
      if (word.pluralGender && word.pluralGender !== word.gender) facts.push(fact('Note', `The plural is ${word.pluralGender}.`));
      facts.push(fact('Why this article', explainDefiniteArticle(word.lemma, word.gender === 'feminine' ? 'f' : 'm')));
    }
    if (word.partOfSpeech === 'verb') {
      facts.push(fact('Conjugation', word.conjugationGroup));
      facts.push(fact('Regularity', word.regularity));
      facts.push(fact('Auxiliary', word.auxiliary));
      facts.push(fact('Past participle', h('span', { lang: 'it' }, word.participle)));
      if (word.irregularForms && word.irregularForms.length) facts.push(fact('Irregular forms', h('span', { lang: 'it' }, word.irregularForms.join(', '))));
      if (word.constructions && word.constructions.length) facts.push(fact('Constructions', h('ul', { class: 'plain' }, word.constructions.map((c) => h('li', { lang: 'it' }, c)))));
    }
    if (word.agreement) facts.push(fact('Agreement', word.agreement));
    facts.push(fact('Category', word.category));
    facts.push(fact('Your status', status.label));

    const blocks = [headword, h('dl', { class: 'facts' }, facts.filter(Boolean).flat())];
    if (word.usage) blocks.push(rich('p', word.usage, { class: 'note' }));
    if (word.partOfSpeech === 'adjective' && word.forms) blocks.push(adjectiveTable(word));
    if (word.exampleItalian) {
      blocks.push(
        h(
          'div',
          { class: 'example' },
          h('p', { lang: 'it', class: 'example__it' }, word.exampleItalian, speakButton(word.exampleItalian)),
          word.exampleEnglish ? h('p', { class: 'example__en' }, word.exampleEnglish) : null
        )
      );
    }
    if (word.partOfSpeech === 'verb' && word.present) {
      const tables = h('div', { class: 'paradigms', hidden: true });
      const toggle = h(
        'button',
        {
          type: 'button',
          class: 'btn btn--ghost',
          'aria-expanded': 'false',
          onclick: () => {
            tables.hidden = !tables.hidden;
            toggle.setAttribute('aria-expanded', String(!tables.hidden));
            if (!tables.childNodes.length) {
              append(tables, renderConjugationSet(word, { highlightEndings: true }));
            }
          }
        },
        icon('BookOpen'),
        'Show the full conjugation (all moods and tenses)'
      );
      blocks.push(toggle, tables);
    }
    if (word.related && word.related.length) {
      blocks.push(
        h(
          'p',
          { class: 'related' },
          'Word family: ',
          word.related
            .map((id) => getWord(id))
            .filter(Boolean)
            .flatMap((w, i) => [i ? ', ' : '', h('a', { href: pageUrl('vocabulary', { word: w.id }), lang: 'it' }, displayLemma(w))])
        )
      );
    }

    const noteArea = h('textarea', { class: 'input', rows: 2, 'aria-label': 'Your note on this word', placeholder: 'Your note (saved in this browser)…' });
    noteArea.value = state.vocabulary.notes[word.id] || '';
    const saveNote = h(
      'button',
      {
        type: 'button',
        class: 'btn btn--ghost',
        onclick: () => {
          store.update((d) => setNote(d, word.id, noteArea.value));
          notify('Note saved.');
        }
      },
      'Save note'
    );
    const actions = h(
      'div',
      { class: 'word-panel__actions' },
      h(
        'button',
        {
          type: 'button',
          class: ['btn', inReview ? '' : 'btn--primary'],
          onclick: () => {
            store.update((d) => (inReview ? removeFromReview(d, word.id) : addToReview(d, word.id)));
            notify(inReview ? 'Removed from review.' : 'Added to review.');
            paint();
            if (opts.onChange) opts.onChange();
          }
        },
        icon(inReview ? 'X' : 'Plus'),
        inReview ? 'Remove from review' : 'Add to review'
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn',
          'aria-pressed': String(fav),
          onclick: () => {
            store.update((d) => toggleFavourite(d, word.id));
            paint();
            if (opts.onChange) opts.onChange();
          }
        },
        icon('Star'),
        fav ? 'Favourite' : 'Add to favourites'
      ),
      h('a', { class: 'btn btn--ghost', href: pageUrl('review', { word: word.id }) }, icon('Repeat'), 'Study now')
    );
    blocks.push(actions, h('div', { class: 'note-editor' }, noteArea, saveNote));
    append(panel, ...blocks);
  };
  paint();
  return panel;
}

export function openWordModal(word, opts = {}) {
  return openModal({ title: displayLemma(word), content: renderWordPanel(word, opts), wide: true });
}

/** Link to the lesson that teaches a tense, with the learner's status. */
export function lessonLinkFor(lessonId) {
  const lesson = lessonId ? getLesson(lessonId) : null;
  if (!lesson) return null;
  const rec = getStore().get().lessons[lesson.id];
  const status = rec && rec.completedAt ? 'studied' : rec ? 'opened' : 'not yet studied';
  return h(
    'span',
    { class: 'lesson-link' },
    h('a', { href: pageUrl('lesson', { id: lesson.id }) }, `Lesson: ${lesson.title}`),
    ' ',
    h('span', { class: ['badge', status === 'studied' ? 'badge--completed' : status === 'opened' ? 'badge--opened' : 'badge--todo'] }, status)
  );
}

const NONFINITE_INFO = {
  infinitive: { lesson: 'infinito-gerundio', text: 'The infinitive names the action. It follows modal verbs and prepositions, and with non it forms the negative tu imperative.' },
  gerund: { lesson: 'infinito-gerundio', text: 'The gerund expresses manner, means, time, cause or condition; with stare it forms the progressive (sto leggendo). Its subject is normally the same as the main verb’s.' },
  'past participle': { lesson: 'participio', text: 'The past participle forms every compound tense (with avere or essere) and the passive; it can also work as an adjective or in a participial clause (finita la cena, …).' }
};

/** Grammatical explanation block for one verb analysis. */
export function verbExplanation(a) {
  if (a.pos !== 'verb') return null;
  const f = a.features || {};
  if (f.tenseKey) {
    const info = tenseInfo(f.tenseKey);
    const word = a.wordId ? getWord(a.wordId) : null;
    const aux = a.auxiliary || (word && word.auxiliary);
    return h(
      'div',
      { class: 'verb-explain' },
      h('dl', { class: 'facts facts--compact' },
        h('dt', {}, 'Mood'), h('dd', {}, info.mood),
        h('dt', {}, 'Tense'), h('dd', {}, fullTenseLabel(info), ` (${info.english})`),
        h('dt', {}, 'Person'), h('dd', {}, f.person),
        word ? [h('dt', {}, 'Auxiliary'), h('dd', {}, `${aux} (in compound tenses)`), h('dt', {}, 'Participle'), h('dd', { lang: 'it' }, word.participle)] : null
      ),
      h('p', { class: 'small' }, info.summary),
      lessonLinkFor(info.lesson)
    );
  }
  const nf = NONFINITE_INFO[f.form];
  if (nf) return h('div', { class: 'verb-explain' }, h('p', { class: 'small' }, nf.text), lessonLinkFor(nf.lesson));
  return null;
}

/**
 * Show the analysis of a clicked token. `analyses` come from the form index;
 * every reading is listed, because a form may be ambiguous out of context.
 */
export function openTokenModal(text, analyses, { sentence, onAdd, context } = {}) {
  const store = getStore();
  const content = h('div', { class: 'token-analysis' });
  if (context) append(content, h('div', { class: 'note' }, h('strong', {}, 'In this sentence: '), context.text, context.lesson ? [' ', lessonLinkFor(context.lesson)] : null));
  if (sentence) append(content, h('p', { class: 'muted', lang: 'it' }, sentence));
  if (!analyses.length) {
    append(content, 
      h('p', {}, `“${text}” is not in the course dictionary, so it is not analysed. You can add it as your own word.`),
      h('a', { class: 'btn', href: pageUrl('vocabulary', { add: text.toLowerCase() }) }, icon('Plus'), 'Add as my word')
    );
  } else {
    if (analyses.length > 1) append(content, h('p', { class: 'note' }, `This form has ${analyses.length} possible readings out of context. ${context ? 'The reading chosen for this sentence is shown above; the others are listed for completeness.' : 'The sentence context decides which one applies.'}`));
    const list = h('ol', { class: 'analyses' });
    for (const a of analyses) {
      const word = a.wordId ? getWord(a.wordId, store.get().vocabulary.custom) : null;
      append(list, 
        h(
          'li',
          {},
          h('p', {}, h('strong', { lang: 'it' }, text), ' — ', a.description),
          h('p', {}, 'Dictionary form: ', h('span', { lang: 'it' }, word ? displayLemma(word) : a.lemma), ' · Meaning: ', a.meaning),
          a.note ? rich('p', a.note, { class: 'muted' }) : null,
          verbExplanation(a),
          word
            ? h(
                'p',
                { class: 'analyses__actions' },
                h('button', { type: 'button', class: 'btn btn--small', onclick: () => openWordModal(word) }, 'Full entry'),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'btn btn--small btn--primary',
                    onclick: () => {
                      store.update((d) => addToReview(d, word.id));
                      notify(`“${displayLemma(word)}” added to review.`);
                      if (onAdd) onAdd(word);
                    }
                  },
                  icon('Plus'),
                  'Add to review'
                )
              )
            : h('p', { class: 'muted' }, 'Grammar word — explained here, not added as a flashcard.')
        )
      );
    }
    append(content, list);
  }
  return openModal({ title: text, content });
}
