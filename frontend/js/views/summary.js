/* ================================================================
   Argus Frontend — Sammendrag/Dashboard-visning
   ================================================================ */
"use strict";

import { state } from "../state.js";
import { CHECK_LABELS, CHECK_ICONS } from "../constants/checkLabels.js";
import { $, escapeHtml } from "../utils/dom.js";
import { severityLabel } from "../utils/format.js";
import { assessmentLevel, repoPriorityScore, repoSeverity } from "../utils/assessment.js";

export function renderSummary() {
  renderSummaryCards();
  renderCoverageChart();
  renderProjectBreakdown();
  renderCheckBreakdown();
  renderPriorityTable();
}

function renderSummaryCards() {
  const report = state.report;
  const total = report.summary.total;
  const actionRepos = report.repos.filter(r =>
    report.checks.some(c => assessmentLevel(r, c) === "action")
  ).length;
  const passingRepos = report.repos.filter(r =>
    report.checks.every(c => r.checks[c] !== false)
  ).length;
  const failingChecks = report.checks.filter(c =>
    report.summary.byCheck[c] && report.summary.byCheck[c].failed > 0
  ).length;
  const avgCoverage = report.checks.length > 0
    ? (report.checks.reduce((sum, c) => sum + (report.summary.byCheck[c]?.coveragePercent || 0), 0) / report.checks.length).toFixed(1)
    : 0;

  const projects = new Set(report.repos.map(r => r.project));

  $("#summary-cards").innerHTML = `
    <div class="stat-card stat-info">
      <span class="stat-label">Repositories</span>
      <span class="stat-value">${total}</span>
      <span class="stat-sub">${projects.size} prosjekter</span>
    </div>
    <div class="stat-card stat-danger">
      <span class="stat-label">Trenger tiltak</span>
      <span class="stat-value">${actionRepos}</span>
      <span class="stat-sub">repos med anbefalte tiltak</span>
    </div>
    <div class="stat-card stat-success">
      <span class="stat-label">Bestått alle</span>
      <span class="stat-value">${passingRepos}</span>
      <span class="stat-sub">${total > 0 ? ((passingRepos / total) * 100).toFixed(0) : 0}% av porteføljen</span>
    </div>
    <div class="stat-card ${parseFloat(avgCoverage) >= 70 ? "stat-success" : parseFloat(avgCoverage) >= 40 ? "stat-warning" : "stat-danger"}">
      <span class="stat-label">Gjennomsnittlig dekning</span>
      <span class="stat-value">${avgCoverage}%</span>
      <span class="stat-sub">${report.checks.length} sjekker kjørt</span>
    </div>
    <div class="stat-card stat-warning">
      <span class="stat-label">Sjekker med avvik</span>
      <span class="stat-value">${failingChecks}</span>
      <span class="stat-sub">av ${report.checks.length} kontroller</span>
    </div>
  `;
}

function renderCoverageChart() {
  const report = state.report;
  const container = $("#coverage-chart");
  let html = "";

  const sorted = [...report.checks].sort((a, b) => {
    const pctA = report.summary.byCheck[a]?.coveragePercent || 0;
    const pctB = report.summary.byCheck[b]?.coveragePercent || 0;
    return pctA - pctB;
  });

  for (const checkId of sorted) {
    const stat = report.summary.byCheck[checkId];
    if (!stat) continue;
    const pct = stat.coveragePercent;
    const colorClass = pct >= 80 ? "green" : pct >= 40 ? "yellow" : "red";
    const label = CHECK_LABELS[checkId] || checkId;

    html += `
      <div class="coverage-row">
        <span class="coverage-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
        <div class="coverage-bar-bg">
          <div class="coverage-bar-fill ${colorClass}" style="width: ${pct}%"></div>
        </div>
        <span class="coverage-pct" style="color: var(--severity-${colorClass === "green" ? "low" : colorClass === "yellow" ? "medium" : "critical"})">${pct.toFixed(1)}%</span>
      </div>
    `;
  }

  container.innerHTML = html;
}

function renderProjectBreakdown() {
  const report = state.report;
  const container = $("#project-breakdown");
  const byProject = {};

  for (const repo of report.repos) {
    if (!byProject[repo.project]) byProject[repo.project] = { total: 0, failing: 0, actions: 0 };
    byProject[repo.project].total++;
    const hasFail = report.checks.some(c => repo.checks[c] === false);
    const hasAction = report.checks.some(c => assessmentLevel(repo, c) === "action");
    if (hasFail) byProject[repo.project].failing++;
    if (hasAction) byProject[repo.project].actions++;
  }

  const sorted = Object.entries(byProject).sort((a, b) => b[1].actions - a[1].actions);
  let html = "";

  for (const [project, stats] of sorted) {
    const colors = stats.actions > 0 ? "var(--severity-critical-bg)" : stats.failing > 0 ? "var(--severity-medium-bg)" : "var(--success-bg)";
    const textColor = stats.actions > 0 ? "var(--severity-critical)" : stats.failing > 0 ? "var(--severity-medium)" : "var(--success)";

    html += `
      <div class="breakdown-item" onclick="filterByProject('${escapeHtml(project)}')">
        <div class="breakdown-item-left">
          <div class="breakdown-icon" style="background: ${colors}; color: ${textColor};">${stats.total}</div>
          <span class="breakdown-item-name">${escapeHtml(project)}</span>
        </div>
        <div class="breakdown-item-right">
          ${stats.actions > 0 ? `<span class="badge badge-critical">${stats.actions} tiltak</span>` : ""}
          ${stats.failing > 0 ? `<span class="badge badge-high">+${stats.failing - stats.actions} avvik</span>` : ""}
        </div>
      </div>
    `;
  }

  container.innerHTML = html || '<p style="color: var(--text-muted); font-size: 0.85rem;">Ingen prosjekter</p>';
}

function renderCheckBreakdown() {
  const report = state.report;
  const container = $("#check-breakdown");
  let html = "";

  const sorted = [...report.checks].sort((a, b) => {
    const failA = report.summary.byCheck[a]?.failed || 0;
    const failB = report.summary.byCheck[b]?.failed || 0;
    return failB - failA;
  });

  for (const checkId of sorted) {
    const stat = report.summary.byCheck[checkId];
    if (!stat) continue;
    const label = CHECK_LABELS[checkId] || checkId;
    const icon = CHECK_ICONS[checkId] || "📋";
    const pct = stat.coveragePercent;
    const badgeClass = pct >= 80 ? "badge-success" : pct >= 40 ? "badge-high" : "badge-critical";

    html += `
      <div class="breakdown-item" onclick="filterByCheck('${escapeHtml(checkId)}')">
        <div class="breakdown-item-left">
          <span style="font-size: 1.1rem">${icon}</span>
          <span class="breakdown-item-name">${escapeHtml(label)}</span>
        </div>
        <div class="breakdown-item-right">
          ${stat.failed > 0 ? `<span class="badge badge-critical">${stat.failed} avvik</span>` : ""}
          <span class="badge ${badgeClass}">${pct.toFixed(0)}%</span>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

function renderPriorityTable() {
  const report = state.report;
  const container = $("#priority-table-container");

  const repos = report.repos
    .filter(r => report.checks.some(c => r.checks[c] === false))
    .sort((a, b) => repoPriorityScore(b) - repoPriorityScore(a));

  if (repos.length === 0) {
    container.innerHTML = '<p style="color: var(--success); padding: 1rem;">✅ Alle repos passerer alle sjekker.</p>';
    return;
  }

  let rows = "";
  for (const repo of repos.slice(0, 50)) {
    const sev = repoSeverity(repo);
    const failedChecks = report.checks.filter(c => assessmentLevel(repo, c) === "action" || assessmentLevel(repo, c) === "fail");
    const actionChecks = report.checks.filter(c => assessmentLevel(repo, c) === "action");

    const checkBadges = failedChecks.map(c => {
      const level = assessmentLevel(repo, c);
      const cls = level === "action" ? "badge-critical" : "badge-high";
      return `<span class="badge ${cls}" title="${escapeHtml(repo.assessments?.[c] || "")}">${escapeHtml(CHECK_LABELS[c] || c)}</span>`;
    }).join(" ");

    rows += `
      <tr class="priority-row-${sev}" onclick="showRepoDetail('${escapeHtml(repo.project)}', '${escapeHtml(repo.repo)}')">
        <td><span class="severity-indicator severity-${sev}">${severityLabel(sev).toUpperCase()}</span></td>
        <td><span class="project-tag">${escapeHtml(repo.project)}</span><span class="repo-name">${escapeHtml(repo.repo)}</span></td>
        <td>${checkBadges}</td>
        <td>${actionChecks.length}</td>
        <td>${failedChecks.length}</td>
      </tr>
    `;
  }

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Prioritet</th>
          <th>Repository</th>
          <th>Avvikende sjekker</th>
          <th>Tiltak</th>
          <th>Totalt</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${repos.length > 50 ? `<p style="color: var(--text-muted); padding: 0.75rem; font-size: 0.8rem;">Viser topp 50 av ${repos.length} repos med avvik.</p>` : ""}
  `;
}
