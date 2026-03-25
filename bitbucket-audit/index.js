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

const BITBUCKET_URL = process.env.BITBUCKET_URL;
const BITBUCKET_TOKEN = process.env.BITBUCKET_TOKEN;
const CONCURRENCY = Math.max(1, parseInt(process.env.CONCURRENCY, 10) || 5);

function validateEnv() {
  const missing = [];
  if (!BITBUCKET_URL) missing.push("BITBUCKET_URL");
  if (!BITBUCKET_TOKEN) missing.push("BITBUCKET_TOKEN");
  if (missing.length) {
    console.error(
      `Feil: Manglende miljøvariabler: ${missing.join(", ")}\n` +
        "Sett dem før du kjører:\n" +
        "  export BITBUCKET_URL=https://bitbucket.eksempel.no\n" +
        "  export BITBUCKET_TOKEN=ditt-token"
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
    const passed = repoResults.filter((r) => r.checks[chk.id]).length;
    byCheck[chk.id] = {
      passed,
      failed: total - passed,
      coveragePercent: total ? +((passed / total) * 100).toFixed(1) : 0,
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

function printReport(report, checks) {
  console.log("\n========== RAPPORT ==========\n");

  for (const chk of checks) {
    const s = report.summary.byCheck[chk.id];
    const pct = s.coveragePercent.toFixed(1);
    const label = chk.label.padEnd(20);
    console.log(`${label} ${String(s.passed).padStart(4)} / ${report.summary.total}  (${pct}%)`);
  }

  // Repos som mangler ALLE sjekker
  const failAll = report.repos.filter((r) =>
    checks.every((c) => !r.checks[c.id])
  );
  if (failAll.length) {
    console.log("\n--- Mangler alle ---");
    for (const r of failAll) {
      console.log(`  ${r.project}/${r.repo}`);
    }
  }

  console.log("");
}

// ---------------------------------------------------------------------------
// 5. Hovedflyt
// ---------------------------------------------------------------------------

async function main() {
  validateEnv();

  // Last inn sjekkere
  const checks = require("./checks");
  const checkIds = checks.map((c) => c.id).join(", ");

  // Hent alle prosjekter
  const projects = await getAllPages("/rest/api/1.0/projects");

  // Hent alle repos per prosjekt (sekvensielt — prosjekter er få)
  let allRepos = [];
  for (const proj of projects) {
    const repos = await getAllPages(
      `/rest/api/1.0/projects/${encodeURIComponent(proj.key)}/repos`
    );
    for (const repo of repos) {
      if (repo.state === "AVAILABLE") {
        allRepos.push({ projectKey: proj.key, repoSlug: repo.slug });
      }
    }
  }

  // Sorter for stabil utskrift
  allRepos.sort((a, b) =>
    `${a.projectKey}/${a.repoSlug}`.localeCompare(
      `${b.projectKey}/${b.repoSlug}`
    )
  );

  const total = allRepos.length;
  console.log(
    `Sjekker ${total} repos (${CONCURRENCY} samtidige) med ${checks.length} sjekker(e): ${checkIds}`
  );

  let done = 0;

  // Kjør sjekkere parallelt via pool, sjekkere sekvensielt per repo
  const repoResults = await pooledMap(allRepos, async ({ projectKey, repoSlug }) => {
    const result = { project: projectKey, repo: repoSlug, checks: {} };
    for (const chk of checks) {
      try {
        result.checks[chk.id] = await chk.run(projectKey, repoSlug, request);
      } catch {
        result.checks[chk.id] = false;
      }
    }
    done++;
    const allPassed = checks.every((c) => result.checks[c.id]);
    process.stdout.write(allPassed ? "✓" : ".");
    if (done % 40 === 0 || done === total) {
      process.stdout.write(`  [${done}/${total}]\n`);
    }
    return result;
  });

  // Bygg og skriv rapport
  const report = buildReport(repoResults, checks);

  const outPath = path.join(process.cwd(), "audit-report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`\nRapport skrevet til ${outPath}`);

  printReport(report, checks);
}

main().catch((err) => {
  console.error("Uventet feil:", err.message || err);
  process.exit(1);
});
