import { h, clear, append } from '../components/dom.js';
import { icon } from '../components/icons.js';
import { pageHeader } from '../components/page-layout.js';
import { notify } from '../components/notifications.js';
import { getStore } from '../core/storage.js';
import { RHYMES, SOURCES } from '../core/data-loader.js';
import { pageUrl } from '../core/pages.js';
import { validateSong, createUserSong, splitLyrics } from '../songs/song-manager.js';

export function context() {
  return { title: 'Songs' };
}

export function songForm({ initial = {}, submitLabel = 'Save song', onSubmit }) {
  const title = h('input', { id: 'sg-title', class: 'input', value: initial.title || '', autocomplete: 'off' });
  const artist = h('input', { id: 'sg-artist', class: 'input', value: initial.artist || '', autocomplete: 'off' });
  const lyrics = h('textarea', { id: 'sg-lyrics', class: 'input input--lyrics', rows: 10, lang: 'it', spellcheck: 'false' });
  lyrics.value = initial.lyrics || '';
  const notes = h('textarea', { id: 'sg-notes', class: 'input', rows: 2 });
  notes.value = initial.notes || '';
  const rights = h('input', { id: 'sg-rights', type: 'checkbox', checked: Boolean(initial.title) });
  const msg = h('div', { 'aria-live': 'polite' });
  return h(
    'form',
    {
      class: 'form',
      novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        clear(msg);
        const input = { title: title.value, artist: artist.value, lyrics: lyrics.value, notes: notes.value, rightsConfirmed: rights.checked };
        const errors = validateSong(input);
        if (errors.length) {
          append(msg, h('div', { class: 'banner banner--error', role: 'alert' }, h('ul', { class: 'plain' }, errors.map((x) => h('li', {}, x)))));
          return;
        }
        onSubmit(input);
      }
    },
    h('div', { class: 'form-row' }, h('div', { class: 'field' }, h('label', { for: 'sg-title' }, 'Title'), title), h('div', { class: 'field' }, h('label', { for: 'sg-artist' }, 'Artist (optional)'), artist)),
    h('div', { class: 'field field--wide' }, h('label', { for: 'sg-lyrics' }, 'Lyrics — one line per line, blank line between verses'), lyrics),
    h('div', { class: 'field field--wide' }, h('label', { for: 'sg-notes' }, 'Notes (optional)'), notes),
    h('label', { class: 'check' }, rights, ' I have the right to use these lyrics for my personal study. They are stored only in this browser.'),
    h('div', { class: 'button-row' }, h('button', { type: 'submit', class: 'btn btn--primary' }, icon('Plus'), submitLabel)),
    msg
  );
}

export function render(main) {
  const store = getStore();
  const state = store.get();
  append(main, 
    pageHeader('Songs', 'Study songs line by line: literal and natural translations, the infinitive behind every verb, vocabulary to save, and your own notes. Start with the original rhymes, or paste lyrics you are allowed to use.')
  );
  append(main, 
    h(
      'section',
      { 'aria-labelledby': 'rh-h' },
      h('h2', { id: 'rh-h' }, 'Original rhymes'),
      h(
        'ul',
        { class: 'story-list' },
        RHYMES.map((r) => {
          const studied = state.songs.studied[r.id];
          return h(
            'li',
            { class: 'story-item' },
            h('a', { class: 'story-item__link', href: pageUrl('song', { id: r.id }) }, h('span', { class: 'story-item__title', lang: 'it' }, r.title), h('span', { class: 'story-item__en' }, r.titleEnglish)),
            h('p', { class: 'story-item__summary' }, r.summary),
            h('p', { class: 'story-item__meta' }, h('span', { class: 'tag tag--level' }, r.level), h('span', { class: 'tag' }, r.form), studied ? h('span', { class: 'badge badge--completed' }, `${studied.lines.length}/${r.lines.length} lines studied`) : null)
          );
        })
      )
    )
  );
  const mine = state.songs.user;
  append(main, 
    h(
      'section',
      { 'aria-labelledby': 'my-h' },
      h('h2', { id: 'my-h' }, 'My songs'),
      mine.length
        ? h(
            'ul',
            { class: 'story-list' },
            mine.map((s) => {
              const studied = state.songs.studied[s.id];
              const lines = splitLyrics(s.lyrics).flat().length;
              return h(
                'li',
                { class: 'story-item' },
                h('a', { class: 'story-item__link', href: pageUrl('song', { id: s.id }) }, h('span', { class: 'story-item__title', lang: 'it' }, s.title), h('span', { class: 'story-item__en' }, s.artist || '')),
                h('p', { class: 'story-item__meta' }, h('span', { class: 'tag' }, `${lines} lines`), studied ? h('span', { class: 'badge badge--completed' }, `${studied.lines.length}/${lines} lines studied`) : null)
              );
            })
          )
        : h('p', { class: 'muted' }, 'No songs yet. Paste the lyrics of an Italian song below to study it here.')
    ),
    h(
      'section',
      { class: 'panel', 'aria-labelledby': 'add-song-h' },
      h('h2', { id: 'add-song-h' }, 'Add a song'),
      h('p', { class: 'note' }, SOURCES.lyricsPolicy),
      songForm({
        onSubmit: (input) => {
          const song = createUserSong(input);
          store.update((d) => {
            d.songs.user.push(song);
          });
          notify('Song saved.');
          window.location.href = pageUrl('song', { id: song.id });
        }
      })
    )
  );
}
