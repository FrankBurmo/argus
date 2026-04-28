/* ================================================================
   Argus Frontend — Sårbarhets-explorer (Sårbarheter-fanen)
   ================================================================ */
"use strict";

import { state } from "../state.js";
import { $, escapeHtml, toast } from "../utils/dom.js";
import { sevLabelNo, ecoClass } from "../utils/format.js";
import { downloadFile } from "../utils/download.js";
import {
  buildVulnIndex,
  getFilteredVulns,
  vulnerabilityMatchesFilters,
  buildSummaryForRepos,
} from "../data/vulnIndex.js";

export function renderExplorer() {
  const allVulns = buildVulnIndex();

  if (allVulns.length === 0) {
    renderEmptyVulnState();
    return;
  }

  renderVulnSeveritySummary(allVulns);
  renderVulnFilters(allVulns);
  renderVulnList(allVulns);
}

function renderEmptyVulnState() {
  $("#vuln-severity-summary").innerHTML = "";
  const filterEls = ["#filter-severity", "#filter-ecosystem", "#filter-vuln-projects", "#filter-fix"];
  filterEls.forEach(sel => { if ($(sel)) $(sel).innerHTML = ""; });

  $("#vuln-table-container").innerHTML = `
    <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
      <p style="font-size: 1.5rem; margin-bottom: 0.5rem;">🎉</p>
      <p style="font-size: 1rem; font-weight: 600; color: var(--success);">Ingen kjente sårbarheter funnet</p>
      <p style="font-size: 0.85rem; margin-top: 0.5rem;">
        Enten har ingen repos avhengigheter med kjente CVE-er, eller OSV-sjekken var ikke aktivert.
      </p>
    </div>
  `;
  $("#vuln-result-count").textContent = "0 sårbarheter";
}

function renderVulnSeveritySummary(allVulns) {
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, NONE: 0, UNKNOWN: 0 };
  for (const { vuln } of allVulns) {
    const sev = vuln.severity || "UNKNOWN";
    counts[sev] = (counts[sev] || 0) + 1;
  }

  const items = [
    { key: "CRITICAL", label: "Critical", dot: "critical", count: counts.CRITICAL },
    { key: "HIGH", label: "High", dot: "high", count: counts.HIGH },
    { key: "MEDIUM", label: "Medium", dot: "medium", count: counts.MEDIUM },
    { key: "LOW", label: "Low", dot: "low", count: counts.LOW },
    { key: "NONE", label: "Ingen", dot: "none", count: counts.NONE },
    { key: "UNKNOWN", label: "Ukjent", dot: "unknown", count: counts.UNKNOWN },
  ].filter(i => i.count > 0);

  $("#vuln-severity-summary").innerHTML = items.map(i => `
    <div class="severity-card ${state.vulnFilters.severity.includes(i.key) ? "active" : ""}"
         onclick="toggleVulnFilter('severity', '${i.key}')">
      <span class="sev-dot ${i.dot}"></span>
      <div>
        <div class="sev-count">${i.count}</div>
        <div class="sev-label">${i.label}</div>
      </div>
    </div>
  `).join("");
}

function renderVulnFilters(allVulns) {
  const sevCounts = {};
  const ecoCounts = {};
  const projCounts = {};
  let fixCount = 0;
  let noFixCount = 0;

  for (const { vuln, repos } of allVulns) {
    const sev = vuln.severity || "UNKNOWN";
    sevCounts[sev] = (sevCounts[sev] || 0) + 1;

    const eco = vuln.ecosystem || "Ukjent";
    ecoCounts[eco] = (ecoCounts[eco] || 0) + 1;

    for (const r of repos) {
      projCounts[r.project] = (projCounts[r.project] || 0) + 1;
    }

    if (vuln.fixedIn) fixCount++;
    else noFixCount++;
  }

  const f = state.vulnFilters;

  // Severity-filtre
  const sevOrder = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"];
  $("#filter-severity").innerHTML = sevOrder
    .filter(s => sevCounts[s])
    .map(s => `
      <label class="filter-option ${f.severity.includes(s) ? "active" : ""}">
        <input type="checkbox" ${f.severity.includes(s) ? "checked" : ""} onchange="toggleVulnFilter('severity', '${s}')">
        <span class="sev-dot ${s.toLowerCase()}" style="width:8px;height:8px;border-radius:50%;display:inline-block;"></span>
        ${sevLabelNo(s)}
        <span class="option-count">${sevCounts[s]}</span>
      </label>
    `).join("");

  // Økosystem
  $("#filter-ecosystem").innerHTML = Object.entries(ecoCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([eco, count]) => `
      <label class="filter-option ${f.ecosystem.includes(eco) ? "active" : ""}">
        <input type="checkbox" ${f.ecosystem.includes(eco) ? "checked" : ""} onchange="toggleVulnFilter('ecosystem', '${escapeHtml(eco)}')">
        ${escapeHtml(eco)}
        <span class="option-count">${count}</span>
      </label>
    `).join("");

  // Prosjekt
  $("#filter-vuln-projects").innerHTML = Object.entries(projCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([proj, count]) => `
      <label class="filter-option ${f.projects.includes(proj) ? "active" : ""}">
        <input type="checkbox" ${f.projects.includes(proj) ? "checked" : ""} onchange="toggleVulnFilter('projects', '${escapeHtml(proj)}')">
        ${escapeHtml(proj)}
        <span class="option-count">${count}</span>
      </label>
    `).join("");

  // Fix tilgjengelig
  $("#filter-fix").innerHTML = `
    <label class="filter-option ${f.fixAvailable.includes("yes") ? "active" : ""}">
      <input type="checkbox" ${f.fixAvailable.includes("yes") ? "checked" : ""} onchange="toggleVulnFilter('fixAvailable', 'yes')">
      Fiks tilgjengelig
      <span class="option-count">${fixCount}</span>
    </label>
    <label class="filter-option ${f.fixAvailable.includes("no") ? "active" : ""}">
      <input type="checkbox" ${f.fixAvailable.includes("no") ? "checked" : ""} onchange="toggleVulnFilter('fixAvailable', 'no')">
      Ingen fiks
      <span class="option-count">${noFixCount}</span>
    </label>
  `;
}

export function renderVulnList(allVulns) {
  const searchTerm = ($("#vuln-search-input")?.value || "").toLowerCase();
  const filtered = getFilteredVulns(allVulns, searchTerm);

  $("#vuln-result-count").textContent = `${filtered.length} sårbarheter funnet`;

  const PAGE_SIZE = 100;
  const visible = filtered.slice(0, PAGE_SIZE);

  let html = `
    <div class="vuln-list-header">
      <span>Alvorlighet</span>
      <span>Sårbarhet</span>
      <span style="text-align: right">Oppdaget i</span>
    </div>
  `;

  for (const { vuln, repos } of visible) {
    const sevClass = (vuln.severity || "UNKNOWN").toLowerCase();
    const cvssStr = vuln.cvssScore ? vuln.cvssScore.toFixed(1) : "";
    const cveDisplay = vuln.cveId || vuln.id;
    const cveUrl = vuln.cveId
      ? `https://osv.dev/vulnerability/${encodeURIComponent(vuln.cveId)}`
      : `https://osv.dev/vulnerability/${encodeURIComponent(vuln.id)}`;

    const uniqueRepoCount = new Set(repos.map(r => `${r.project}|${r.repo}`)).size;
    const uniqueProjectCount = new Set(repos.map(r => r.project)).size;
    const uniqueVersions = [...new Set(repos.map(r => r.version))].sort();

    html += `
      <div class="vuln-row" onclick="showVulnDetail('${escapeHtml(vuln.id)}')">
        <div class="vuln-row-severity">
          <span class="vuln-sev-badge ${sevClass}">${sevLabelNo(vuln.severity || "UNKNOWN")}</span>
          ${cvssStr ? `<span class="vuln-cvss">${cvssStr}</span>` : ""}
        </div>
        <div class="vuln-row-main">
          <div class="vuln-title">${escapeHtml(vuln.summary)}</div>
          <div class="vuln-meta">
            <a class="vuln-cve" href="${cveUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${escapeHtml(cveDisplay)}</a>
            <span class="vuln-pkg-badge ${ecoClass(vuln.ecosystem)}">📦 ${escapeHtml(vuln.package)}</span>
          </div>
          <div class="vuln-tags">
            ${vuln.fixedIn ? `<span class="vuln-tag fix-available">✅ Fiks: ${escapeHtml(vuln.fixedIn)}</span>` : `<span class="vuln-tag no-fix">Ingen fiks kjent</span>`}
            <span class="vuln-tag">${uniqueVersions.length} versjon${uniqueVersions.length > 1 ? "er" : ""}</span>
            ${(vuln.aliases || []).filter(a => a !== vuln.cveId && a !== vuln.id).slice(0, 2).map(a =>
              `<a class="vuln-tag" style="color: var(--text-link); text-decoration: none;" href="https://osv.dev/vulnerability/${encodeURIComponent(a)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${escapeHtml(a)}</a>`
            ).join("")}
          </div>
        </div>
        <div class="vuln-row-detected">
          <span class="vuln-detected-label">Oppdaget i</span>
          <span class="vuln-detected-count">📦 ${uniqueRepoCount} Repositor${uniqueRepoCount === 1 ? "y" : "ies"}</span>
          <span class="vuln-detected-count">📁 ${uniqueProjectCount} Prosjekt${uniqueProjectCount > 1 ? "er" : ""}</span>
        </div>
      </div>
    `;
  }

  if (filtered.length > PAGE_SIZE) {
    html += `<p style="color: var(--text-muted); padding: 1rem; font-size: 0.8rem; text-align: center;">Viser ${PAGE_SIZE} av ${filtered.length} sårbarheter. Bruk filtre for å snevre inn.</p>`;
  }

  $("#vuln-table-container").innerHTML = html;
}

/** Toggle et sårbarhetsfilter og rendre på nytt. */
export function toggleVulnFilter(group, value) {
  const arr = state.vulnFilters[group];
  const idx = arr.indexOf(value);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(value);
  renderExplorer();
}

/** Eksporter filtrerte issues som JSON-rapport (samme format som CLI-output). */
export function exportFilteredIssuesJson() {
  if (!state.report) return;

  const searchTerm = ($("#vuln-search-input")?.value || "").toLowerCase();
  const filteredRepos = state.report.repos
    .map(repo => {
      const vulnerabilities = (repo.vulnerabilities || []).filter(vuln =>
        vulnerabilityMatchesFilters(vuln, repo, searchTerm)
      );
      if (vulnerabilities.length === 0) return null;
      return { ...repo, vulnerabilities };
    })
    .filter(Boolean);

  const exportedReport = {
    generatedAt: new Date().toISOString(),
    checks: [...state.report.checks],
    summary: buildSummaryForRepos(filteredRepos, state.report.checks),
    repos: filteredRepos,
  };

  const fileStamp = new Date().toISOString().replace(/[:.]/g, "-");
  downloadFile(`issues-filtrert-${fileStamp}.json`, JSON.stringify(exportedReport, null, 2), "application/json");
  const issueCount = filteredRepos.reduce((sum, repo) => sum + (repo.vulnerabilities || []).length, 0);
  toast(`Eksporterte ${issueCount} issue${issueCount === 1 ? "" : "s"} til JSON.`);
}
