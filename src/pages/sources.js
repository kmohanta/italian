import { h, append } from '../components/dom.js';
import { icon } from '../components/icons.js';
import { pageHeader } from '../components/page-layout.js';
import { SOURCES, LESSONS, STORIES, RHYMES, VERIFICATION, getLesson } from '../core/data-loader.js';
import { BUILT_IN } from '../vocabulary/dictionary.js';

export function context() {
  return { title: 'Sources & licences' };
}

export function render(main) {
  const used = new Map();
  for (const w of BUILT_IN) used.set(w.sourceId, (used.get(w.sourceId) || 0) + 1);
  append(main, 
    pageHeader('Sources and licences', 'Where every part of this site comes from, and how you may reuse it.'),
    h(
      'section',
      { class: 'panel' },
      h('h2', {}, 'Content in this course'),
      h('p', {}, `${LESSONS.length} lessons, ${BUILT_IN.length} vocabulary entries, ${STORIES.length} stories and ${RHYMES.length} rhymes — all written for this project and released under CC BY 4.0. You may copy, adapt and share them, including commercially, if you give appropriate credit.`),
      h('p', { class: 'muted' }, 'Approximate levels (A0 to B2) describe the intended difficulty only. This site is not affiliated with, or certified by, any CEFR examination body.')
    ),
    h(
      'section',
      { class: 'panel' },
      h('h2', {}, 'Provenance'),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'table' },
          h('thead', {}, h('tr', {}, ['Source', 'Covers', 'Licence', 'Author'].map((c) => h('th', { scope: 'col' }, c)))),
          h(
            'tbody',
            {},
            SOURCES.sources.map((s) =>
              h(
                'tr',
                {},
                h('th', { scope: 'row' }, s.url ? h('a', { href: s.url, rel: 'noopener', target: '_blank' }, s.title, ' ', icon('ExternalLink', { size: 14 })) : s.title, h('br'), h('span', { class: 'muted small' }, s.kind)),
                h('td', {}, s.covers, used.get(s.id) ? h('span', { class: 'muted small' }, ` (${used.get(s.id)} vocabulary entries)`) : null, s.note ? h('p', { class: 'muted small' }, s.note) : null),
                h('td', {}, s.licenceUrl ? h('a', { href: s.licenceUrl, rel: 'noopener', target: '_blank' }, s.licence) : s.licence),
                h('td', {}, s.author || '—')
              )
            )
          )
        )
      )
    ),
    verificationPanel(),
    h('section', { class: 'panel' }, h('h2', {}, 'Song lyrics'), h('p', {}, SOURCES.lyricsPolicy)),
    h(
      'section',
      { class: 'panel' },
      h('h2', {}, 'Optional external references'),
      h('p', { class: 'muted' }, 'These links open other websites. They are never contacted unless you click them.'),
      h('ul', { class: 'list' }, SOURCES.references.map((r) => h('li', {}, h('a', { href: r.url, rel: 'noopener', target: '_blank' }, r.title, ' ', icon('ExternalLink', { size: 14 })), h('span', { class: 'muted' }, ` — ${r.note}`))))
    ),
    h('section', { class: 'panel' }, h('h2', {}, 'Privacy'), h('p', {}, 'No analytics, cookies, advertising or third-party requests are used during study. Your data stays in your browser’s local storage. Fonts are your system fonts; icons are bundled with the site.'))
  );
}

const STATUS = {
  'reference-checked': 'checked against references',
  'engine-tested': 'forms tested automatically',
  'author-written': 'author-written, unchecked',
  'needs-review': 'needs review'
};

function verificationPanel() {
  const V = VERIFICATION;
  return h(
    'section',
    { class: 'panel', id: 'verification', 'aria-labelledby': 'verification-h' },
    h('h2', { id: 'verification-h' }, 'Verification register'),
    h('p', {}, h('strong', {}, V.nativeSpeakerReview ? 'Reviewed by a native speaker.' : 'Not reviewed by a native speaker. '), V.statement),
    h('p', { class: 'muted small' }, `Last updated ${V.lastUpdated}. “Forms tested automatically” means the conjugation engine’s output is compared with hand-written expected forms in the test suite; it does not mean that every usage note has been checked.`),
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'table' },
        h('thead', {}, h('tr', {}, ['Topic', 'Status', 'References', 'Open points'].map((c) => h('th', { scope: 'col' }, c)))),
        h(
          'tbody',
          {},
          V.topics.map((t) =>
            h(
              'tr',
              {},
              h('th', { scope: 'row' }, t.topic, t.lessons.length ? h('p', { class: 'small muted' }, t.lessons.map((id, i) => [i ? ', ' : '', h('a', { href: `lesson.html?id=${id}` }, getLesson(id) ? getLesson(id).title : id)])) : null),
              h('td', {}, h('span', { class: ['badge', `badge--${t.status}`] }, STATUS[t.status] || t.status)),
              h('td', { class: 'small' }, (t.sources || []).map((id) => V.references.find((r) => r.id === id)).filter(Boolean).map((r, i) => [i ? '; ' : '', r.title])),
              h('td', { class: 'small' }, t.notes || '')
            )
          )
        )
      )
    ),
    h('h3', {}, 'References and what was checked against them'),
    h(
      'ul',
      { class: 'list' },
      V.references.map((r) =>
        h('li', {}, r.url ? h('a', { href: r.url, rel: 'noopener', target: '_blank' }, r.title, ' ', icon('ExternalLink', { size: 14 })) : h('strong', {}, r.title), h('span', { class: 'muted' }, ` — ${r.author}, ${r.work}. `), h('span', { class: 'small' }, r.checked))
      )
    )
  );
}
