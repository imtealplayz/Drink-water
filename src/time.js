const MINUTE_MS=60000;
const DEFAULT_QUIET_START_MINUTE=1320;
const DEFAULT_QUIET_END_MINUTE=480;
function getZonedParts(timestamp,timeZone){
 const f=new Intl.DateTimeFormat("en-GB",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
 const v={};for(const p of f.formatToParts(new Date(timestamp)))if(p.type!=="literal")v[p.type]=Number(p.value);
 return {year:v.year,month:v.month,day:v.day,hour:v.hour===24?0:v.hour,minute:v.minute,second:v.second};
}
function isValidTimeZone(timeZone){if(typeof timeZone!=="string"||!timeZone.trim())return false;try{new Intl.DateTimeFormat("en-US",{timeZone}).format(new Date());return true;}catch{return false;}}
function localDateKey(timestamp,timeZone){const p=getZonedParts(timestamp,timeZone);return [String(p.year).padStart(4,"0"),String(p.month).padStart(2,"0"),String(p.day).padStart(2,"0")].join("-");}
function addDaysToDateKey(dateKey,amount){const p=dateKey.split("-").map(Number),d=new Date(Date.UTC(p[0],p[1]-1,p[2]+amount));return [String(d.getUTCFullYear()).padStart(4,"0"),String(d.getUTCMonth()+1).padStart(2,"0"),String(d.getUTCDate()).padStart(2,"0")].join("-");}
function zonedTimeToTimestamp(dateKey,clock,timeZone){
 const d=dateKey.split("-").map(Number),m=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(clock);
 if(!m)throw new Error("Clock time must use HH:MM in 24-hour format.");
 const desired=Date.UTC(d[0],d[1]-1,d[2],Number(m[1]),Number(m[2]),0);let guess=desired;
 for(let i=0;i<6;i++){const p=getZonedParts(guess,timeZone),shown=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second),diff=desired-shown;if(diff===0)break;guess+=diff;}
 return guess;
}
function parseClockInput(value){const m=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value||"").trim());return m?Number(m[1])*60+Number(m[2]):null;}
function formatClockMinute(value){const n=Number(value);if(!Number.isInteger(n)||n<0||n>=1440)throw new Error("Minute of day must be between 0 and 1439.");return String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0");}
function isWithinQuietHours(minute,start=DEFAULT_QUIET_START_MINUTE,end=DEFAULT_QUIET_END_MINUTE){const m=Number(minute),s=Number(start),e=Number(end);if(s===e)return true;return s<e?m>=s&&m<e:m>=s||m<e;}
function clockMatchesTimeZone(clock,timeZone,now=Date.now(),toleranceMinutes=15){const entered=parseClockInput(clock);if(entered===null||!isValidTimeZone(timeZone))return false;const p=getZonedParts(now,timeZone),actual=p.hour*60+p.minute,diff=Math.abs(entered-actual);return Math.min(diff,1440-diff)<=toleranceMinutes;}
function getIntervalMinutes(goal){return Math.max(45,Math.round(840/Number(goal)));}
function nextReminderTimestamp(now,timeZone,intervalMinutes,quietStart=DEFAULT_QUIET_START_MINUTE,quietEnd=DEFAULT_QUIET_END_MINUTE){
 if(Number(quietStart)===Number(quietEnd))throw new Error("Quiet hours must have different start and end times.");
 const candidate=now+intervalMinutes*MINUTE_MS,p=getZonedParts(candidate,timeZone),date=localDateKey(candidate,timeZone),minute=p.hour*60+p.minute;
 if(!isWithinQuietHours(minute,quietStart,quietEnd))return candidate;
 const endDate=Number(quietStart)>Number(quietEnd)&&minute>=Number(quietStart)?addDaysToDateKey(date,1):date;
 return zonedTimeToTimestamp(endDate,formatClockMinute(Number(quietEnd)),timeZone);
}
function nextMorningTimestamp(now,timeZone,quietEnd=DEFAULT_QUIET_END_MINUTE){return zonedTimeToTimestamp(addDaysToDateKey(localDateKey(now,timeZone),1),formatClockMinute(Number(quietEnd)),timeZone);}
function nextDailySummaryTimestamp(now,timeZone,summaryTime="20:00"){const today=localDateKey(now,timeZone);let at=zonedTimeToTimestamp(today,summaryTime,timeZone);if(at<=now)at=zonedTimeToTimestamp(addDaysToDateKey(today,1),summaryTime,timeZone);return at;}
function formatLocalTime(timestamp,timeZone){return new Intl.DateTimeFormat("en-GB",{timeZone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(timestamp));}
module.exports={addDaysToDateKey,clockMatchesTimeZone,formatClockMinute,formatLocalTime,getIntervalMinutes,getZonedParts,isValidTimeZone,isWithinQuietHours,localDateKey,nextDailySummaryTimestamp,nextMorningTimestamp,nextReminderTimestamp,parseClockInput,zonedTimeToTimestamp};
