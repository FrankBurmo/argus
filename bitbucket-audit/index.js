#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const { config, validateEnv } = require("./lib/config");
const { createClient } = require("./lib/http");
const pooledMap = require("./lib/pool");
const { buildReport } = require("./lib/report");
const buildMarkdownReport = require("./lib/reportMarkdown");
const printReport = require("./lib/reportTerminal");
const secret = require("./secret");

// ---------------------------------------------------------------------------
// Hovedflyt
// ---------------------------------------------------------------------------

async function main() {
  validateEnv();

  // Hent token: miljøvariabel → sikker lagring → spør bruker
  if (!config.BITBUCKET_TOKEN) {
    config.BITBUCKET_TOKEN = secret.getToken();
    if (config.BITBUCKET_TOKEN) {
      console.log("Token hentet fra sikker lagring.");
    }
  }
  if (!config.BITBUCKET_TOKEN) {
    console.log("Fant ikke Bitbucket-token i miljøvariabler eller sikker lagring.");
    config.BITBUCKET_TOKEN = await secret.promptForToken();
    if (!config.BITBUCKET_TOKEN) {
      console.error("Feil: Ingen token oppgitt.");
      process.exit(1);
    }
    secret.setToken(config.BITBUCKET_TOKEN);
    console.log("Token lagret i sikker lagring.\n");
  }

  const { request, getAllPages } = createClient(
    config.BITBUCKET_URL,
    () => config.BITBUCKET_TOKEN
  );

  // Last inn sjekkere
  const checks = require("./checks");
  const checkIds = checks.map((c) => c.id).join(", ");

  // Hent prosjekter — ett spesifikt eller alle
  let projects;
  if (config.PROJECT_KEY) {
    try {
      const proj = await request(`/rest/api/1.0/projects/${encodeURIComponent(config.PROJECT_KEY)}`);
      projects = [proj];
      console.log(`Kjører kun for prosjekt: ${proj.key} (${proj.name})`);
    } catch (err) {
      console.error(`Feil: Fant ikke Bitbucket-prosjekt "${config.PROJECT_KEY}": ${err.message}`);
      process.exit(1);
    }
  } else {
    projects = await getAllPages("/rest/api/1.0/projects");
  }

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
  if (config.MAX_REPOS > 0 && allRepos.length > config.MAX_REPOS) {
    console.log(`MAX_REPOS=${config.MAX_REPOS}: begrenser til ${config.MAX_REPOS} av ${allRepos.length} repos.`);
    allRepos = allRepos.slice(0, config.MAX_REPOS);
  }

  const total = allRepos.length;
  console.log(
    `Sjekker ${total} repos (${config.CONCURRENCY} samtidige) med ${checks.length} sjekker(e): ${checkIds}`
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

    // Hent detaljer for bestått sjekker som støtter det (f.eks. hvilke lintere er i bruk)
    for (const chk of checks) {
      if (result.checks[chk.id] === true && typeof chk.details === "function") {
        try {
          const text = await chk.details(projectKey, repoSlug, request);
          if (text) result.assessments[chk.id] = text;
        } catch {
          // Ignorer feil — detaljer er valgfrie
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

    done++;
    const allPassed = checks.every((c) => result.checks[c.id] !== false);
    process.stdout.write(allPassed ? "✓" : ".");
    if (done % 40 === 0 || done === total) {
      process.stdout.write(`  [${done}/${total}]\n`);
    }
    return result;
  }, config.CONCURRENCY);

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

  // OCSF-hendelsesstrøm (kun ved --output-format ocsf)
  if (config.OUTPUT_FORMAT === "ocsf") {
    const { toOcsfEvents } = require("./siem/ocsf");
    const ocsfEvents = toOcsfEvents(report, checks);
    const ocsfPath = path.join(reportsDir, `audit-${timestamp}.ocsf.json`);
    fs.writeFileSync(ocsfPath, JSON.stringify(ocsfEvents, null, 2), "utf8");
    console.log(`  OCSF : ${ocsfPath}  (${ocsfEvents.length} hendelser)`);
  }

  printReport(report, checks);
}

main().catch((err) => {
  console.error("Uventet feil:", err.message || err);
  process.exit(1);
});
