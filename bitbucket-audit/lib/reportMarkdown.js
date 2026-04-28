"use strict";

const { assessIcon, isActionable, groupByProject } = require("./report");

function buildMarkdownReport(report, checks) {
  const lines = [];
  const ts = new Date(report.generatedAt).toLocaleString("nb-NO", { timeZone: "UTC" });

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

  const actionableCount = report.repos.filter((r) => isActionable(r, checks)).length;
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

  const byProject = groupByProject(report.repos);
  let hasAnyFailures = false;

  for (const [project, repos] of Object.entries(byProject)) {
    const failingRepos = repos.filter((r) => checks.some((chk) => r.checks[chk.id] === false));
    if (failingRepos.length === 0) continue;
    hasAnyFailures = true;

    // Del opp i "bør korrigeres" og "ingen tiltak nødvendig"
    const actionable    = failingRepos.filter((r) => isActionable(r, checks));
    const nonActionable = failingRepos.filter((r) => !isActionable(r, checks));

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

module.exports = buildMarkdownReport;
