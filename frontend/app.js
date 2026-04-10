/* ================================================================
   Argus Code Security — Frontend-applikasjon
   ================================================================ */
"use strict";

// ---------------------------------------------------------------------------
// Tilstand
// ---------------------------------------------------------------------------

let report = null;         // Rå JSON-rapport
let checkMeta = [];        // [{ id, label }]
let activeView = "summary";
let activeFilters = {
  status: [],
  checks: [],
  projects: [],
  assessment: [],
};

// ---------------------------------------------------------------------------
// Sjekk-metadata (label-mapping)
// ---------------------------------------------------------------------------

const CHECK_LABELS = {
  "renovate":           "Renovate / Dependabot",
  "owasp-dep-check":    "OWASP Dependency-Check",
  "npm-audit":          "npm audit i CI",
  "dep-vulns":          "Kjente sårbarheter (OSV)",
  "codeowners":         "CODEOWNERS",
  "pipeline":           "CI/CD-pipeline",
  "branch-protection":  "Branch-beskyttelse",
  "secrets":            "Hemmelighetsdeteksjon",
  "stale":              "Vedlikeholdsstatus",
  "readme":             "README",
  "tests":              "Tester i CI",
  "pr-activity":        "PR-aktivitet",
  "linting":            "Linting i CI",
};

const CHECK_ICONS = {
  "renovate":          "🔄",
  "owasp-dep-check":   "🛡️",
  "npm-audit":         "📦",
  "dep-vulns":         "🔍",
  "codeowners":        "👥",
  "pipeline":          "⚙️",
  "branch-protection": "🔒",
  "secrets":           "🔑",
  "stale":             "📅",
  "readme":            "📄",
  "tests":             "🧪",
  "pr-activity":       "🔀",
  "linting":           "✨",
};

// ---------------------------------------------------------------------------
// Hjelpefunksjoner
// ---------------------------------------------------------------------------

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString("nb-NO", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/**
 * Klassifiser en sjekk-vurdering til et prioriteringsnivå.
 */
function assessmentLevel(repo, checkId) {
  const val = repo.checks[checkId];
  if (val === true) return "pass";
  if (val === null) return "na";
  const text = repo.assessments && repo.assessments[checkId];
  if (!text) return "fail";
  if (text.startsWith("Anbefalt")) return "action";
  if (text.startsWith("Ikke nødvendig")) return "na";
  return "unknown";
}

function levelLabel(level) {
  switch (level) {
    case "pass": return "Bestått";
    case "fail": return "Feilet";
    case "action": return "Anbefalt tiltak";
    case "na": return "Ikke aktuelt";
    case "unknown": return "Usikkert";
    default: return level;
  }
}

/**
 * Beregn en prioriterings-score for et repo (høyere = mer kritisk).
 */
function repoPriorityScore(repo) {
  let score = 0;
  for (const checkId of report.checks) {
    const level = assessmentLevel(repo, checkId);
    if (level === "action") score += 10;
    else if (level === "fail") score += 5;
    else if (level === "unknown") score += 2;
  }
  return score;
}

/**
 * Generer en "severity" basert på antall feil.
 */
function repoSeverity(repo) {
  const actionCount = report.checks.filter(c => assessmentLevel(repo, c) === "action").length;
  const failCount = report.checks.filter(c => assessmentLevel(repo, c) === "fail").length;
  const total = actionCount + failCount;
  if (total >= 5 || actionCount >= 3) return "critical";
  if (total >= 3 || actionCount >= 2) return "high";
  if (total >= 1) return "medium";
  return "low";
}

function severityLabel(sev) {
  switch (sev) {
    case "critical": return "Kritisk";
    case "high": return "Høy";
    case "medium": return "Middels";
    case "low": return "Lav";
    default: return sev;
  }
}

// ---------------------------------------------------------------------------
// Fil-lasting
// ---------------------------------------------------------------------------

function handleFile(file) {
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

function loadReport(data) {
  report = data;
  checkMeta = report.checks.map(id => ({
    id,
    label: CHECK_LABELS[id] || id,
    icon: CHECK_ICONS[id] || "📋",
  }));

  // Tilbakestill filtre
  activeFilters = { status: [], checks: [], projects: [], assessment: [] };
  vulnFilters = { severity: [], ecosystem: [], projects: [], fixAvailable: [] };

  // Vis app
  $("#landing").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#report-meta").textContent = `Generert ${formatDate(report.generatedAt)} — ${report.summary.total} repos`;

  renderActiveView();
  toast("Rapport lastet!");
}

// ---------------------------------------------------------------------------
// Navigasjon
// ---------------------------------------------------------------------------

function switchView(view) {
  activeView = view;
  $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  $$(".view").forEach(v => v.classList.add("hidden"));
  $(`#view-${view}`).classList.remove("hidden");
  renderActiveView();
}

function renderActiveView() {
  switch (activeView) {
    case "summary": renderSummary(); break;
    case "vulnerabilities": renderExplorer(); break;
    case "repos": renderRepos(); break;
  }
}

// ---------------------------------------------------------------------------
// Sammendrag/Dashboard
// ---------------------------------------------------------------------------

function renderSummary() {
  renderSummaryCards();
  renderCoverageChart();
  renderProjectBreakdown();
  renderCheckBreakdown();
  renderPriorityTable();
}

function renderSummaryCards() {
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
  const container = $("#priority-table-container");

  // Sorter repos etter prioriterings-score
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

// ---------------------------------------------------------------------------
// Sårbarheter-explorer (faktiske CVE-er fra OSV-skanning)
// ---------------------------------------------------------------------------

let vulnFilters = {
  severity: [],
  ecosystem: [],
  projects: [],
  fixAvailable: [],
};

/**
 * Bygg en flat, deduplisert liste over alle sårbarheter på tvers av repos.
 * Grupperer per vuln-ID og pakke+versjon, og sporer berørte repos.
 */
function buildVulnIndex() {
  const index = new Map(); // key: "vulnId|pkg|version" → { vuln, repos: [{project, repo}] }

  for (const repo of report.repos) {
    if (!repo.vulnerabilities || repo.vulnerabilities.length === 0) continue;
    for (const v of repo.vulnerabilities) {
      const key = `${v.id}|${v.package}|${v.version}`;
      if (!index.has(key)) {
        index.set(key, { vuln: v, repos: [] });
      }
      index.get(key).repos.push({ project: repo.project, repo: repo.repo });
    }
  }

  // Returner som sortert array (høyest severity først, deretter CVSS)
  return Array.from(index.values()).sort((a, b) => {
    if (b.vuln.severityRank !== a.vuln.severityRank) return b.vuln.severityRank - a.vuln.severityRank;
    return (b.vuln.cvssScore || 0) - (a.vuln.cvssScore || 0);
  });
}

function renderExplorer() {
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
    <div class="severity-card ${vulnFilters.severity.includes(i.key) ? "active" : ""}"
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
  // Alvorlighetsgrad
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

  // Severity-filtre
  const sevOrder = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"];
  $("#filter-severity").innerHTML = sevOrder
    .filter(s => sevCounts[s])
    .map(s => `
      <label class="filter-option ${vulnFilters.severity.includes(s) ? "active" : ""}">
        <input type="checkbox" ${vulnFilters.severity.includes(s) ? "checked" : ""} onchange="toggleVulnFilter('severity', '${s}')">
        <span class="sev-dot ${s.toLowerCase()}" style="width:8px;height:8px;border-radius:50%;display:inline-block;"></span>
        ${sevLabelNo(s)}
        <span class="option-count">${sevCounts[s]}</span>
      </label>
    `).join("");

  // Økosystem
  $("#filter-ecosystem").innerHTML = Object.entries(ecoCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([eco, count]) => `
      <label class="filter-option ${vulnFilters.ecosystem.includes(eco) ? "active" : ""}">
        <input type="checkbox" ${vulnFilters.ecosystem.includes(eco) ? "checked" : ""} onchange="toggleVulnFilter('ecosystem', '${escapeHtml(eco)}')">
        ${escapeHtml(eco)}
        <span class="option-count">${count}</span>
      </label>
    `).join("");

  // Prosjekt
  $("#filter-vuln-projects").innerHTML = Object.entries(projCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([proj, count]) => `
      <label class="filter-option ${vulnFilters.projects.includes(proj) ? "active" : ""}">
        <input type="checkbox" ${vulnFilters.projects.includes(proj) ? "checked" : ""} onchange="toggleVulnFilter('projects', '${escapeHtml(proj)}')">
        ${escapeHtml(proj)}
        <span class="option-count">${count}</span>
      </label>
    `).join("");

  // Fix tilgjengelig
  $("#filter-fix").innerHTML = `
    <label class="filter-option ${vulnFilters.fixAvailable.includes("yes") ? "active" : ""}">
      <input type="checkbox" ${vulnFilters.fixAvailable.includes("yes") ? "checked" : ""} onchange="toggleVulnFilter('fixAvailable', 'yes')">
      Fiks tilgjengelig
      <span class="option-count">${fixCount}</span>
    </label>
    <label class="filter-option ${vulnFilters.fixAvailable.includes("no") ? "active" : ""}">
      <input type="checkbox" ${vulnFilters.fixAvailable.includes("no") ? "checked" : ""} onchange="toggleVulnFilter('fixAvailable', 'no')">
      Ingen fiks
      <span class="option-count">${noFixCount}</span>
    </label>
  `;
}

function sevLabelNo(sev) {
  switch (sev) {
    case "CRITICAL": return "Kritisk";
    case "HIGH": return "Høy";
    case "MEDIUM": return "Middels";
    case "LOW": return "Lav";
    case "NONE": return "Ingen";
    default: return "Ukjent";
  }
}

function ecoClass(ecosystem) {
  switch ((ecosystem || "").toLowerCase()) {
    case "npm": return "npm";
    case "maven": return "maven";
    case "pypi": return "pypi";
    case "go": return "go";
    default: return "default";
  }
}

function renderVulnList(allVulns) {
  const searchTerm = ($("#vuln-search-input")?.value || "").toLowerCase();

  // Filtrer
  let filtered = allVulns;

  if (vulnFilters.severity.length > 0) {
    filtered = filtered.filter(({ vuln }) => vulnFilters.severity.includes(vuln.severity || "UNKNOWN"));
  }
  if (vulnFilters.ecosystem.length > 0) {
    filtered = filtered.filter(({ vuln }) => vulnFilters.ecosystem.includes(vuln.ecosystem || "Ukjent"));
  }
  if (vulnFilters.projects.length > 0) {
    filtered = filtered.filter(({ repos }) => repos.some(r => vulnFilters.projects.includes(r.project)));
  }
  if (vulnFilters.fixAvailable.length > 0) {
    if (vulnFilters.fixAvailable.length === 1) {
      const wantFix = vulnFilters.fixAvailable[0] === "yes";
      filtered = filtered.filter(({ vuln }) => wantFix ? !!vuln.fixedIn : !vuln.fixedIn);
    }
  }

  if (searchTerm) {
    filtered = filtered.filter(({ vuln, repos }) => {
      const searchable = [
        vuln.id, vuln.cveId, vuln.summary, vuln.package, vuln.version,
        vuln.ecosystem, ...(vuln.aliases || []),
        ...repos.map(r => `${r.project} ${r.repo}`),
      ].join(" ").toLowerCase();
      return searchable.includes(searchTerm);
    });
  }

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

    const uniqueRepoCount = repos.length;
    const uniqueProjectCount = new Set(repos.map(r => r.project)).size;

    html += `
      <div class="vuln-row" onclick="showVulnDetail('${escapeHtml(vuln.id)}', '${escapeHtml(vuln.package)}', '${escapeHtml(vuln.version)}')">
        <div class="vuln-row-severity">
          <span class="vuln-sev-badge ${sevClass}">${sevLabelNo(vuln.severity || "UNKNOWN")}</span>
          ${cvssStr ? `<span class="vuln-cvss">${cvssStr}</span>` : ""}
        </div>
        <div class="vuln-row-main">
          <div class="vuln-title">${escapeHtml(vuln.summary)}</div>
          <div class="vuln-meta">
            <a class="vuln-cve" href="${cveUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${escapeHtml(cveDisplay)}</a>
            <span class="vuln-pkg-badge ${ecoClass(vuln.ecosystem)}">📦 ${escapeHtml(vuln.package)} ${escapeHtml(vuln.version)}</span>
          </div>
          <div class="vuln-tags">
            ${vuln.fixedIn ? `<span class="vuln-tag fix-available">✅ Fiks: ${escapeHtml(vuln.fixedIn)}</span>` : `<span class="vuln-tag no-fix">Ingen fiks kjent</span>`}
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

function toggleVulnFilter(group, value) {
  const arr = vulnFilters[group];
  const idx = arr.indexOf(value);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(value);
  renderExplorer();
}

function showVulnDetail(vulnId, pkg, version) {
  const allVulns = buildVulnIndex();
  const key = `${vulnId}|${pkg}|${version}`;
  const entry = allVulns.find(e => `${e.vuln.id}|${e.vuln.package}|${e.vuln.version}` === key);
  if (!entry) return;

  const { vuln, repos } = entry;
  const panel = $("#detail-panel");
  const body = $("#detail-body");
  const sevClass = (vuln.severity || "UNKNOWN").toLowerCase();

  const osvUrl = `https://osv.dev/vulnerability/${encodeURIComponent(vuln.id)}`;
  const nvdUrl = vuln.cveId ? `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(vuln.cveId)}` : null;
  const ghsaUrl = (vuln.aliases || []).find(a => a.startsWith("GHSA-"))
    ? `https://github.com/advisories/${(vuln.aliases || []).find(a => a.startsWith("GHSA-"))}`
    : null;

  let html = `
    <div class="detail-header">
      <h2>${escapeHtml(vuln.summary)}</h2>
      <div class="detail-project" style="margin-top: 0.25rem;">${escapeHtml(vuln.id)}${vuln.cveId && vuln.cveId !== vuln.id ? ` · ${escapeHtml(vuln.cveId)}` : ""}</div>
    </div>

    <div class="vuln-detail-severity">
      <span class="vuln-sev-badge ${sevClass}" style="font-size: 0.85rem; padding: 0.4rem 0.8rem;">${sevLabelNo(vuln.severity || "UNKNOWN").toUpperCase()}</span>
      ${vuln.cvssScore ? `<span class="big-score" style="color: var(--severity-${sevClass})">${vuln.cvssScore.toFixed(1)}</span>` : ""}
    </div>

    <div class="detail-section">
      <h3>Pakke</h3>
      <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
        <span class="vuln-pkg-badge ${ecoClass(vuln.ecosystem)}" style="font-size: 0.85rem; padding: 0.3rem 0.6rem;">
          📦 ${escapeHtml(vuln.package)} ${escapeHtml(vuln.version)}
        </span>
        <span style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(vuln.ecosystem || "")}</span>
        ${vuln.fixedIn ? `<span class="vuln-tag fix-available" style="font-size: 0.8rem;">✅ Oppgrader til ${escapeHtml(vuln.fixedIn)}</span>` : `<span class="vuln-tag no-fix" style="font-size: 0.8rem;">Ingen kjent fiks</span>`}
      </div>
    </div>

    <div class="detail-section">
      <h3>Oppdaget i ${repos.length} repositor${repos.length === 1 ? "y" : "ies"}</h3>
      <div class="vuln-detail-repos">
        ${repos.map(r => `
          <div class="vuln-detail-repo-item" onclick="showRepoDetail('${escapeHtml(r.project)}', '${escapeHtml(r.repo)}')">
            <span class="project-tag">${escapeHtml(r.project)}</span>
            <span class="repo-name">${escapeHtml(r.repo)}</span>
          </div>
        `).join("")}
      </div>
    </div>

    <div class="detail-section">
      <h3>Referanser</h3>
      <div class="vuln-detail-refs">
        <a href="${osvUrl}" target="_blank" rel="noopener">🔗 OSV.dev — ${escapeHtml(vuln.id)}</a>
        ${nvdUrl ? `<a href="${nvdUrl}" target="_blank" rel="noopener">🔗 NVD — ${escapeHtml(vuln.cveId)}</a>` : ""}
        ${ghsaUrl ? `<a href="${ghsaUrl}" target="_blank" rel="noopener">🔗 GitHub Advisory</a>` : ""}
        ${(vuln.references || []).map(ref => `
          <a href="${escapeHtml(ref.url)}" target="_blank" rel="noopener">🔗 ${escapeHtml(ref.type || "Referanse")} — ${escapeHtml(new URL(ref.url).hostname)}</a>
        `).join("")}
      </div>
    </div>

    ${vuln.aliases && vuln.aliases.length > 0 ? `
    <div class="detail-section">
      <h3>Aliaser</h3>
      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
        ${vuln.aliases.map(a => `<a href="https://osv.dev/vulnerability/${encodeURIComponent(a)}" target="_blank" rel="noopener" class="badge badge-info">${escapeHtml(a)}</a>`).join("")}
      </div>
    </div>
    ` : ""}
  `;

  body.innerHTML = html;
  panel.classList.remove("hidden");
}

// ---------------------------------------------------------------------------
// Repos-visning
// ---------------------------------------------------------------------------

function renderRepos() {
  renderRepoTable();
}

function renderRepoTable() {
  const searchTerm = ($("#repo-search-input")?.value || "").toLowerCase();

  let repos = report.repos;
  if (searchTerm) {
    repos = repos.filter(r =>
      `${r.project} ${r.repo}`.toLowerCase().includes(searchTerm)
    );
  }

  $("#repo-result-count").textContent = `${repos.length} repositories`;

  // Sorter etter prioriterings-score
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

// ---------------------------------------------------------------------------
// Detaljpanel
// ---------------------------------------------------------------------------

function showRepoDetail(project, repoSlug) {
  const repo = report.repos.find(r => r.project === project && r.repo === repoSlug);
  if (!repo) return;

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

  // Avvik som krever tiltak
  if (failedChecks.length > 0) {
    html += `<div class="detail-section"><h3>Avvik og anbefalte tiltak</h3><div class="detail-check-list">`;
    for (const chk of failedChecks) {
      const level = assessmentLevel(repo, chk.id);
      const statusClass = level === "action" ? "status-fail" : "status-warn";
      const statusIcon = level === "action" ? "!" : "✕";
      const assessment = repo.assessments?.[chk.id] || "Ingen vurdering";

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
            <div class="check-links">
              ${chk.id === "dep-vulns" ? '<a href="https://osv.dev/" target="_blank" rel="noopener">🔗 OSV.dev</a>' : ""}
              ${chk.id === "owasp-dep-check" ? '<a href="https://owasp.org/www-project-dependency-check/" target="_blank" rel="noopener">🔗 OWASP DC</a>' : ""}
              ${chk.id === "npm-audit" ? '<a href="https://docs.npmjs.com/cli/v10/commands/npm-audit" target="_blank" rel="noopener">🔗 npm audit docs</a>' : ""}
              ${chk.id === "renovate" ? '<a href="https://docs.renovatebot.com/" target="_blank" rel="noopener">🔗 Renovate docs</a>' : ""}
              ${chk.id === "secrets" ? '<a href="https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/01-Information_Gathering/06-Identify_Application_Entry_Points" target="_blank" rel="noopener">🔗 OWASP Testing Guide</a>' : ""}
            </div>
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

function closeDetail() {
  $("#detail-panel").classList.add("hidden");
}

// ---------------------------------------------------------------------------
// Filtre-handlinger
// ---------------------------------------------------------------------------

function toggleFilter(group, value) {
  const arr = activeFilters[group];
  const idx = arr.indexOf(value);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(value);
  renderActiveView();
}

function filterByProject(project) {
  vulnFilters = { severity: [], ecosystem: [], projects: [project], fixAvailable: [] };
  switchView("vulnerabilities");
}

function filterByCheck(checkId) {
  // For dep-vulns, bytt til sårbarhetsfanen; for andre, bruk repo-fanen
  if (checkId === "dep-vulns") {
    vulnFilters = { severity: [], ecosystem: [], projects: [], fixAvailable: [] };
    switchView("vulnerabilities");
  } else {
    switchView("repos");
  }
}

// ---------------------------------------------------------------------------
// Demodata
// ---------------------------------------------------------------------------

function generateDemoData() {
  const projects = ["PLATFORM", "FRONTEND", "BACKEND", "DATA", "MOBILE"];
  const repoNames = ["api-gateway", "user-service", "payment-service", "web-app", "admin-portal",
    "auth-service", "notification-svc", "analytics-engine", "mobile-app", "data-pipeline",
    "config-server", "cdn-proxy", "logging-service", "search-api", "report-generator",
    "identity-provider", "file-storage", "email-service", "webhook-handler", "rate-limiter"];
  const checkIds = ["renovate", "owasp-dep-check", "npm-audit", "dep-vulns", "codeowners",
    "pipeline", "branch-protection", "secrets", "stale", "readme", "tests", "pr-activity", "linting"];

  // Realistiske demo-sårbarheter
  const demoVulns = [
    { id: "GHSA-c2qf-rxjj-qqgw", cveId: "CVE-2021-44906", summary: "Prototype Pollution in minimist", severity: "CRITICAL", severityRank: 4, cvssScore: 9.8, package: "minimist", version: "1.2.5", ecosystem: "npm", fixedIn: "1.2.6", aliases: ["CVE-2021-44906", "GHSA-c2qf-rxjj-qqgw"], references: [{ type: "ADVISORY", url: "https://github.com/advisories/GHSA-c2qf-rxjj-qqgw" }] },
    { id: "GHSA-35jh-r3h4-6jhm", cveId: "CVE-2021-23337", summary: "Command Injection in lodash", severity: "HIGH", severityRank: 3, cvssScore: 7.2, package: "lodash", version: "4.17.20", ecosystem: "npm", fixedIn: "4.17.21", aliases: ["CVE-2021-23337"], references: [{ type: "ADVISORY", url: "https://github.com/advisories/GHSA-35jh-r3h4-6jhm" }] },
    { id: "GHSA-p6mc-m468-83gw", cveId: "CVE-2022-25883", summary: "ReDoS vulnerability in semver", severity: "HIGH", severityRank: 3, cvssScore: 7.5, package: "semver", version: "6.3.0", ecosystem: "npm", fixedIn: "6.3.1", aliases: ["CVE-2022-25883"], references: [] },
    { id: "GHSA-952p-6rrq-rcjv", cveId: "CVE-2023-42282", summary: "Server-Side Request Forgery in ip", severity: "CRITICAL", severityRank: 4, cvssScore: 9.8, package: "ip", version: "1.1.8", ecosystem: "npm", fixedIn: "1.1.9", aliases: ["CVE-2023-42282"], references: [] },
    { id: "GHSA-4q6p-r6v2-jvc5", cveId: "CVE-2020-15168", summary: "Denial of Service in node-fetch", severity: "MEDIUM", severityRank: 2, cvssScore: 5.3, package: "node-fetch", version: "2.6.0", ecosystem: "npm", fixedIn: "2.6.1", aliases: ["CVE-2020-15168"], references: [] },
    { id: "GHSA-ww39-953v-wcq6", cveId: "CVE-2022-25858", summary: "ReDoS in terser", severity: "HIGH", severityRank: 3, cvssScore: 7.5, package: "terser", version: "5.14.1", ecosystem: "npm", fixedIn: "5.14.2", aliases: ["CVE-2022-25858"], references: [] },
    { id: "GHSA-3xgq-45jj-v275", cveId: "CVE-2022-37601", summary: "Prototype Pollution in loader-utils", severity: "CRITICAL", severityRank: 4, cvssScore: 9.8, package: "loader-utils", version: "2.0.2", ecosystem: "npm", fixedIn: "2.0.3", aliases: ["CVE-2022-37601"], references: [] },
    { id: "GHSA-67hx-6x53-jw92", cveId: "CVE-2023-36665", summary: "Prototype Pollution in protobufjs", severity: "HIGH", severityRank: 3, cvssScore: 8.8, package: "protobufjs", version: "6.11.2", ecosystem: "npm", fixedIn: "6.11.4", aliases: ["CVE-2023-36665"], references: [] },
    { id: "GHSA-2m39-62fm-q8r3", cveId: "CVE-2022-26612", summary: "Path traversal in Hadoop", severity: "HIGH", severityRank: 3, cvssScore: 8.8, package: "org.apache.hadoop:hadoop-common", version: "2.9.2", ecosystem: "Maven", fixedIn: "3.2.3", aliases: ["CVE-2022-26612"], references: [] },
    { id: "GHSA-jfh8-c2jp-5v3q", cveId: "CVE-2021-45046", summary: "Log4j RCE via Thread Context", severity: "CRITICAL", severityRank: 4, cvssScore: 9.0, package: "org.apache.logging.log4j:log4j-core", version: "2.15.0", ecosystem: "Maven", fixedIn: "2.16.0", aliases: ["CVE-2021-45046"], references: [{ type: "ADVISORY", url: "https://logging.apache.org/log4j/2.x/security.html" }] },
    { id: "GHSA-jfhm-5ghh-2f97", cveId: "CVE-2020-36518", summary: "Denial of Service via deeply nested objects in jackson-databind", severity: "HIGH", severityRank: 3, cvssScore: 7.5, package: "com.fasterxml.jackson.core:jackson-databind", version: "2.12.6", ecosystem: "Maven", fixedIn: "2.12.6.1", aliases: ["CVE-2020-36518"], references: [] },
    { id: "PYSEC-2021-421", cveId: "CVE-2021-41496", summary: "Buffer overflow in numpy", severity: "MEDIUM", severityRank: 2, cvssScore: 5.5, package: "numpy", version: "1.21.2", ecosystem: "PyPI", fixedIn: "1.22.0", aliases: ["CVE-2021-41496"], references: [] },
    { id: "PYSEC-2022-203", cveId: "CVE-2022-42969", summary: "ReDoS in py library", severity: "MEDIUM", severityRank: 2, cvssScore: 5.3, package: "py", version: "1.11.0", ecosystem: "PyPI", fixedIn: null, aliases: ["CVE-2022-42969"], references: [] },
    { id: "GO-2023-1571", cveId: "CVE-2022-41723", summary: "Denial of service via crafted HTTP/2 stream in net/http", severity: "HIGH", severityRank: 3, cvssScore: 7.5, package: "golang.org/x/net", version: "0.5.0", ecosystem: "Go", fixedIn: "0.7.0", aliases: ["CVE-2022-41723"], references: [] },
    { id: "GHSA-vvpx-j8f3-3w6h", cveId: "CVE-2023-28155", summary: "SSRF in request", severity: "MEDIUM", severityRank: 2, cvssScore: 6.1, package: "request", version: "2.88.2", ecosystem: "npm", fixedIn: null, aliases: ["CVE-2023-28155"], references: [] },
  ];

  const repos = [];
  for (let i = 0; i < 35; i++) {
    const project = projects[Math.floor(Math.random() * projects.length)];
    const repoName = repoNames[i % repoNames.length] + (i >= repoNames.length ? `-${Math.floor(i / repoNames.length)}` : "");
    const checks = {};
    const assessments = {};
    const vulnerabilities = [];

    for (const checkId of checkIds) {
      const rand = Math.random();
      if (rand < 0.6) checks[checkId] = true;
      else if (rand < 0.75) checks[checkId] = null;
      else {
        checks[checkId] = false;
        if (Math.random() < 0.6) {
          assessments[checkId] = "Anbefalt — bør konfigureres for bedre sikkerhet.";
        } else if (Math.random() < 0.5) {
          assessments[checkId] = "Ikke nødvendig — dette repoet har ingen relevante avhengigheter.";
        } else {
          assessments[checkId] = "Usikkert — kunne ikke vurdere automatisk.";
        }
      }
    }

    // Legg til tilfeldige faktiske sårbarheter for repos som feilet dep-vulns-sjekken
    if (checks["dep-vulns"] === false) {
      const numVulns = Math.floor(Math.random() * 5) + 1;
      const available = [...demoVulns].sort(() => Math.random() - 0.5);
      for (let v = 0; v < Math.min(numVulns, available.length); v++) {
        vulnerabilities.push({ ...available[v] });
      }
    }

    // Legg til eksempel på hvilke lintere som er i bruk for repos som bestod linting-sjekken
    if (checks["linting"] === true) {
      const linterCombos = [
        "Lintere funnet: ESLint, Prettier.",
        "Lintere funnet: Biome.",
        "Lintere funnet: ESLint.",
        "Lintere funnet: ESLint, Prettier, Stylelint.",
        "Lintere funnet: Ruff.",
        "Lintere funnet: Pylint, Ruff.",
        "Lintere funnet: Checkstyle, EditorConfig.",
      ];
      assessments["linting"] = linterCombos[i % linterCombos.length];
    }

    repos.push({ project, repo: repoName, checks, assessments, vulnerabilities });
  }

  const byCheck = {};
  for (const checkId of checkIds) {
    const passed = repos.filter(r => r.checks[checkId] === true).length;
    const notApplicable = repos.filter(r => r.checks[checkId] === null).length;
    const coveredByAlt = repos.filter(r =>
      r.checks[checkId] === false && r.assessments[checkId]?.startsWith("Ikke nødvendig")
    ).length;
    const failed = repos.filter(r => r.checks[checkId] === false).length - coveredByAlt;
    const applicable = repos.length - notApplicable;
    const covered = passed + coveredByAlt;
    byCheck[checkId] = {
      passed, failed, coveredByAlt, notApplicable,
      coveragePercent: applicable ? +((covered / applicable) * 100).toFixed(1) : 0,
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    checks: checkIds,
    summary: { total: repos.length, byCheck },
    repos,
  };
}

// ---------------------------------------------------------------------------
// Event-lyttere
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  // Navigasjon
  $$(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  // Fil-opplasting
  const fileInputs = [$("#file-input"), $("#file-input-landing")];
  fileInputs.forEach(input => {
    if (!input) return;
    input.addEventListener("change", (e) => {
      if (e.target.files.length > 0) handleFile(e.target.files[0]);
    });
  });

  // Drag & drop
  const landing = $("#landing");
  if (landing) {
    landing.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
    landing.addEventListener("drop", (e) => {
      e.preventDefault();
      if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });
  }

  // Demodata
  const demoBtn = $("#load-demo-btn");
  if (demoBtn) {
    demoBtn.addEventListener("click", () => loadReport(generateDemoData()));
  }

  // Detaljpanel lukking
  const detailClose = $("#detail-close");
  if (detailClose) detailClose.addEventListener("click", closeDetail);

  const detailOverlay = $(".detail-overlay");
  if (detailOverlay) detailOverlay.addEventListener("click", closeDetail);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDetail();
  });

  // Søk — sårbarhet-explorer
  const vulnSearchInput = $("#vuln-search-input");
  if (vulnSearchInput) {
    vulnSearchInput.addEventListener("input", () => {
      if (report) {
        const allVulns = buildVulnIndex();
        renderVulnList(allVulns);
      }
    });
  }

  const repoSearchInput = $("#repo-search-input");
  if (repoSearchInput) {
    repoSearchInput.addEventListener("input", () => {
      if (report) renderRepoTable();
    });
  }
});
