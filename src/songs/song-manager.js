/**
 * Song laboratory data: the built-in original rhymes plus songs the
 * learner pastes in. User songs live only in the learner's browser.
 */

import { RHYMES, getRhyme } from '../core/data-loader.js';

export const MAX_LYRICS_LENGTH = 20000;

/** Split pasted lyrics into verses (blank-line separated) and lines. */
export function splitLyrics(text) {
  const clean = String(text || '')
    .replace(/\r\n?/g, '\n')
    .slice(0, MAX_LYRICS_LENGTH);
  const verses = clean
    .split(/\n\s*\n/)
    .map((v) => v.split('\n').map((l) => l.trim()).filter(Boolean))
    .filter((v) => v.length);
  return verses;
}

export function validateSong(input) {
  const errors = [];
  if (!String(input.title || '').trim()) errors.push('Give the song a title.');
  if (!String(input.lyrics || '').trim()) errors.push('Paste the lyrics.');
  if (String(input.lyrics || '').length > MAX_LYRICS_LENGTH) errors.push(`Lyrics are limited to ${MAX_LYRICS_LENGTH} characters.`);
  if (!input.rightsConfirmed) errors.push('Confirm that you have the right to use these lyrics for personal study.');
  return errors;
}

export function createUserSong(input, now = new Date()) {
  return {
    id: `user-${now.getTime().toString(36)}`,
    title: String(input.title).trim().slice(0, 200),
    artist: String(input.artist || '').trim().slice(0, 200),
    lyrics: String(input.lyrics).slice(0, MAX_LYRICS_LENGTH),
    notes: String(input.notes || '').slice(0, 5000),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

/** Unified view of a song (built-in rhyme or user song) as lines with translations. */
export function songView(id, state) {
  const rhyme = getRhyme(id);
  if (rhyme) {
    return {
      id,
      builtIn: true,
      title: rhyme.title,
      subtitle: rhyme.titleEnglish,
      level: rhyme.level,
      names: rhyme.names || [],
      verses: [rhyme.lines.map((l, i) => ({ index: i, it: l.it, literal: l.literal, natural: l.natural, note: l.note }))],
      rhyme
    };
  }
  const user = state.songs.user.find((s) => s.id === id);
  if (!user) return null;
  const translations = state.songs.userTranslations[id] || {};
  let index = 0;
  const verses = splitLyrics(user.lyrics).map((v) =>
    v.map((line) => {
      const t = translations[index] || {};
      return { index: index++, it: line, literal: t.literal || '', natural: t.natural || '', note: '' };
    })
  );
  return { id, builtIn: false, title: user.title, subtitle: user.artist, level: null, names: [], verses, user };
}

export function allSongs(state) {
  return [
    ...RHYMES.map((r) => ({ id: r.id, title: r.title, subtitle: r.titleEnglish, level: r.level, builtIn: true })),
    ...state.songs.user.map((s) => ({ id: s.id, title: s.title, subtitle: s.artist, level: null, builtIn: false }))
  ];
}

export function lineKey(songId, index) {
  return `${songId}#${index}`;
}

export function setLineNote(draft, songId, index, text) {
  const k = lineKey(songId, index);
  const t = String(text || '').trim();
  if (t) draft.songs.lineNotes[k] = t.slice(0, 2000);
  else delete draft.songs.lineNotes[k];
}

export function setUserTranslation(draft, songId, index, field, text) {
  const all = (draft.songs.userTranslations[songId] = draft.songs.userTranslations[songId] || {});
  const entry = (all[index] = all[index] || {});
  entry[field] = String(text || '').slice(0, 1000);
}

export function markStudied(draft, songId, linesStudied, totalLines) {
  const prev = draft.songs.studied[songId] || { lines: [] };
  const lines = [...new Set([...(prev.lines || []), ...linesStudied])];
  draft.songs.studied[songId] = { lines, total: totalLines, at: new Date().toISOString() };
}
