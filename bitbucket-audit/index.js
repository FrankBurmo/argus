#!/usr/bin/env node
"use strict";

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

// ---------------------------------------------------------------------------
// 1. Konfigurasjon
// ---------------------------------------------------------------------------

// Last inn .env fra arbeidsmappen (overstyrer IKKE allerede satte variabler)
require("dotenv").config({ path: path.join(process.cwd(), ".env") });

const BITBUCKET_URL = process.env.BITBUCKET_URL;
let BITBUCKET_TOKEN = process.env.BITBUCKET_TOKEN;
const CONCURRENCY = Math.max(1, parseInt(process.env.CONCURRENCY, 10) || 5);
const MAX_REPOS = parseInt(process.env.MAX_REPOS, 10) || 0; // 0 = ingen grense
// Filtrer på ett Bitbucket-prosjekt: søk i CLI-argument først, deretter miljøvariabel
const PROJECT_KEY = (process.argv[2] || process.env.PROJECT_KEY || "").toUpperCase().trim() || null;

const secret = require("./secret");

function validateEnv() {
  if (!BITBUCKET_URL) {
    console.error(
      "Feil: Manglende miljøvariabel: BITBUCKET_URL\n" +
        "Sett den før du kjører:\n" +
        "  export BITBUCKET_URL=https://bitbucket.eksempel.no"
    );
    process.exit(1);
  }
  const parsedUrl = new URL(BITBUCKET_URL);
  if (parsedUrl.protocol !== "https:") {
    console.error(
      "Feil: BITBUCKET_URL må bruke HTTPS for å beskytte tokenet under overføring.\n" +
        "  Bruk: https://bitbucket.eksempel.no"
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// 2. HTTP-klient
// ---------------------------------------------------------------------------

const parsedBase = new URL(BITBUCKET_URL || "http://localhost");
const transport = parsedBase.protocol === "https:" ? https : http;

/**
 * Gjør en GET-forespørsel mot Bitbucket og returnerer JSON-body.
 * Kaster Error ved HTTP-statuskoder utenfor 2xx.
 */
function request(apiPath) {
  const url = new URL(apiPath, BITBUCKET_URL);

  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === "https:" ? 443 : 80),
    path: url.pathname + url.search,
    method: "GET",
    headers: {
      Authorization: `Bearer ${BITBUCKET_TOKEN}`,
      Accept: "application/json",
    },
  };

  return new Promise((resolve, reject) => {
    const req = transport.request(options, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(
            new Error(
              `HTTP ${res.statusCode} for ${options.path}: ${body.slice(0, 200)}`
            )
          );
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Ugyldig JSON fra ${options.path}: ${e.message}`));
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

/**
 * Henter alle sider fra et paginert Bitbucket-endepunkt.
 * Returnerer flattet array av `.values`.
 */
async function getAllPages(apiPath) {
  const results = [];
  let start = 0;
  const separator = apiPath.includes("?") ? "&" : "?";

  while (true) {
    const page = await request(
      `${apiPath}${separator}limit=100&start=${start}`
    );
    if (Array.isArray(page.values)) {
      results.push(...page.values);
    }
    if (page.isLastPage !== false) break;
    start = page.nextPageStart;
  }
  return results;
}

// ---------------------------------------------------------------------------
// 3. Concurrency pool
// ---------------------------------------------------------------------------

async function pooledMap(items, fn, concurrency = CONCURRENCY) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (true) {
      const i = index++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// 4. Rapportgenerering
// ---------------------------------------------------------------------------

function buildReport(repoResults, checks) {
  const total = repoResults.length;
  const byCheck = {};

  for (const chk of checks) {
    const passed       = repoResults.filter((r) => r.checks[chk.id] === true).length;
    const notApplicable = repoResults.filter((r) => r.checks[chk.id] === null).length;
    const coveredByAlt = repoResults.filter((r) =>
      r.checks[chk.id] === false &&
      r.assessments && r.assessments[chk.id] &&
      r.assessments[chk.id].startsWith("Ikke nødvendig")
    ).length;
    const failed       = repoResults.filter((r) => r.checks[chk.id] === false).length - coveredByAlt;
    const applicable   = total - notApplicable;
    const covered      = passed + coveredByAlt;
    byCheck[chk.id] = {
      passed,
      failed,
      coveredByAlt,
      notApplicable,
      coveragePercent: applicable ? +((covered / applicable) * 100).toFixed(1) : 0,
    };
  }

  const repos = repoResults
    .slice()
    .sort((a, b) =>
      `${a.project}/${a.repo}`.localeCompare(`${b.project}/${b.repo}`)
    );

  return {
    generatedAt: new Date().toISOString(),
    checks: checks.map((c) => c.id),
    summary: { total, byCheck },
    repos,
  };
}

function buildMarkdownReport(report, checks) {
  const lines = [];
  const ts = new Date(report.generatedAt).toLocaleString("nb-NO", { timeZone: "UTC" });

  // Klassifiser sjekk-resultat til ikon
  function assessIcon(chk, r) {
    const val = r.checks[chk.id];
    if (val === true)  return "✅";
    if (val === null)  return "➖"; // Ikke aktuelt (ingen pipeline)
    const text = r.assessments && r.assessments[chk.id];
    if (!text) return "❌";
    if (text.startsWith("Anbefalt"))       return "⚠️";
    if (text.startsWith("Ikke nødvendig")) return "➖";
    return "❓"; // Usikkert / Kunne ikke vurdere
  }

  // Har repoet minst én sjekk som er eksplisitt feilet og anbefalt korrigert?
  function isActionable(r) {
    return checks.some((chk) => {
      if (r.checks[chk.id] !== false) return false;
      const text = r.assessments && r.assessments[chk.id];
      return text && text.startsWith("Anbefalt");
    });
  }

  lines.push("# Argus — Bitbucket Revisjonsrapport");
  lines.push("");
  lines.push(`> **Generert:** ${ts} UTC  `);
  lines.push(`> **Repos sjekket:** ${report.summary.total}  `);
  lines.push(`> **Sjekker:** ${checks.map((c) => c.label).join(", ")}`);
  lines.push("");
  lines.push("**Ikoner:** ✅ OK &nbsp;|&nbsp; ➖ Ikke aktuelt &nbsp;|&nbsp; ⚠️ Anbefalt korrigert &nbsp;|&nbsp; ➡️ Ikke nødvendig &nbsp;|&nbsp; ❓ Usikkert");
  lines.push("");

  // ── Sammendrag ──────────────────────────────────────────────
  lines.push("## Sammendrag");
  lines.push("");

  const actionableCount = report.repos.filter(isActionable).length;
  if (actionableCount > 0) {
    lines.push(`> ⚠️ **${actionableCount} av ${report.summary.total} repos har tiltak som anbefales gjennomført.**`);
    lines.push("");
  }

  lines.push(`| Sjekker | Bestått | Dekket | Feilet | Ikke aktuelt | Dekning (av aktuelle) |`);
  lines.push(`| ------- | -------:| ------:| ------:| ------------:| ---------------------:|`);
  for (const chk of checks) {
    const s = report.summary.byCheck[chk.id];
    const pct = s.coveragePercent.toFixed(1);
    const icon = s.coveragePercent >= 80 ? "🟢" : s.coveragePercent >= 40 ? "🟡" : "🔴";
    const naCell = s.notApplicable > 0 ? `➖ ${s.notApplicable}` : "—";
    const covCell = s.coveredByAlt > 0 ? `➡️ ${s.coveredByAlt}` : "—";
    lines.push(`| ${chk.label} | ${s.passed} | ${covCell} | ${s.failed} | ${naCell} | ${icon} ${pct}% |`);
  }
  lines.push("");

  // ── Gruppert per prosjekt ────────────────────────────────────
  lines.push("## Avvik per prosjekt");
  lines.push("");

  const byProject = {};
  for (const r of report.repos) {
    if (!byProject[r.project]) byProject[r.project] = [];
    byProject[r.project].push(r);
  }

  let hasAnyFailures = false;

  for (const [project, repos] of Object.entries(byProject)) {
    const failingRepos = repos.filter((r) => checks.some((chk) => r.checks[chk.id] === false));
    if (failingRepos.length === 0) continue;
    hasAnyFailures = true;

    // Del opp i "bør korrigeres" og "ingen tiltak nødvendig"
    const actionable    = failingRepos.filter(isActionable);
    const nonActionable = failingRepos.filter((r) => !isActionable(r));

    const projectActionCount = actionable.length;
    lines.push(`### ${project}`);
    lines.push("");
    if (projectActionCount > 0) {
      lines.push(`⚠️ **${projectActionCount} repos bør korrigeres** — ${nonActionable.length} har ingen tiltak nødvendig — ${repos.filter((r) => checks.every((chk) => r.checks[chk.id] !== false)).length} er OK/ikke-aktuelt`);
    } else {
      lines.push(`Ingen tiltak nødvendig (${nonActionable.length} repos mangler sjekker, men vurdering tilsier at de ikke trenger dem)`);
    }
    lines.push("");

    const checkHeaders = checks.map((c) => c.label).join(" | ");
    const checkDivider = checks.map(() => ":---:").join(" | ");

    // ── Repos som bør korrigeres ─────────────────────────────
    if (actionable.length > 0) {
      lines.push(`#### ⚠️ Bør korrigeres`);
      lines.push("");
      lines.push(`| Repo | ${checkHeaders} | Tiltak |`);
      lines.push(`| ---- | ${checkDivider} | ------ |`);

      for (const r of actionable) {
        const checkCells = checks.map((chk) => assessIcon(chk, r)).join(" | ");
        const tiltakCells = checks
          .filter((chk) => r.checks[chk.id] === false && r.assessments && r.assessments[chk.id] && r.assessments[chk.id].startsWith("Anbefalt"))
          .map((chk) => `**${chk.label}:** ${r.assessments[chk.id]}`)
          .join("<br>");
        lines.push(`| \`${r.repo}\` | ${checkCells} | ${tiltakCells} |`);
      }
      lines.push("");
    }

    // ── Repos uten nødvendige tiltak ─────────────────────────
    if (nonActionable.length > 0) {
      lines.push(`<details><summary>➖ ${nonActionable.length} repos uten nødvendige tiltak</summary>`);
      lines.push("");
      lines.push(`| Repo | ${checkHeaders} |`);
      lines.push(`| ---- | ${checkDivider} |`);
      for (const r of nonActionable) {
        const checkCells = checks.map((chk) => assessIcon(chk, r)).join(" | ");
        lines.push(`| \`${r.repo}\` | ${checkCells} |`);
      }
      lines.push("");
      lines.push("</details>");
      lines.push("");
    }

    // Repos uten avvik i prosjektet, kompakt
    const okRepos = repos.filter((r) => checks.every((chk) => r.checks[chk.id] !== false));
    if (okRepos.length > 0) {
      lines.push(`<details><summary>✅ ${okRepos.length} repos uten avvik</summary>`);
      lines.push("");
      for (const r of okRepos) {
        const naChecks = checks.filter((chk) => r.checks[chk.id] === null);
        const suffix = naChecks.length > 0 ? ` — ➖ ${naChecks.map((c) => c.label).join(", ")} ikke aktuelt` : "";
        lines.push(`- \`${r.repo}\`${suffix}`);
      }
      lines.push("");
      lines.push("</details>");
      lines.push("");
    }
  }

  if (!hasAnyFailures) {
    lines.push("✅ Alle repos passerer alle sjekker.");
    lines.push("");
  }

  // ── Prosjekter uten avvik ────────────────────────────────────
  const perfectProjects = Object.entries(byProject)
    .filter(([, repos]) => repos.every((r) => checks.every((chk) => r.checks[chk.id] !== false)))
    .map(([p]) => p);

  if (perfectProjects.length > 0) {
    lines.push("## Prosjekter uten avvik");
    lines.push("");
    for (const p of perfectProjects) lines.push(`- **${p}**`);
    lines.push("");
  }

  lines.push("---");
  lines.push(`*Rapport generert av [Argus](https://github.com/FrankBurmo/argus)*`);
  lines.push("");

  return lines.join("\n");
}

function printReport(report, checks) {
  // ANSI-farger
  const c = {
    reset:  "\x1b[0m",
    bold:   "\x1b[1m",
    dim:    "\x1b[2m",
    red:    "\x1b[31m",
    green:  "\x1b[32m",
    yellow: "\x1b[33m",
    cyan:   "\x1b[36m",
    white:  "\x1b[37m",
    bgRed:  "\x1b[41m",
  };

  const width = 60;
  const line  = "─".repeat(width);

  // ── Topptekst ──────────────────────────────────────────────
  console.log(`\n${c.bold}${c.cyan}${"═".repeat(width)}${c.reset}`);
  const title = "ARGUS — BITBUCKET REVISJONSRAPPORT";
  const pad   = Math.floor((width - title.length) / 2);
  console.log(`${c.bold}${c.cyan}${" ".repeat(pad)}${title}${c.reset}`);
  console.log(`${c.bold}${c.cyan}${"═".repeat(width)}${c.reset}`);
  console.log(`${c.dim}  Generert : ${report.generatedAt}${c.reset}`);
  console.log(`${c.dim}  Repos    : ${report.summary.total}  |  Sjekker: ${checks.map(c => c.label).join(", ")}${c.reset}\n`);

  // ── Sammendragstabell ───────────────────────────────────────
  const BAR_WIDTH = 20;
  for (const chk of checks) {
    const s   = report.summary.byCheck[chk.id];
    const pct = s.coveragePercent;
    const applicable = report.summary.total - s.notApplicable;
    const covered = s.passed + (s.coveredByAlt || 0);
    const filled = Math.round((pct / 100) * BAR_WIDTH);
    const bar = c.green + "█".repeat(filled) + c.reset + c.dim + "░".repeat(BAR_WIDTH - filled) + c.reset;
    const label = chk.label.padEnd(22);
    const altNote = s.coveredByAlt > 0 ? ` ${c.dim}(${s.coveredByAlt} dekket av alt.)${c.reset}` : "";
    const fraction = `${String(covered).padStart(4)} / ${applicable}${altNote}${s.notApplicable > 0 ? ` (${c.dim}${s.notApplicable} ikke aktuell${c.reset})` : ""}`;
    const pctStr = `${pct.toFixed(1).padStart(5)}%`;
    const color = pct >= 80 ? c.green : pct >= 40 ? c.yellow : c.red;
    console.log(`  ${c.bold}${label}${c.reset} ${bar}  ${fraction}  ${color}${pctStr}${c.reset}`);
  }

  // ── Gruppert per prosjekt ───────────────────────────────────
  const byProject = {};
  for (const r of report.repos) {
    if (!byProject[r.project]) byProject[r.project] = [];
    byProject[r.project].push(r);
  }

  const projectsWithFailures = Object.entries(byProject).filter(([, repos]) =>
    repos.some((r) => checks.some((chk) => r.checks[chk.id] === false))
  );

  if (projectsWithFailures.length === 0) {
    console.log(`\n  ${c.green}${c.bold}Alle repos passerer alle sjekker. ✓${c.reset}\n`);
    return;
  }

  console.log(`\n${c.bold}  PROSJEKTER MED AVVIK${c.reset}`);
  console.log(`  ${line}`);

  for (const [project, repos] of projectsWithFailures) {
    const failingRepos = repos.filter((r) => checks.some((chk) => r.checks[chk.id] === false));
    const allCount  = repos.length;
    const failCount = failingRepos.length;

    console.log(
      `\n  ${c.bold}${c.cyan}${project}${c.reset}` +
      `  ${c.dim}(${allCount} repos, ${c.reset}${c.red}${failCount} med avvik${c.reset}${c.dim})${c.reset}`
    );
    console.log(`  ${"─".repeat(Math.min(width - 2, project.length + 30))}`);

    for (const r of repos) {
      const failingChecks = checks.filter((chk) => r.checks[chk.id] === false);
      const allOk = failingChecks.length === 0;

      if (allOk) {
        // Vis OK/ikke-aktuell repos dempet
        const boxes = checks.map((chk) =>
          r.checks[chk.id] === null
            ? `${c.dim}─ ${chk.label}${c.reset}`
            : `${c.green}☑ ${chk.label}${c.reset}`
        ).join("  ");
        console.log(`  ${c.dim}${r.repo.padEnd(30)}${c.reset}  ${boxes}`);
        continue;
      }

      // Repo med avvik
      const boxes = checks
        .map((chk) =>
          r.checks[chk.id] === true  ? `${c.green}☑ ${chk.label}${c.reset}` :
          r.checks[chk.id] === null  ? `${c.dim}─ ${chk.label}${c.reset}` :
                                       `${c.red}☐ ${chk.label}${c.reset}`
        )
        .join("  ");

      const repoLabel = `${c.bold}${r.repo}${c.reset}`;
      console.log(`  ${repoLabel.padEnd(30 + c.bold.length + c.reset.length)}  ${boxes}`);

      for (const chk of failingChecks) {
        const assessment = (r.assessments && r.assessments[chk.id]) || "Ingen vurdering";
        // Fargelegg vurdering basert på innhold
        let assessColor = c.dim;
        if (assessment.startsWith("Anbefalt")) assessColor = c.yellow;
        else if (assessment.startsWith("Ikke nødvendig")) assessColor = c.dim;
        else if (assessment.startsWith("Usikkert")) assessColor = c.dim;
        console.log(`    ${c.dim}└─${c.reset} ${c.dim}${chk.label}:${c.reset} ${assessColor}${assessment}${c.reset}`);
      }
    }
  }

  console.log(`\n  ${line}`);
  const totalFailing = report.repos.filter((r) => checks.some((chk) => r.checks[chk.id] === false)).length;
  console.log(
    `  ${c.bold}Totalt:${c.reset} ${c.red}${totalFailing} repos med avvik${c.reset}` +
    ` av ${report.summary.total} sjekket.\n`
  );
}

// ---------------------------------------------------------------------------
// 5. Hovedflyt
// ---------------------------------------------------------------------------

async function main() {
  validateEnv();

  // Hent token: miljøvariabel → sikker lagring → spør bruker
  if (!BITBUCKET_TOKEN) {
    BITBUCKET_TOKEN = secret.getToken();
    if (BITBUCKET_TOKEN) {
      console.log("Token hentet fra sikker lagring.");
    }
  }
  if (!BITBUCKET_TOKEN) {
    console.log("Fant ikke Bitbucket-token i miljøvariabler eller sikker lagring.");
    BITBUCKET_TOKEN = await secret.promptForToken();
    if (!BITBUCKET_TOKEN) {
      console.error("Feil: Ingen token oppgitt.");
      process.exit(1);
    }
    secret.setToken(BITBUCKET_TOKEN);
    console.log("Token lagret i sikker lagring.\n");
  }

  // Last inn sjekkere
  const checks = require("./checks");
  const checkIds = checks.map((c) => c.id).join(", ");

  // Hent prosjekter — ett spesifikt eller alle
  let projects;
  if (PROJECT_KEY) {
    try {
      const proj = await request(`/rest/api/1.0/projects/${encodeURIComponent(PROJECT_KEY)}`);
      projects = [proj];
      console.log(`Kjører kun for prosjekt: ${proj.key} (${proj.name})`);
    } catch (err) {
      console.error(`Feil: Fant ikke Bitbucket-prosjekt "${PROJECT_KEY}": ${err.message}`);
      process.exit(1);
    }
  } else {
    projects = await getAllPages("/rest/api/1.0/projects");
  }

  // Hent alle repos per prosjekt (sekvensielt — prosjekter er få)
  // Filtrerer bort arkiverte repos via repo.archived-feltet (standard API)
  // og via archive-API-et som fallback for eldre Bitbucket-versjoner.
  const archivedSlugs = new Set();
  try {
    const archived = await getAllPages("/rest/archive/1.0/repos?limit=1000");
    for (const r of archived) {
      if (r.project && r.slug) {
        archivedSlugs.add(`${r.project.key}/${r.slug}`);
      }
    }
  } catch {
    // Archive-API er ikke tilgjengelig på alle versjoner — ignorer stille
  }

  // Hent alle repos per prosjekt (sekvensielt — prosjekter er få)
  let allRepos = [];
  let archivedFiltered = 0;
  for (const proj of projects) {
    const repos = await getAllPages(
      `/rest/api/1.0/projects/${encodeURIComponent(proj.key)}/repos`
    );
    for (const repo of repos) {
      if (repo.state === "AVAILABLE") {
        const isArchived = repo.archived === true || archivedSlugs.has(`${proj.key}/${repo.slug}`);
        if (isArchived) {
          archivedFiltered++;
        } else {
          allRepos.push({ projectKey: proj.key, repoSlug: repo.slug });
        }
      }
    }
  }

  if (archivedFiltered > 0) {
    console.log(`Filtrerte bort ${archivedFiltered} arkiverte repos.`);
  }

  // Sorter for stabil utskrift
  allRepos.sort((a, b) =>
    `${a.projectKey}/${a.repoSlug}`.localeCompare(
      `${b.projectKey}/${b.repoSlug}`
    )
  );

  // Begrens antall repos hvis MAX_REPOS er satt
  if (MAX_REPOS > 0 && allRepos.length > MAX_REPOS) {
    console.log(`MAX_REPOS=${MAX_REPOS}: begrenser til ${MAX_REPOS} av ${allRepos.length} repos.`);
    allRepos = allRepos.slice(0, MAX_REPOS);
  }

  const total = allRepos.length;
  console.log(
    `Sjekker ${total} repos (${CONCURRENCY} samtidige) med ${checks.length} sjekker(e): ${checkIds}`
  );

  let done = 0;

  // Kjør sjekkere parallelt via pool, sjekkere sekvensielt per repo
  const repoResults = await pooledMap(allRepos, async ({ projectKey, repoSlug }) => {
    const result = { project: projectKey, repo: repoSlug, checks: {}, assessments: {}, vulnerabilities: [] };

    // Kjør alle sjekker først
    for (const chk of checks) {
      try {
        result.checks[chk.id] = await chk.run(projectKey, repoSlug, request);
      } catch {
        result.checks[chk.id] = false;
      }
    }

    // Kjør vurderinger med tilgang til alle sjekkresultater (muliggjør kryssreferanser)
    for (const chk of checks) {
      if (result.checks[chk.id] === false && typeof chk.assess === "function") {
        try {
          result.assessments[chk.id] = await chk.assess(projectKey, repoSlug, request, result);
        } catch {
          result.assessments[chk.id] = "Kunne ikke vurdere.";
        }
      }
    }

    // Hent detaljert sårbarhetsinformasjon fra sjekker som støtter det
    for (const chk of checks) {
      if (typeof chk.collectVulnerabilities === "function") {
        try {
          const vulns = await chk.collectVulnerabilities(projectKey, repoSlug, request);
          if (vulns.length > 0) {
            result.vulnerabilities.push(...vulns);
          }
        } catch {
          // Ignorer feil ved innhenting av detaljer — sjekk-resultatet er allerede satt
        }
      }
    }

    // Hent tilleggsdetaljer for sjekker som bestod og støtter det (f.eks. funnet CODEOWNERS-fil)
    for (const chk of checks) {
      if (result.checks[chk.id] === true && typeof chk.collectDetails === "function") {
        try {
          const details = await chk.collectDetails(projectKey, repoSlug, request);
          if (details) {
            if (!result.details) result.details = {};
            result.details[chk.id] = details;
          }
        } catch {
          // Ignorer feil — detaljer er valgfrie tilleggsinformasjon
        }
      }
    }

    done++;
    const allPassed = checks.every((c) => result.checks[c.id] !== false);
    process.stdout.write(allPassed ? "✓" : ".");
    if (done % 40 === 0 || done === total) {
      process.stdout.write(`  [${done}/${total}]\n`);
    }
    return result;
  });

  // Bygg og skriv rapport
  const report = buildReport(repoResults, checks);

  const reportsDir = path.join(process.cwd(), "reports");
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const jsonPath = path.join(reportsDir, `audit-${timestamp}.json`);
  const mdPath   = path.join(reportsDir, `audit-${timestamp}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(mdPath, buildMarkdownReport(report, checks), "utf8");

  console.log(`\nRapporter skrevet til:`);
  console.log(`  JSON : ${jsonPath}`);
  console.log(`  MD   : ${mdPath}`);

  printReport(report, checks);
}

main().catch((err) => {
  console.error("Uventet feil:", err.message || err);
  process.exit(1);
});
