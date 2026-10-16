import { describe, it, expect } from 'vitest';
import { buildExport, validateImport, exportFilename, summarise } from '../src/core/import-export.js';
import { createDefaultState, createStore, memoryAdapter, SCHEMA_VERSION } from '../src/core/storage.js';

function sampleState() {
  const s = createDefaultState();
  s.lessons['present-are'] = { openedAt: '2026-10-01T10:00:00Z', completedAt: '2026-10-01T10:30:00Z' };
  s.srs.cards.noun_gatto = { id: 'noun_gatto', box: 2, due: '2026-10-12', reps: 2, lapses: 0, addedOn: '2026-10-01', lastReviewed: '2026-10-10', history: [{ day: '2026-10-10', grade: 'good', from: 1, to: 2 }] };
  s.vocabulary.custom.push({ id: 'custom_ciuffo', lemma: 'ciuffo', partOfSpeech: 'noun', meaning: 'tuft' });
  return s;
}

describe('export', () => {
  it('wraps the state with metadata', () => {
    const out = buildExport(sampleState(), new Date('2026-10-11T12:00:00Z'));
    expect(out.app).toBe('italian-learning-lab');
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
    expect(out.exportedAt).toBe('2026-10-11T12:00:00.000Z');
    expect(exportFilename(new Date('2026-10-11T12:00:00Z'))).toBe('italian-learning-lab-backup-2026-10-11.json');
  });
});

describe('import', () => {
  it('round-trips a backup and summarises it', () => {
    const json = JSON.stringify(buildExport(sampleState()));
    const res = validateImport(json);
    expect(res.ok).toBe(true);
    expect(res.summary).toMatchObject({ lessonsCompleted: 1, reviewCards: 1, reviewsRecorded: 1, customWords: 1 });
    const store = createStore({ adapter: memoryAdapter() });
    store.replace(res.state);
    expect(store.get().srs.cards.noun_gatto.box).toBe(2);
  });

  it('rejects invalid JSON and foreign files', () => {
    expect(validateImport('{oops').ok).toBe(false);
    expect(validateImport(JSON.stringify({ hello: 1 })).errors[0]).toMatch(/not exported/);
    expect(validateImport('[]').ok).toBe(false);
  });

  it('rejects backups from a newer schema', () => {
    const res = validateImport({ app: 'italian-learning-lab', schemaVersion: SCHEMA_VERSION + 1, data: {} });
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toMatch(/newer version/);
  });

  it('upgrades older backups with a warning', () => {
    const res = validateImport({ app: 'italian-learning-lab', schemaVersion: 1, data: { customWords: [{ id: 'custom_a', lemma: 'a' }] } });
    expect(res.ok).toBe(true);
    expect(res.warnings.join(' ')).toMatch(/older format/);
    expect(res.state.vocabulary.custom).toHaveLength(1);
  });

  it('drops damaged review cards and reports them', () => {
    const s = sampleState();
    s.srs.cards.broken = { id: 'broken', box: 'x' };
    const res = validateImport(buildExport(s));
    expect(res.ok).toBe(true);
    expect(res.warnings.join(' ')).toMatch(/1 review card/);
    expect(res.state.srs.cards.broken).toBeUndefined();
    expect(summarise(res.state).reviewCards).toBe(1);
  });
});
