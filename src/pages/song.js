import { h, clear, rich, append } from '../components/dom.js';
import { icon } from '../components/icons.js';
import { renderNotFound } from '../components/page-layout.js';
import { renderExerciseSet } from '../components/exercise-renderer.js';
import { openWordModal, speakButton } from '../components/word-detail.js';
import { confirmDialog } from '../components/modal.js';
import { notify } from '../components/notifications.js';
import { renderTokens, renderVerbFormsPanel } from './story.js';
import { songForm } from './songs.js';
import { getStore } from '../core/storage.js';
import { getRhyme, getLesson } from '../core/data-loader.js';
import { getParam } from '../core/router.js';
import { pageUrl } from '../core/pages.js';
import { recordExerciseResult } from '../core/progress.js';
import { songView, setLineNote, setUserTranslation, markStudied, lineKey } from '../songs/song-manager.js';
import { createLocalAudio } from '../songs/audio-player.js';
import { prepareSentence, verbContexts, verbFormsUsed } from '../reading/reading-engine.js';
import { getWord, displayLemma } from '../vocabulary/dictionary.js';
import { addToReview } from '../vocabulary/vocabulary-manager.js';
import { PERSONS } from '../grammar/grammar-engine.js';

export function context() {
  const id = getParam('id');
  const state = getStore().get();
  const view = id ? songView(id, state) : null;
  return {
    id,
    view,
    title: view ? view.title : 'Song not found',
    breadcrumbs: [{ label: 'Songs', href: 'songs.html' }, { label: view ? view.title : 'Not found' }]
  };
}

/** Verb analysis of a line: every verb form with its infinitive and person/tense. */
function verbAnalysis(tokens) {
  const rows = [];
  for (const t of tokens) {
    if (t.kind !== 'word') continue;
    const verbs = t.analyses.filter((a) => a.pos === 'verb');
    if (!verbs.length) continue;
    rows.push({
      form: t.text,
      readings: verbs.map((a) => {
        const f = a.features;
        const detail = f.tense ? `${f.tense}, ${f.person || PERSONS[f.personIndex]}` : f.form === 'past participle' ? `past participle (${f.agreement})` : f.form;
        return { lemma: a.lemma, detail, wordId: a.wordId };
      })
    });
  }
  return rows;
}

function audioPanel() {
  const audio = h('audio', { controls: true, preload: 'metadata', class: 'audio' });
  const ctl = createLocalAudio(audio);
  const status = h('p', { class: 'muted small', 'aria-live': 'polite' }, 'No file loaded.');
  const file = h('input', {
    type: 'file',
    id: 'audio-file',
    accept: 'audio/*',
    class: 'input',
    onchange: (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      if (ctl.load(f)) status.textContent = `Playing from your device: ${f.name}. The file is not uploaded or saved.`;
      else status.textContent = 'That file does not look like an audio file.';
    }
  });
  const rate = h(
    'select',
    { id: 'audio-rate', class: 'input', onchange: (e) => ctl.setRate(Number(e.target.value)) },
    [0.5, 0.75, 0.9, 1, 1.25].map((r) => h('option', { value: r, selected: r === 1 }, `${r}×`))
  );
  return h(
    'section',
    { class: 'panel', 'aria-labelledby': 'audio-h' },
    h('h2', { id: 'audio-h' }, 'Audio (optional)'),
    h('p', { class: 'muted small' }, 'Choose an audio file stored on your device to listen while you read. It plays locally and is forgotten when you leave the page.'),
    h('div', { class: 'form-row' }, h('div', { class: 'field' }, h('label', { for: 'audio-file' }, 'Audio file'), file), h('div', { class: 'field' }, h('label', { for: 'audio-rate' }, 'Speed'), rate)),
    audio,
    h('div', { class: 'button-row' }, h('button', { type: 'button', class: 'btn btn--small', onclick: () => ctl.rewind(5) }, icon('Rewind', { size: 16 }), 'Back 5 s')),
    status
  );
}

export function render(main, ctx) {
  const store = getStore();
  let view = ctx.view;
  if (!view) {
    renderNotFound(main, { what: 'song', backHref: 'songs.html', backLabel: 'Go to the songs list', detail: ctx.id ? `There is no song with the ID “${ctx.id}” in this browser. Songs you add are stored only on the device where you added them.` : 'No song was specified in the link.' });
    return;
  }
  store.update((d) => store.logActivity(d, 'song', view.id, view.title));

  const lines = view.verses.flat();
  let current = 0;
  const studio = h('section', { class: 'panel line-studio', 'aria-labelledby': 'studio-h', 'aria-live': 'polite' });
  const lyricsEl = h('div', { class: 'lyrics', lang: 'it' });

  function paintLyrics() {
    clear(lyricsEl);
    const studied = new Set((store.get().songs.studied[view.id] || {}).lines || []);
    view.verses.forEach((verse) => {
      append(lyricsEl, 
        h(
          'ol',
          { class: 'verse', start: verse[0].index + 1 },
          verse.map((l) =>
            h(
              'li',
              { class: ['lyric-line', l.index === current && 'is-current', studied.has(l.index) && 'is-studied'] },
              h('button', { type: 'button', class: 'lyric-line__btn', 'aria-current': l.index === current ? 'true' : null, onclick: () => { current = l.index; paintLyrics(); paintStudio(); } }, l.it),
              studied.has(l.index) ? h('span', { class: 'sr-only' }, ' (studied)') : null
            )
          )
        )
      );
    });
  }

  function paintStudio() {
    clear(studio);
    const line = lines[current];
    const state = store.get();
    const tokens = prepareSentence(line.it, { names: view.names, custom: state.vocabulary.custom });
    const contexts = verbContexts(line.it, { names: view.names, custom: state.vocabulary.custom });
    const showLit = h('div', { class: 'reveal', hidden: true });
    const showNat = h('div', { class: 'reveal', hidden: true });
    const revealBtn = (target, label) =>
      h('button', { type: 'button', class: 'btn btn--small', 'aria-expanded': 'false', onclick: (e) => { target.hidden = !target.hidden; e.currentTarget.setAttribute('aria-expanded', String(!target.hidden)); } }, icon('Eye', { size: 16 }), label);

    let translations;
    if (view.builtIn) {
      append(showLit, h('p', {}, line.literal));
      append(showNat, h('p', {}, line.natural));
      translations = h('div', { class: 'translations' }, h('div', { class: 'button-row' }, revealBtn(showLit, 'Literal translation'), revealBtn(showNat, 'Natural translation')), showLit, showNat, line.note ? rich('p', line.note, { class: 'note' }) : null);
    } else {
      const field = (key, label) => {
        const id = `tr-${key}`;
        const input = h('textarea', { id, class: 'input', rows: 1 });
        input.value = line[key] || '';
        input.addEventListener('change', () => {
          store.update((d) => setUserTranslation(d, view.id, line.index, key, input.value));
          view = songView(view.id, store.get());
          lines.splice(0, lines.length, ...view.verses.flat());
          notify('Translation saved.');
        });
        return h('div', { class: 'field field--wide' }, h('label', { for: id }, label), input);
      };
      translations = h('div', { class: 'translations' }, h('p', { class: 'muted small' }, 'Write your own translations; they are saved in this browser.'), field('literal', 'Literal translation'), field('natural', 'Natural translation'));
    }

    const verbs = verbAnalysis(tokens);
    const verbTable = verbs.length
      ? h(
          'table',
          { class: 'table table--small' },
          h('caption', {}, 'Verbs in this line'),
          h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Form'), h('th', { scope: 'col' }, 'Infinitive'), h('th', { scope: 'col' }, 'Analysis'))),
          h(
            'tbody',
            {},
            verbs.flatMap((v) =>
              v.readings.map((r, i) =>
                h(
                  'tr',
                  {},
                  i === 0 ? h('th', { scope: 'row', lang: 'it', rowspan: v.readings.length }, v.form) : null,
                  h('td', { lang: 'it' }, r.wordId ? h('button', { type: 'button', class: 'link-btn', onclick: () => openWordModal(getWord(r.wordId, state.vocabulary.custom)) }, r.lemma) : r.lemma),
                  h('td', {}, r.detail)
                )
              )
            )
          )
        )
      : h('p', { class: 'muted small' }, 'No verb forms from the dictionary in this line.');
    const unknown = tokens.filter((t) => t.kind === 'word' && !t.known && !t.name);

    const note = h('textarea', { id: 'line-note', class: 'input', rows: 2, placeholder: 'Your note on this line…' });
    note.value = state.songs.lineNotes[lineKey(view.id, line.index)] || '';
    const studiedNow = ((state.songs.studied[view.id] || {}).lines || []).includes(line.index);

    append(studio, 
      h('h2', { id: 'studio-h' }, `Line ${line.index + 1} of ${lines.length}`),
      h('p', { class: 'studio__line', lang: 'it' }, renderTokens(tokens, { sentence: line.it, hints: true, contexts }), ' ', speakButton(line.it)),
      translations,
      verbTable,
      unknown.length ? h('p', { class: 'note' }, `Not in the dictionary: ${unknown.map((u) => u.text).join(', ')}. Click a word to add it as your own.`) : null,
      h('div', { class: 'field field--wide' }, h('label', { for: 'line-note' }, 'My note'), note),
      h(
        'div',
        { class: 'button-row' },
        h('button', { type: 'button', class: 'btn btn--small', onclick: () => { store.update((d) => setLineNote(d, view.id, line.index, note.value)); notify('Note saved.'); } }, 'Save note'),
        h('button', { type: 'button', class: 'btn btn--small', disabled: current === 0, onclick: () => { current--; paintLyrics(); paintStudio(); } }, icon('ChevronLeft', { size: 16 }), 'Previous line'),
        h(
          'button',
          {
            type: 'button',
            class: ['btn btn--small', !studiedNow && 'btn--primary'],
            onclick: () => {
              store.update((d) => markStudied(d, view.id, [line.index], lines.length));
              if (current < lines.length - 1) current++;
              paintLyrics();
              paintStudio();
            }
          },
          icon('Check', { size: 16 }),
          studiedNow ? 'Studied · next' : 'Mark studied · next'
        )
      )
    );
  }

  paintLyrics();
  paintStudio();

  const header = h('header', { class: 'reader__header' }, h('p', { class: 'eyebrow' }, view.builtIn ? `Original rhyme · ${view.level}` : 'My song'), h('h1', { lang: 'it' }, view.title), view.subtitle ? h('p', { class: 'lead' }, view.subtitle) : null);
  const parts = [header];

  if (!view.builtIn) {
    const editArea = h('div', { hidden: true });
    append(editArea, 
      songForm({
        initial: view.user,
        submitLabel: 'Save changes',
        onSubmit: (input) => {
          store.update((d) => {
            const s = d.songs.user.find((x) => x.id === view.id);
            Object.assign(s, { title: input.title.trim(), artist: input.artist.trim(), lyrics: input.lyrics, notes: input.notes, updatedAt: new Date().toISOString() });
          });
          notify('Song updated.');
          window.location.reload();
        }
      })
    );
    parts.push(
      h(
        'div',
        { class: 'button-row' },
        h('button', { type: 'button', class: 'btn btn--small', onclick: () => { editArea.hidden = !editArea.hidden; } }, icon('Pencil', { size: 16 }), 'Edit lyrics'),
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn--small btn--danger',
            onclick: async () => {
              if (await confirmDialog({ title: 'Delete song?', message: `Delete “${view.title}”, its translations and notes from this browser?`, confirmLabel: 'Delete', danger: true })) {
                store.update((d) => {
                  d.songs.user = d.songs.user.filter((x) => x.id !== view.id);
                  delete d.songs.userTranslations[view.id];
                  delete d.songs.studied[view.id];
                  for (const k of Object.keys(d.songs.lineNotes)) if (k.startsWith(`${view.id}#`)) delete d.songs.lineNotes[k];
                });
                window.location.href = 'songs.html';
              }
            }
          },
          icon('Trash2', { size: 16 }),
          'Delete'
        )
      ),
      editArea
    );
    if (view.user.notes) parts.push(h('p', { class: 'note' }, view.user.notes));
  }

  const songForms = verbFormsUsed(lines.map((l) => l.it), { names: view.names, custom: store.get().vocabulary.custom });
  parts.push(h('div', { class: 'song-layout' }, h('section', { class: 'panel', 'aria-label': 'Lyrics' }, h('h2', {}, 'Lines'), h('p', { class: 'muted small' }, 'Choose a line to study it.'), lyricsEl), studio), renderVerbFormsPanel(songForms, 'Verb forms in this text'), audioPanel());

  if (view.builtIn) {
    const r = getRhyme(view.id);
    const words = r.vocabulary.map((id) => getWord(id)).filter(Boolean);
    parts.push(
      h(
        'div',
        { class: 'grid-2' },
        h(
          'section',
          { class: 'panel', 'aria-labelledby': 'rv-h' },
          h('h2', { id: 'rv-h' }, 'Vocabulary'),
          h('ul', { class: 'chips' }, words.map((w) => h('li', {}, h('button', { type: 'button', class: 'chip', lang: 'it', onclick: () => openWordModal(w) }, displayLemma(w), h('span', { class: 'chip__meaning', lang: 'en' }, w.meaning))))),
          h('button', { type: 'button', class: 'btn', onclick: () => { store.update((d) => words.forEach((w) => addToReview(d, w.id))); notify(`${words.length} words added to review.`); } }, icon('Plus'), 'Add all to review')
        ),
        h(
          'section',
          { class: 'panel', 'aria-labelledby': 'rg-h' },
          h('h2', { id: 'rg-h' }, 'Grammar'),
          h(
            'dl',
            { class: 'grammar-notes' },
            r.grammarNotes.flatMap((n) => {
              const l = n.lesson ? getLesson(n.lesson) : null;
              return [h('dt', {}, n.title), h('dd', {}, rich('span', n.text), l ? [' ', h('a', { href: pageUrl('lesson', { id: l.id }) }, `→ ${l.title}`)] : null)];
            })
          )
        )
      ),
      h(
        'section',
        { class: 'panel', 'aria-labelledby': 're-h' },
        h('h2', { id: 're-h' }, 'Exercises'),
        renderExerciseSet(r.exercises, { onChecked: (result, response, ex) => store.update((d) => recordExerciseResult(d, ex, response, result)) })
      )
    );
  }
  append(main, ...parts);
}
