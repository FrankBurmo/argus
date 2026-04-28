"use strict";

const { groupByProject } = require("./report");

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
  const byProject = groupByProject(report.repos);

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

module.exports = printReport;
