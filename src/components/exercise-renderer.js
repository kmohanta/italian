/**
 * Reusable exercise renderer.
 *
 * Supports the six interaction kinds used by the course data
 * (choice, text, cloze, table, match, order). Every exercise type in the
 * curriculum maps onto one of them — e.g. "article", "conjugation" and
 * "competing-forms" are choice or text exercises with a different label.
 *
 * Answers are checked with core/validation.js. Options and exercise order
 * may be shuffled; answers are compared by value, never by position, so
 * shuffling cannot invalidate an answer key.
 */
import { h, clear, rich, formatInline, append } from './dom.js';
import { icon } from './icons.js';
import { checkExercise, shuffle as shuffleList } from '../core/validation.js';
import { pageUrl } from '../core/pages.js';

export const TYPE_LABELS = {
  'multiple-choice': 'Multiple choice',
  'fill-blank': 'Fill in the blank',
  'translate-it-en': 'Translate into English',
  'translate-en-it': 'Translate into Italian',
  article: 'Choose the article',
  plural: 'Plural formation',
  conjugation: 'Conjugation',
  classification: 'Grammatical classification',
  matching: 'Matching',
  'sentence-order': 'Sentence order',
  infinitive: 'Find the infinitive',
  'grammatical-role': 'Grammatical role',
  cloze: 'Cloze passage',
  'reading-comprehension': 'Reading comprehension',
  'song-interpretation': 'Song interpretation',
  'competing-forms': 'Choose the correct form'
};

const ACCENTS = ['à', 'è', 'é', 'ì', 'ò', 'ù'];
let uid = 0;

/** Small row of buttons that insert accented letters into the last focused input. */
function accentBar(getTarget) {
  return h(
    'div',
    { class: 'accent-bar', role: 'group', 'aria-label': 'Insert accented letter' },
    ACCENTS.map((ch) =>
      h(
        'button',
        {
          type: 'button',
          class: 'accent-btn',
          lang: 'it',
          onmousedown: (e) => e.preventDefault(), // keep focus in the input
          onclick: () => {
            const input = getTarget();
            if (!input || input.disabled) return;
            const start = input.selectionStart ?? input.value.length;
            const end = input.selectionEnd ?? input.value.length;
            input.value = input.value.slice(0, start) + ch + input.value.slice(end);
            input.focus();
            input.setSelectionRange?.(start + 1, start + 1);
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        },
        ch
      )
    )
  );
}

function textInput(attrs) {
  return h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', class: 'input', ...attrs });
}

/**
 * Render one exercise.
 * opts: { number, random, shuffleOptions = true, lessonId, onChecked(result, response, ex) }
 */
export function renderExercise(ex, opts = {}) {
  const id = `ex-${++uid}`;
  const random = opts.random || Math.random;
  const isItalianAnswer = ex.lang !== 'en';
  let lastFocused = null;
  const track = (input) => {
    input.addEventListener('focus', () => {
      lastFocused = input;
    });
    return input;
  };

  const feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });
  const body = h('div', { class: 'exercise__body' });
  let getResponse;
  let lockInputs;
  let markParts = () => {};

  const promptEl = rich('p', ex.prompt, { class: 'exercise__prompt', id: `${id}-prompt` });

  switch (ex.kind) {
    case 'choice': {
      const options = opts.shuffleOptions === false || ex.shuffle === false ? ex.options : shuffleList(ex.options, random);
      const group = h('div', { class: 'choices', role: 'radiogroup', 'aria-labelledby': `${id}-prompt` });
      options.forEach((opt, i) => {
        const input = h('input', { type: 'radio', name: id, value: opt, id: `${id}-${i}` });
        append(group, h('label', { class: 'choice', for: `${id}-${i}` }, input, rich('span', opt)));
      });
      append(body, group);
      getResponse = () => {
        const sel = group.querySelector('input:checked');
        return sel ? sel.value : null;
      };
      lockInputs = (lock) => group.querySelectorAll('input').forEach((i) => (i.disabled = lock));
      markParts = (result) => {
        group.querySelectorAll('label').forEach((label) => {
          const input = label.querySelector('input');
          label.classList.toggle('is-correct', input.value === ex.answer);
          label.classList.toggle('is-wrong', input.checked && input.value !== ex.answer);
        });
        void result;
      };
      break;
    }
    case 'text': {
      const input = track(textInput({ id: `${id}-input`, lang: isItalianAnswer ? 'it' : 'en', 'aria-labelledby': `${id}-prompt` }));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          check();
        }
      });
      append(body, input);
      if (isItalianAnswer) append(body, accentBar(() => lastFocused || input));
      getResponse = () => input.value;
      lockInputs = (lock) => (input.disabled = lock);
      markParts = (result) => {
        input.classList.toggle('is-correct', result.correct);
        input.classList.toggle('is-wrong', !result.correct);
      };
      break;
    }
    case 'cloze': {
      const inputs = [];
      const para = h('p', { class: 'cloze', lang: 'it' });
      const parts = ex.text.split(/(\{\d+\})/);
      for (const part of parts) {
        const m = /^\{(\d+)\}$/.exec(part);
        if (m) {
          const n = Number(m[1]);
          const input = track(textInput({ class: 'input input--inline', 'aria-label': `Blank ${n + 1}`, size: Math.max(4, (ex.blanks[n].answer || '').length + 2) }));
          inputs[n] = input;
          append(para, input);
        } else if (part) {
          append(para, h('span', { html: formatInline(part) }));
        }
      }
      append(body, para, accentBar(() => lastFocused || inputs[0]));
      getResponse = () => inputs.map((i) => i.value);
      lockInputs = (lock) => inputs.forEach((i) => (i.disabled = lock));
      markParts = (result) => markInputs(inputs, result, ex.blanks);
      break;
    }
    case 'table': {
      const inputs = [];
      const tbody = h('tbody');
      ex.rows.forEach((row, i) => {
        const input = track(textInput({ 'aria-label': row.label, lang: 'it' }));
        inputs.push(input);
        append(tbody, h('tr', {}, h('th', { scope: 'row', lang: 'it' }, row.label), h('td', {}, input), h('td', { class: 'expected', 'aria-live': 'polite' })));
        void i;
      });
      append(body, h('div', { class: 'table-wrap' }, h('table', { class: 'table table--exercise' }, tbody)), accentBar(() => lastFocused || inputs[0]));
      getResponse = () => inputs.map((i) => i.value);
      lockInputs = (lock) => inputs.forEach((i) => (i.disabled = lock));
      markParts = (result) => {
        markInputs(inputs, result, ex.rows);
        [...tbody.querySelectorAll('.expected')].forEach((cell, i) => {
          cell.textContent = result.parts[i].correct ? '' : `→ ${ex.rows[i].answer}`;
        });
      };
      break;
    }
    case 'match': {
      const rights = [...new Set(ex.pairs.map((p) => p[1]))];
      const shuffled = shuffleList(rights, random);
      const lefts = opts.shuffleOptions === false ? ex.pairs.map((p) => p[0]) : shuffleList(ex.pairs.map((p) => p[0]), random);
      const selects = {};
      const list = h('div', { class: 'match' });
      lefts.forEach((left, i) => {
        const select = h(
          'select',
          { class: 'input', id: `${id}-m${i}` },
          h('option', { value: '' }, 'Choose…'),
          shuffled.map((r) => h('option', { value: r }, r))
        );
        selects[left] = select;
        append(list, h('div', { class: 'match__row' }, h('label', { for: `${id}-m${i}`, class: 'match__left', html: formatInline(left) }), select));
      });
      append(body, list);
      getResponse = () => Object.fromEntries(Object.entries(selects).map(([l, s]) => [l, s.value]));
      lockInputs = (lock) => Object.values(selects).forEach((s) => (s.disabled = lock));
      markParts = (result) => {
        for (const p of result.parts) {
          selects[p.left].classList.toggle('is-correct', p.correct);
          selects[p.left].classList.toggle('is-wrong', !p.correct);
        }
      };
      break;
    }
    case 'order': {
      const chosen = [];
      const bank = h('div', { class: 'order__bank', role: 'group', 'aria-label': 'Available words' });
      const line = h('div', { class: 'order__line', role: 'group', 'aria-label': 'Your sentence' });
      let tokens = shuffleList(ex.tokens, random);
      // Avoid presenting the tokens already in the correct order.
      if (tokens.join(' ') === ex.answer.join(' ') && tokens.length > 1) tokens = [...tokens.slice(1), tokens[0]];
      const paint = () => {
        clear(bank);
        clear(line);
        const remaining = [...tokens];
        for (const c of chosen) remaining.splice(remaining.indexOf(c), 1);
        if (!chosen.length) append(line, h('span', { class: 'order__placeholder' }, 'Click the words in order…'));
        chosen.forEach((t, i) =>
          append(line, h('button', { type: 'button', class: 'token token--chosen', lang: 'it', 'aria-label': `${t}, remove`, onclick: () => { chosen.splice(i, 1); paint(); } }, t))
        );
        remaining.forEach((t) => append(bank, h('button', { type: 'button', class: 'token', lang: 'it', onclick: () => { chosen.push(t); paint(); } }, t)));
      };
      paint();
      append(body, line, bank);
      getResponse = () => [...chosen];
      lockInputs = (lock) => [bank, line].forEach((el) => el.querySelectorAll('button').forEach((b) => (b.disabled = lock)));
      markParts = (result) => {
        line.classList.toggle('is-correct', result.correct);
        line.classList.toggle('is-wrong', !result.correct);
      };
      body.resetOrder = () => {
        chosen.length = 0;
        paint();
      };
      break;
    }
    default:
      append(body, h('p', { class: 'muted' }, `Unsupported exercise kind: ${ex.kind}`));
      getResponse = () => null;
      lockInputs = () => {};
  }

  const checkBtn = h('button', { type: 'button', class: 'btn btn--primary', onclick: () => check() }, icon('Check'), 'Check');
  const retryBtn = h('button', { type: 'button', class: 'btn', hidden: true, onclick: () => retry() }, icon('RotateCcw'), 'Try again');
  const actions = h('div', { class: 'exercise__actions' }, checkBtn, retryBtn);

  const article = h(
    'article',
    { class: 'exercise', dataset: { kind: ex.kind, exerciseId: ex.id } },
    h('header', { class: 'exercise__header' }, opts.number ? h('span', { class: 'exercise__number' }, `${opts.number}.`) : null, h('span', { class: 'exercise__type' }, TYPE_LABELS[ex.type] || ex.type)),
    promptEl,
    body,
    actions,
    feedback
  );

  function check() {
    const response = getResponse();
    const empty =
      response === null ||
      (typeof response === 'string' && !response.trim()) ||
      (Array.isArray(response) && response.every((r) => !String(r).trim())) ||
      (response && typeof response === 'object' && !Array.isArray(response) && Object.values(response).every((v) => !v));
    if (empty) {
      clear(feedback);
      append(feedback, h('p', { class: 'feedback__hint' }, ex.kind === 'choice' ? 'Choose an option first.' : 'Write an answer first.'));
      return;
    }
    const result = checkExercise(ex, response);
    lockInputs(true);
    markParts(result);
    checkBtn.hidden = true;
    retryBtn.hidden = false;
    showFeedback(result);
    article.classList.toggle('exercise--correct', result.correct);
    article.classList.toggle('exercise--wrong', !result.correct);
    if (opts.onChecked) opts.onChecked(result, response, ex);
  }

  function showFeedback(result) {
    clear(feedback);
    const expected = Array.isArray(result.expected) ? result.expected.join(' · ') : result.expected;
    if (result.correct) {
      append(feedback, h('p', { class: 'feedback__verdict feedback__verdict--ok' }, icon('Check'), ' Correct.'));
    } else {
      append(feedback, h('p', { class: 'feedback__verdict feedback__verdict--wrong' }, icon('X'), result.score > 0 ? ` Partly right. ${result.message || ''}` : ' Not quite.'));
      if (result.message && !(result.score > 0)) append(feedback, h('p', { class: 'feedback__message' }, result.message));
      if (ex.kind !== 'table') append(feedback, h('p', { class: 'feedback__answer' }, 'Correct answer: ', h('strong', { lang: ex.lang === 'en' ? 'en' : 'it' }, expected)));
      if (Array.isArray(result.parts) && ex.kind === 'cloze') {
        const wrong = result.parts.map((p, i) => ({ p, i })).filter(({ p }) => !p.correct && p.message);
        for (const { p, i } of wrong) append(feedback, h('p', { class: 'feedback__message' }, `Blank ${i + 1}: ${p.message}`));
      }
    }
    if (ex.explanation) append(feedback, rich('p', ex.explanation, { class: 'feedback__explanation' }));
    const links = [];
    if (ex.ruleRef && opts.lessonId) links.push(h('a', { href: `${pageUrl('lesson', { id: opts.lessonId })}#${ex.ruleRef}` }, 'Review the rule'));
    if (!result.correct && opts.lessonId) links.push(h('a', { href: pageUrl('review', { lesson: opts.lessonId }) }, 'Practise this lesson again'));
    if (links.length) append(feedback, h('p', { class: 'feedback__links' }, links.flatMap((l, i) => (i ? [' · ', l] : [l]))));
  }

  function retry() {
    lockInputs(false);
    article.querySelectorAll('input[type="text"], select').forEach((el) => {
      el.value = '';
      el.classList.remove('is-correct', 'is-wrong');
    });
    article.querySelectorAll('input[type="radio"]').forEach((el) => (el.checked = false));
    article.querySelectorAll('.is-correct, .is-wrong').forEach((el) => el.classList.remove('is-correct', 'is-wrong'));
    article.querySelectorAll('.expected').forEach((el) => (el.textContent = ''));
    if (body.resetOrder) body.resetOrder();
    article.classList.remove('exercise--correct', 'exercise--wrong');
    clear(feedback);
    checkBtn.hidden = false;
    retryBtn.hidden = true;
    const first = article.querySelector('input, select, .token');
    if (first) first.focus();
  }

  article.check = check;
  article.retry = retry;
  return article;
}

function markInputs(inputs, result, items) {
  inputs.forEach((input, i) => {
    const ok = result.parts[i].correct;
    input.classList.toggle('is-correct', ok);
    input.classList.toggle('is-wrong', !ok);
    input.title = ok ? '' : `Correct: ${items[i].answer}`;
  });
}

/**
 * Render a list of exercises with a running score and a "repeat set"
 * button that reshuffles.
 * opts: { lessonId, onChecked, shuffle (exercise order), title }
 */
export function renderExerciseSet(exercises, opts = {}) {
  const container = h('section', { class: 'exercise-set' });
  const score = h('p', { class: 'exercise-set__score', 'aria-live': 'polite' });
  const list = h('div', { class: 'exercise-set__list' });
  let results = new Map();

  const updateScore = () => {
    const done = results.size;
    const right = [...results.values()].filter(Boolean).length;
    score.textContent = done ? `${right} of ${done} checked correct · ${exercises.length - done} remaining` : `${exercises.length} exercises`;
  };

  const render = (reshuffle) => {
    results = new Map();
    clear(list);
    const ordered = reshuffle ? shuffleList(exercises) : exercises;
    ordered.forEach((ex, i) => {
      append(list, 
        renderExercise(ex, {
          number: i + 1,
          lessonId: opts.lessonId || (ex.source && ex.source.type === 'lesson' ? ex.source.id : undefined),
          onChecked: (result, response) => {
            if (!results.has(ex.id)) results.set(ex.id, result.correct);
            updateScore();
            if (opts.onChecked) opts.onChecked(result, response, ex);
          }
        })
      );
    });
    updateScore();
  };

  const repeat = h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => render(true) }, icon('Shuffle'), 'Repeat set (shuffled)');
  append(container, h('div', { class: 'exercise-set__bar' }, score, repeat), list);
  render(Boolean(opts.shuffle));
  return container;
}
