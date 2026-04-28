/* ================================================================
   Argus Frontend — Repos-visning og filterhandlinger
   ================================================================ */
"use strict";

import { state } from "../state.js";
import { $, escapeHtml } from "../utils/dom.js";
import { levelLabel } from "../utils/format.js";
import { assessmentLevel, repoPriorityScore } from "../utils/assessment.js";
import { switchView, renderActiveView } from "./router.js";

export function renderRepos() {
  renderRepoTable();
}

export function renderRepoTable() {
  const report = state.report;
  const checkMeta = state.checkMeta;
  const searchTerm = ($("#repo-search-input")?.value || "").toLowerCase();

  let repos = report.repos;
  if (searchTerm) {
    repos = repos.filter(r =>
      `${r.project} ${r.repo}`.toLowerCase().includes(searchTerm)
    );
  }

  $("#repo-result-count").textContent = `${repos.length} repositories`;

  const sorted = [...repos].sort((a, b) => repoPriorityScore(b) - repoPriorityScore(a));

  let headerCells = '<th>Repository</th>';
  for (const chk of checkMeta) {
    headerCells += `<th title="${escapeHtml(chk.label)}" style="text-align: center">${chk.icon}</th>`;
  }
  headerCells += '<th>Score</th>';

  let rows = "";
  for (const repo of sorted.slice(0, 200)) {
    let cells = `<td><span class="project-tag">${escapeHtml(repo.project)}</span><span class="repo-name">${escapeHtml(repo.repo)}</span></td>`;

    for (const chk of checkMeta) {
      const level = assessmentLevel(repo, chk.id);
      const title = repo.assessments?.[chk.id] || levelLabel(level);
      let icon;
      switch (level) {
        case "pass": icon = '<span class="status-icon status-pass" title="' + escapeHtml(title) + '">✓</span>'; break;
        case "action": icon = '<span class="status-icon status-fail" title="' + escapeHtml(title) + '">!</span>'; break;
        case "fail": icon = '<span class="status-icon status-warn" title="' + escapeHtml(title) + '">✕</span>'; break;
        case "na": icon = '<span class="status-icon status-na" title="' + escapeHtml(title) + '">–</span>'; break;
        default: icon = '<span class="status-icon status-na" title="' + escapeHtml(title) + '">?</span>'; break;
      }
      cells += `<td style="text-align: center">${icon}</td>`;
    }

    const score = repoPriorityScore(repo);
    const scoreSev = score >= 30 ? "critical" : score >= 20 ? "high" : score >= 10 ? "medium" : "low";
    cells += `<td><span class="severity-indicator severity-${scoreSev}">${score}</span></td>`;

    rows += `<tr onclick="showRepoDetail('${escapeHtml(repo.project)}', '${escapeHtml(repo.repo)}')">${cells}</tr>`;
  }

  $("#repo-table-container").innerHTML = `
    <table class="data-table">
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${sorted.length > 200 ? `<p style="color: var(--text-muted); padding: 0.75rem; font-size: 0.8rem;">Viser 200 av ${sorted.length} repos.</p>` : ""}
  `;
}

/** Toggle et repos-filter og rendre på nytt (gjenværende fra original API). */
export function toggleFilter(group, value) {
  const arr = state.activeFilters[group];
  const idx = arr.indexOf(value);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(value);
  renderActiveView();
}

/** Drill-down fra prosjekt-breakdown → sårbarhetsfanen filtrert på prosjekt. */
export function filterByProject(project) {
  state.vulnFilters = { severity: [], ecosystem: [], projects: [project], fixAvailable: [] };
  switchView("vulnerabilities");
}

/** Drill-down fra sjekk-breakdown — bytter til riktig fane. */
export function filterByCheck(checkId) {
  if (checkId === "dep-vulns") {
    state.vulnFilters = { severity: [], ecosystem: [], projects: [], fixAvailable: [] };
    switchView("vulnerabilities");
  } else {
    switchView("repos");
  }
}
