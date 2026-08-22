// Updates the "Latest Activity" section of README.md with the most recently
// pushed repos for the user. Run by .github/workflows/update-readme.yml daily.
//
// Usage: node scripts/update-recent-repos.mjs
// Writes README.md only if the generated block differs.

import { readFile, writeFile } from "node:fs/promises";

const USER = "vranasinghe";
const README = "README.md";
const START = "<!-- RECENT-REPOS:START -->";
const END = "<!-- RECENT-REPOS:END -->";
const MAX = 5;
const SELF_REPO = USER.toLowerCase(); // profile repo, skip it

const langBadges = {
  JavaScript: '<img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black" />',
  TypeScript: '<img src="https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white" />',
  Python: '<img src="https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white" />',
  Java: '<img src="https://img.shields.io/badge/Java-ED8B00?style=flat-square&logo=openjdk&logoColor=white" />',
  "Jupyter Notebook": '<img src="https://img.shields.io/badge/Jupyter-F37626?style=flat-square&logo=jupyter&logoColor=white" />',
  HTML: '<img src="https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white" />',
  CSS: '<img src="https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white" />',
  "C++": '<img src="https://img.shields.io/badge/C++-00599C?style=flat-square&logo=c%2B%2B&logoColor=white" />',
  C: '<img src="https://img.shields.io/badge/C-A8B9CC?style=flat-square&logo=c&logoColor=black" />',
  "C#": '<img src="https://img.shields.io/badge/C%23-239120?style=flat-square&logo=csharp&logoColor=white" />',
  Go: '<img src="https://img.shields.io/badge/Go-00ADD8?style=flat-square&logo=go&logoColor=white" />',
  Rust: '<img src="https://img.shields.io/badge/Rust-000000?style=flat-square&logo=rust&logoColor=white" />',
  Dart: '<img src="https://img.shields.io/badge/Dart-0175C2?style=flat-square&logo=dart&logoColor=white" />',
  PHP: '<img src="https://img.shields.io/badge/PHP-777BB4?style=flat-square&logo=php&logoColor=white" />',
  Ruby: '<img src="https://img.shields.io/badge/Ruby-CC342D?style=flat-square&logo=ruby&logoColor=white" />',
  Swift: '<img src="https://img.shields.io/badge/Swift-FA7343?style=flat-square&logo=swift&logoColor=white" />',
  Kotlin: '<img src="https://img.shields.io/badge/Kotlin-7F52FF?style=flat-square&logo=kotlin&logoColor=white" />',
  Shell: '<img src="https://img.shields.io/badge/Shell-121011?style=flat-square&logo=gnu-bash&logoColor=white" />',
};

function getLangBadge(lang) {
  if (!lang) return "•";
  if (langBadges[lang]) return langBadges[lang];
  return `<img src="https://img.shields.io/badge/${encodeURIComponent(lang)}-30363d?style=flat-square" />`;
}

function ghHeaders() {
  const headers = { "User-Agent": USER, Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function fetchRepos() {
  const res = await fetch(
    `https://api.github.com/users/${USER}/repos?per_page=100&sort=pushed`,
    { headers: ghHeaders() }
  );
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function fetchProfile() {
  const res = await fetch(`https://api.github.com/users/${USER}`, {
    headers: ghHeaders(),
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// Replaces the <img> between START/END markers with a freshly-baked badge URL
// carrying the given count, so it shows a real number without shields.io's
// flaky dynamic GitHub-token-pool badges.
function replaceBadge(readme, label, count, logo) {
  const START = `<!-- ${label}-BADGE:START -->`;
  const END = `<!-- ${label}-BADGE:END -->`;
  const startIdx = readme.indexOf(START);
  const endIdx = readme.indexOf(END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(`Markers ${START} / ${END} not found in ${README}`);
  }
  const alt = label.charAt(0) + label.slice(1).toLowerCase();
  const img =
    `<img src="https://img.shields.io/badge/${label}-${count}-00aaff` +
    `?style=for-the-badge&labelColor=0d1117&logo=${logo}&logoColor=white" alt="${alt}"/>`;
  const before = readme.slice(0, startIdx + START.length);
  const after = readme.slice(endIdx);
  return before + img + after;
}

function renderRows(repos) {
  const rows = repos
    .filter((r) => !r.fork && !r.archived)
    .filter((r) => r.name.toLowerCase() !== SELF_REPO)
    .filter((r) => r.description && r.description.trim())
    .slice(0, MAX)
    .map((r) => {
      const lang = getLangBadge(r.language);
      const desc = r.description.trim();
      const short = desc.length > 110 ? desc.slice(0, 107).trimEnd() + "…" : desc;
      return `| [**${r.name}**](${r.html_url}) | ${lang} | ${short} |`;
    });

  return [
    "| Repository | Language | Description |",
    "| :--- | :--- | :--- |",
    ...rows,
  ].join("\n");
}

async function main() {
  const [repos, profile] = await Promise.all([fetchRepos(), fetchProfile()]);
  const table = renderRows(repos);

  const readme = await readFile(README, "utf8");
  const startIdx = readme.indexOf(START);
  const endIdx = readme.indexOf(END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(`Markers ${START} / ${END} not found in ${README}`);
  }

  const before = readme.slice(0, startIdx + START.length);
  const after = readme.slice(endIdx);
  const block =
    "\n<!-- Updated automatically by .github/workflows/update-readme.yml. Do not edit by hand. -->\n\n" +
    table +
    "\n\n";
  let next = before + block + after;

  next = replaceBadge(next, "FOLLOWERS", profile.followers, "github");
  next = replaceBadge(next, "REPOS", profile.public_repos, "git");

  if (next === readme) {
    console.log("README already up to date.");
    return;
  }
  await writeFile(README, next, "utf8");
  console.log("README Latest Activity + badge counts updated.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
