"use strict";

// ---------------------------------------------------------------------------
// Genererer en Markdown-rapport per team
// ---------------------------------------------------------------------------

function buildTeamMarkdownReport(team, repoResults, checks) {
  const date = new Date().toISOString().slice(0, 10);
  const healthLabel = team.overallScore >= 80 ? "God" : team.overallScore >= 50 ? "Trenger tiltak" : "Kritisk";

  let md = `# ${team.name} — Argus Teamrapport\n\n`;
  md += `| | |\n|---|---|\n`;
  md += `| **Dato**     | ${date} |\n`;
  md += `| **Score**    | ${team.overallScore.toFixed(1)} % |\n`;
  md += `| **Status**   | ${healthLabel} |\n`;
  md += `| **Repos**    | ${team.repoCount} |\n`;
  if (team.slackChannel) md += `| **Slack**    | ${team.slackChannel} |\n`;
  if (team.members && team.members.length > 0) {
    md += `| **Medlemmer** | ${team.members.join(", ")} |\n`;
  }
  md += "\n";

  // Kategoriscorer
  md += `## Kategoriscorer\n\n`;
  md += `| Kategori | Score |\n|---|---|\n`;
  const catLabels = { sikkerhet: "Sikkerhet", devops: "DevOps-modenhet", governance: "Governance" };
  for (const [cat, label] of Object.entries(catLabels)) {
    const score = team.categoryScores[cat];
    md += `| ${label} | ${score !== null && score !== undefined ? score.toFixed(1) + " %" : "–"} |\n`;
  }
  md += "\n";

  // Sjekk-oversikt
  md += `## Sjekk-oversikt\n\n`;
  md += `| Sjekk | Bestått | Feilet | N/A | Score |\n|---|---|---|---|---|\n`;
  for (const chk of checks) {
    const stat = team.byCheck[chk.id];
    if (!stat) continue;
    const scoreStr = stat.score !== null && stat.score !== undefined
      ? stat.score.toFixed(1) + " %"
      : "–";
    md += `| ${chk.label} | ${stat.passed} | ${stat.failed} | ${stat.na} | ${scoreStr} |\n`;
  }
  md += "\n";

  // Sårbarhetsoversikt
  md += `## Sårbarheter\n\n`;
  md += `- **Totalt:** ${team.vulnerabilities.total}\n`;
  md += `- **Kritisk:** ${team.vulnerabilities.critical}\n`;
  md += `- **Høy:** ${team.vulnerabilities.high}\n`;
  md += `- **Middels:** ${team.vulnerabilities.medium}\n`;
  md += `- **Lav:** ${team.vulnerabilities.low}\n\n`;

  // Topp-5 kritiske CVEer
  const critVulns = [];
  for (const repo of repoResults) {
    for (const v of (repo.vulnerabilities || [])) {
      if ((v.severity || "").toUpperCase() === "CRITICAL") {
        critVulns.push({ ...v, _repo: `${repo.project}/${repo.repo}` });
      }
    }
  }
  critVulns.sort((a, b) => (b.cvssScore || 0) - (a.cvssScore || 0));

  if (critVulns.length > 0) {
    md += `### Topp kritiske sårbarheter\n\n`;
    md += `| CVE | Pakke | Versjon | Repo |\n|---|---|---|---|\n`;
    for (const v of critVulns.slice(0, 5)) {
      md += `| ${v.cveId || v.id} | ${v.package} | ${v.version} | ${v._repo} |\n`;
    }
    md += "\n";
  }

  // Anbefalte tiltak — sortert etter lavest score
  const actionItems = checks
    .map((chk) => {
      const stat = team.byCheck[chk.id];
      if (!stat || stat.failed === 0) return null;
      return { label: chk.label, failed: stat.failed, score: stat.score };
    })
    .filter(Boolean)
    .sort((a, b) => (a.score || 0) - (b.score || 0));

  if (actionItems.length > 0) {
    md += `## Anbefalte tiltak\n\n`;
    for (const item of actionItems) {
      const scoreStr = item.score !== null ? item.score.toFixed(1) + " %" : "–";
      md += `1. **${item.label}** — ${item.failed} repo(er) feilet (score: ${scoreStr})\n`;
    }
    md += "\n";
  }

  return md;
}

module.exports = { buildTeamMarkdownReport };
