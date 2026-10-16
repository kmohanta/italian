import { h, clear, formatDateTime, append } from '../components/dom.js';
import { icon } from '../components/icons.js';
import { pageHeader, applyPreferences } from '../components/page-layout.js';
import { notify, banner } from '../components/notifications.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { getStore, DEFAULT_SETTINGS } from '../core/storage.js';
import { buildExport, exportFilename, validateImport, downloadJson, summarise } from '../core/import-export.js';
import { speechAvailable, whenVoicesReady, speak } from '../songs/audio-player.js';

export function context() {
  return { title: 'Settings' };
}

function numberField(id, label, value, { min, max, step = 1, help, onChange }) {
  const input = h('input', { id, type: 'number', class: 'input input--number', value, min, max, step });
  input.addEventListener('change', () => {
    const n = Number(input.value);
    if (!Number.isFinite(n)) return;
    onChange(Math.min(max, Math.max(min, Math.round(n))));
    input.value = Math.min(max, Math.max(min, Math.round(n)));
  });
  return h('div', { class: 'field' }, h('label', { for: id }, label), input, help ? h('p', { class: 'help' }, help) : null);
}

function summaryList(s) {
  return h(
    'ul',
    { class: 'plain summary-list' },
    h('li', {}, `${s.lessonsOpened} lessons opened, ${s.lessonsCompleted} completed`),
    h('li', {}, `${s.exercisesAttempted} exercises attempted`),
    h('li', {}, `${s.reviewCards} review cards, ${s.reviewsRecorded} reviews recorded`),
    h('li', {}, `${s.customWords} custom words, ${s.notes} word notes`),
    h('li', {}, `${s.storiesRead} stories read, ${s.userSongs} songs of your own`),
    s.createdAt ? h('li', {}, `profile started ${formatDateTime(s.createdAt)}`) : null
  );
}

export function render(main) {
  const store = getStore();
  const save = (fn, msg = 'Saved.') => {
    store.update((d) => fn(d.settings));
    applyPreferences(store.get().settings);
    notify(msg);
  };
  const s = store.get().settings;

  append(main, pageHeader('Settings', 'Preferences, study goals, and your data.'));

  // Where data lives
  append(main, 
    h(
      'section',
      { class: 'panel panel--info', 'aria-labelledby': 'data-where-h' },
      h('h2', { id: 'data-where-h' }, icon('Info'), ' Where your progress is stored'),
      h('p', {}, 'This site has no server and no accounts. Everything you do — lesson progress, review schedules, notes, your own words and songs — is saved in this browser’s local storage on this device.'),
      h(
        'ul',
        { class: 'bullets' },
        h('li', {}, 'It is not synchronised. Another browser, another device, or a private window will start empty.'),
        h('li', {}, 'Clearing your browser’s site data deletes it.'),
        h('li', {}, 'To back it up or move it to another device, export a JSON file below and import it there.'),
        h('li', {}, 'Nothing is sent anywhere: no tracking, no analytics, no advertising.')
      ),
      store.persistent ? null : banner('Browser storage is not available here (for example in some private-browsing modes). Your progress will be lost when you close the tab.', { type: 'error' })
    )
  );

  // Appearance
  const themeGroup = h(
    'fieldset',
    { class: 'inline-radios' },
    h('legend', {}, 'Theme'),
    [['auto', 'Follow system'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) =>
      h('label', {}, h('input', { type: 'radio', name: 'theme', value: v, checked: s.theme === v, onchange: () => save((st) => { st.theme = v; }) }), ` ${l}`)
    )
  );
  const sizeSel = h(
    'div',
    { class: 'field' },
    h('label', { for: 'set-size' }, 'Text size'),
    h('select', { id: 'set-size', class: 'input', onchange: (e) => save((st) => { st.textSize = e.target.value; }) }, [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large'], ['x-large', 'Extra large']].map(([v, l]) => h('option', { value: v, selected: s.textSize === v }, l)))
  );
  const hints = h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: s.showHintsByDefault, onchange: (e) => save((st) => { st.showHintsByDefault = e.target.checked; }) }), ' Show vocabulary hints (word meanings on hover) in stories by default');
  append(main, h('section', { class: 'panel', 'aria-labelledby': 'app-h' }, h('h2', { id: 'app-h' }, 'Appearance and reading'), themeGroup, sizeSel, hints));

  // Study goals
  append(main, 
    h(
      'section',
      { class: 'panel', 'aria-labelledby': 'goal-h' },
      h('h2', { id: 'goal-h' }, 'Study goals and review limits'),
      h('p', { class: 'muted' }, 'Goals are suggestions. There are no streaks and nothing is lost on days you do not study.'),
      h(
        'div',
        { class: 'form-row' },
        numberField('set-min', 'Daily study target (minutes)', s.dailyMinutes, { min: 5, max: 240, help: 'Split into vocabulary, grammar, reading and songs on the dashboard.', onChange: (v) => save((st) => { st.dailyMinutes = v; }) }),
        numberField('set-new', 'New words per day', s.newCardsPerDay, { min: 0, max: 100, help: 'How many unseen words to introduce each day.', onChange: (v) => save((st) => { st.newCardsPerDay = v; }) }),
        numberField('set-max', 'Maximum reviews per day', s.maxReviewsPerDay, { min: 5, max: 1000, help: 'Caps a session after a long break.', onChange: (v) => save((st) => { st.maxReviewsPerDay = v; }) })
      ),
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'set-dir' }, 'Flashcard direction'),
        h('select', { id: 'set-dir', class: 'input', onchange: (e) => save((st) => { st.reviewDirection = e.target.value; }) }, [['it-en', 'Italian → English'], ['en-it', 'English → Italian'], ['mixed', 'Mixed']].map(([v, l]) => h('option', { value: v, selected: s.reviewDirection === v }, l)))
      )
    )
  );

  // Speech
  const speechSection = h('section', { class: 'panel', 'aria-labelledby': 'tts-h' }, h('h2', { id: 'tts-h' }, 'Read-aloud (text-to-speech)'));
  if (!speechAvailable()) {
    append(speechSection, h('p', { class: 'muted' }, 'Speech synthesis is not available in this browser. Everything else works normally; read-aloud buttons are hidden.'));
  } else {
    const voiceSel = h('select', { id: 'set-voice', class: 'input', onchange: (e) => save((st) => { st.speechVoice = e.target.value; }) }, h('option', { value: '' }, 'Default Italian voice'));
    const voiceInfo = h('p', { class: 'help' }, 'Looking for Italian voices…');
    whenVoicesReady().then((voices) => {
      for (const v of voices) append(voiceSel, h('option', { value: v.voiceURI, selected: v.voiceURI === store.get().settings.speechVoice }, `${v.name} (${v.lang})${v.localService ? '' : ' — online'}`));
      voiceInfo.textContent = voices.length ? `${voices.length} Italian voice(s) found. Voices marked “online” may be processed by your browser vendor’s service.` : 'No Italian voice is installed. Your browser may read Italian with another voice; you can install an Italian voice in your operating system settings.';
    });
    const rate = h('input', { id: 'set-rate', type: 'range', min: 0.5, max: 1.5, step: 0.05, value: s.speechRate, class: 'range' });
    const rateOut = h('output', { for: 'set-rate' }, `${s.speechRate}×`);
    rate.addEventListener('input', () => (rateOut.textContent = `${Number(rate.value).toFixed(2)}×`));
    rate.addEventListener('change', () => save((st) => { st.speechRate = Number(rate.value); }));
    append(speechSection, 
      h('div', { class: 'field' }, h('label', { for: 'set-voice' }, 'Voice'), voiceSel, voiceInfo),
      h('div', { class: 'field' }, h('label', { for: 'set-rate' }, 'Speed'), h('div', { class: 'range-row' }, rate, rateOut)),
      h('button', { type: 'button', class: 'btn', onclick: () => speak('Ciao! Il gatto dorme sul letto.', { rate: store.get().settings.speechRate, voiceURI: store.get().settings.speechVoice }) }, icon('Volume2'), 'Test voice')
    );
  }
  append(main, speechSection);

  // Backup
  const importInput = h('input', { type: 'file', id: 'import-file', accept: 'application/json,.json', class: 'input' });
  const importMsg = h('div', { 'aria-live': 'polite' });
  importInput.addEventListener('change', async () => {
    clear(importMsg);
    const file = importInput.files && importInput.files[0];
    if (!file) return;
    const text = await file.text();
    const res = validateImport(text);
    importInput.value = '';
    if (!res.ok) {
      append(importMsg, h('div', { class: 'banner banner--error', role: 'alert' }, h('strong', {}, 'This file cannot be imported. '), h('ul', { class: 'plain' }, res.errors.map((e) => h('li', {}, e)))));
      return;
    }
    const current = summarise(store.get());
    openModal({
      title: 'Import backup?',
      wide: true,
      content: h(
        'div',
        {},
        h('p', {}, `Backup from ${res.exportedAt ? formatDateTime(res.exportedAt) : 'an unknown date'}. Importing will `, h('strong', {}, 'replace'), ' all data currently in this browser.'),
        res.warnings.length ? h('div', { class: 'banner banner--warning' }, h('ul', { class: 'plain' }, res.warnings.map((w) => h('li', {}, w)))) : null,
        h('div', { class: 'grid-2' }, h('div', {}, h('h3', {}, 'In the backup'), summaryList(res.summary)), h('div', {}, h('h3', {}, 'Currently in this browser'), summaryList(current))),
        h('p', { class: 'muted' }, 'Tip: export your current data first if you might want it back.')
      ),
      actions: [
        { label: 'Cancel' },
        {
          label: 'Replace my data',
          danger: true,
          onClick: () => {
            store.replace(res.state);
            applyPreferences(store.get().settings);
            notify('Backup imported.');
            setTimeout(() => window.location.reload(), 600);
          }
        }
      ]
    });
  });

  append(main, 
    h(
      'section',
      { class: 'panel', 'aria-labelledby': 'backup-h' },
      h('h2', { id: 'backup-h' }, 'Back up and transfer'),
      h('p', {}, 'Your data now: '),
      summaryList(summarise(store.get())),
      h(
        'div',
        { class: 'button-row' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn--primary',
            onclick: () => {
              downloadJson(buildExport(store.get()), exportFilename());
              notify('Backup downloaded.');
            }
          },
          icon('Download'),
          'Export backup (JSON)'
        )
      ),
      h('div', { class: 'field' }, h('label', { for: 'import-file' }, 'Import a backup file'), importInput, h('p', { class: 'help' }, 'You will see a preview and must confirm before anything is replaced.')),
      importMsg
    )
  );

  // Reset
  append(main, 
    h(
      'section',
      { class: 'panel panel--danger', 'aria-labelledby': 'reset-h' },
      h('h2', { id: 'reset-h' }, 'Reset'),
      h('p', {}, 'Resetting never touches the built-in course. Export a backup first if you might want your data back.'),
      h(
        'div',
        { class: 'button-row' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn',
            onclick: async () => {
              if (await confirmDialog({ title: 'Reset learning progress?', message: 'Lesson progress, exercise results, review schedules and reading history will be deleted. Your settings, custom words, notes and songs are kept.', confirmLabel: 'Reset progress', danger: true })) {
                store.reset({ keepCustomContent: true, keepSettings: true });
                notify('Progress reset.');
                setTimeout(() => window.location.reload(), 600);
              }
            }
          },
          icon('RotateCcw'),
          'Reset progress only'
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn--danger',
            onclick: async () => {
              if (await confirmDialog({ title: 'Delete everything?', message: 'All personal data in this browser — progress, settings, custom words, notes and songs — will be permanently deleted.', confirmLabel: 'Delete everything', danger: true })) {
                store.reset({ keepCustomContent: false, keepSettings: false });
                applyPreferences(DEFAULT_SETTINGS);
                notify('All personal data deleted.');
                setTimeout(() => window.location.reload(), 600);
              }
            }
          },
          icon('Trash2'),
          'Delete all personal data'
        )
      )
    )
  );
}
