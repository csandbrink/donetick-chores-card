const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const DAY_MS = 86400000;

// Timestamp in ms, or null when the value is empty or unparsable. A bare
// YYYY-MM-DD is a calendar day, not UTC midnight - new Date() would read it as
// the latter and shift it by a day west of UTC.
export function parseDue(value) {
  if (!value) return null;
  const dateOnly = DATE_ONLY.exec(String(value));
  const time = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])).getTime()
    : new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/** Local midnight of the day the given date falls on. */
export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Whole calendar days from today to the given timestamp: 0 for today, 1 for
 * tomorrow, negative for the past. Day granularity, so a chore due earlier
 * today still counts as today.
 */
export function daysFromToday(time, now = new Date()) {
  return Math.round((startOfDay(new Date(time)) - startOfDay(now)) / DAY_MS);
}

/** True when the timestamp lies on a calendar day before today. */
export function isBeforeToday(time, now = new Date()) {
  return startOfDay(new Date(time)) < startOfDay(now);
}

/**
 * The value a datetime-local input wants ("YYYY-MM-DDTHH:mm", local time) for
 * a due date, or "" when there is none or it cannot be read.
 */
export function toDateTimeLocal(value) {
  const time = parseDue(value);
  if (time === null) return "";
  const date = new Date(time);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Today at 18:00 local time - the time of day Donetick's own frontend uses
 * for a recurring chore when the user picks none.
 */
export function defaultTimeOfDay(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0, 0);
}

/** Day and month in the given locale, e.g. "06.10." or "10/06". */
export function formatDayMonth(time, locale) {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit" }).format(new Date(time));
}
