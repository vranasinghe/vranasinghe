export const HIDDEN_LANGUAGES = [];
export const fmtNum = n => n >= 1000 ? `${(n/1000).toFixed(1).replace(/\.0$/, '')}k` : String(n ?? 0);
export const fmtDate = d => d ? new Date(`${d.slice(0,10)}T00:00:00Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}) : '—';
export function streaks(calendar) {
 const days=[...calendar].sort((a,b)=>a.date.localeCompare(b.date)); let best={count:0,start:null,end:null}, run={count:0,start:null,end:null};
 for(const d of days) { if(d.count>0) {if(!run.count) run.start=d.date;run.count++;run.end=d.date;if(run.count>best.count) best={...run};} else run={count:0,start:null,end:null}; }
 const today=new Date().toISOString().slice(0,10); if(days.at(-1)?.date===today && !days.at(-1).count) {const previous=days.slice(0,-1); run=streaksCurrent(previous);} else run=streaksCurrent(days);
 return {current:run,longest:best};
}
function streaksCurrent(days) {let count=0,start=null,end=null;for(let i=days.length-1;i>=0&&days[i].count>0;i--){end ||= days[i].date;start=days[i].date;count++;}return {count,start,end};}
export function topLanguages(repos,limit=6) {const m=new Map(); for(const r of repos.filter(r=>!r.isFork&&!r.isArchived)) for(const l of r.languages||[]) {if(HIDDEN_LANGUAGES.includes(l.name))continue;const x=m.get(l.name)||{name:l.name,color:l.color||'#8b949e',bytes:0,repos:0};x.bytes+=l.size;x.repos++;m.set(l.name,x);} const a=[...m.values()].map(x=>({...x,score:Math.sqrt(x.bytes)*Math.sqrt(x.repos)})).sort((a,b)=>b.score-a.score).slice(0,limit);const total=a.reduce((s,x)=>s+x.score,0);return a.map(x=>({...x,percent:total?100*x.score/total:0}));}
export function weekdayActivity(calendar) {const totals=Array(7).fill(0);for(const d of calendar) totals[new Date(d.date+'T00:00:00Z').getUTCDay()]+=d.count;return totals.some(Boolean)?['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][totals.indexOf(Math.max(...totals))]:'—';}
export function summary(data) {return {stars:data.repos.reduce((s,r)=>s+(r.stars||0),0),commits:data.commits||0,prs:data.prs||0,issues:data.issues||0,total:data.calendar.reduce((s,d)=>s+d.count,0),activeDays:data.calendar.filter(d=>d.count>0).length,...streaks(data.calendar)};}
