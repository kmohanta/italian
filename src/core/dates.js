/**
 * Calendar-date helpers.
 *
 * Scheduling works with *local calendar days* represented as ISO strings
 * ("2026-10-11"). Using day keys rather than timestamps means a review due
 * "tomorrow" becomes due at local midnight regardless of the time of day
 * at which it was answered, and daylight-saving changes cannot shift a
 * due date by one day.
 */

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Local calendar day of a Date as "YYYY-MM-DD". */
export function toDayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isDayKey(value) {
  if (typeof value !== 'string') return false;
  const match = DAY_KEY.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

function keyToUtc(key) {
  if (!isDayKey(key)) throw new TypeError(`Invalid day key: ${key}`);
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcToKey(ms) {
  const date = new Date(ms);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const MS_PER_DAY = 86_400_000;

/** Add a whole number of days (may be negative) to a day key. */
export function addDays(key, days) {
  if (!Number.isInteger(days)) throw new TypeError('days must be an integer');
  return utcToKey(keyToUtc(key) + days * MS_PER_DAY);
}

/** Number of days from `a` to `b` (positive if b is later). */
export function diffDays(a, b) {
  return Math.round((keyToUtc(b) - keyToUtc(a)) / MS_PER_DAY);
}

export function compareDayKeys(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Human-friendly relative description of a day key compared with today. */
export function describeDay(key, today = toDayKey()) {
  const diff = diffDays(today, key);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff > 1) return `in ${diff} days`;
  return `${-diff} days ago`;
}

/** Format a day key for display, e.g. "11 Oct 2026". */
export function formatDayKey(key) {
  if (!isDayKey(key)) return '';
  const [y, m, d] = key.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[m - 1]} ${y}`;
}

/** List of day keys from `start` (inclusive) for `count` days. */
export function dayRange(start, count) {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}
