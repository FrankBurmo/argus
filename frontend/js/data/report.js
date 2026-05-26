/* ================================================================
   Argus Frontend — Innlasting og validering av rapport
   ================================================================ */
"use strict";

import { state, resetFilters } from "../state.js";
import { CHECK_LABELS, CHECK_ICONS } from "../constants/checkLabels.js";
import { $, toast } from "../utils/dom.js";
import { formatDate } from "../utils/format.js";
import { renderActiveView } from "../views/router.js";

/** Les en JSON-fil og lever den til loadReport hvis den er gyldig. */
export function handleFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.repos || !data.checks || !data.summary) {
        toast("Ugyldig rapportformat – mangler repos, checks eller summary.");
        return;
      }
      loadReport(data);
    } catch (err) {
      toast("Kunne ikke lese JSON: " + err.message);
    }
  };
  reader.readAsText(file);
}

/** Aktiver app-visning og fyll inn med ny rapport. */
export function loadReport(data) {
  normalizeTeams(data);

  state.report = data;
  state.checkMeta = data.checks.map(id => ({
    id,
    label: CHECK_LABELS[id] || id,
    icon: CHECK_ICONS[id] || "📋",
  }));

  resetFilters();

  // Sett hasTeams basert på om rapporten inneholder team-data
  state.hasTeams = Array.isArray(data.teams) && data.teams.length > 0;
  const teamsNavBtn = document.querySelector('[data-view="teams"]');
  if (teamsNavBtn) teamsNavBtn.classList.toggle("hidden", !state.hasTeams);

  $("#landing").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#report-meta").textContent = `Generert ${formatDate(data.generatedAt)} — ${data.summary.total} repos`;

  renderActiveView();
  toast("Rapport lastet!");
}

// ---------------------------------------------------------------------------
// Normalisering av nytt team-format (summary.byTeam + repo.team)
// ---------------------------------------------------------------------------

const CHECK_CATEGORIES_LOCAL = {
  sikkerhet:  ["secrets", "branch-protection", "dep-vulns", "npm-audit", "owasp-dep-check"],
  devops:     ["pipeline", "renovate", "linting", "tests", "pr-activity"],
  governance: ["readme", "stale", "codeowners"],
};

/**
 * Konverterer nytt rapportformat (summary.byTeam + repo.team-felt) til det
 * interne team-formatet (data.teams-array) som resten av frontenden forventer.
 * Gjør ingenting hvis data.teams allerede finnes, eller byTeam mangler.
 */
function normalizeTeams(data) {
  if (Array.isArray(data.teams) && data.teams.length > 0) return;
  const byTeam = data.summary?.byTeam;
  if (!byTeam || Object.keys(byTeam).length === 0) return;

  // Bygg repo-lookup: teamKey → ["PROJECT/repo", ...]
  const teamReposMap = new Map();
  for (const repo of (data.repos || [])) {
    if (!repo.team) continue;
    const key = `${repo.team.product}/${repo.team.id}`;
    if (!teamReposMap.has(key)) teamReposMap.set(key, []);
    teamReposMap.get(key).push(`${repo.project}/${repo.repo}`);
  }

  data.teams = Object.entries(byTeam).map(([teamKey, entry]) => {
    // Adapter byCheck: coveragePercent → score, legg til na: 0
    const byCheck = {};
    for (const [checkId, stat] of Object.entries(entry.byCheck || {})) {
      byCheck[checkId] = {
        passed: stat.passed,
        failed: stat.failed,
        na: 0,
        score: stat.coveragePercent ?? null,
      };
    }

    // overallScore = snitt av alle score-verdier
    const scores = Object.values(byCheck)
      .map(s => s.score)
      .filter(s => s !== null && s !== undefined);
    const overallScore = scores.length > 0
      ? parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1))
      : 0;

    // categoryScores = snitt per kategori
    const categoryScores = {};
    for (const [cat, ids] of Object.entries(CHECK_CATEGORIES_LOCAL)) {
      const catScores = ids
        .map(id => byCheck[id]?.score)
        .filter(s => s !== null && s !== undefined);
      categoryScores[cat] = catScores.length > 0
        ? parseFloat((catScores.reduce((a, b) => a + b, 0) / catScores.length).toFixed(1))
        : null;
    }

    // vulnerabilities = telle fra matchede repos
    const repoKeys = teamReposMap.get(teamKey) || [];
    const repoKeySet = new Set(repoKeys);
    let totalVulns = 0, criticalVulns = 0;
    for (const repo of (data.repos || [])) {
      if (!repoKeySet.has(`${repo.project}/${repo.repo}`)) continue;
      for (const v of (repo.vulnerabilities || [])) {
        totalVulns++;
        if ((v.severity || "").toUpperCase() === "CRITICAL") criticalVulns++;
      }
    }

    return {
      id: teamKey,
      name: entry.name,
      description: null,
      repoCount: entry.repoCount,
      repos: repoKeys,
      overallScore,
      categoryScores,
      byCheck,
      vulnerabilities: { total: totalVulns, critical: criticalVulns },
      members: [],
      slackChannel: null,
    };
  });
}
