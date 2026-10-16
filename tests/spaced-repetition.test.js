import { describe, it, expect } from 'vitest';
import * as SR from '../src/vocabulary/spaced-repetition.js';
import { addDays, diffDays, isDayKey, describeDay, toDayKey, dayRange } from '../src/core/dates.js';

const today = '2026-10-11';

describe('dates', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // leap year
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('is unaffected by daylight-saving changes', () => {
    // Europe switches clocks on the last Sunday of March and October.
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 7)).toBe('2026-10-31');
    expect(diffDays('2026-03-28', '2026-03-30')).toBe(2);
  });
  it('validates day keys', () => {
    expect(isDayKey('2026-02-29')).toBe(false);
    expect(isDayKey('2028-02-29')).toBe(true);
    expect(isDayKey('2026-13-01')).toBe(false);
    expect(isDayKey('hello')).toBe(false);
  });
  it('describes relative days', () => {
    expect(describeDay(today, today)).toBe('today');
    expect(describeDay('2026-10-12', today)).toBe('tomorrow');
    expect(describeDay('2026-10-15', today)).toBe('in 4 days');
    expect(describeDay('2026-10-09', today)).toBe('2 days ago');
  });
  it('formats the local date', () => {
    expect(toDayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(dayRange(today, 3)).toEqual(['2026-10-11', '2026-10-12', '2026-10-13']);
  });
});

describe('Leitner scheduling', () => {
  it('uses the documented intervals', () => {
    expect(SR.INTERVALS).toEqual([1, 2, 4, 7, 14, 30]);
    expect(SR.intervalForBox(0)).toBe(0);
    expect(SR.intervalForBox(6)).toBe(30);
  });
  it('Good moves up one box', () => {
    expect(SR.schedule(0, 'good', today)).toEqual({ box: 1, interval: 1, due: '2026-10-12' });
    expect(SR.schedule(3, 'good', today)).toEqual({ box: 4, interval: 7, due: '2026-10-18' });
  });
  it('Easy moves up two boxes', () => {
    expect(SR.schedule(0, 'easy', today)).toEqual({ box: 2, interval: 2, due: '2026-10-13' });
    expect(SR.schedule(5, 'easy', today).box).toBe(6);
  });
  it('Hard keeps the box and uses the previous interval', () => {
    expect(SR.schedule(3, 'hard', today)).toEqual({ box: 3, interval: 2, due: '2026-10-13' });
    expect(SR.schedule(0, 'hard', today)).toEqual({ box: 1, interval: 1, due: '2026-10-12' });
  });
  it('Again resets to box 0, due today', () => {
    expect(SR.schedule(5, 'again', today)).toEqual({ box: 0, interval: 0, due: today });
  });
  it('caps at box 6 / 30 days', () => {
    expect(SR.schedule(6, 'good', today)).toEqual({ box: 6, interval: 30, due: '2026-11-10' });
  });
  it('records history, repetitions and lapses', () => {
    let c = SR.newCard('noun_gatto', today);
    c = SR.review(c, 'good', today);
    c = SR.review(c, 'again', '2026-10-12');
    expect(c.reps).toBe(2);
    expect(c.lapses).toBe(1);
    expect(c.history).toEqual([
      { day: today, grade: 'good', from: 0, to: 1 },
      { day: '2026-10-12', grade: 'again', from: 1, to: 0 }
    ]);
  });
  it('rejects unknown grades', () => {
    expect(() => SR.schedule(1, 'perfect', today)).toThrow();
  });
});

describe('queues and statistics', () => {
  const card = (id, box, due, reps = 1, history = []) => ({ id, box, due, reps, lapses: 0, addedOn: '2026-10-01', lastReviewed: null, history });
  it('orders due cards and respects limits', () => {
    const cards = {
      a: card('a', 2, '2026-10-10'),
      b: card('b', 1, '2026-10-11'),
      c: card('c', 3, '2026-10-20'),
      n1: card('n1', 0, '2026-10-11', 0),
      n2: card('n2', 0, '2026-10-11', 0),
      n3: card('n3', 0, '2026-10-11', 0)
    };
    const q = SR.buildQueue(cards, { today, newPerDay: 2, maxReviews: 100 });
    expect(q.map((c) => c.id)).toEqual(['a', 'b', 'n1', 'n2']);
    expect(SR.buildQueue(cards, { today, newPerDay: 2, maxReviews: 1 }).length).toBe(1);
  });
  it('counts new cards already introduced today', () => {
    const cards = {
      x: card('x', 1, '2026-10-12', 1, [{ day: today, grade: 'good', from: 0, to: 1 }]),
      n1: card('n1', 0, today, 0)
    };
    expect(SR.newIntroducedToday(cards, today)).toBe(1);
    expect(SR.buildQueue(cards, { today, newPerDay: 1 }).length).toBe(0);
  });
  it('computes distribution, forecast and retention', () => {
    const cards = {
      a: card('a', 1, today, 1, [{ day: '2026-10-05', grade: 'good', from: 1, to: 2 }]),
      b: card('b', 4, '2026-10-13', 1, [{ day: '2026-10-06', grade: 'again', from: 2, to: 0 }]),
      c: card('c', 6, '2026-11-20')
    };
    expect(SR.boxDistribution(cards)).toEqual([0, 1, 0, 0, 1, 0, 1]);
    expect(SR.forecast(cards, today, 3)).toEqual([1, 0, 1]);
    expect(SR.retention(cards, today)).toBe(0.5);
  });
});
