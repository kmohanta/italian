/**
 * Leitner-style spaced repetition.
 *
 * SCHEDULING POLICY (also shown on the Review page)
 * --------------------------------------------------
 * Each card sits in a box. Box 0 is "learning"; boxes 1–6 have fixed
 * intervals:
 *
 *     box       1   2   3   4   5    6
 *     interval  1   2   4   7   14   30   (days)
 *
 * After a card is shown, the learner grades their recall:
 *
 *   Again — not remembered. The card returns to box 0 and is due again
 *           today (it reappears later in the same session). Counts as a
 *           lapse.
 *   Hard  — remembered with difficulty. The card stays in its box (a
 *           learning card moves to box 1) and is scheduled with the
 *           *previous* box's interval, so it comes back sooner.
 *   Good  — remembered. The card moves up one box and is scheduled with
 *           that box's interval.
 *   Easy  — remembered effortlessly. The card moves up two boxes.
 *
 * Box 6 is the ceiling: Good or Easy there keeps the card in box 6 and
 * schedules it 30 days ahead. Dates are local calendar days.
 *
 * A card counts as "known" from box 4 (an interval of a week or more).
 */

import { addDays, compareDayKeys, toDayKey } from '../core/dates.js';

export const INTERVALS = [1, 2, 4, 7, 14, 30]; // index = box - 1
export const MAX_BOX = INTERVALS.length;
export const GRADES = ['again', 'hard', 'good', 'easy'];
export const KNOWN_FROM_BOX = 4;

export function intervalForBox(box) {
  if (box <= 0) return 0;
  return INTERVALS[Math.min(box, MAX_BOX) - 1];
}

export function newCard(wordId, today = toDayKey()) {
  return {
    id: wordId,
    box: 0,
    due: today,
    reps: 0,
    lapses: 0,
    addedOn: today,
    lastReviewed: null,
    history: [] // { day, grade, from, to }
  };
}

/** Pure: compute the next box and due date for a grade. */
export function schedule(box, grade, today) {
  let next;
  let interval;
  switch (grade) {
    case 'again':
      next = 0;
      interval = 0;
      break;
    case 'hard':
      next = Math.max(1, box);
      interval = intervalForBox(Math.max(1, next - 1));
      break;
    case 'good':
      next = Math.min(MAX_BOX, box + 1);
      interval = intervalForBox(next);
      break;
    case 'easy':
      next = Math.min(MAX_BOX, box + 2);
      interval = intervalForBox(next);
      break;
    default:
      throw new Error(`Unknown grade: ${grade}`);
  }
  return { box: next, interval, due: addDays(today, interval) };
}

/** Return an updated copy of the card after grading it. */
export function review(card, grade, today = toDayKey()) {
  const s = schedule(card.box, grade, today);
  return {
    ...card,
    box: s.box,
    due: s.due,
    reps: card.reps + 1,
    lapses: card.lapses + (grade === 'again' ? 1 : 0),
    lastReviewed: today,
    history: [...card.history, { day: today, grade, from: card.box, to: s.box }].slice(-50)
  };
}

/** Human-readable label for the interval a grade would produce. */
export function previewLabel(card, grade, today = toDayKey()) {
  const { interval } = schedule(card.box, grade, today);
  if (interval === 0) return 'again today';
  if (interval === 1) return '1 day';
  return `${interval} days`;
}

export function isDue(card, today = toDayKey()) {
  return compareDayKeys(card.due, today) <= 0;
}

/** Cards due today (or overdue), most overdue and lowest box first. */
export function dueCards(cards, today = toDayKey()) {
  return Object.values(cards)
    .filter((c) => isDue(c, today))
    .sort((a, b) => compareDayKeys(a.due, b.due) || a.box - b.box || a.id.localeCompare(b.id));
}

/** How many cards were introduced (first reviewed) on `today`. */
export function newIntroducedToday(cards, today = toDayKey()) {
  return Object.values(cards).filter((c) => c.history.length > 0 && c.history[0].day === today).length;
}

/** How many reviews were done today. */
export function reviewsDoneToday(cards, today = toDayKey()) {
  let n = 0;
  for (const c of Object.values(cards)) for (const h of c.history) if (h.day === today) n++;
  return n;
}

/**
 * Build today's queue respecting the daily limits.
 *  - due: cards already reviewed before (reps > 0) that are due.
 *  - fresh: cards never reviewed, in the order given by `newOrder`
 *    (an array of word IDs) — capped by the remaining new-card allowance.
 */
export function buildQueue(cards, { today = toDayKey(), newPerDay = 10, maxReviews = 100 } = {}) {
  const all = dueCards(cards, today);
  const seen = all.filter((c) => c.reps > 0);
  const unseen = all.filter((c) => c.reps === 0).sort((a, b) => compareDayKeys(a.addedOn, b.addedOn) || 0);
  const newAllowance = Math.max(0, newPerDay - newIntroducedToday(cards, today));
  const reviewAllowance = Math.max(0, maxReviews - reviewsDoneToday(cards, today));
  const queue = [...seen, ...unseen.slice(0, newAllowance)];
  return queue.slice(0, reviewAllowance);
}

/** Distribution of cards over boxes: [box0, box1, ..., box6]. */
export function boxDistribution(cards) {
  const dist = new Array(MAX_BOX + 1).fill(0);
  for (const c of Object.values(cards)) dist[Math.min(MAX_BOX, Math.max(0, c.box))]++;
  return dist;
}

/** Number of cards due on each of the next `days` days (today first). */
export function forecast(cards, today = toDayKey(), days = 7) {
  const out = new Array(days).fill(0);
  for (const c of Object.values(cards)) {
    for (let i = 0; i < days; i++) {
      const d = addDays(today, i);
      if (i === 0 ? compareDayKeys(c.due, d) <= 0 : c.due === d) {
        out[i]++;
        break;
      }
    }
  }
  return out;
}

/** Share of non-"again" grades among reviews of previously-seen cards in the last `days` days. */
export function retention(cards, today = toDayKey(), days = 30) {
  const since = addDays(today, -days);
  let total = 0;
  let ok = 0;
  for (const c of Object.values(cards)) {
    for (const h of c.history) {
      if (h.from > 0 && compareDayKeys(h.day, since) > 0) {
        total++;
        if (h.grade !== 'again') ok++;
      }
    }
  }
  return total ? ok / total : null;
}
