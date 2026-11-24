import { setTimeout as sleep } from 'node:timers/promises';
export const USER = 'vranasinghe', DATA_FILE = '.cache/profile-data.json';
export async function fetchWithRetry(url, options = {}) {
  for (let i = 0; i < 4; i++) {
    try {
      const response = await fetch(url, {...options, signal: AbortSignal.timeout(20000)});
      if (response.ok) return response;
      const error = new Error(`HTTP ${response.status} for ${url}`);
      if (response.status !== 429 && response.status < 500) throw Object.assign(error, {permanent:true});
      throw error;
    } catch (error) {
      if (error.permanent || i === 3) throw error;
      await sleep(2000 * 2 ** i);
    }
  }
}
const headers = () => ({'User-Agent': USER, 'Accept':'application/vnd.github+json', ...((process.env.PROFILE_TOKEN || process.env.GITHUB_TOKEN) ? {Authorization:`Bearer ${process.env.PROFILE_TOKEN || process.env.GITHUB_TOKEN}`} : {})});
export async function rest(path) { return (await fetchWithRetry(`https://api.github.com${path}`, {headers:headers()})).json(); }
export async function graphql(query, variables = {}) {
  const result = await (await fetchWithRetry('https://api.github.com/graphql', {method:'POST', headers:{...headers(),'Content-Type':'application/json'}, body:JSON.stringify({query,variables})})).json();
  if (result.errors?.length) throw new Error(result.errors.map(e => e.message).join('; '));
  return result.data;
}
export async function scrapeCalendar() {
  const html = await (await fetchWithRetry(`https://github.com/users/${USER}/contributions`, {headers:{'User-Agent':USER}})).text();
  const dates = new Map();
  for (const [tag] of html.matchAll(/<td\b[^>]*>/g)) { const id=tag.match(/\bid="([^"]+)"/), date=tag.match(/data-date="(\d{4}-\d\d-\d\d)"/); if(id && date) dates.set(id[1],date[1]); }
  const days=[];
  for (const m of html.matchAll(/<tool-tip\b[^>]*\bfor="([^"]+)"[^>]*>([\s\S]*?)<\/tool-tip>/g)) { const date=dates.get(m[1]); if(date) {const n=m[2].replace(/<[^>]*>/g,'').trim().match(/^([\d,]+) contributions?/); days.push({date,count:n ? Number(n[1].replaceAll(',','')) : 0});} }
  if (!days.length) throw new Error('No contribution days found in GitHub calendar');
  return days.sort((a,b)=>a.date.localeCompare(b.date));
}
