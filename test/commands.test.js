const test = require("node:test");
const assert = require("node:assert/strict");
const { commandDefinitions } = require("../src/commands");

test("/stats accepts an optional Discord user", () => {
  const statsCommand = commandDefinitions.find((command) => command.name === "stats");
  assert.ok(statsCommand, "stats command should exist");

  assert.deepEqual(statsCommand.options, [
    {
      type: 6,
      name: "user",
      description: "Whose stats to view. Leave empty to view your own.",
      required: false
    }
  ]);
});
