const fs=require("node:fs"),path=require("node:path"),Database=require("better-sqlite3");
const {addDaysToDateKey,localDateKey,nextDailySummaryTimestamp}=require("./time");
const {calculateVolumeXp}=require("./xp");
const databasePath=process.env.DB_PATH||path.join(process.cwd(),"data","drink-water.sqlite");
fs.mkdirSync(path.dirname(path.resolve(databasePath)),{recursive:true});
const db=new Database(databasePath);
db.pragma("journal_mode = WAL");db.pragma("foreign_keys = ON");db.pragma("busy_timeout = 5000");
db.exec(
 "CREATE TABLE IF NOT EXISTS users (user_id TEXT PRIMARY KEY,goal INTEGER NOT NULL DEFAULT 6 CHECK(goal>=6 AND goal<=24),timezone TEXT NOT NULL DEFAULT 'UTC',active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),next_reminder_at INTEGER,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);"+
 "CREATE TABLE IF NOT EXISTS water_logs (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL,local_date TEXT NOT NULL,amount INTEGER NOT NULL DEFAULT 1 CHECK(amount>0),created_at INTEGER NOT NULL,FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE);"+
 "CREATE INDEX IF NOT EXISTS idx_water_logs_user_date ON water_logs(user_id,local_date);"+
 "CREATE TABLE IF NOT EXISTS pending_setups (user_id TEXT PRIMARY KEY,goal INTEGER NOT NULL CHECK(goal>=6 AND goal<=24),expires_at INTEGER NOT NULL);"
);
function addColumnIfMissing(table,column,definition){const cols=db.pragma("table_info("+table+")");if(!cols.some(c=>c.name===column))db.exec("ALTER TABLE "+table+" ADD COLUMN "+column+" "+definition);}
const xpColumnExisted=db.pragma("table_info(users)").some(c=>c.name==="xp");
// Additive migrations preserve existing users and logs.
addColumnIfMissing("users","interval_minutes","INTEGER");
addColumnIfMissing("users","quiet_start_minute","INTEGER NOT NULL DEFAULT 1320");
addColumnIfMissing("users","quiet_end_minute","INTEGER NOT NULL DEFAULT 480");
addColumnIfMissing("users","glass_size_ml","INTEGER NOT NULL DEFAULT 250");
addColumnIfMissing("users","reminder_style","TEXT NOT NULL DEFAULT 'standard'");
addColumnIfMissing("users","daily_summary_enabled","INTEGER NOT NULL DEFAULT 1");
addColumnIfMissing("users","summary_time","TEXT NOT NULL DEFAULT '20:00'");
addColumnIfMissing("users","next_summary_at","INTEGER");
addColumnIfMissing("water_logs","volume_ml","INTEGER NOT NULL DEFAULT 250");
addColumnIfMissing("users","xp","INTEGER NOT NULL DEFAULT 0");
db.exec("CREATE TABLE IF NOT EXISTS hydration_goal_rewards (user_id TEXT NOT NULL,local_date TEXT NOT NULL,xp_awarded INTEGER NOT NULL DEFAULT 25,PRIMARY KEY(user_id,local_date),FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE);");
if(!xpColumnExisted){
 const oldUsers=db.prepare("SELECT user_id,goal FROM users").all();
 const oldDays=db.prepare("SELECT local_date,SUM(amount) AS glasses,SUM(volume_ml) AS volume_ml FROM water_logs WHERE user_id=? GROUP BY local_date");
 const saveXp=db.prepare("UPDATE users SET xp=? WHERE user_id=?");
 const saveReward=db.prepare("INSERT OR IGNORE INTO hydration_goal_rewards(user_id,local_date,xp_awarded) VALUES(?,?,25)");
 for(const u of oldUsers){let volume=0,bonus=0;for(const day of oldDays.all(u.user_id)){volume+=Number(day.volume_ml);if(Number(day.glasses)>=Number(u.goal)){bonus+=25;saveReward.run(u.user_id,day.local_date);}}saveXp.run(Math.floor(volume/100)+bonus,u.user_id);}
}
const oldProfiles=db.prepare("SELECT user_id,timezone,summary_time FROM users WHERE active=1 AND daily_summary_enabled=1 AND next_summary_at IS NULL").all();
const setMigrated=db.prepare("UPDATE users SET next_summary_at=? WHERE user_id=? AND next_summary_at IS NULL");
for(const u of oldProfiles)setMigrated.run(nextDailySummaryTimestamp(Date.now(),u.timezone,u.summary_time),u.user_id);
function getUser(userId){return db.prepare("SELECT * FROM users WHERE user_id=?").get(String(userId))||null;}
function savePendingSetup(userId,goal,expiresAt){db.prepare("INSERT INTO pending_setups(user_id,goal,expires_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET goal=excluded.goal,expires_at=excluded.expires_at").run(String(userId),Number(goal),Number(expiresAt));}
function getPendingSetup(userId,now=Date.now()){return db.prepare("SELECT * FROM pending_setups WHERE user_id=? AND expires_at>?").get(String(userId),Number(now))||null;}
function deletePendingSetup(userId){db.prepare("DELETE FROM pending_setups WHERE user_id=?").run(String(userId));}
function saveReminderSetup(userId,goal,timeZone,nextReminderAt){
 const now=Date.now(),old=getUser(userId),enabled=old?Boolean(old.daily_summary_enabled):true,summaryTime=old?old.summary_time:"20:00";
 const nextSummary=enabled?nextDailySummaryTimestamp(now,String(timeZone),summaryTime):null;
 db.prepare("INSERT INTO users(user_id,goal,timezone,active,next_reminder_at,next_summary_at,created_at,updated_at) VALUES(?,?,?,1,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET goal=excluded.goal,timezone=excluded.timezone,active=1,next_reminder_at=excluded.next_reminder_at,next_summary_at=excluded.next_summary_at,updated_at=excluded.updated_at")
 .run(String(userId),Number(goal),String(timeZone),Number(nextReminderAt),nextSummary,now,now);
}
function setReminderActive(userId,active,nextReminderAt=null,nextSummaryAt=null){db.prepare("UPDATE users SET active=?,next_reminder_at=?,next_summary_at=?,updated_at=? WHERE user_id=?").run(active?1:0,nextReminderAt,nextSummaryAt,Date.now(),String(userId));}
function setNextReminder(userId,at){db.prepare("UPDATE users SET next_reminder_at=?,updated_at=? WHERE user_id=?").run(Number(at),Date.now(),String(userId));}
function setNextSummary(userId,at){db.prepare("UPDATE users SET next_summary_at=?,updated_at=? WHERE user_id=?").run(Number(at),Date.now(),String(userId));}
function updateUserSettings(userId,s,nextReminderAt,nextSummaryAt){
 db.prepare("UPDATE users SET interval_minutes=?,quiet_start_minute=?,quiet_end_minute=?,glass_size_ml=?,reminder_style=?,daily_summary_enabled=?,summary_time=?,next_reminder_at=?,next_summary_at=?,updated_at=? WHERE user_id=?")
 .run(s.intervalMinutes===null?null:Number(s.intervalMinutes),Number(s.quietStartMinute),Number(s.quietEndMinute),Number(s.glassSizeMl),String(s.reminderStyle),s.dailySummaryEnabled?1:0,String(s.summaryTime),nextReminderAt===null?null:Number(nextReminderAt),nextSummaryAt===null?null:Number(nextSummaryAt),Date.now(),String(userId));
 return getUser(userId);
}
function getDueReminders(now=Date.now(),limit=30){return db.prepare("SELECT * FROM users WHERE active=1 AND next_reminder_at IS NOT NULL AND next_reminder_at<=? ORDER BY next_reminder_at LIMIT ?").all(Number(now),Number(limit));}
function getDueSummaries(now=Date.now(),limit=30){return db.prepare("SELECT * FROM users WHERE active=1 AND daily_summary_enabled=1 AND next_summary_at IS NOT NULL AND next_summary_at<=? ORDER BY next_summary_at LIMIT ?").all(Number(now),Number(limit));}
function addDrink(userId,dateKey,createdAt=Date.now(),volumeMl=250,goal=6){
 const id=String(userId),date=String(dateKey),volume=Number(volumeMl),dailyGoal=Number(goal);
 if(!Number.isInteger(volume)||volume<1||volume>5000)throw new RangeError("Drink amount must be a whole number from 1 to 5000 ml.");
 const insert=db.prepare("INSERT INTO water_logs(user_id,local_date,amount,volume_ml,created_at) VALUES(?,?,1,?,?)");
 const totalMlQuery=db.prepare("SELECT COALESCE(SUM(volume_ml),0) AS total FROM water_logs WHERE user_id=?");
 const dailyTotalQuery=db.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM water_logs WHERE user_id=? AND local_date=?");
 const rewardInsert=db.prepare("INSERT OR IGNORE INTO hydration_goal_rewards(user_id,local_date,xp_awarded) VALUES(?,?,25)");
 const updateXp=db.prepare("UPDATE users SET xp=xp+? WHERE user_id=?");
 const getXp=db.prepare("SELECT xp FROM users WHERE user_id=?");
 const tx=db.transaction(()=>{
  const previousMl=Number(totalMlQuery.get(id).total);
  insert.run(id,date,volume,Number(createdAt));
  const total=Number(dailyTotalQuery.get(id,date).total);
  const volumeXp=calculateVolumeXp(previousMl,volume);
  let goalBonusXp=0;
  if(total>=dailyGoal){const reward=rewardInsert.run(id,date);if(reward.changes)goalBonusXp=25;}
  const xpEarned=volumeXp+goalBonusXp;
  if(xpEarned>0)updateXp.run(xpEarned,id);
  return {total,totalMl:previousMl+volume,volumeXp,goalBonusXp,xpEarned,totalXp:Number(getXp.get(id).xp)};
 });
 return tx();
}
function getDailyTotal(userId,dateKey){return Number(db.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM water_logs WHERE user_id=? AND local_date=?").get(String(userId),String(dateKey)).total);}
function getDailyLeaderboard(now=Date.now()){
 const users=db.prepare("SELECT user_id,goal,timezone FROM users").all(),total=db.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM water_logs WHERE user_id=? AND local_date=?");
 return users.map(u=>({userId:u.user_id,goal:Number(u.goal),glasses:Number(total.get(u.user_id,localDateKey(now,u.timezone)).total)})).filter(x=>x.glasses>0).sort((a,b)=>b.glasses-a.glasses||a.userId.localeCompare(b.userId)).map((x,i)=>({...x,rank:i+1}));
}
function getStats(userId,todayDateKey,goal){
 const rows=db.prepare("SELECT local_date,SUM(amount) AS glasses,SUM(volume_ml) AS millilitres FROM water_logs WHERE user_id=? GROUP BY local_date ORDER BY local_date").all(String(userId));
 const byDate=new Map();let totalGlasses=0,totalMl=0;
 for(const r of rows){const count=Number(r.glasses);byDate.set(r.local_date,{glasses:count,millilitres:Number(r.millilitres)});totalGlasses+=count;totalMl+=Number(r.millilitres);}
 const yesterday=addDaysToDateKey(todayDateKey,-1),completed=new Set(rows.filter(r=>Number(r.glasses)>=Number(goal)).map(r=>r.local_date));
 let currentStreak=0,cursor=completed.has(todayDateKey)?todayDateKey:(completed.has(yesterday)?yesterday:null);
 while(cursor&&completed.has(cursor)){currentStreak++;cursor=addDaysToDateKey(cursor,-1);}
 let bestStreak=0,running=0,previous=null;
 for(const r of rows){if(Number(r.glasses)<Number(goal)){running=0;previous=r.local_date;continue;}if(previous&&addDaysToDateKey(previous,1)===r.local_date)running++;else running=1;bestStreak=Math.max(bestStreak,running);previous=r.local_date;}
 const today=byDate.get(todayDateKey)||{glasses:0,millilitres:0};
 return {goal:Number(goal),today:today.glasses,todayMl:today.millilitres,currentStreak,bestStreak,totalGlasses,totalMl,completedDays:completed.size};
}
module.exports={addDrink,db,deletePendingSetup,getDailyTotal,getDailyLeaderboard,getDueReminders,getDueSummaries,getPendingSetup,getStats,getUser,savePendingSetup,saveReminderSetup,setNextReminder,setNextSummary,setReminderActive,updateUserSettings};
