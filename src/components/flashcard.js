/**
 * Flashcard face for vocabulary review.
 * Nouns are always shown with their article; verbs with key forms.
 */
import { h } from './dom.js';
import { displayLemma, displayPlural } from '../vocabulary/dictionary.js';
import { speakButton } from './word-detail.js';

function keyForms(word) {
  if (word.partOfSpeech === 'noun') return word.plural ? `plural: ${displayPlural(word)}` : 'no plural in normal use';
  if (word.partOfSpeech === 'verb') {
    const p = (word.present || []).map((f) => f || '—');
    return `${p[0]}, ${p[1]}, ${p[2]} … ${p[5]} · participle ${word.participle} (${word.auxiliary})`;
  }
  if (word.partOfSpeech === 'adjective' && word.forms) {
    const f = word.forms;
    return [...new Set([f.ms, f.fs, f.mp, f.fp])].join(', ');
  }
  return '';
}

/** direction: 'it-en' shows Italian first; 'en-it' shows English first. */
export function renderFlashcard(word, { direction = 'it-en', revealed = false } = {}) {
  const italian = h('p', { class: 'card__italian', lang: 'it' }, displayLemma(word));
  const english = h('p', { class: 'card__english' }, word.meaning);
  const front = direction === 'it-en' ? italian : english;
  const back = direction === 'it-en' ? english : italian;
  return h(
    'div',
    { class: ['flashcard', revealed && 'is-revealed'] },
    h('div', { class: 'flashcard__front' }, h('span', { class: 'tag' }, word.partOfSpeech), front, direction === 'it-en' ? speakButton(displayLemma(word)) : null),
    revealed
      ? h(
          'div',
          { class: 'flashcard__back' },
          back,
          direction === 'en-it' ? speakButton(displayLemma(word)) : null,
          keyForms(word) ? h('p', { class: 'card__forms', lang: 'it' }, keyForms(word)) : null,
          word.exampleItalian ? h('p', { class: 'card__example' }, h('span', { lang: 'it' }, word.exampleItalian), speakButton(word.exampleItalian), h('br'), h('span', { class: 'muted' }, word.exampleEnglish)) : null
        )
      : null
  );
}
