// Generates assets/contribution-graph.svg: a daily contribution line chart for
// the last DAYS days, drawn from the public GitHub contribution calendar.
// Replaces the hosted github-readme-activity-graph service, which went offline.
// Run by .github/workflows/update-readme.yml daily.
//
// Usage: node scripts/generate-contribution-graph.mjs
// Writes the SVG only if it differs.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const USER = "vranasinghe";
const OUT = "assets/contribution-graph.svg";
const DAYS = 31;
const TITLE = "Contribution Timeline";

const COLORS = {
  bg: "#0d1117",
  border: "#30363d",
  grid: "#21262d",
  text: "#8b949e",
  title: "#00aaff",
  line: "#00aaff",
  area: "#0055ff",
  point: "#e6edf3",
};

// Chart geometry
const W = 1000;
const H = 420;
const PAD = { top: 70, right: 30, bottom: 80, left: 60 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

async function fetchCalendar() {
  const res = await fetch(`https://github.com/users/${USER}/contributions`, {
    headers: { "User-Agent": USER },
  });
  if (!res.ok) {
    throw new Error(`GitHub contributions page ${res.status}`);
  }
  return res.text();
}

// Each day is a <td data-date="YYYY-MM-DD" id="contribution-day-component-X-Y">
// with a matching <tool-tip for="..."> holding "N contributions on ...".
function parseCalendar(html) {
  const dateById = new Map();
  for (const m of html.matchAll(/<td\b[^>]*>/g)) {
    const date = m[0].match(/data-date="(\d{4}-\d{2}-\d{2})"/);
    const id = m[0].match(/\bid="([^"]+)"/);
    if (date && id) dateById.set(id[1], date[1]);
  }

  const days = [];
  for (const m of html.matchAll(/<tool-tip\b[^>]*\bfor="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
    const date = dateById.get(m[1]);
    if (!date) continue;
    const n = m[2].match(/^(\d+) contributions?/);
    days.push({ date, count: n ? Number(n[1]) : 0 });
  }
  if (days.length === 0) {
    throw new Error("No contribution days found; GitHub page format may have changed");
  }
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

// Rounds the y-axis max up to a tidy value and picks a tick step.
function niceScale(max) {
  if (max <= 4) return { max: 4, step: 1 };
  const rough = max / 5;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((f) => f * mag).find((s) => s >= rough);
  return { max: Math.ceil(max / step) * step, step };
}

// Monotone cubic (Fritsch–Carlson) path: smooth like the reference chart but
// never overshoots below zero or above a peak.
function smoothPath(pts) {
  const n = pts.length;
  if (n < 2) return `M${pts[0].x},${pts[0].y}`;
  const dx = [], slope = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    slope.push((pts[i + 1].y - pts[i].y) / dx[i]);
  }
  const t = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    t.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  }
  t.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      t[i] = t[i + 1] = 0;
      continue;
    }
    const a = t[i] / slope[i];
    const b = t[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) {
      const k = 3 / Math.sqrt(h);
      t[i] = k * a * slope[i];
      t[i + 1] = k * b * slope[i];
    }
  }
  const f = (v) => v.toFixed(1);
  let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d +=
      ` C${f(pts[i].x + h)},${f(pts[i].y + t[i] * h)}` +
      ` ${f(pts[i + 1].x - h)},${f(pts[i + 1].y - t[i + 1] * h)}` +
      ` ${f(pts[i + 1].x)},${f(pts[i + 1].y)}`;
  }
  return d;
}

function formatDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function renderSvg(days) {
  const total = days.reduce((s, d) => s + d.count, 0);
  const { max, step } = niceScale(Math.max(...days.map((d) => d.count)));
  const x = (i) => PAD.left + (PLOT_W * i) / (days.length - 1);
  const y = (v) => PAD.top + PLOT_H - (PLOT_H * v) / max;
  const pts = days.map((d, i) => ({ x: x(i), y: y(d.count) }));
  const line = smoothPath(pts);
  const base = PAD.top + PLOT_H;
  const area = `${line} L${pts.at(-1).x.toFixed(1)},${base} L${pts[0].x.toFixed(1)},${base} Z`;

  const yGrid = [];
  for (let v = 0; v <= max; v += step) {
    yGrid.push(
      `<line x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(v)}" y2="${y(v)}" class="grid"/>` +
        `<text x="${PAD.left - 12}" y="${y(v) + 4}" text-anchor="end" class="label">${v}</text>`
    );
  }

  const xGrid = days.map((d, i) => {
    const px = x(i).toFixed(1);
    return (
      `<line x1="${px}" x2="${px}" y1="${PAD.top}" y2="${base}" class="grid"/>` +
      `<text transform="translate(${px},${base + 16}) rotate(-45)" text-anchor="end" class="label">${formatDate(d.date)}</text>`
    );
  });

  const points = days.map(
    (d, i) =>
      `<circle cx="${pts[i].x.toFixed(1)}" cy="${pts[i].y.toFixed(1)}" r="3.5" class="point">` +
      `<title>${formatDate(d.date)}: ${d.count} contribution${d.count === 1 ? "" : "s"}</title></circle>`
  );

  const range = `${formatDate(days[0].date)} – ${formatDate(days.at(-1).date)}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${TITLE}: ${total} contributions, ${range}">
<style>
  .label { font: 12px 'Segoe UI', Ubuntu, sans-serif; fill: ${COLORS.text}; }
  .title { font: 600 20px 'Segoe UI', Ubuntu, sans-serif; fill: ${COLORS.title}; }
  .sub { font: 13px 'Segoe UI', Ubuntu, sans-serif; fill: ${COLORS.text}; }
  .grid { stroke: ${COLORS.grid}; stroke-width: 1; }
  .line { fill: none; stroke: ${COLORS.line}; stroke-width: 3; stroke-linejoin: round; stroke-linecap: round; }
  .point { fill: ${COLORS.point}; stroke: ${COLORS.line}; stroke-width: 1.5; }
</style>
<defs>
  <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${COLORS.area}" stop-opacity="0.55"/>
    <stop offset="1" stop-color="${COLORS.area}" stop-opacity="0.02"/>
  </linearGradient>
</defs>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${COLORS.bg}" stroke="${COLORS.border}"/>
<text x="${W / 2}" y="34" text-anchor="middle" class="title">${TITLE}</text>
<text x="${W / 2}" y="54" text-anchor="middle" class="sub">${total} contributions · ${range}</text>
${yGrid.join("\n")}
${xGrid.join("\n")}
<path d="${area}" fill="url(#fill)"/>
<path d="${line}" class="line"/>
${points.join("\n")}
</svg>
`;
}

async function main() {
  const days = parseCalendar(await fetchCalendar()).slice(-DAYS);
  const svg = renderSvg(days);

  const current = await readFile(OUT, "utf8").catch(() => null);
  if (current === svg) {
    console.log("Contribution graph already up to date.");
    return;
  }
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, svg, "utf8");
  console.log(`Contribution graph updated (${days[0].date} → ${days.at(-1).date}).`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
