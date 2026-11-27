process.env.DB_PATH = ":memory:";
const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateVolumeXp, getLevelProgress } = require("../src/xp");
const { commandDefinitions } = require("../src/commands");
const { addDrink, db, getUser, saveReminderSetup } = require("../src/database");
test("volume XP accumulates in 100 ml increments", () => {
  assert.equal(calculateVolumeXp(0, 50), 0); assert.equal(calculateVolumeXp(50, 50), 1);
  assert.equal(calculateVolumeXp(250, 150), 2); assert.equal(calculateVolumeXp(999, 1), 1);
});
test("levels require progressively more XP", () => {
  assert.deepEqual(getLevelProgress(0), {level:1,currentXp:0,xpForNextLevel:100,totalXp:0});
  assert.deepEqual(getLevelProgress(100), {level:2,currentXp:0,xpForNextLevel:150,totalXp:100});
  assert.deepEqual(getLevelProgress(250), {level:3,currentXp:0,xpForNextLevel:200,totalXp:250});
});
test("/drink has an optional amount argument", () => {
  const command=commandDefinitions.find(entry=>entry.name==="drink");
  assert.equal(command.options[0].name,"amount"); assert.equal(command.options[0].required,false);
  assert.equal(command.options[0].min_value,1); assert.equal(command.options[0].max_value,5000);
});
test("daily goal bonus is awarded once and volume XP accumulates", () => {
  const now=Date.now(); saveReminderSetup("xp-test-user",6,"UTC",now+60000); let result;
  for(let i=0;i<6;i+=1)result=addDrink("xp-test-user","2026-11-24",now+i,100,6);
  assert.equal(result.volumeXp,1); assert.equal(result.goalBonusXp,25); assert.equal(result.xpEarned,26);
  const extra=addDrink("xp-test-user","2026-11-24",now+10,100,6);
  assert.equal(extra.goalBonusXp,0); assert.equal(extra.xpEarned,1); assert.equal(getUser("xp-test-user").xp,32);
});
test("configured glass size is accepted as the default drink amount", () => {
  const now=Date.now(); saveReminderSetup("xp-default-user",8,"UTC",now+60000);
  const glass=getUser("xp-default-user").glass_size_ml;
  assert.equal(addDrink("xp-default-user","2026-11-23",now,glass,8).totalMl,glass);
});
test.after(() => db.close());
