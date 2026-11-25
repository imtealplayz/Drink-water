const test = require("node:test");
const assert = require("node:assert/strict");
const {
  clockMatchesTimeZone,
  getIntervalMinutes,
  localDateKey,
  nextMorningTimestamp,
  nextReminderTimestamp,
  zonedTimeToTimestamp
} = require("../src/time");

test("local date keys use the user's timezone", () => {
  const instant = Date.parse("2026-11-25T20:00:00.000Z");
  assert.equal(localDateKey(instant, "Asia/Kolkata"), "2026-11-26");
  assert.equal(localDateKey(instant, "America/Los_Angeles"), "2026-11-25");
});

test("timezone clock validation accepts a matching local clock", () => {
  const instant = Date.parse("2026-11-26T03:13:00.000Z");
  assert.equal(clockMatchesTimeZone("08:43", "Asia/Kolkata", instant), true);
  assert.equal(clockMatchesTimeZone("08:43", "Europe/London", instant), false);
});

test("reminders stay inside the 08:00 to 22:00 local window", () => {
  const beforeMorning = Date.parse("2026-11-26T01:00:00.000Z");
  const afterNight = Date.parse("2026-11-26T17:00:00.000Z");

  const morningReminder = nextReminderTimestamp(beforeMorning, "Asia/Kolkata", 60);
  const nightReminder = nextReminderTimestamp(afterNight, "Asia/Kolkata", 60);

  assert.equal(new Date(morningReminder).toISOString(), "2026-11-26T02:30:00.000Z");
  assert.equal(new Date(nightReminder).toISOString(), "2026-11-27T02:30:00.000Z");
});

test("next morning follows the local calendar day", () => {
  const now = Date.parse("2026-11-26T17:00:00.000Z");
  const next = nextMorningTimestamp(now, "Asia/Kolkata");
  assert.equal(new Date(next).toISOString(), "2026-11-27T02:30:00.000Z");
});

test("reminder frequency adapts to the daily goal", () => {
  assert.equal(getIntervalMinutes(6), 140);
  assert.equal(getIntervalMinutes(14), 60);
  assert.equal(getIntervalMinutes(24), 45);
});

test("wall-clock conversion handles a daylight-saving transition date", () => {
  const timestamp = zonedTimeToTimestamp("2026-03-08", "08:00", "America/New_York");
  assert.equal(new Date(timestamp).toISOString(), "2026-03-08T12:00:00.000Z");
});
