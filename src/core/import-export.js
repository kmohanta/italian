/**
 * Backup and restore of personal data as JSON.
 *
 * Export produces a self-describing file:
 *   { app: 'italian-learning-lab', schemaVersion, exportedAt, data: {...} }
 *
 * Import validates the file, produces a human-readable summary for a
 * preview, and only then (after the learner confirms) replaces the stored
 * data. Nothing is merged silently.
 */

import { SCHEMA_VERSION, normaliseState } from './storage.js';

export const APP_ID = 'italian-learning-lab';
const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export function buildExport(state, now = new Date()) {
  return {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    data: state
  };
}

export function exportFilename(now = new Date()) {
  const d = now.toISOString().slice(0, 10);
  return `italian-learning-lab-backup-${d}.json`;
}

export function summarise(state) {
  const lessonsCompleted = Object.values(state.lessons).filter((l) => l && l.completedAt).length;
  const lessonsOpened = Object.keys(state.lessons).length;
  const cards = Object.keys(state.srs.cards).length;
  const reviews = Object.values(state.srs.cards).reduce((n, c) => n + (Array.isArray(c.history) ? c.history.length : 0), 0);
  return {
    lessonsOpened,
    lessonsCompleted,
    exercisesAttempted: Object.keys(state.exercises).length,
    reviewCards: cards,
    reviewsRecorded: reviews,
    customWords: state.vocabulary.custom.length,
    notes: Object.keys(state.vocabulary.notes).length,
    storiesRead: Object.keys(state.reading.read).length,
    userSongs: state.songs.user.length,
    createdAt: state.createdAt
  };
}

/**
 * Validate parsed JSON (or a JSON string).
 * Returns { ok, errors: string[], warnings: string[], state?, summary? }.
 */
export function validateImport(input) {
  const errors = [];
  const warnings = [];
  let obj = input;
  if (typeof input === 'string') {
    if (input.length > MAX_IMPORT_BYTES) return { ok: false, errors: ['The file is too large to be a backup from this site.'], warnings };
    try {
      obj = JSON.parse(input);
    } catch {
      return { ok: false, errors: ['The file is not valid JSON.'], warnings };
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, errors: ['The file does not contain a backup object.'], warnings };
  }
  if (obj.app !== APP_ID) errors.push('This file was not exported by Italian Learning Lab.');
  if (typeof obj.schemaVersion !== 'number') errors.push('The backup has no schema version.');
  else if (obj.schemaVersion > SCHEMA_VERSION) errors.push(`The backup was made by a newer version of the site (schema ${obj.schemaVersion}); this version understands up to ${SCHEMA_VERSION}.`);
  else if (obj.schemaVersion < SCHEMA_VERSION) warnings.push(`The backup uses an older format (schema ${obj.schemaVersion}); it will be upgraded.`);
  if (!obj.data || typeof obj.data !== 'object' || Array.isArray(obj.data)) errors.push('The backup has no data section.');
  if (errors.length) return { ok: false, errors, warnings };

  const d = obj.data;
  const expectObject = ['settings', 'lessons', 'exercises', 'srs', 'vocabulary', 'reading', 'songs'];
  for (const k of expectObject) {
    if (d[k] !== undefined && (typeof d[k] !== 'object' || d[k] === null || Array.isArray(d[k]))) {
      warnings.push(`Section “${k}” has an unexpected shape and will be reset.`);
    }
  }
  if (d.srs && d.srs.cards && typeof d.srs.cards === 'object') {
    let bad = 0;
    for (const c of Object.values(d.srs.cards)) {
      if (!c || typeof c.id !== 'string' || typeof c.box !== 'number' || typeof c.due !== 'string') bad++;
    }
    if (bad) warnings.push(`${bad} review card(s) are damaged and will be skipped.`);
  }
  const state = normaliseState(d);
  // Remove damaged cards rather than importing them.
  for (const [id, c] of Object.entries(state.srs.cards)) {
    if (!c || typeof c.id !== 'string' || typeof c.box !== 'number' || typeof c.due !== 'string') delete state.srs.cards[id];
    else if (!Array.isArray(c.history)) c.history = [];
  }
  return { ok: true, errors, warnings, state, summary: summarise(state), exportedAt: obj.exportedAt || null };
}

/** Trigger a download of the backup in a browser. */
export function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
