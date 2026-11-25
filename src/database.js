const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const { addDaysToDateKey } = require("./time");

const databasePath = process.env.DB_PATH || path.join(process.cwd(), "data", "drink-water.sqlite");
fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });

const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

db.exec(
  "CREATE TABLE IF NOT EXISTS users (" +
  "user_id TEXT PRIMARY KEY, " +
  "goal INTEGER NOT NULL DEFAULT 6 CHECK (goal >= 6 AND goal <= 24), " +
  "timezone TEXT NOT NULL DEFAULT 'UTC', " +
  "active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)), " +
  "next_reminder_at INTEGER, " +
  "created_at INTEGER NOT NULL, " +
  "updated_at INTEGER NOT NULL" +
  ");" +
  "CREATE TABLE IF NOT EXISTS water_logs (" +
  "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
  "user_id TEXT NOT NULL, " +
  "local_date TEXT NOT NULL, " +
  "amount INTEGER NOT NULL DEFAULT 1 CHECK (amount > 0), " +
  "created_at INTEGER NOT NULL, " +
  "FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE" +
  ");" +
  "CREATE INDEX IF NOT EXISTS idx_water_logs_user_date " +
  "ON water_logs(user_id, local_date);" +
  "CREATE TABLE IF NOT EXISTS pending_setups (" +
  "user_id TEXT PRIMARY KEY, " +
  "goal INTEGER NOT NULL CHECK (goal >= 6 AND goal <= 24), " +
  "expires_at INTEGER NOT NULL" +
  ");"
);

function getUser(userId) {
  return db.prepare("SELECT * FROM users WHERE user_id = ?").get(String(userId)) || null;
}

function savePendingSetup(userId, goal, expiresAt) {
  db.prepare(
    "INSERT INTO pending_setups (user_id, goal, expires_at) VALUES (?, ?, ?) " +
    "ON CONFLICT(user_id) DO UPDATE SET goal = excluded.goal, expires_at = excluded.expires_at"
  ).run(String(userId), Number(goal), Number(expiresAt));
}

function getPendingSetup(userId, now = Date.now()) {
  const row = db.prepare(
    "SELECT * FROM pending_setups WHERE user_id = ? AND expires_at > ?"
  ).get(String(userId), Number(now));
  return row || null;
}

function deletePendingSetup(userId) {
  db.prepare("DELETE FROM pending_setups WHERE user_id = ?").run(String(userId));
}

function saveReminderSetup(userId, goal, timeZone, nextReminderAt) {
  const now = Date.now();
  db.prepare(
    "INSERT INTO users (user_id, goal, timezone, active, next_reminder_at, created_at, updated_at) " +
    "VALUES (?, ?, ?, 1, ?, ?, ?) " +
    "ON CONFLICT(user_id) DO UPDATE SET " +
    "goal = excluded.goal, timezone = excluded.timezone, active = 1, " +
    "next_reminder_at = excluded.next_reminder_at, updated_at = excluded.updated_at"
  ).run(
    String(userId),
    Number(goal),
    String(timeZone),
    Number(nextReminderAt),
    now,
    now
  );
}

function setReminderActive(userId, active, nextReminderAt = null) {
  db.prepare(
    "UPDATE users SET active = ?, next_reminder_at = ?, updated_at = ? WHERE user_id = ?"
  ).run(active ? 1 : 0, nextReminderAt, Date.now(), String(userId));
}

function setNextReminder(userId, nextReminderAt) {
  db.prepare(
    "UPDATE users SET next_reminder_at = ?, updated_at = ? WHERE user_id = ?"
  ).run(Number(nextReminderAt), Date.now(), String(userId));
}

function getDueReminders(now = Date.now(), limit = 30) {
  return db.prepare(
    "SELECT * FROM users " +
    "WHERE active = 1 AND next_reminder_at IS NOT NULL AND next_reminder_at <= ? " +
    "ORDER BY next_reminder_at ASC LIMIT ?"
  ).all(Number(now), Number(limit));
}

function addDrink(userId, dateKey, createdAt = Date.now()) {
  const insert = db.prepare(
    "INSERT INTO water_logs (user_id, local_date, amount, created_at) VALUES (?, ?, 1, ?)"
  );

  const transaction = db.transaction(() => {
    insert.run(String(userId), String(dateKey), Number(createdAt));
    return db.prepare(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM water_logs WHERE user_id = ? AND local_date = ?"
    ).get(String(userId), String(dateKey)).total;
  });

  return Number(transaction());
}

function getDailyTotal(userId, dateKey) {
  const result = db.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM water_logs WHERE user_id = ? AND local_date = ?"
  ).get(String(userId), String(dateKey));

  return Number(result.total);
}

function getStats(userId, todayDateKey, goal) {
  const rows = db.prepare(
    "SELECT local_date, SUM(amount) AS glasses FROM water_logs " +
    "WHERE user_id = ? GROUP BY local_date ORDER BY local_date ASC"
  ).all(String(userId));

  const byDate = new Map();
  let totalGlasses = 0;

  for (const row of rows) {
    const count = Number(row.glasses);
    byDate.set(row.local_date, count);
    totalGlasses += count;
  }

  const yesterday = addDaysToDateKey(todayDateKey, -1);
  const completedDays = new Set(
    rows
      .filter((row) => Number(row.glasses) >= Number(goal))
      .map((row) => row.local_date)
  );

  let currentStreak = 0;
  let cursor = completedDays.has(todayDateKey)
    ? todayDateKey
    : completedDays.has(yesterday)
      ? yesterday
      : null;

  while (cursor && completedDays.has(cursor)) {
    currentStreak += 1;
    cursor = addDaysToDateKey(cursor, -1);
  }

  let bestStreak = 0;
  let runningStreak = 0;
  let previousDate = null;

  for (const row of rows) {
    if (Number(row.glasses) < Number(goal)) {
      runningStreak = 0;
      previousDate = row.local_date;
      continue;
    }

    if (previousDate && addDaysToDateKey(previousDate, 1) === row.local_date) {
      runningStreak += 1;
    } else {
      runningStreak = 1;
    }

    bestStreak = Math.max(bestStreak, runningStreak);
    previousDate = row.local_date;
  }

  return {
    goal: Number(goal),
    today: Number(byDate.get(todayDateKey) || 0),
    currentStreak,
    bestStreak,
    totalGlasses,
    completedDays: completedDays.size
  };
}

module.exports = {
  addDrink,
  db,
  deletePendingSetup,
  getDailyTotal,
  getDueReminders,
  getPendingSetup,
  getStats,
  getUser,
  savePendingSetup,
  saveReminderSetup,
  setNextReminder,
  setReminderActive
};
