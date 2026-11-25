const MINUTE_MS = 60 * 1000;
const QUIET_START_MINUTE = 8 * 60;
const QUIET_END_MINUTE = 22 * 60;

function getZonedParts(timestamp, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });

  const values = {};
  for (const part of formatter.formatToParts(new Date(timestamp))) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour === 24 ? 0 : values.hour,
    minute: values.minute,
    second: values.second
  };
}

function isValidTimeZone(timeZone) {
  if (typeof timeZone !== "string" || !timeZone.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function localDateKey(timestamp, timeZone) {
  const parts = getZonedParts(timestamp, timeZone);
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0")
  ].join("-");
}

function addDaysToDateKey(dateKey, amount) {
  const parts = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + amount));
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function zonedTimeToTimestamp(dateKey, clock, timeZone) {
  const dateParts = dateKey.split("-").map(Number);
  const clockMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(clock);
  if (!clockMatch) throw new Error("Clock time must use HH:MM in 24-hour format.");

  const targetHour = Number(clockMatch[1]);
  const targetMinute = Number(clockMatch[2]);
  const desiredAsUtc = Date.UTC(
    dateParts[0],
    dateParts[1] - 1,
    dateParts[2],
    targetHour,
    targetMinute,
    0
  );

  let guess = desiredAsUtc;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const shown = getZonedParts(guess, timeZone);
    const shownAsUtc = Date.UTC(
      shown.year,
      shown.month - 1,
      shown.day,
      shown.hour,
      shown.minute,
      shown.second
    );
    const difference = desiredAsUtc - shownAsUtc;
    if (difference === 0) break;
    guess += difference;
  }

  return guess;
}

function parseClockInput(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || "").trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function clockMatchesTimeZone(clock, timeZone, now = Date.now(), toleranceMinutes = 15) {
  const enteredMinute = parseClockInput(clock);
  if (enteredMinute === null || !isValidTimeZone(timeZone)) return false;

  const parts = getZonedParts(now, timeZone);
  const actualMinute = parts.hour * 60 + parts.minute;
  const directDifference = Math.abs(enteredMinute - actualMinute);
  const wrappedDifference = Math.min(directDifference, 1440 - directDifference);
  return wrappedDifference <= toleranceMinutes;
}

function getIntervalMinutes(goal) {
  const numericGoal = Number(goal);
  return Math.max(45, Math.round((14 * 60) / numericGoal));
}

function nextReminderTimestamp(now, timeZone, intervalMinutes) {
  const candidate = now + intervalMinutes * MINUTE_MS;
  const local = getZonedParts(candidate, timeZone);
  const dateKey = localDateKey(candidate, timeZone);
  const minuteOfDay = local.hour * 60 + local.minute;

  if (minuteOfDay < QUIET_START_MINUTE) {
    return zonedTimeToTimestamp(dateKey, "08:00", timeZone);
  }

  if (minuteOfDay >= QUIET_END_MINUTE) {
    return zonedTimeToTimestamp(addDaysToDateKey(dateKey, 1), "08:00", timeZone);
  }

  return candidate;
}

function nextMorningTimestamp(now, timeZone) {
  const tomorrow = addDaysToDateKey(localDateKey(now, timeZone), 1);
  return zonedTimeToTimestamp(tomorrow, "08:00", timeZone);
}

function formatLocalTime(timestamp, timeZone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(new Date(timestamp));
}

module.exports = {
  addDaysToDateKey,
  clockMatchesTimeZone,
  formatLocalTime,
  getIntervalMinutes,
  getZonedParts,
  isValidTimeZone,
  localDateKey,
  nextMorningTimestamp,
  nextReminderTimestamp,
  parseClockInput,
  zonedTimeToTimestamp
};
