require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  MessageFlags,
  Partials,
  REST,
  Routes
} = require("discord.js");

const {
  addDrink,
  deletePendingSetup,
  getDailyTotal,
  getDailyLeaderboard,
  getDueReminders,
  getDueSummaries,
  getPendingSetup,
  getStats,
  getUser,
  savePendingSetup,
  saveReminderSetup,
  setNextReminder,
  setNextSummary,
  setReminderActive,
  updateUserSettings
} = require("./database");

const {
  clockMatchesTimeZone,
  getIntervalMinutes,
  localDateKey,
  nextDailySummaryTimestamp,
  nextMorningTimestamp,
  nextReminderTimestamp,
  parseClockInput,
  isWithinQuietHours,
  isValidTimeZone
} = require("./time");

const {
  dailySummaryCard,
  infoCard,
  leaderboardCard,
  reminderCard,
  reminderErrorMessage,
  reminderOptionsMessage,
  settingsCard,
  settingsModal,
  setupModal,
  setupPrompt,
  statsCard
} = require("./components");

const { commandDefinitions } = require("./commands");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const prefix = process.env.PREFIX || "w!";

if (!token || !clientId) {
  console.error("Missing DISCORD_TOKEN or CLIENT_ID. Add both in Railway Variables; the service is waiting for configuration.");
  setInterval(() => {
    console.log("Drink Water is waiting for DISCORD_TOKEN and CLIENT_ID.");
  }, 5 * 60 * 1000);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

let schedulerRunning = false;

function userStats(user, now = Date.now()) {
  const today = localDateKey(now, user.timezone);
  return getStats(user.user_id, today, user.goal);
}

function componentReply(container, extraFlags = 0) {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | extraFlags
  };
}

async function replyWithInfo(interaction, title, description, accent) {
  const card = infoCard(title, description, accent);
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(componentReply(card));
  }
  return interaction.reply(componentReply(card, MessageFlags.Ephemeral));
}

async function sendSetupToUser(user, goal) {
  const now = Date.now();
  savePendingSetup(user.id, goal, now + 20 * 60 * 1000);

  try {
    const dm = await user.createDM();
    await dm.send(setupPrompt(goal));
    return true;
  } catch (error) {
    deletePendingSetup(user.id);
    console.warn("Could not DM user " + user.id + ":", error.message);
    return false;
  }
}

async function beginReminderSetup(user, goal, interaction = null, message = null) {
  if (interaction) {
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
  }

  const sent = await sendSetupToUser(user, goal);

  if (!sent) {
    if (interaction) {
      return interaction.editReply(componentReply(reminderErrorMessage()));
    }

    if (message) {
      return message.reply({
        components: [reminderErrorMessage()],
        flags: MessageFlags.IsComponentsV2
      });
    }

    return;
  }

  const confirmation = reminderOptionsMessage(goal);
  if (interaction) {
    return interaction.editReply(componentReply(confirmation));
  }

  if (message) {
    return message.reply({
      components: [confirmation],
      flags: MessageFlags.IsComponentsV2
    });
  }
}

function intervalForUser(user) {
  return user.interval_minutes || getIntervalMinutes(user.goal);
}

function nextSummaryForUser(user, now = Date.now()) {
  return user.daily_summary_enabled
    ? nextDailySummaryTimestamp(now, user.timezone, user.summary_time)
    : null;
}

function getStatsForUser(userId) {
  const user = getUser(userId);
  if (!user) return { user: null, stats: null };

  const now = Date.now();
  return {
    user,
    stats: userStats(user, now)
  };
}

function getLeaderboardForUser(userId) {
  const leaderboard = getDailyLeaderboard(Date.now());
  return {
    entries: leaderboard.slice(0, 10),
    participantCount: leaderboard.length,
    viewerEntry: leaderboard.find((entry) => entry.userId === String(userId)) || null
  };
}

function handleDrink(userId) {
  const user = getUser(userId);
  if (!user) return null;

  const now = Date.now();
  const today = localDateKey(now, user.timezone);
  const total = addDrink(userId, today, now, user.glass_size_ml);

  if (user.active) {
    const nextAt = total >= user.goal
      ? nextMorningTimestamp(now, user.timezone, user.quiet_end_minute)
      : nextReminderTimestamp(now, user.timezone, intervalForUser(user), user.quiet_start_minute, user.quiet_end_minute);
    setNextReminder(userId, nextAt);
  }

  const updatedUser = getUser(userId);
  return {
    user: updatedUser,
    stats: userStats(updatedUser, now)
  };
}

async function handleChatInput(interaction) {
  const userId = interaction.user.id;

  switch (interaction.commandName) {
    case "reminder": {
      const goal = interaction.options.getInteger("glasses", true);
      return beginReminderSetup(interaction.user, goal, interaction);
    }

    case "stats": {
      const selectedUser = interaction.options.getUser("user") || interaction.user;
      const isSelf = selectedUser.id === interaction.user.id;
      const result = getStatsForUser(selectedUser.id);

      if (!result.user) {
        return replyWithInfo(
          interaction,
          isSelf ? "No hydration profile yet" : "No hydration profile found",
          isSelf
            ? "Run /reminder with your daily glass goal to set up your profile."
            : "<@" + selectedUser.id + "> hasn't set up a hydration profile yet."
        );
      }

      return interaction.reply({
        components: [statsCard(
          result.user,
          result.stats,
          result.user.timezone,
          isSelf ? null : "<@" + selectedUser.id + ">"
        )],
        flags: MessageFlags.IsComponentsV2
      });
    }

    case "settings": {
      const user = getUser(userId);
      if (!user) {
        return replyWithInfo(interaction, "No hydration profile yet", "Run /reminder first. You can customize the schedule after your profile is created.");
      }
      return interaction.reply({
        components: [settingsCard(user)],
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      });
    }

    case "leaderboard": {
      const result = getLeaderboardForUser(userId);
      return interaction.reply({
        components: [leaderboardCard(
          result.entries,
          result.participantCount,
          result.viewerEntry
        )],
        flags: MessageFlags.IsComponentsV2
      });
    }

    case "drink": {
      const result = handleDrink(userId);
      if (!result) {
        return replyWithInfo(
          interaction,
          "Let's set you up first",
          "Run /reminder with a daily glass goal before logging water."
        );
      }

      return interaction.reply({
        components: [statsCard(result.user, result.stats, result.user.timezone)],
        flags: MessageFlags.IsComponentsV2
      });
    }

    case "pause": {
      const user = getUser(userId);
      if (!user) {
        return replyWithInfo(interaction, "No reminders to pause", "Run /reminder to create your hydration schedule.");
      }

      setReminderActive(userId, false, null);
      return replyWithInfo(interaction, "Reminders paused", "No more scheduled DMs will be sent until you run /resume.");
    }

    case "resume": {
      const user = getUser(userId);
      if (!user) {
        return replyWithInfo(interaction, "No reminder schedule found", "Run /reminder to create your hydration schedule.");
      }

      const now = Date.now();
      const nextAt = nextReminderTimestamp(now, user.timezone, intervalForUser(user), user.quiet_start_minute, user.quiet_end_minute);
      setReminderActive(userId, true, nextAt, nextSummaryForUser(user, now));
      return replyWithInfo(interaction, "Reminders are back on", "Your next reminder is scheduled for " + new Date(nextAt).toISOString() + " UTC, adjusted to your local quiet hours.");
    }

    default:
      return replyWithInfo(interaction, "Unknown command", "I don't recognise that command.");
  }
}

async function handleSetupModal(interaction) {
  const pending = getPendingSetup(interaction.user.id);
  if (!pending) {
    return interaction.reply({
      components: [infoCard("Setup expired", "Run /reminder again to start a fresh setup.")],
      flags: MessageFlags.IsComponentsV2
    });
  }

  const localTime = interaction.fields.getTextInputValue("local_time").trim();
  const timeZone = interaction.fields.getTextInputValue("timezone").trim();

  if (!isValidTimeZone(timeZone)) {
    return interaction.reply({
      components: [infoCard(
        "Timezone not recognised",
        "Use an IANA timezone such as Asia/Kolkata, Europe/London, or America/New_York. Abbreviations such as IST or EST are not accepted.",
        0xD97757
      )],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (!clockMatchesTimeZone(localTime, timeZone, Date.now(), 15)) {
    return interaction.reply({
      components: [infoCard(
        "That time doesn't match",
        "The clock time you entered is more than 15 minutes away from the current time in " + timeZone + ". Check both fields and submit again.",
        0xD97757
      )],
      flags: MessageFlags.IsComponentsV2
    });
  }

  const now = Date.now();
  const nextAt = nextReminderTimestamp(now, timeZone, getIntervalMinutes(pending.goal));
  saveReminderSetup(interaction.user.id, pending.goal, timeZone, nextAt);
  deletePendingSetup(interaction.user.id);

  const user = getUser(interaction.user.id);
  const stats = userStats(user, now);
  return interaction.reply({
    components: [reminderCard(user, stats, now)],
    flags: MessageFlags.IsComponentsV2
  });
}

async function handleSettingsModal(interaction) {
  const userId = interaction.user.id;
  const user = getUser(userId);
  if (!user) return interaction.reply({
    components: [infoCard("Profile not found", "Run /reminder to create your hydration profile.")],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
  });

  const intervalRaw = interaction.fields.getTextInputValue("interval").trim().toLowerCase();
  let intervalMinutes = null;
  if (intervalRaw !== "auto") {
    intervalMinutes = Number(intervalRaw);
    if (!Number.isInteger(intervalMinutes) || intervalMinutes < 15 || intervalMinutes > 360) {
      return interaction.reply({
        components: [infoCard("Invalid reminder interval", "Enter **auto** or a whole number from **15 to 360** minutes.", 0xD97757)],
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      });
    }
  }

  const quietMatch = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(interaction.fields.getTextInputValue("quiet_hours").trim());
  const quietStartMinute = quietMatch ? parseClockInput(quietMatch[1]) : null;
  const quietEndMinute = quietMatch ? parseClockInput(quietMatch[2]) : null;
  if (quietStartMinute === null || quietEndMinute === null || quietStartMinute === quietEndMinute) {
    return interaction.reply({
      components: [infoCard("Invalid quiet hours", "Use two different 24-hour times, for example **22:00-08:00**.", 0xD97757)],
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
  }

  const glassSizeMl = Number(interaction.fields.getTextInputValue("glass_size").trim());
  if (!Number.isInteger(glassSizeMl) || glassSizeMl < 100 || glassSizeMl > 2000) {
    return interaction.reply({
      components: [infoCard("Invalid glass size", "Enter a whole number from **100 to 2000 ml**.", 0xD97757)],
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
  }

  const reminderStyle = interaction.fields.getTextInputValue("style").trim().toLowerCase();
  if (!["standard", "minimal", "encouraging"].includes(reminderStyle)) {
    return interaction.reply({
      components: [infoCard("Unknown reminder style", "Choose **standard**, **minimal**, or **encouraging**.", 0xD97757)],
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
  }

  const summaryRaw = interaction.fields.getTextInputValue("summary").trim().toLowerCase();
  const dailySummaryEnabled = summaryRaw !== "off";
  const summaryMinute = dailySummaryEnabled ? parseClockInput(summaryRaw) : null;
  if (dailySummaryEnabled && summaryMinute === null) {
    return interaction.reply({
      components: [infoCard("Invalid summary time", "Enter a 24-hour time such as **20:00**, or **off** to disable the daily summary.", 0xD97757)],
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
  }
  if (dailySummaryEnabled && isWithinQuietHours(summaryMinute, quietStartMinute, quietEndMinute)) {
    return interaction.reply({
      components: [infoCard("Summary falls in quiet hours", "Choose a summary time outside your quiet hours, or set it to **off**.", 0xD97757)],
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
  }

  const summaryTime = dailySummaryEnabled ? summaryRaw : user.summary_time;
  const settings = { intervalMinutes, quietStartMinute, quietEndMinute, glassSizeMl, reminderStyle, dailySummaryEnabled, summaryTime };
  const now = Date.now();
  const nextReminderAt = user.active
    ? nextReminderTimestamp(now, user.timezone, intervalMinutes || getIntervalMinutes(user.goal), quietStartMinute, quietEndMinute)
    : null;
  const nextSummaryAt = user.active && dailySummaryEnabled
    ? nextDailySummaryTimestamp(now, user.timezone, summaryTime)
    : null;

  updateUserSettings(userId, settings, nextReminderAt, nextSummaryAt);
  return interaction.reply({
    components: [settingsCard(getUser(userId), "Preferences saved. Your next reminders will use these settings.")],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
  });
}

async function handleButton(interaction) {
  const userId = interaction.user.id;
  const action = interaction.customId;

  if (action === "water:settings:edit") {
    const user = getUser(userId);
    if (!user) return interaction.reply({
      components: [infoCard("Profile not found", "Run /reminder to create your hydration profile.")],
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
    return interaction.showModal(settingsModal(user));
  }

  if (action === "water:setup:open") {
    const pending = getPendingSetup(userId);
    if (!pending) {
      return interaction.reply({
        components: [infoCard("Setup expired", "Run /reminder again and use the new setup message.")],
        flags: MessageFlags.IsComponentsV2
      });
    }
    return interaction.showModal(setupModal());
  }

  if (action === "water:stats") {
    const result = getStatsForUser(userId);
    if (!result.user) {
      return interaction.reply({
        components: [infoCard("No profile found", "Run /reminder to set up your daily goal.")],
        flags: MessageFlags.IsComponentsV2
      });
    }

    return interaction.reply({
      components: [statsCard(result.user, result.stats, result.user.timezone)],
      flags: MessageFlags.IsComponentsV2
    });
  }

  const user = getUser(userId);
  if (!user) {
    return interaction.reply({
      components: [infoCard("Profile not found", "Run /reminder to create your hydration schedule.")],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (action === "water:drink") {
    const result = handleDrink(userId);
    return interaction.update({
      components: [reminderCard(result.user, result.stats)],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (action === "water:snooze") {
    if (!user.active) {
      return interaction.reply({
        components: [infoCard("Reminders are paused", "Run /resume before snoozing reminders.")],
        flags: MessageFlags.IsComponentsV2
      });
    }

    const now = Date.now();
    const nextAt = nextReminderTimestamp(now, user.timezone, 30, user.quiet_start_minute, user.quiet_end_minute);
    setNextReminder(userId, nextAt);
    return interaction.reply({
      components: [infoCard("Snoozed for 30 minutes", "I'll remind you again after your snooze, while still respecting your local quiet hours.")],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (action === "water:pause") {
    setReminderActive(userId, false, null);
    const updated = getUser(userId);
    const stats = userStats(updated);
    return interaction.update({
      components: [reminderCard(updated, stats)],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (action === "water:resume") {
    const now = Date.now();
    const nextAt = nextReminderTimestamp(now, user.timezone, intervalForUser(user), user.quiet_start_minute, user.quiet_end_minute);
    setReminderActive(userId, true, nextAt, nextSummaryForUser(user, now));
    const updated = getUser(userId);
    const stats = userStats(updated);
    return interaction.update({
      components: [reminderCard(updated, stats)],
      flags: MessageFlags.IsComponentsV2
    });
  }
}

async function handlePrefixMessage(message) {
  if (message.author.bot || !message.content.startsWith(prefix)) return;

  const parts = message.content.slice(prefix.length).trim().split(/\s+/);
  const command = String(parts.shift() || "").toLowerCase();

  if (command === "reminder") {
    const goal = Number(parts[0]);
    if (!Number.isInteger(goal) || goal < 6 || goal > 24) {
      return message.reply({
        components: [infoCard("Choose a daily goal", "Use w!reminder 8 with a whole number from 6 to 24.")],
        flags: MessageFlags.IsComponentsV2
      });
    }
    return beginReminderSetup(message.author, goal, null, message);
  }

  if (command === "stats") {
    const result = getStatsForUser(message.author.id);
    if (!result.user) {
      return message.reply({
        components: [infoCard("No hydration profile yet", "Use w!reminder 8 to set up your daily goal.")],
        flags: MessageFlags.IsComponentsV2
      });
    }
    return message.reply({
      components: [statsCard(result.user, result.stats, result.user.timezone)],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (command === "leaderboard") {
    const result = getLeaderboardForUser(message.author.id);
    return message.reply({
      components: [leaderboardCard(
        result.entries,
        result.participantCount,
        result.viewerEntry
      )],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (command === "drink") {
    const result = handleDrink(message.author.id);
    if (!result) {
      return message.reply({
        components: [infoCard("Set up first", "Use w!reminder 8 before logging water.")],
        flags: MessageFlags.IsComponentsV2
      });
    }
    return message.reply({
      components: [statsCard(result.user, result.stats, result.user.timezone)],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (command === "pause") {
    const user = getUser(message.author.id);
    if (!user) {
      return message.reply("You don't have a reminder schedule yet. Use w!reminder 8 first.");
    }
    setReminderActive(message.author.id, false, null);
    return message.reply("Your water reminders are now paused.");
  }

  if (command === "resume") {
    const user = getUser(message.author.id);
    if (!user) {
      return message.reply("You don't have a reminder schedule yet. Use w!reminder 8 first.");
    }
    const nextAt = nextReminderTimestamp(Date.now(), user.timezone, getIntervalMinutes(user.goal));
    setReminderActive(message.author.id, true, nextAt);
    return message.reply("Your water reminders are back on.");
  }

  if (command === "help") {
    return message.reply({
      components: [infoCard(
        "Drink Water commands",
        "w!reminder 8 — set an 8-glass daily goal\nw!drink — log one glass\nw!stats — see your progress and streaks\nw!leaderboard — see today's global leaderboard\nw!pause — turn reminders off\nw!resume — turn reminders back on"
      )],
      flags: MessageFlags.IsComponentsV2
    });
  }
}

async function runScheduler() {
  if (schedulerRunning || !client.isReady()) return;
  schedulerRunning = true;

  try {
    const now = Date.now();
    const dueUsers = getDueReminders(now, 30);

    for (const user of dueUsers) {
      try {
        const today = localDateKey(now, user.timezone);
        const total = getDailyTotal(user.user_id, today);

        if (total >= user.goal) {
          setNextReminder(user.user_id, nextMorningTimestamp(now, user.timezone, user.quiet_end_minute));
          continue;
        }

        const nextAt = nextReminderTimestamp(now, user.timezone, intervalForUser(user), user.quiet_start_minute, user.quiet_end_minute);
        setNextReminder(user.user_id, nextAt);

        const discordUser = await client.users.fetch(user.user_id);
        const stats = getStats(user.user_id, today, user.goal);
        const dm = await discordUser.createDM();

        await dm.send({
          components: [reminderCard(user, stats, now)],
          flags: MessageFlags.IsComponentsV2
        });
      } catch (error) {
        console.error("Reminder delivery failed for user " + user.user_id + ":", error.message);
        setReminderActive(user.user_id, false, null);
      }
    }
    const dueSummaries = getDueSummaries(now, 30);
    for (const user of dueSummaries) {
      setNextSummary(user.user_id, nextDailySummaryTimestamp(now, user.timezone, user.summary_time));
      try {
        const today = localDateKey(now, user.timezone);
        const stats = getStats(user.user_id, today, user.goal);
        const discordUser = await client.users.fetch(user.user_id);
        const dm = await discordUser.createDM();
        await dm.send({
          components: [dailySummaryCard(user, stats, now)],
          flags: MessageFlags.IsComponentsV2
        });
      } catch (error) {
        console.error("Daily summary delivery failed for user " + user.user_id + ":", error.message);
      }
    }
  } finally {
    schedulerRunning = false;
  }
}

client.once("ready", async () => {
  console.log("Drink Water is online as " + client.user.tag + ".");

  try {
    const rest = new REST({ version: "10" }).setToken(token);
    await rest.put(Routes.applicationCommands(clientId), { body: commandDefinitions });
    console.log("Registered " + commandDefinitions.length + " global application commands.");
  } catch (error) {
    console.error("Could not register application commands:", error);
  }

  runScheduler().catch((error) => console.error("Initial scheduler run failed:", error));
  setInterval(() => {
    runScheduler().catch((error) => console.error("Scheduler error:", error));
  }, 15 * 1000);
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleChatInput(interaction);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === "water:timezone:submit") {
      await handleSetupModal(interaction);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === "water:settings:submit") {
      await handleSettingsModal(interaction);
      return;
    }

    if (interaction.isButton()) {
      await handleButton(interaction);
    }
  } catch (error) {
    console.error("Interaction handler error:", error);

    const card = infoCard(
      "Something went wrong",
      "That action couldn't be completed. Please try again in a moment.",
      0xD97757
    );

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          components: [card],
          flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
        });
      } else {
        await interaction.reply({
          components: [card],
          flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
        });
      }
    } catch (replyError) {
      console.error("Could not send interaction error message:", replyError.message);
    }
  }
});

client.on("messageCreate", async (message) => {
  try {
    await handlePrefixMessage(message);
  } catch (error) {
    console.error("Prefix command error:", error);
    try {
      await message.reply("Something went wrong while running that command. Please try again.");
    } catch (replyError) {
      console.error("Could not reply to prefix command:", replyError.message);
    }
  }
});

client.on("error", (error) => {
  console.error("Discord client error:", error);
});

if (token && clientId) {
  client.login(token).catch((error) => {
    console.error("Could not log in to Discord:", error);
    process.exit(1);
  });
}
