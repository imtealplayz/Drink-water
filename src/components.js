const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const { formatClockMinute, formatLocalTime, getIntervalMinutes } = require("./time");

const ACCENT = 0x27B8AD;

function text(content) {
  return new TextDisplayBuilder().setContent(content);
}

function separator() {
  return new SeparatorBuilder();
}

function button(customId, label, style, emoji) {
  const builder = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style);

  if (emoji) builder.setEmoji({ name: emoji });
  return builder;
}

function v2(container, extraFlags = 0) {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | extraFlags
  };
}

function infoCard(title, description, accent = ACCENT) {
  return new ContainerBuilder()
    .setAccentColor(accent)
    .addTextDisplayComponents(text("# " + title))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(description));
}

function setupPrompt(goal) {
  const container = new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents(
      text("# 💧 Drink Water\n### Let's build a better hydration habit.\n\nYour daily target is **" + goal + " glasses**.\n\nBefore I schedule anything, I need your local time and timezone. This keeps reminders aligned with your day, including daylight-saving changes.")
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text("**Next step**\nPress the button below. Enter the time shown on your clock and an IANA timezone such as **Asia/Kolkata**, **Europe/London**, or **America/New_York**.")
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        button("water:setup:open", "Set my timezone", ButtonStyle.Success, "🌍")
      )
    );

  return v2(container);
}

function setupModal() {
  return new ModalBuilder()
    .setCustomId("water:timezone:submit")
    .setTitle("Your local time")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("local_time")
          .setLabel("What time is it for you right now?")
          .setPlaceholder("21:42")
          .setStyle(TextInputStyle.Short)
          .setMinLength(5)
          .setMaxLength(5)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("timezone")
          .setLabel("Your timezone (IANA format)")
          .setPlaceholder("Asia/Kolkata")
          .setStyle(TextInputStyle.Short)
          .setMinLength(3)
          .setMaxLength(64)
          .setRequired(true)
      )
    );
}

function progressBar(current, goal) {
  const ratio = Math.max(0, Math.min(1, current / goal));
  const filled = Math.round(ratio * 10);
  return "▰".repeat(filled) + "▱".repeat(10 - filled);
}

function reminderCard(user, stats, now = Date.now()) {
  const reachedGoal = stats.today >= user.goal;
  const currentTime = formatLocalTime(now, user.timezone);
  const status = user.active ? "Reminders are **on**" : "Reminders are **paused**";
  const style = user.reminder_style || "standard";
  const heading = style === "minimal" ? "# Hydration reminder" : style === "encouraging" ? "# Keep your hydration going!" : "# 💧 Hydration check-in";
  const headline = reachedGoal ? "Daily goal complete. Nicely done." : style === "encouraging" ? "A little water now is a win for the rest of your day." : style === "minimal" ? "Time for a water break." : "Time for a little water check-in.";
  const volume = Number(stats.todayMl || 0).toLocaleString("en-US");

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents(
      text(heading + "\n" + headline + "\n\n**Today's progress**\n## " + stats.today + " / " + user.goal + " glasses\n" + progressBar(stats.today, user.goal) + "\n**Water logged:** " + volume + " ml")
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text("🔥 **Current streak:** " + stats.currentStreak + " day" + (stats.currentStreak === 1 ? "" : "s") +
        "\n🏆 **Best streak:** " + stats.bestStreak + " day" + (stats.bestStreak === 1 ? "" : "s") +
        "\n🥛 **Glass size:** " + user.glass_size_ml + " ml" +
        "\n🕒 **Your local time:** " + currentTime +
        "\n🌍 **Timezone:** " + user.timezone +
        "\n\n" + status)
    );

  if (user.active) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        button("water:drink", "I drank a glass", ButtonStyle.Success, "💧"),
        button("water:snooze", "Snooze 30m", ButtonStyle.Secondary, "💤"),
        button("water:pause", "Turn off", ButtonStyle.Danger, "🔕")
      )
    );
  } else {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        button("water:resume", "Resume reminders", ButtonStyle.Success, "🔔"),
        button("water:stats", "View stats", ButtonStyle.Secondary, "📊")
      )
    );
  }

  return container;
}

function statsCard(user, stats, timeZone, subject = null) {
  const safeGoal = user ? user.goal : 6;
  const progress = user ? stats.today + " / " + safeGoal + " glasses" : "Not set up yet";
  const bar = user ? progressBar(stats.today, safeGoal) : "Run /reminder to get started.";
  const heading = subject
    ? "# 📊 Hydration stats for " + subject
    : "# 📊 Your hydration stats";

  return new ContainerBuilder()
    .setAccentColor(0x6B8FE8)
    .addTextDisplayComponents(
      text(heading + "\n### A little progress adds up.\n\n**Today**\n## " + progress + "\n" + bar)
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text("🔥 **Current streak:** " + (user ? stats.currentStreak : 0) + " days" +
        "\n🏆 **Best streak:** " + (user ? stats.bestStreak : 0) + " days" +
        "\n💧 **Total glasses logged:** " + (user ? stats.totalGlasses : 0) +
        "\n🥛 **Water logged today:** " + (user ? Number(stats.todayMl || 0).toLocaleString("en-US") : 0) + " ml" +
        "\n🌊 **Total water logged:** " + (user ? Number(stats.totalMl || 0).toLocaleString("en-US") : 0) + " ml" +
        "\n✅ **Goal-complete days:** " + (user ? stats.completedDays : 0) +
        (user ? "\n🌍 **Timezone:** " + timeZone : ""))
    );
}

function settingsModal(user) {
  const interval=user.interval_minutes===null?"auto":String(user.interval_minutes);
  const quiet=formatClockMinute(user.quiet_start_minute)+"-"+formatClockMinute(user.quiet_end_minute);
  return new ModalBuilder().setCustomId("water:settings:submit").setTitle("Reminder settings").addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("interval").setLabel("Interval minutes or auto").setPlaceholder("auto or 60").setValue(interval).setStyle(TextInputStyle.Short).setMaxLength(4).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("quiet_hours").setLabel("Quiet hours (HH:MM-HH:MM)").setPlaceholder("22:00-08:00").setValue(quiet).setStyle(TextInputStyle.Short).setMinLength(11).setMaxLength(11).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("glass_size").setLabel("Glass size (100-2000 ml)").setPlaceholder("250").setValue(String(user.glass_size_ml)).setStyle(TextInputStyle.Short).setMaxLength(4).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("style").setLabel("Style: standard, minimal, encouraging").setPlaceholder("standard").setValue(user.reminder_style||"standard").setStyle(TextInputStyle.Short).setMaxLength(12).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("summary").setLabel("Daily summary time (HH:MM or off)").setPlaceholder("20:00 or off").setValue(user.daily_summary_enabled?user.summary_time:"off").setStyle(TextInputStyle.Short).setMaxLength(5).setRequired(true))
  );
}
function settingsCard(user,notice=null){
 const interval=user.interval_minutes===null?"Automatic ("+getIntervalMinutes(user.goal)+" min based on your goal)":user.interval_minutes+" minutes";
 const quiet=formatClockMinute(user.quiet_start_minute)+"–"+formatClockMinute(user.quiet_end_minute);
 const summary=user.daily_summary_enabled?"On at "+user.summary_time:"Off";
 return new ContainerBuilder().setAccentColor(0x27B8AD).addTextDisplayComponents(text("# ⚙️ Reminder settings"+(notice?"\n\n"+notice:"")+"\n\n**Reminder interval**\n"+interval+"\n\n**Quiet hours**\n"+quiet+"\n\n**Glass size**\n"+user.glass_size_ml+" ml per logged glass"+"\n\n**Reminder style**\n"+user.reminder_style+"\n\n**Daily summary**\n"+summary+"\n\n**Timezone**\n"+user.timezone))
 .addSeparatorComponents(separator()).addActionRowComponents(new ActionRowBuilder().addComponents(button("water:settings:edit","Edit settings",ButtonStyle.Primary,"⚙️")));
}
function dailySummaryCard(user,stats,now=Date.now()){
 const complete=stats.today>=user.goal,heading=user.reminder_style==="minimal"?"# Daily hydration summary":"# 💧 Your daily hydration summary";
 const message=complete?"You reached your daily goal. Well done.":"You logged "+stats.today+" of "+user.goal+" glasses today.";
 return new ContainerBuilder().setAccentColor(complete?0x27B8AD:0x6B8FE8)
 .addTextDisplayComponents(text(heading+"\n"+message+"\n\n**Today's water**\n## "+stats.today+" / "+user.goal+" glasses"+"\n**Total volume:** "+Number(stats.todayMl||0).toLocaleString("en-US")+" ml"+"\n**Daily goal:** "+(complete?"Complete":(user.goal-stats.today)+" glass(es) to go")+"\n**Current streak:** "+stats.currentStreak+" days"+"\n**Logged glass size:** "+user.glass_size_ml+" ml"+"\n**Local time:** "+formatLocalTime(now,user.timezone)))
 .addSeparatorComponents(separator()).addActionRowComponents(new ActionRowBuilder().addComponents(button("water:stats","View full stats",ButtonStyle.Secondary,"📊")));
}
function leaderboardCard(entries, participantCount, viewerEntry) {
  const ranking = entries.length
    ? entries.map((entry) => {
      const marker = entry.rank === 1
        ? "🥇"
        : entry.rank === 2
          ? "🥈"
          : entry.rank === 3
            ? "🥉"
            : "**" + entry.rank + ".**";

      return marker + " <@" + entry.userId + "> — **" +
        entry.glasses + "** / " + entry.goal + " glasses";
    }).join("\n")
    : "No glasses have been logged today yet. Be the first to claim the top spot.";

  let personalStanding;
  if (!viewerEntry) {
    personalStanding = "Your standing: **Not ranked yet** — log your first glass with /drink.";
  } else {
    const outsideTopTen = viewerEntry.rank > 10 ? " (outside the top 10)" : "";
    personalStanding = "Your standing: **#" + viewerEntry.rank + "**" + outsideTopTen +
      " — " + viewerEntry.glasses + " / " + viewerEntry.goal + " glasses.";
  }

  return new ContainerBuilder()
    .setAccentColor(0xE6B84A)
    .addTextDisplayComponents(
      text("# 🏆 Today's hydration leaderboard\n### Global daily rankings\n\n" + ranking)
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text("**Participants today:** " + participantCount + "\n" + personalStanding)
    );
}

function reminderOptionsMessage(goal) {
  return infoCard(
    "Check your DMs",
    "I sent you a private setup card for a daily goal of **" + goal + " glasses**. Open it and set your local time and timezone to finish setup."
  );
}

function reminderErrorMessage() {
  return infoCard(
    "I couldn't DM you",
    "Discord did not let me open a DM with you. To receive scheduled reminders, add the bot to a server you share with it and allow server members to DM you. Then run /reminder again.",
    0xD97757
  );
}

module.exports = {
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
  statsCard,
  v2
};
