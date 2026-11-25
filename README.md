# Drink Water

A personal hydration reminder bot for Discord. It uses Discord Components V2, supports user-installed application commands, and stores all progress in a local SQLite database.

## Features

- Set a daily goal with /reminder or w!reminder.
- Minimum goal: 6 glasses per day. Maximum: 24.
- The setup DM asks for the current local clock and an IANA timezone, then checks that they match.
- Timezone-aware reminders that follow daylight-saving changes.
- Quiet hours: 08:00–22:00 in the user's timezone.
- Reminders are spaced according to the daily goal, with a minimum interval of 45 minutes.
- Components V2 reminder cards with buttons to log a glass, snooze for 30 minutes, view stats, or pause reminders.
- Daily progress, current streak, best streak, total glasses, and completed-goal days.
- SQLite persistence. No Redis, Upstash, MongoDB, or other hosted database is required.
- Prefix commands for servers where the bot is installed, plus user-installable slash commands.

## Commands

| Command | What it does |
| --- | --- |
| /reminder glasses:8 | Start setup for an 8-glass daily goal |
| /stats | Show today's progress and lifetime stats |
| /drink | Log one glass |
| /pause | Turn off scheduled reminders |
| /resume | Turn reminders back on |
| w!reminder 8 | Prefix version of reminder setup |
| w!stats | Prefix version of stats |
| w!drink | Prefix version of logging a glass |
| w!pause | Pause reminders |
| w!resume | Resume reminders |
| w!help | Show prefix help |

The reminder command accepts a whole number from 6 to 24.

## How reminders work

After /reminder or w!reminder, the bot sends a setup card by DM. Press **Set my timezone** and enter:

- Your current local time in 24-hour HH:MM format.
- Your IANA timezone, such as Asia/Kolkata, Europe/London, or America/New_York.

The bot verifies that the clock matches the timezone within 15 minutes. It then schedules reminders in that timezone. The schedule avoids 22:00–08:00 local time. Reaching the daily goal pauses reminders until 08:00 the following local day.

The **I drank a glass** button logs one glass. **Snooze 30m** postpones the next reminder. **Turn off** pauses reminders. You can also use /pause and /resume.

Streaks count consecutive local calendar days on which the user's daily goal was reached. The current streak remains active during today if yesterday's goal was completed and today is not over yet.

## Discord Developer Portal setup

1. Create a Discord application and add a bot user.
2. In **Installation**, enable both **Guild Install** and **User Install**.
3. Under **Default Install Settings**:
   - User Install: add the applications.commands scope.
   - Guild Install: add bot and applications.commands.
   - For the bot invite, allow **View Channels**, **Send Messages**, and **Read Message History** if you want to use the w! prefix commands.
4. Under **Bot**, enable the **Message Content Intent**. This is required for prefix commands such as w!reminder 8.
5. Copy the bot token and the application ID.
6. Add the bot to at least one server that the people receiving reminders share with it. Also install the app to your own account to use the personal slash commands across Discord.
7. Run the command registration step below.

### Important user-install limitation

A user-installed app can run its application commands across a user's servers and DMs, but a user installation alone is not a background messaging permission. Scheduled DMs are sent by the bot user, so the bot must also be running and able to DM that person. In practice, add the bot to a server the person shares with it and make sure their DM privacy settings allow messages from server members. If Discord rejects the DM, this bot pauses that user's schedule rather than repeatedly retrying.

The /stats and /drink commands are designed to work as personal app commands. A user's server may still restrict public responses from user-installed apps; Discord can make those responses ephemeral.

## Run locally

Use Node.js 20 or newer.

1. Clone the repository.
2. Install dependencies:

       npm install

3. Copy .env.example to .env and fill in DISCORD_TOKEN and CLIENT_ID.
4. Register slash commands:

       npm run register

5. Start the bot:

       npm start

The database is created automatically at data/drink-water.sqlite.

## Hosting

Use an always-on Node.js process. The scheduler must remain online for reminders to be delivered on time.

The SQLite file must live on persistent storage. For example, on a host with a persistent volume mounted at /app/data, set:

    DB_PATH=/app/data/drink-water.sqlite

Run a single bot replica against this SQLite file. SQLite is intentionally used here to avoid an external database service; do not run multiple bot replicas writing to the same local database file.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| DISCORD_TOKEN | Yes | Bot token from the Developer Portal |
| CLIENT_ID | Yes | Application ID |
| DB_PATH | No | SQLite database path; defaults to ./data/drink-water.sqlite |
| PREFIX | No | Prefix for legacy text commands; defaults to w! |

## Tests

Run:

    npm run check
    npm test

The tests cover timezone date boundaries, clock verification, quiet hours, interval selection, and daylight-saving time conversion.
