import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { USER, DATA_FILE, rest, graphql, scrapeCalendar } from './lib/github.mjs';
const fixture = process.argv.indexOf('--fixture');
let data;
if (fixture >= 0) data = JSON.parse(await readFile(process.argv[fixture+1], 'utf8'));
else {
  try {
    const query = `query($login:String!) { user(login:$login) { name followers { totalCount } repositories(privacy:PUBLIC, ownerAffiliations:OWNER, first:100, orderBy:{field:PUSHED_AT,direction:DESC}) { totalCount nodes { name description url isFork isArchived pushedAt stargazerCount forkCount primaryLanguage { name color } languages(first:10,orderBy:{field:SIZE,direction:DESC}) { edges { size node { name color } } } } } pullRequests { totalCount } issues { totalCount } contributionsCollection { totalCommitContributions totalPullRequestContributions totalIssueContributions totalPullRequestReviewContributions restrictedContributionsCount contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } } } } }`;
    const {user:u}=await graphql(query,{login:USER});
    const c=u.contributionsCollection;
    data={name:u.name,followers:u.followers.totalCount,repoCount:u.repositories.totalCount,prs:u.pullRequests.totalCount,issues:u.issues.totalCount,commits:c.totalCommitContributions,calendar:c.contributionCalendar.weeks.flatMap(w=>w.contributionDays.map(d=>({date:d.date,count:d.contributionCount}))),repos:u.repositories.nodes.map(r=>({...r,stars:r.stargazerCount,forks:r.forkCount,languages:r.languages.edges.map(e=>({...e.node,size:e.size}))}))};
  } catch(error) {
    console.warn(`::warning::GraphQL failed; using public REST and calendar: ${error.message}`);
    const [u,repos,calendar]=await Promise.all([rest(`/users/${USER}`),rest(`/users/${USER}/repos?per_page=100&sort=pushed&type=owner`),scrapeCalendar()]);
    data={name:u.name,followers:u.followers,repoCount:u.public_repos,prs:0,issues:0,commits:0,calendar,repos:repos.map(r=>({name:r.name,description:r.description,url:r.html_url,isFork:r.fork,isArchived:r.archived,pushedAt:r.pushed_at,stars:r.stargazers_count,forks:r.forks_count,primaryLanguage:r.language?{name:r.language,color:null}:null,languages:r.language?[{name:r.language,color:null,size:1}]:[]}))};
  }
  try { const events=await rest(`/users/${USER}/events/public?per_page=50`); data.events=events.map(e=>({type:e.type,repo:e.repo.name,createdAt:e.created_at,action:e.payload.action,refType:e.payload.ref_type,ref:e.payload.ref,commits:e.payload.size ?? e.payload.commits?.length ?? 0,number:e.payload.number ?? e.payload.issue?.number,title:e.payload.issue?.title ?? e.payload.pull_request?.title,merged:e.payload.pull_request?.merged})); }
  catch(e) {console.warn(`::warning::Events unavailable: ${e.message}`);data.events=[];}
}
await mkdir('.cache',{recursive:true}); await writeFile(DATA_FILE,JSON.stringify(data,null,2)+'\n'); console.log('Profile data collected.');
