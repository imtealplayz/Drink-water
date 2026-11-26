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
    description: "Show your water progress, total glasses, and streaks."
  },
  {
    ...common,
    name: "leaderboard",
    description: "See today's global hydration leaderboard."
  },
  {
    ...common,
    name: "drink",
    description: "Log one glass of water."
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
