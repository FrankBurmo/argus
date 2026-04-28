/* ================================================================
   Argus Frontend — Detaljpanel for enkelt-repo
   ================================================================ */
"use strict";

import { state } from "../state.js";
import { CHECK_REMEDIATION } from "../constants/remediation.js";
import { $, escapeHtml } from "../utils/dom.js";
import { severityLabel, sevLabelNo, ecoClass } from "../utils/format.js";
import { assessmentLevel, repoPriorityScore, repoSeverity } from "../utils/assessment.js";

export function showRepoDetail(project, repoSlug) {
  const repo = state.report.repos.find(r => r.project === project && r.repo === repoSlug);
  if (!repo) return;

  const checkMeta = state.checkMeta;
  const panel = $("#detail-panel");
  const body = $("#detail-body");

  const failedChecks = checkMeta.filter(c => assessmentLevel(repo, c.id) === "action" || assessmentLevel(repo, c.id) === "fail");
  const passedChecks = checkMeta.filter(c => assessmentLevel(repo, c.id) === "pass");
  const naChecks = checkMeta.filter(c => assessmentLevel(repo, c.id) === "na" || assessmentLevel(repo, c.id) === "unknown");

  let html = `
    <div class="detail-header">
      <h2>${escapeHtml(repoSlug)}</h2>
      <div class="detail-project">${escapeHtml(project)}</div>
    </div>
  `;

  // Score og severity
  const score = repoPriorityScore(repo);
  const sev = repoSeverity(repo);
  html += `
    <div class="detail-section">
      <div style="display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem;">
        <span class="severity-indicator severity-${sev}" style="font-size: 0.9rem; padding: 0.4rem 0.8rem;">
          ${severityLabel(sev).toUpperCase()} — Score ${score}
        </span>
        <span style="color: var(--text-secondary); font-size: 0.85rem;">${failedChecks.length} avvik, ${passedChecks.length} bestått, ${naChecks.length} ikke aktuelt</span>
      </div>
    </div>
  `;

  // Avvik som krever tiltak — med handlingskort
  if (failedChecks.length > 0) {
    html += `<div class="detail-section"><h3>Avvik og anbefalte tiltak</h3><div class="detail-check-list">`;
    for (const chk of failedChecks) {
      const level = assessmentLevel(repo, chk.id);
      const statusClass = level === "action" ? "status-fail" : "status-warn";
      const statusIcon = level === "action" ? "!" : "✕";
      const assessment = repo.assessments?.[chk.id] || "Ingen vurdering";
      const remediation = CHECK_REMEDIATION[chk.id];

      // CVE-linking
      const assessmentHtml = escapeHtml(assessment)
        .replace(/(CVE-\d{4}-\d+)/g, '<a href="https://osv.dev/vulnerability/$1" target="_blank" rel="noopener">$1</a>')
        .replace(/(GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})/g, '<a href="https://github.com/advisories/$1" target="_blank" rel="noopener">$1</a>');

      html += `
        <div class="detail-check-item">
          <span class="check-status status-icon ${statusClass}">${statusIcon}</span>
          <div class="check-info">
            <div class="check-name">${chk.icon} ${escapeHtml(chk.label)}</div>
            <div class="check-assessment">${assessmentHtml}</div>
            ${remediation ? `
            <div class="remediation-card remediation-${escapeHtml(remediation.severity)}">
              <div class="remediation-header" onclick="this.parentElement.classList.toggle('open')">
                <span class="remediation-toggle">▶</span>
                <span class="remediation-title">Slik fikser du dette</span>
                <span class="remediation-severity-badge remediation-sev-${escapeHtml(remediation.severity)}">${escapeHtml(remediation.severity)}</span>
              </div>
              <div class="remediation-body">
                <p class="remediation-why">${escapeHtml(remediation.why)}</p>
                <ol class="remediation-steps">
                  ${remediation.steps.map(s => `<li>${escapeHtml(s).replace(/\`([^`]+)\`/g, '<code>$1</code>')}</li>`).join("")}
                </ol>
                <a class="remediation-doc-link" href="${escapeHtml(remediation.docUrl)}" target="_blank" rel="noopener">📖 ${escapeHtml(remediation.docLabel)}</a>
              </div>
            </div>
            ` : ""}
          </div>
        </div>
      `;
    }
    html += "</div></div>";
  }

  // Faktiske sårbarheter funnet
  if (repo.vulnerabilities && repo.vulnerabilities.length > 0) {
    html += `<div class="detail-section"><h3>Kjente sårbarheter (${repo.vulnerabilities.length})</h3><div class="detail-check-list">`;
    const sortedVulns = [...repo.vulnerabilities].sort((a, b) => (b.severityRank || 0) - (a.severityRank || 0));
    for (const v of sortedVulns) {
      const sevClass = (v.severity || "UNKNOWN").toLowerCase();
      const osvUrl = `https://osv.dev/vulnerability/${encodeURIComponent(v.cveId || v.id)}`;
      html += `
        <div class="detail-check-item" style="border-left: 3px solid var(--severity-${sevClass});">
          <div class="check-info" style="width: 100%;">
            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              <span class="vuln-sev-badge ${sevClass}">${sevLabelNo(v.severity || "UNKNOWN")}</span>
              ${v.cvssScore ? `<span class="vuln-cvss">${v.cvssScore.toFixed(1)}</span>` : ""}
              <a class="vuln-cve" href="${osvUrl}" target="_blank" rel="noopener">${escapeHtml(v.cveId || v.id)}</a>
            </div>
            <div class="check-name" style="margin-top: 0.3rem;">${escapeHtml(v.summary)}</div>
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.3rem; flex-wrap: wrap;">
              <span class="vuln-pkg-badge ${ecoClass(v.ecosystem)}">📦 ${escapeHtml(v.package)} ${escapeHtml(v.version)}</span>
              ${v.fixedIn ? `<span class="vuln-tag fix-available">✅ Fiks: ${escapeHtml(v.fixedIn)}</span>` : `<span class="vuln-tag no-fix">Ingen fiks kjent</span>`}
            </div>
          </div>
        </div>
      `;
    }
    html += "</div></div>";
  }

  // Bestått
  if (passedChecks.length > 0) {
    html += `<div class="detail-section"><h3>Bestått sjekker</h3><div class="detail-check-list">`;
    for (const chk of passedChecks) {
      const details = repo.assessments?.[chk.id] || "";
      html += `
        <div class="detail-check-item">
          <span class="check-status status-icon status-pass">✓</span>
          <div class="check-info">
            <div class="check-name">${chk.icon} ${escapeHtml(chk.label)}</div>
            ${details ? `<div class="check-assessment">${escapeHtml(details)}</div>` : ""}
          </div>
        </div>
      `;
    }
    html += "</div></div>";
  }

  // Ikke aktuelt
  if (naChecks.length > 0) {
    html += `<div class="detail-section"><h3>Ikke aktuelt</h3><div class="detail-check-list">`;
    for (const chk of naChecks) {
      const assessment = repo.assessments?.[chk.id] || "";
      html += `
        <div class="detail-check-item">
          <span class="check-status status-icon status-na">–</span>
          <div class="check-info">
            <div class="check-name">${chk.icon} ${escapeHtml(chk.label)}</div>
            ${assessment ? `<div class="check-assessment">${escapeHtml(assessment)}</div>` : ""}
          </div>
        </div>
      `;
    }
    html += "</div></div>";
  }

  body.innerHTML = html;
  panel.classList.remove("hidden");
}
