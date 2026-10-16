import { describe, it, expect } from 'vitest';
import { createStore, memoryAdapter, STORAGE_KEY, BACKUP_KEY, normaliseState, SCHEMA_VERSION } from '../src/core/storage.js';

describe('storage', () => {
  it('starts with defaults and persists updates', () => {
    const adapter = memoryAdapter();
    const store = createStore({ adapter });
    expect(store.get().settings.dailyMinutes).toBe(30);
    store.update((d) => {
      d.settings.dailyMinutes = 45;
      d.lessons['present-are'] = { openedAt: 'x' };
    });
    const reopened = createStore({ adapter });
    expect(reopened.get().settings.dailyMinutes).toBe(45);
    expect(reopened.get().lessons['present-are']).toEqual({ openedAt: 'x' });
  });

  it('does not let callers mutate the stored state accidentally', () => {
    const store = createStore({ adapter: memoryAdapter() });
    const s = store.get();
    store.update((d) => {
      d.settings.theme = 'dark';
    });
    expect(s.settings.theme).toBe('auto');
    expect(store.get().settings.theme).toBe('dark');
  });

  it('recovers from damaged JSON and keeps a backup', () => {
    const adapter = memoryAdapter({ [STORAGE_KEY]: '{not json' });
    const store = createStore({ adapter });
    expect(store.get().schemaVersion).toBe(SCHEMA_VERSION);
    expect(store.warnings.length).toBe(1);
    expect(adapter.getItem(BACKUP_KEY)).toBe('{not json');
  });

  it('sanitises invalid values', () => {
    const s = normaliseState({ settings: { theme: 'purple', dailyMinutes: -4, newCardsPerDay: 'lots' }, lessons: [], srs: { cards: 'x' } });
    expect(s.settings.theme).toBe('auto');
    expect(s.settings.dailyMinutes).toBe(5);
    expect(s.settings.newCardsPerDay).toBe(10);
    expect(s.lessons).toEqual({});
    expect(s.srs.cards).toEqual({});
  });

  it('migrates schema v1 custom words', () => {
    const s = normaliseState({ schemaVersion: 1, customWords: [{ id: 'custom_x', lemma: 'x' }] });
    expect(s.vocabulary.custom).toHaveLength(1);
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('works without browser storage', () => {
    const store = createStore({ adapter: null });
    store.update((d) => {
      d.settings.dailyMinutes = 20;
    });
    expect(store.get().settings.dailyMinutes).toBe(20);
  });

  it('reset keeps custom content and settings by default', () => {
    const store = createStore({ adapter: memoryAdapter() });
    store.update((d) => {
      d.settings.dailyMinutes = 50;
      d.vocabulary.custom.push({ id: 'custom_a', lemma: 'a' });
      d.lessons.x = { openedAt: 'now' };
    });
    store.reset();
    expect(store.get().lessons).toEqual({});
    expect(store.get().vocabulary.custom).toHaveLength(1);
    expect(store.get().settings.dailyMinutes).toBe(50);
    store.reset({ keepCustomContent: false, keepSettings: false });
    expect(store.get().vocabulary.custom).toHaveLength(0);
    expect(store.get().settings.dailyMinutes).toBe(30);
  });

  it('collapses repeated activity on the same day', () => {
    const store = createStore({ adapter: memoryAdapter() });
    store.update((d) => {
      store.logActivity(d, 'lesson', 'a', 'Lesson A');
      store.logActivity(d, 'lesson', 'a', 'Lesson A');
      store.logActivity(d, 'story', 'b', 'Story B');
    });
    expect(store.get().activity).toHaveLength(2);
  });
});
