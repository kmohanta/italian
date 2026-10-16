import { h, clear, rich, append } from '../components/dom.js';
import { icon } from '../components/icons.js';
import { renderNotFound, applyPreferences } from '../components/page-layout.js';
import { renderExerciseSet } from '../components/exercise-renderer.js';
import { openTokenModal, openWordModal, speakButton } from '../components/word-detail.js';
import { notify } from '../components/notifications.js';
import { getStore } from '../core/storage.js';
import { getStory, getLesson, STORIES } from '../core/data-loader.js';
import { getParam } from '../core/router.js';
import { pageUrl } from '../core/pages.js';
import { prepareSentence, markRead, recordVisit, toggleStoryFavourite, recordComprehension, verbContexts, verbFormsUsed } from '../reading/reading-engine.js';
import { lessonLinkFor } from '../components/word-detail.js';
import { tenseInfo } from '../grammar/verb-system.js';
import { recordExerciseResult } from '../core/progress.js';
import { getWord, displayLemma } from '../vocabulary/dictionary.js';
import { addToReview } from '../vocabulary/vocabulary-manager.js';
import { speak, stopSpeaking, speechAvailable } from '../songs/audio-player.js';

export function context() {
  const id = getParam('id');
  const story = id ? getStory(id) : null;
  return {
    id,
    story,
    title: story ? story.title : 'Story not found',
    breadcrumbs: [{ label: 'Reading', href: 'reading.html' }, { label: story ? story.title : 'Not found' }]
  };
}

const SIZES = ['small', 'medium', 'large', 'x-large'];

/** Render a prepared sentence as clickable word buttons. */
export function renderTokens(tokens, { sentence, hints, onAdd, contexts } = {}) {
  const frag = [];
  tokens.forEach((t, i) => {
    const prev = tokens[i - 1];
    const needsSpace = i > 0 && !(t.kind === 'punct' && /^[.,;:!?…)»]/.test(t.text)) && !(prev && prev.kind === 'word' && prev.text.endsWith("'") && prev.text !== "po'") && !(prev && prev.kind === 'punct' && /[«(]$/.test(prev.text));
    if (needsSpace) frag.push(' ');
    if (t.kind !== 'word') {
      frag.push(t.text);
      return;
    }
    if (t.name) {
      frag.push(h('span', { class: 'word word--name' }, t.text));
      return;
    }
    const gloss = t.analyses.length ? [...new Set(t.analyses.map((a) => a.meaning))].slice(0, 2).join(' / ') : 'not in the dictionary';
    frag.push(
      h(
        'button',
        {
          type: 'button',
          class: ['word', !t.known && 'word--unknown', hints && t.known && 'word--hint'],
          title: hints ? gloss : null,
          'aria-label': `${t.text}: ${gloss}. Show analysis.`,
          onclick: () => openTokenModal(t.text, t.analyses, { sentence, onAdd, context: contexts ? contexts[i] : null })
        },
        t.text
      )
    );
  });
  return frag;
}

export function render(main, ctx) {
  const story = ctx.story;
  if (!story) {
    renderNotFound(main, { what: 'story', backHref: 'reading.html', backLabel: 'Go to the story list', detail: ctx.id ? `There is no story with the ID “${ctx.id}”.` : 'No story was specified in the link.' });
    return;
  }
  const store = getStore();
  store.update((d) => {
    recordVisit(d, story.id);
    store.logActivity(d, 'story', story.id, story.title);
  });

  let mode = 'hidden'; // 'hidden' | 'all'
  let hints = store.get().settings.showHintsByDefault;
  const revealed = new Set();
  const text = h('div', { class: 'reader__text', lang: 'it' });

  function paintText() {
    clear(text);
    const custom = store.get().vocabulary.custom;
    story.paragraphs.forEach((para, p) => {
      const block = h('div', { class: 'reader__paragraph' });
      para.forEach((s, i) => {
        const key = `${p}-${i}`;
        const tokens = prepareSentence(s.it, { names: story.names, custom });
        const contexts = verbContexts(s.it, { names: story.names, custom });
        const show = mode === 'all' || revealed.has(key);
        const trBtn = h(
          'button',
          {
            type: 'button',
            class: 'icon-btn icon-btn--small',
            'aria-expanded': String(show),
            'aria-label': show ? 'Hide translation' : 'Show translation',
            title: show ? 'Hide translation' : 'Show translation',
            onclick: () => {
              if (revealed.has(key)) revealed.delete(key);
              else revealed.add(key);
              paintText();
            }
          },
          icon(show ? 'EyeOff' : 'Eye', { size: 16 })
        );
        append(block, 
          h(
            'div',
            { class: 'sentence' },
            h('p', { class: 'sentence__it' }, renderTokens(tokens, { sentence: s.it, hints, contexts })),
            h('span', { class: 'sentence__tools' }, speakButton(s.it), trBtn),
            show ? h('p', { class: 'sentence__en', lang: 'en' }, s.en, s.note ? rich('span', ` — ${s.note}`, { class: 'sentence__note' }) : null) : null
          )
        );
      });
      append(text, block);
    });
  }

  const toolbar = h('div', { class: 'reader__toolbar', role: 'toolbar', 'aria-label': 'Reading options' });
  const paintToolbar = () => {
    clear(toolbar);
    const st = store.get();
    const read = Boolean(st.reading.read[story.id]);
    const fav = st.reading.favourites.includes(story.id);
    const sizeIdx = SIZES.indexOf(st.settings.textSize);
    const setSize = (delta) => {
      const next = SIZES[Math.min(SIZES.length - 1, Math.max(0, sizeIdx + delta))];
      store.update((d) => {
        d.settings.textSize = next;
      });
      applyPreferences(store.get().settings);
      paintToolbar();
    };
    append(toolbar, 
      h('button', { type: 'button', class: 'btn btn--small', onclick: () => setSize(-1), disabled: sizeIdx <= 0, 'aria-label': 'Smaller text' }, icon('Type', { size: 14 }), '−'),
      h('button', { type: 'button', class: 'btn btn--small', onclick: () => setSize(1), disabled: sizeIdx >= SIZES.length - 1, 'aria-label': 'Larger text' }, icon('Type', { size: 18 }), '+'),
      h(
        'button',
        { type: 'button', class: 'btn btn--small', 'aria-pressed': String(mode === 'all'), onclick: () => { mode = mode === 'all' ? 'hidden' : 'all'; revealed.clear(); paintText(); paintToolbar(); } },
        icon(mode === 'all' ? 'EyeOff' : 'Eye', { size: 16 }),
        mode === 'all' ? 'Hide all translations' : 'Show all translations'
      ),
      h('button', { type: 'button', class: 'btn btn--small', 'aria-pressed': String(hints), onclick: () => { hints = !hints; paintText(); paintToolbar(); } }, icon('Lightbulb', { size: 16 }), hints ? 'Hints on' : 'Hints off'),
      speechAvailable()
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn btn--small',
              onclick: async () => {
                const s = store.get().settings;
                for (const para of story.paragraphs) for (const x of para) if (!(await speak(x.it, { rate: s.speechRate, voiceURI: s.speechVoice }))) return;
              }
            },
            icon('Play', { size: 16 }),
            'Read aloud'
          )
        : null,
      speechAvailable() ? h('button', { type: 'button', class: 'btn btn--small', onclick: stopSpeaking }, icon('Square', { size: 14 }), 'Stop') : null,
      h('button', { type: 'button', class: 'btn btn--small', 'aria-pressed': String(fav), onclick: () => { store.update((d) => toggleStoryFavourite(d, story.id)); paintToolbar(); } }, icon('Star', { size: 16 }), fav ? 'Favourite' : 'Add to favourites'),
      h(
        'button',
        { type: 'button', class: ['btn btn--small', !read && 'btn--primary'], onclick: () => { store.update((d) => markRead(d, story.id, !read)); notify(read ? 'Marked as unread.' : 'Marked as read.'); paintToolbar(); } },
        icon(read ? 'RotateCcw' : 'Check', { size: 16 }),
        read ? 'Mark as unread' : 'Mark as read'
      )
    );
  };
  paintToolbar();
  paintText();

  const words = story.vocabulary.map((id) => getWord(id)).filter(Boolean);
  const vocab = h(
    'section',
    { class: 'panel', 'aria-labelledby': 'sv-h' },
    h('h2', { id: 'sv-h' }, 'Vocabulary'),
    h('ul', { class: 'chips' }, words.map((w) => h('li', {}, h('button', { type: 'button', class: 'chip', lang: 'it', onclick: () => openWordModal(w) }, displayLemma(w), h('span', { class: 'chip__meaning', lang: 'en' }, w.meaning))))),
    h(
      'button',
      {
        type: 'button',
        class: 'btn',
        onclick: () => {
          store.update((d) => words.forEach((w) => addToReview(d, w.id)));
          notify(`${words.length} words added to review.`);
        }
      },
      icon('Plus'),
      'Add all to review'
    )
  );

  const notes = h(
    'section',
    { class: 'panel', 'aria-labelledby': 'sg-h' },
    h('h2', { id: 'sg-h' }, 'Grammar in this story'),
    h(
      'dl',
      { class: 'grammar-notes' },
      story.grammarNotes.flatMap((n) => {
        const l = n.lesson ? getLesson(n.lesson) : null;
        return [h('dt', {}, n.title), h('dd', {}, rich('span', n.text), l ? [' ', h('a', { href: pageUrl('lesson', { id: l.id }) }, `→ ${l.title}`)] : null)];
      })
    )
  );

  const answered = new Map();
  const questions = h(
    'section',
    { class: 'panel', 'aria-labelledby': 'sq-h' },
    h('h2', { id: 'sq-h' }, 'Comprehension questions'),
    renderExerciseSet(story.questions, {
      onChecked: (result, response, ex) => {
        if (!answered.has(ex.id)) answered.set(ex.id, result.correct);
        store.update((d) => {
          recordExerciseResult(d, ex, response, result);
          if (answered.size === story.questions.length) {
            recordComprehension(d, story.id, [...answered.values()].filter(Boolean).length, story.questions.length);
          }
        });
        if (answered.size === story.questions.length) notify(`Questions finished: ${[...answered.values()].filter(Boolean).length}/${story.questions.length} right first time.`);
      }
    })
  );

  const forms = verbFormsUsed(story.paragraphs.flat().map((x) => x.it), { names: story.names, custom: store.get().vocabulary.custom });
  const formsPanel = renderVerbFormsPanel(forms, 'Verb forms in this story');

  const idx = STORIES.findIndex((s) => s.id === story.id);
  const next = STORIES[idx + 1];

  append(main, 
    h(
      'article',
      { class: 'reader' },
      h('header', { class: 'reader__header' }, h('p', { class: 'eyebrow' }, `${story.level} · ${story.length}`), h('h1', { lang: 'it' }, story.title), h('p', { class: 'lead' }, `${story.titleEnglish} — ${story.summary}`)),
      toolbar,
      h('p', { class: 'muted small' }, 'Click any word to see its meaning, dictionary form and grammar, and to add it to your review. Dotted words are not in the dictionary.'),
      text
    ),
    questions,
    formsPanel,
    h('div', { class: 'grid-2' }, vocab, notes),
    h('nav', { class: 'pager', 'aria-label': 'Stories' }, h('a', { href: 'reading.html', class: 'pager__prev' }, icon('ChevronLeft'), h('span', {}, h('small', {}, 'Back'), 'All stories')), next ? h('a', { class: 'pager__next', href: pageUrl('story', { id: next.id }) }, h('span', {}, h('small', {}, 'Next story'), h('span', { lang: 'it' }, next.title)), icon('ChevronRight')) : h('span'))
  );
}

/**
 * Panel listing the tenses, moods and non-finite forms found in a text,
 * each with examples and a link to its lesson. Forms the learner has not
 * studied yet are marked and briefly explained rather than hidden.
 */
export function renderVerbFormsPanel(forms, title) {
  if (!forms.length) return null;
  const store = getStore();
  const order = ['presente', 'passatoProssimo', 'imperfetto', 'trapassatoProssimo', 'passatoRemoto', 'trapassatoRemoto', 'futuro', 'futuroAnteriore', 'condizionale', 'condizionalePassato', 'congiuntivoPresente', 'congiuntivoPassato', 'congiuntivoImperfetto', 'congiuntivoTrapassato', 'imperativo'];
  const rank = (k) => {
    const i = order.indexOf(k.split(':')[0]);
    return i < 0 ? 99 : i;
  };
  const sorted = [...forms].sort((a, b) => rank(a.key) - rank(b.key));
  return h(
    'section',
    { class: 'panel', 'aria-labelledby': 'vf-h' },
    h('h2', { id: 'vf-h' }, title),
    h('p', { class: 'muted small' }, 'Every verb form is kept as the author wrote it. Forms you have not studied yet are explained briefly here and in the word inspector, with a link to the full lesson. Forms that are ambiguous out of context are not counted.'),
    h(
      'ul',
      { class: 'verb-forms' },
      sorted.map((f) => {
        const info = tenseInfo(f.key.split(':')[0]);
        const rec = store.get().lessons[f.lesson];
        const studied = rec && rec.completedAt;
        return h(
          'li',
          { class: ['verb-forms__item', !studied && 'is-new'] },
          h('p', { class: 'verb-forms__label' }, h('strong', {}, f.label), ' — ', h('span', { lang: 'it' }, f.examples.join(', '))),
          !studied && info ? h('p', { class: 'small' }, f.key.endsWith(':passive') ? `essere/venire + participle. With essere this can be a passive (the subject undergoes the action) or simply a state described by a participle used as an adjective (era spento = it was off); context decides. Tense of the auxiliary: ${info.summary}` : info.summary) : null,
          lessonLinkFor(f.lesson)
        );
      })
    )
  );
}
