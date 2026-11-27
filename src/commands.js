const commandContexts = [0, 1, 2];
const integrationTypes = [0, 1];

const common = {
  integration_types: integrationTypes,
  contexts: commandContexts
};

const commandDefinitions = [
  {
    ...common,
    name: "reminder",
    description: "Set your daily water goal and reminders.",
    options: [
      {
        type: 4,
        name: "glasses",
        description: "How many glasses you want to drink each day (6–24).",
        required: true,
        min_value: 6,
        max_value: 24
      }
    ]
  },
  {
    ...common,
    name: "stats",
    description: "Show water progress, total glasses, and streaks.",
    options: [
      {
        type: 6,
        name: "user",
        description: "Whose stats to view. Leave empty to view your own.",
        required: false
      }
    ]
  },
  {
    ...common,
    name: "settings",
    description: "Customize your reminder schedule and hydration preferences."
  },
  {
    ...common,
    name: "leaderboard",
    description: "See today's global hydration leaderboard."
  },
  {
    ...common,
    name: "drink",
    description: "Log water in millilitres; omit the amount to use your glass size.",
    options: [
      {
        type: 4,
        name: "amount",
        description: "Water amount in ml (1–5000). Omit to use your configured glass size.",
        required: false,
        min_value: 1,
        max_value: 5000
      }
    ]
  },
  {
    ...common,
    name: "pause",
    description: "Turn off your water reminders."
  },
  {
    ...common,
    name: "resume",
    description: "Turn your water reminders back on."
  }
];

module.exports = { commandDefinitions };
