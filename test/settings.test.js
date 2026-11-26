process.env.DB_PATH=":memory:";
const test=require("node:test");
const assert=require("node:assert/strict");
const {addDrink,db,getDueSummaries,getStats,getUser,saveReminderSetup,updateUserSettings}=require("../src/database");
test("existing profile defaults are added without losing data",()=>{
 const now=Date.now();saveReminderSetup("settings-user",8,"Asia/Kolkata",now+60000);
 const user=getUser("settings-user");
 assert.equal(user.interval_minutes,null);assert.equal(user.quiet_start_minute,1320);assert.equal(user.quiet_end_minute,480);
 assert.equal(user.glass_size_ml,250);assert.equal(user.reminder_style,"standard");assert.equal(user.daily_summary_enabled,1);
 assert.equal(user.summary_time,"20:00");assert.ok(user.next_summary_at>now);
});
test("glass sizes are stored per drink and summed in ml",()=>{
 const now=Date.now();saveReminderSetup("volume-user",8,"UTC",now+60000);
 addDrink("volume-user","2026-11-26",now,330);addDrink("volume-user","2026-11-26",now+1,500);
 const stats=getStats("volume-user","2026-11-26",8);
 assert.equal(stats.today,2);assert.equal(stats.todayMl,830);assert.equal(stats.totalMl,830);
});
test("custom preferences persist and daily summary remains scheduled",()=>{
 const now=Date.now();saveReminderSetup("prefs-user",8,"Asia/Kolkata",now+60000);
 updateUserSettings("prefs-user",{intervalMinutes:45,quietStartMinute:1260,quietEndMinute:420,glassSizeMl:400,reminderStyle:"encouraging",dailySummaryEnabled:true,summaryTime:"19:30"},now+120000,now+240000);
 const u=getUser("prefs-user");
 assert.equal(u.interval_minutes,45);assert.equal(u.quiet_start_minute,1260);assert.equal(u.quiet_end_minute,420);
 assert.equal(u.glass_size_ml,400);assert.equal(u.reminder_style,"encouraging");assert.equal(u.summary_time,"19:30");
 assert.equal(u.next_summary_at,now+240000);assert.equal(getDueSummaries(now+240001).some(x=>x.user_id==="prefs-user"),true);
});
test.after(()=>db.close());
