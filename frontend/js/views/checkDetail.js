/* ================================================================
   Argus Frontend — Sjekk-detaljvisning
   Viser alle repos fordelt på "avvik" og "består", sortert
   etter Bitbucket-prosjekt, deretter repo.
   ================================================================ */
"use strict";

import { state } from "../state.js";
import { $, escapeHtml } from "../utils/dom.js";
import { CHECK_LABELS, CHECK_ICONS } from "../constants/checkLabels.js";
import { assessmentLevel } from "../utils/assessment.js";
import { switchView } from "./router.js";

export function renderCheckDetail() {
  const checkId = state.activeCheck;
  const container = $("#check-detail-container");

  if (!checkId || !state.report) {
    switchView("summary");
    return;
  }

  const report = state.report;
  const label = CHECK_LABELS[checkId] || checkId;
  const icon  = CHECK_ICONS[checkId]  || "📋";

  // Sorter repos: prosjekt stigende, deretter repo stigende
  const allRepos = [...report.repos].sort((a, b) => {
    const proj = a.project.localeCompare(b.project, "nb");
    return proj !== 0 ? proj : a.repo.localeCompare(b.repo, "nb");
  });

  const failing = allRepos.filter(r => {
    const level = assessmentLevel(r, checkId);
    return level === "action" || level === "fail" || level === "unknown";
  });

  const passing = allRepos.filter(r => assessmentLevel(r, checkId) === "pass");
  const na      = allRepos.filter(r => assessmentLevel(r, checkId) === "na");

  container.innerHTML = `
    <div class="check-detail-header">
      <button class="back-btn" onclick="backFromCheckDetail()">← Tilbake</button>
      <span class="check-detail-icon">${icon}</span>
      <div class="check-detail-titles">
        <h2 class="check-detail-title">${escapeHtml(label)}</h2>
        <p class="check-detail-subtitle">
          <span class="badge badge-critical">${failing.length} avvik</span>
          <span class="badge badge-success">${passing.length} består</span>
          ${na.length > 0 ? `<span class="badge badge-na">${na.length} ikke aktuelt</span>` : ""}
        </p>
      </div>
    </div>

    <div class="check-detail-sections">
      ${renderRepoSection(failing, checkId, "avvik", "check-detail-failing")}
      ${renderRepoSection(passing, checkId, "består", "check-detail-passing")}
      ${na.length > 0 ? renderRepoSection(na, checkId, "ikke aktuelt", "check-detail-na") : ""}
    </div>
  `;
}

function renderRepoSection(repos, checkId, sectionLabel, sectionClass) {
  const isEmpty = repos.length === 0;
  const isFailing = sectionClass === "check-detail-failing";
  const isPassing = sectionClass === "check-detail-passing";

  const title = isFailing
    ? `Repos med avvik (${repos.length})`
    : isPassing
      ? `Repos som består (${repos.length})`
      : `Ikke aktuelt (${repos.length})`;

  if (isEmpty) {
    const emptyMsg = isFailing
      ? "✅ Ingen repos med avvik — alle er på stell!"
      : "Ingen repos.";
    return `
      <div class="card ${sectionClass}">
        <h3 class="card-title">${escapeHtml(title)}</h3>
        <p class="check-detail-empty">${emptyMsg}</p>
      </div>
    `;
  }

  // Grupper etter prosjekt
  const byProject = {};
  for (const repo of repos) {
    if (!byProject[repo.project]) byProject[repo.project] = [];
    byProject[repo.project].push(repo);
  }

  const projectBlocks = Object.keys(byProject).sort((a, b) => a.localeCompare(b, "nb")).map(project => {
    const repoRows = byProject[project].map(repo => buildRepoRow(repo, checkId, isFailing)).join("");
    return `
      <div class="check-detail-project-group">
        <div class="check-detail-project-header">
          <span class="project-tag">${escapeHtml(project)}</span>
          <span class="check-detail-project-count">${byProject[project].length} repo${byProject[project].length !== 1 ? "s" : ""}</span>
        </div>
        <div class="check-detail-repo-list">${repoRows}</div>
      </div>
    `;
  }).join("");

  return `
    <div class="card ${sectionClass}">
      <h3 class="card-title">${escapeHtml(title)}</h3>
      ${projectBlocks}
    </div>
  `;
}

function buildRepoRow(repo, checkId, showAssessment) {
  const level      = assessmentLevel(repo, checkId);
  const assessment = repo.assessments?.[checkId] || "";

  let levelBadge = "";
  if (level === "action") {
    levelBadge = '<span class="badge badge-critical">Tiltak</span>';
  } else if (level === "fail" || level === "unknown") {
    levelBadge = '<span class="badge badge-high">Avvik</span>';
  } else if (level === "pass") {
    levelBadge = '<span class="badge badge-success">✓</span>';
  } else {
    levelBadge = '<span class="badge badge-na">—</span>';
  }

  const assessmentHtml = showAssessment && assessment
    ? `<span class="check-detail-assessment">${escapeHtml(assessment)}</span>`
    : "";

  return `
    <div class="check-detail-repo-row" onclick="showRepoDetail('${escapeHtml(repo.project)}', '${escapeHtml(repo.repo)}')">
      <div class="check-detail-repo-left">
        <span class="repo-name">${escapeHtml(repo.repo)}</span>
        ${assessmentHtml}
      </div>
      <div class="check-detail-repo-right">
        ${levelBadge}
      </div>
    </div>
  `;
}

/** Naviger tilbake til sammendrag-visningen. */
export function backFromCheckDetail() {
  state.activeCheck = null;
  switchView("summary");
}
