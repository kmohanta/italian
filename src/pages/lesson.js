import { h, rich, clear, pct, append } from '../components/dom.js';
import { icon } from '../components/icons.js';
import { renderNotFound } from '../components/page-layout.js';
import { renderParadigm, renderComparison, renderArticulatedTable, renderDataTable, renderTenseOverview, renderConjugationSet } from '../components/tables.js';
import { renderExerciseSet } from '../components/exercise-renderer.js';
import { openWordModal, speakButton } from '../components/word-detail.js';
import { notify } from '../components/notifications.js';
import { getStore } from '../core/storage.js';
import { getLesson, getStory, getRhyme, nextLesson, previousLesson, verificationFor, verificationReference } from '../core/data-loader.js';
import { getParam } from '../core/router.js';
import { pageUrl } from '../core/pages.js';
import { markLessonOpened, setLessonCompleted, recordExerciseResult, lessonStatus, masteryExplanation } from '../core/progress.js';
import { getWord, displayLemma } from '../vocabulary/dictionary.js';
import { addToReview } from '../vocabulary/vocabulary-manager.js';

export function context() {
  const id = getParam('id');
  const lesson = id ? getLesson(id) : null;
  return {
    lesson,
    id,
    title: lesson ? lesson.title : 'Lesson not found',
    breadcrumbs: [
      { label: 'Learning path', href: 'learning-path.html' },
      ...(lesson ? [{ label: `Module ${lesson.moduleNumber}: ${lesson.moduleTitle}`, href: `learning-path.html#${lesson.moduleId}` }] : []),
      { label: lesson ? lesson.title : 'Not found' }
    ]
  };
}

const STATUS_LABEL = {
  'reference-checked': 'Checked against references',
  'engine-tested': 'Forms tested automatically',
  'author-written': 'Author-written, not yet checked against a reference',
  'needs-review': 'Needs review'
};

/** Honest provenance note for a lesson, from src/data/verification.json. */
export function verificationNote(lessonId) {
  const v = verificationFor(lessonId);
  const refs = v ? (v.sources || []).map(verificationReference).filter(Boolean) : [];
  return h(
    'aside',
    { class: 'verification', 'aria-label': 'Verification status' },
    h('p', { class: 'verification__status' }, h('strong', {}, 'Verification: '), v ? STATUS_LABEL[v.status] || v.status : 'not recorded', '. ', h('span', { class: 'muted' }, 'Not reviewed by a native speaker.')),
    refs.length
      ? h('p', { class: 'small' }, 'References: ', refs.map((r, i) => [i ? '; ' : '', r.url ? h('a', { href: r.url, rel: 'noopener', target: '_blank' }, r.title) : r.title, ` (${r.work})`]))
      : null,
    v && v.notes ? h('p', { class: 'small muted' }, v.notes) : null,
    h('p', { class: 'small' }, h('a', { href: 'sources.html#verification' }, 'Full verification register'))
  );
}

const RULE_LABEL = { rule: 'Rule', tendency: 'Tendency', exception: 'Exception', tip: 'Tip' };

export function renderBlock(block) {
  switch (block.type) {
    case 'p':
      return rich('p', block.text);
    case 'list':
      return h('ul', { class: 'bullets' }, block.items.map((t) => rich('li', t)));
    case 'rule':
      return h(
        'aside',
        { class: ['rule', `rule--${block.kind}`], 'aria-label': RULE_LABEL[block.kind] || 'Note' },
        h('p', { class: 'rule__label' }, RULE_LABEL[block.kind] || 'Note', block.title ? h('span', { class: 'rule__title' }, ` — ${block.title}`) : null),
        rich('p', block.text)
      );
    case 'table':
      return renderDataTable(block);
    case 'paradigm': {
      const word = getWord(block.verb);
      return word ? renderParadigm(word, block.tense || 'present', { highlightEndings: block.highlightEndings, gender: block.gender }) : null;
    }
    case 'compare': {
      const words = block.verbs.map((v) => getWord(v)).filter(Boolean);
      return renderComparison(words, block.tense || 'present');
    }
    case 'articulated-table':
      return renderArticulatedTable();
    case 'tense-overview':
      return renderTenseOverview();
    case 'conjugation-set': {
      const word = getWord(block.verb);
      return word ? renderConjugationSet(word, { gender: block.gender }) : null;
    }
    default:
      return null;
  }
}

function statusPanel(lesson) {
  const store = getStore();
  const panel = h('aside', { class: 'status-panel', 'aria-label': 'Lesson status' });
  const paint = () => {
    const s = lessonStatus(store.get(), lesson);
    clear(panel);
    append(panel, 
      h('p', { class: 'status-panel__line' }, h('strong', {}, s.state === 'completed' ? 'Completed' : 'Not marked complete'), s.attempted ? ` · ${s.attempted}/${s.total} exercises tried · accuracy ${pct(s.accuracy)}` : ''),
      h('p', { class: 'muted small' }, masteryExplanation(s)),
      h(
        'button',
        {
          type: 'button',
          class: ['btn', s.state === 'completed' ? '' : 'btn--primary'],
          onclick: () => {
            store.update((d) => {
              setLessonCompleted(d, lesson.id, s.state !== 'completed');
              store.logActivity(d, 'lesson', lesson.id, lesson.title);
            });
            notify(s.state === 'completed' ? 'Lesson marked as not complete.' : 'Lesson marked complete.');
            paint();
          }
        },
        icon(s.state === 'completed' ? 'RotateCcw' : 'SquareCheck'),
        s.state === 'completed' ? 'Mark as not complete' : 'Mark lesson complete'
      )
    );
  };
  paint();
  panel.repaint = paint;
  return panel;
}

export function render(main, ctx) {
  const lesson = ctx.lesson;
  if (!lesson) {
    renderNotFound(main, { what: 'lesson', backHref: 'learning-path.html', backLabel: 'Go to the learning path', detail: ctx.id ? `There is no lesson with the ID “${ctx.id}”.` : 'No lesson was specified in the link.' });
    return;
  }
  const store = getStore();
  store.update((d) => {
    markLessonOpened(d, lesson.id);
    store.logActivity(d, 'lesson', lesson.id, lesson.title);
  });

  const toc = h(
    'nav',
    { class: 'toc', 'aria-label': 'In this lesson' },
    h('p', { class: 'toc__title' }, 'In this lesson'),
    h(
      'ol',
      {},
      lesson.sections.map((s) => h('li', {}, h('a', { href: `#${s.id}` }, s.heading))),
      h('li', {}, h('a', { href: '#examples' }, 'Worked examples')),
      h('li', {}, h('a', { href: '#exercises' }, 'Exercises')),
      h('li', {}, h('a', { href: '#summary' }, 'Summary'))
    )
  );

  const header = h(
    'header',
    { class: 'lesson-header' },
    h('p', { class: 'eyebrow' }, `Module ${lesson.moduleNumber} · Lesson ${lesson.positionInModule} · approx. ${lesson.level}`),
    h('h1', {}, lesson.title),
    h('p', { class: 'lead' }, lesson.description)
  );

  const objectives = h('section', { class: 'objectives', 'aria-labelledby': 'obj-h' }, h('h2', { id: 'obj-h' }, 'Objectives'), h('ul', { class: 'checklist' }, lesson.objectives.map((o) => rich('li', o))));

  const sections = lesson.sections.map((s) => h('section', { class: 'lesson-section', id: s.id, 'aria-labelledby': `${s.id}-h` }, h('h2', { id: `${s.id}-h` }, s.heading), s.blocks.map(renderBlock)));

  const examples = h(
    'section',
    { class: 'lesson-section', id: 'examples', 'aria-labelledby': 'examples-h' },
    h('h2', { id: 'examples-h' }, 'Worked examples'),
    h(
      'ol',
      { class: 'examples' },
      lesson.examples.map((ex) =>
        h(
          'li',
          { class: 'example' },
          h('p', { class: 'example__it', lang: 'it' }, ex.it, ' ', speakButton(ex.it)),
          h('p', { class: 'example__en' }, ex.en),
          ex.note ? rich('p', ex.note, { class: 'example__note' }) : null,
          /[.!?]$/.test(ex.it) ? h('a', { class: 'small', href: `grammar.html?s=${encodeURIComponent(ex.it)}#analyser` }, 'Analyse this sentence') : null
        )
      )
    )
  );

  const status = statusPanel(lesson);
  const exercises = h(
    'section',
    { class: 'lesson-section', id: 'exercises', 'aria-labelledby': 'exercises-h' },
    h('h2', { id: 'exercises-h' }, 'Exercises'),
    h('p', { class: 'muted' }, 'Feedback appears immediately. Accents, articles and endings count. Every exercise can be retried.'),
    renderExerciseSet(lesson.exercises, {
      lessonId: lesson.id,
      onChecked: (result, response, ex) => {
        store.update((d) => {
          recordExerciseResult(d, ex, response, result);
          store.logActivity(d, 'exercise', lesson.id, lesson.title);
        });
        status.repaint();
      }
    })
  );

  const words = lesson.relatedVocabulary.map((id) => getWord(id)).filter(Boolean);
  const vocab = h(
    'section',
    { class: 'lesson-section', id: 'vocabulary', 'aria-labelledby': 'vocab-h' },
    h('h2', { id: 'vocab-h' }, 'Related vocabulary'),
    h(
      'ul',
      { class: 'chips' },
      words.map((w) => h('li', {}, h('button', { type: 'button', class: 'chip', lang: 'it', onclick: () => openWordModal(w) }, displayLemma(w), h('span', { class: 'chip__meaning', lang: 'en' }, w.meaning))))
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'btn',
        onclick: () => {
          store.update((d) => words.forEach((w) => addToReview(d, w.id)));
          notify(`${words.length} words added to your review queue.`);
        }
      },
      icon('Plus'),
      'Add all to review'
    )
  );

  const stories = lesson.relatedStories.map(getStory).filter(Boolean);
  const songs = (lesson.relatedSongs || []).map(getRhyme).filter(Boolean);
  const apply = h(
    'section',
    { class: 'lesson-section', id: 'apply', 'aria-labelledby': 'apply-h' },
    h('h2', { id: 'apply-h' }, 'Apply it'),
    h(
      'ul',
      { class: 'list' },
      stories.map((s) => h('li', {}, 'Read ', h('a', { href: pageUrl('story', { id: s.id }), lang: 'it' }, s.title), ` (${s.level}) — ${s.summary}`)),
      songs.map((s) => h('li', {}, 'Study the rhyme ', h('a', { href: pageUrl('song', { id: s.id }), lang: 'it' }, s.title))),
      h('li', {}, 'Revise later: ', h('a', { href: pageUrl('review', { lesson: lesson.id }) }, 'practise this lesson’s exercises again')),
      h('li', {}, 'Look it up: ', h('a', { href: pageUrl('grammar', { lesson: lesson.id }) }, 'this topic in the grammar reference'))
    )
  );

  const summary = h('section', { class: 'lesson-section summary', id: 'summary', 'aria-labelledby': 'summary-h' }, h('h2', { id: 'summary-h' }, 'Summary'), h('ul', { class: 'bullets' }, lesson.summary.map((s) => rich('li', s))));

  const prev = previousLesson(lesson.id);
  const next = nextLesson(lesson.id);
  const pager = h(
    'nav',
    { class: 'pager', 'aria-label': 'Lesson navigation' },
    prev ? h('a', { class: 'pager__prev', href: pageUrl('lesson', { id: prev.id }) }, icon('ChevronLeft'), h('span', {}, h('small', {}, 'Previous'), prev.title)) : h('span'),
    next ? h('a', { class: 'pager__next', href: pageUrl('lesson', { id: next.id }) }, h('span', {}, h('small', {}, 'Next'), next.title), icon('ChevronRight')) : h('a', { class: 'pager__next', href: 'learning-path.html' }, h('span', {}, h('small', {}, 'Finished'), 'Back to the learning path'))
  );

  append(main, h('article', { class: 'lesson' }, header, h('div', { class: 'lesson-layout' }, h('div', { class: 'lesson-main' }, objectives, ...sections, examples, exercises, summary, vocab, apply, verificationNote(lesson.id), status, pager), toc)));
}
