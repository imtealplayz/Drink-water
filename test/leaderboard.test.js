process.env.DB_PATH = ":memory:";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  addDrink,
  db,
  getDailyLeaderboard,
  saveReminderSetup
} = require("../src/database");

test("daily leaderboard uses each participant's local calendar day", () => {
  const now = Date.parse("2026-11-26T20:00:00.000Z");

  saveReminderSetup("india-user", 8, "Asia/Kolkata", now + 60_000);
  saveReminderSetup("utc-user", 6, "UTC", now + 60_000);
  saveReminderSetup("inactive-progress-user", 10, "Asia/Kolkata", now + 60_000);

  addDrink("india-user", "2026-11-27", now);
  addDrink("india-user", "2026-11-27", now + 1);
  addDrink("india-user", "2026-11-27", now + 2);
  addDrink("utc-user", "2026-11-26", now);
  addDrink("utc-user", "2026-11-26", now + 1);
  addDrink("inactive-progress-user", "2026-11-26", now);

  const leaderboard = getDailyLeaderboard(now);
  assert.deepEqual(
    leaderboard.map(({ userId, glasses, rank }) => ({ userId, glasses, rank })),
    [
      { userId: "india-user", glasses: 3, rank: 1 },
      { userId: "utc-user", glasses: 2, rank: 2 }
    ]
  );
});

test.after(() => db.close());
