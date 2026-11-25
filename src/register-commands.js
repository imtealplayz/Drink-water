require("dotenv").config();

const { REST, Routes } = require("discord.js");
const { commandDefinitions } = require("./commands");

async function main() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;

  if (!token || !clientId) {
    throw new Error("Set DISCORD_TOKEN and CLIENT_ID in your environment before registering commands.");
  }

  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationCommands(clientId), { body: commandDefinitions });
  console.log("Registered " + commandDefinitions.length + " global application commands.");
}

main().catch((error) => {
  console.error("Command registration failed:", error);
  process.exitCode = 1;
});
