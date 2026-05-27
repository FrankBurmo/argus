/* ================================================================
   Argus Frontend — Team-visning (liste og detaljside)
   ================================================================ */
"use strict";

import { state } from "../state.js";
import { $, escapeHtml } from "../utils/dom.js";
import { switchView } from "./router.js";
import {
  getAllTeams, getTeamData, getTeamRepos,
  teamHealthClass, teamHealthLabel,
  CHECK_CATEGORIES,
} from "../data/teamData.js";
import { CHECK_LABELS, CHECK_ICONS } from "../constants/checkLabels.js";
import { assessmentLevel, repoPriorityScore } from "../utils/assessment.js";
import { levelLabel } from "../utils/format.js";

// ---------------------------------------------------------------------------
// renderTeamList — kort-grid med alle team
// ---------------------------------------------------------------------------

export function renderTeamList() {
  const container = $("#teams-container");
  if (!container) return;

  const teams = getAllTeams();
  if (teams.length === 0) {
    container.innerHTML = `<div class="teams-empty">Ingen team-data tilgjengelig i denne rapporten.</div>`;
    return;
  }

  const f = state.teamFilters;

  // Sorter
  let sorted = [...teams];
  if (f.sortBy === "score") {
    sorted.sort((a, b) => f.sortDir === "asc"
      ? a.overallScore - b.overallScore
      : b.overallScore - a.overallScore);
  } else if (f.sortBy === "name") {
    sorted.sort((a, b) => a.name.localeCompare(b.name, "nb"));
  } else if (f.sortBy === "repos") {
    sorted.sort((a, b) => f.sortDir === "asc"
      ? a.repoCount - b.repoCount
      : b.repoCount - a.repoCount);
  }

  // Filtrer
  if (f.criticalOnly) sorted = sorted.filter(t => t.overallScore < 50);
  if (f.withVulnsOnly) sorted = sorted.filter(t => t.vulnerabilities.total > 0);

  const criticalBtn = f.criticalOnly
    ? `<button class="filter-toggle active" onclick="setTeamFilter('criticalOnly', ${!f.criticalOnly})">Bare kritiske</button>`
    : `<button class="filter-toggle" onclick="setTeamFilter('criticalOnly', ${!f.criticalOnly})">Bare kritiske</button>`;
  const vulnsBtn = f.withVulnsOnly
    ? `<button class="filter-toggle active" onclick="setTeamFilter('withVulnsOnly', ${!f.withVulnsOnly})">Med sårbarheter</button>`
    : `<button class="filter-toggle" onclick="setTeamFilter('withVulnsOnly', ${!f.withVulnsOnly})">Med sårbarheter</button>`;

  const sortDirLabel = f.sortDir === "asc" ? "↑" : "↓";

  container.innerHTML = `
    <div class="teams-toolbar">
      <select onchange="setTeamSort(this.value)">
        <option value="score_asc"  ${f.sortBy === "score"  && f.sortDir === "asc"  ? "selected" : ""}>Score (lavest først)</option>
        <option value="score_desc" ${f.sortBy === "score"  && f.sortDir === "desc" ? "selected" : ""}>Score (høyest først)</option>
        <option value="name_asc"   ${f.sortBy === "name"                           ? "selected" : ""}>Alfabetisk</option>
        <option value="repos_desc" ${f.sortBy === "repos"  && f.sortDir === "desc" ? "selected" : ""}>Flest repos</option>
      </select>
      ${criticalBtn}
      ${vulnsBtn}
      <span style="margin-left: auto; font-size: 0.8rem; color: var(--text-muted);">${sorted.length} team</span>
    </div>
    <div class="teams-grid">
      ${sorted.map(team => renderTeamCard(team)).join("")}
    </div>
  `;
}

function renderTeamCard(team) {
  const hClass = teamHealthClass(team.overallScore);
  const hLabel = teamHealthLabel(team.overallScore);
  const initials = team.name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();

  const catDefs = [
    { key: "sikkerhet",  label: "Sikkerhet",   cls: "cat-sikkerhet" },
    { key: "devops",     label: "DevOps",       cls: "cat-devops"    },
    { key: "governance", label: "Governance",   cls: "cat-governance"},
  ];

  const catBars = catDefs.map(({ key, label, cls }) => {
    const pct = team.categoryScores[key] ?? 0;
    return `
      <div class="team-category-row">
        <span class="team-category-label">${label}</span>
        <div class="team-category-bar-bg">
          <div class="team-category-bar-fill ${cls}" style="width: ${pct}%"></div>
        </div>
        <span class="team-category-pct">${pct !== null ? pct.toFixed(0) + "%" : "–"}</span>
      </div>`;
  }).join("");

  // Sirkulær SVG-indicator
  const r = 22, circ = 2 * Math.PI * r;
  const dash = (team.overallScore / 100) * circ;
  const hColor = team.overallScore >= 80 ? "var(--color-good)" : team.overallScore >= 50 ? "var(--color-warn)" : "var(--color-critical)";

  const vulnMeta = team.vulnerabilities.total > 0
    ? `<span class="team-meta-vulns">⚠ ${team.vulnerabilities.total} sårb. (${team.vulnerabilities.critical} krit.)</span>`
    : `<span style="color: var(--color-good);">✓ Ingen sårbarheter</span>`;

  return `
    <div class="team-card" onclick="showTeamDetail('${escapeHtml(team.id)}')">
      <div class="team-card-header">
        <div class="team-avatar">${escapeHtml(initials)}</div>
        <div class="team-card-title-block">
          <p class="team-card-name">${escapeHtml(team.name)}</p>
          <p class="team-card-desc">${escapeHtml(team.description || "")}</p>
        </div>
        <span class="health-badge ${hClass}">${hLabel}</span>
      </div>

      <div class="team-score-row">
        <div class="team-score-ring">
          <svg width="56" height="56" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="${r}" fill="none" stroke="var(--border)" stroke-width="5"/>
            <circle cx="28" cy="28" r="${r}" fill="none" stroke="${hColor}" stroke-width="5"
              stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}" stroke-linecap="round"/>
          </svg>
          <div class="team-score-ring-text">${team.overallScore.toFixed(0)}%</div>
        </div>
        <div class="team-categories">${catBars}</div>
      </div>

      <div class="team-card-meta">
        <span>${team.repoCount} repos</span>
        ${vulnMeta}
        <button class="team-card-action" onclick="event.stopPropagation(); showTeamDetail('${escapeHtml(team.id)}')">Vis detaljer →</button>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// renderTeamDetail — detaljside for ett team
// ---------------------------------------------------------------------------

export function renderTeamDetail(teamId) {
  const container = $("#team-detail-container");
  if (!container) return;

  const team = getTeamData(teamId);
  if (!team) {
    container.innerHTML = `<div class="teams-empty">Fant ikke team med ID '${escapeHtml(teamId)}'.</div>`;
    return;
  }

  const hClass = teamHealthClass(team.overallScore);
  const hLabel = teamHealthLabel(team.overallScore);
  const initials = team.name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const checkMeta = state.checkMeta;
  const teamRepoObjects = getTeamRepos(teamId);

  // ── Header ──
  const metaParts = [`${team.repoCount} repos`];
  if (team.members && team.members.length > 0) metaParts.push(team.members.join(", "));
  if (team.slackChannel) metaParts.push(team.slackChannel);

  // ── Kategori-infokort ──
  const catCards = [
    { key: "sikkerhet",  label: "Sikkerhet",   cls: "cat-sikkerhet"  },
    { key: "devops",     label: "DevOps-modenhet", cls: "cat-devops" },
    { key: "governance", label: "Governance",   cls: "cat-governance" },
  ].map(({ key, label, cls }) => {
    const score = team.categoryScores[key];
    const scoreStr = score !== null && score !== undefined ? score.toFixed(1) + "%" : "–";
    const catHealth = score !== null ? teamHealthClass(score) : "health-warn";
    const catLabel  = score !== null ? teamHealthLabel(score)  : "Ukjent";
    return `
      <div class="team-cat-card ${cls}">
        <div class="team-cat-card-label">${label}</div>
        <div class="team-cat-card-score">${scoreStr}</div>
        <span class="health-badge ${catHealth}">${catLabel}</span>
      </div>`;
  }).join("");

  // ── Sjekk-breakdown-tabell ──
  const catForCheck = {};
  for (const [cat, ids] of Object.entries(CHECK_CATEGORIES)) {
    for (const id of ids) catForCheck[id] = cat;
  }

  const allCheckIds = state.report?.checks || [];
  const checkRows = allCheckIds.map(checkId => {
    const stat = team.byCheck[checkId];
    const label = CHECK_LABELS[checkId] || checkId;
    const icon  = CHECK_ICONS[checkId]  || "📋";
    if (!stat) return "";

    const total = stat.passed + stat.failed + stat.na;
    const applicable = total - stat.na;
    const pct = stat.score ?? 0;
    const barClass = pct >= 80 ? "bar-good" : pct >= 50 ? "bar-warn" : "bar-critical";
    const statusIcon = pct >= 80 ? "✅" : pct >= 50 ? "⚠️" : "❌";
    const pctStr = stat.score !== null ? stat.score.toFixed(1) + "%" : "–";

    // Repos som feiler denne sjekken
    const failingRepos = teamRepoObjects.filter(r => r.checks[checkId] === false);
    const expandId = `chk-expand-${escapeHtml(checkId)}`;

    const failRepoTags = failingRepos.map(r =>
      `<span class="check-expand-repo-tag"
             onclick="event.stopPropagation(); showRepoDetail('${escapeHtml(r.project)}', '${escapeHtml(r.repo)}')"
             title="Åpne repo-detaljer">${escapeHtml(r.project)}/${escapeHtml(r.repo)}</span>`
    ).join("");

    return `
      <tr class="check-row" onclick="toggleTeamCheckRow('${escapeHtml(checkId)}')">
        <td>${icon} ${escapeHtml(label)}</td>
        <td>
          <div class="check-bar-bg">
            <div class="check-bar-fill ${barClass}" style="width: ${pct}%"></div>
          </div>
        </td>
        <td>${stat.passed} / ${applicable}${stat.na > 0 ? ` <span style="color:var(--text-muted); font-size:0.75rem;">(${stat.na} N/A)</span>` : ""}</td>
        <td>${pctStr}</td>
        <td class="check-status-icon">${statusIcon}</td>
      </tr>
      ${failingRepos.length > 0 ? `
      <tr class="check-expand-row" id="${expandId}" style="display: none;">
        <td colspan="5">
          <span style="font-size: 0.78rem; color: var(--text-muted);">Repos som feiler:</span>
          <div class="check-expand-repos">${failRepoTags}</div>
        </td>
      </tr>` : ""}`;
  }).join("");

  // ── Repo-tabell ──
  const repoRows = [...teamRepoObjects]
    .sort((a, b) => repoPriorityScore(b) - repoPriorityScore(a))
    .slice(0, 50)
    .map(repo => {
      let cells = `<td><span class="project-tag">${escapeHtml(repo.project)}</span><span class="repo-name">${escapeHtml(repo.repo)}</span></td>`;
      for (const chk of checkMeta) {
        const level = assessmentLevel(repo, chk.id);
        const title = repo.assessments?.[chk.id] || levelLabel(level);
        let iconHtml;
        switch (level) {
          case "pass":   iconHtml = `<span class="status-icon status-pass" title="${escapeHtml(title)}">✓</span>`; break;
          case "action": iconHtml = `<span class="status-icon status-fail" title="${escapeHtml(title)}">!</span>`; break;
          case "fail":   iconHtml = `<span class="status-icon status-warn" title="${escapeHtml(title)}">✕</span>`; break;
          case "na":     iconHtml = `<span class="status-icon status-na" title="${escapeHtml(title)}">–</span>`;  break;
          default:       iconHtml = `<span class="status-icon status-na" title="${escapeHtml(title)}">?</span>`;  break;
        }
        cells += `<td style="text-align:center">${iconHtml}</td>`;
      }
      const score = repoPriorityScore(repo);
      const scoreSev = score >= 30 ? "critical" : score >= 20 ? "high" : score >= 10 ? "medium" : "low";
      cells += `<td><span class="severity-indicator severity-${scoreSev}">${score}</span></td>`;
      return `<tr onclick="showRepoDetail('${escapeHtml(repo.project)}', '${escapeHtml(repo.repo)}')">${cells}</tr>`;
    }).join("");

  let headerCells = "<th>Repository</th>";
  for (const chk of checkMeta) {
    headerCells += `<th title="${escapeHtml(chk.label)}" style="text-align:center">${chk.icon}</th>`;
  }
  headerCells += "<th>Score</th>";

  // ── Sårbarhetsseksjon ──
  const allVulns = [];
  for (const repo of teamRepoObjects) {
    for (const v of (repo.vulnerabilities || [])) {
      allVulns.push({ vuln: v, repoKey: `${repo.project}/${repo.repo}` });
    }
  }
  allVulns.sort((a, b) => (b.vuln.cvssScore || 0) - (a.vuln.cvssScore || 0));

  const vulnRows = allVulns.slice(0, 10).map(({ vuln, repoKey }) => {
    const sevClass = (vuln.severity || "unknown").toLowerCase();
    const cveDisplay = vuln.cveId || vuln.id;
    return `
      <div class="team-vuln-item">
        <span class="team-vuln-sev ${sevClass}">${sevClass.toUpperCase()}</span>
        <span class="team-vuln-summary">${escapeHtml(vuln.summary || cveDisplay)}</span>
        <span class="team-vuln-pkg">📦 ${escapeHtml(vuln.package)}</span>
        <span style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(repoKey)}</span>
      </div>`;
  }).join("");

  const vulnSection = allVulns.length > 0
    ? `<div class="team-vuln-list">${vulnRows}</div>
       ${allVulns.length > 10 ? `<button class="team-view-all-link" onclick="filterVulnsByTeam('${escapeHtml(team.id)}')">Vis alle ${allVulns.length} sårbarheter →</button>` : ""}`
    : `<p style="color: var(--color-good);">✅ Ingen kjente sårbarheter for dette teamets repos.</p>`;

  // Admin er på separat side («team-admin»-visning)

  container.innerHTML = `
    <div class="team-detail-actions">
      <button class="team-detail-back" onclick="switchToTeams()">← Alle team</button>
      ${state.teamsConfig ? `<button class="btn-admin-team" onclick="showTeamAdmin('${escapeHtml(team.id)}')"> ⚙ Administrer team</button>` : ""}
    </div>

    <div class="team-detail-header">
      <div class="team-detail-avatar">${escapeHtml(initials)}</div>
      <div class="team-detail-info">
        <h2 class="team-detail-name">${escapeHtml(team.name)}</h2>
        <div class="team-detail-meta">
          ${metaParts.map(p => `<span>${escapeHtml(p)}</span>`).join("")}
        </div>
        ${team.description ? `<p style="font-size:0.82rem; color:var(--text-muted); margin-top:0.4rem;">${escapeHtml(team.description)}</p>` : ""}
      </div>
      <div class="team-detail-score-block">
        <div class="team-detail-score-val">${team.overallScore.toFixed(1)}%</div>
        <span class="health-badge ${hClass}">${hLabel}</span>
      </div>
    </div>

    <div class="team-category-cards">${catCards}</div>

    <div class="card card-full" style="margin-bottom: 1.5rem;">
      <h3 class="card-title">Sjekk-breakdown</h3>
      <table class="check-breakdown-table">
        <thead>
          <tr>
            <th>Sjekk</th>
            <th>Dekning</th>
            <th>Repos som består</th>
            <th>Score</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${checkRows}</tbody>
      </table>
    </div>

    <div class="card card-full" style="margin-bottom: 1.5rem;">
      <h3 class="card-title">Repositories (${teamRepoObjects.length})</h3>
      ${teamRepoObjects.length > 0 ? `
        <div class="table-container">
          <table class="data-table">
            <thead><tr>${headerCells}</tr></thead>
            <tbody>${repoRows}</tbody>
          </table>
          ${teamRepoObjects.length > 50 ? `<p style="color:var(--text-muted); padding:0.75rem; font-size:0.8rem;">Viser 50 av ${teamRepoObjects.length} repos.</p>` : ""}
        </div>` : `<p style="color:var(--text-muted); padding:1rem;">Ingen repos tilordnet dette teamet.</p>`}
    </div>

    <div class="card card-full">
      <h3 class="card-title">Sårbarheter</h3>
      ${vulnSection}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// renderTeamAdmin — separat admin-side for ett team
// ---------------------------------------------------------------------------

export function renderTeamAdmin(teamId) {
  const container = document.getElementById("team-admin-container");
  if (!container) return;

  const team = getTeamData(teamId);
  if (!team) {
    container.innerHTML = `<div class="teams-empty">Fant ikke team med ID '${escapeHtml(teamId)}'.</div>`;
    return;
  }

  const teamRepoObjects = getTeamRepos(teamId);

  container.innerHTML = `
    <div class="team-detail-actions">
      <button class="team-detail-back" onclick="showTeamDetail('${escapeHtml(team.id)}')"> ← Tilbake til teamstatus</button>
      <button class="btn-export-mapping" onclick="downloadTeamMapping()">⬇ Eksporter team-mapping</button>
    </div>

    <div class="team-admin-page-header">
      <h2>⚙ Administrer: ${escapeHtml(team.name)}</h2>
    </div>

    <div class="card card-full team-admin-card">
      <h3 class="card-title">Team-innstillinger</h3>
      <div class="team-admin-form">
        <div class="team-admin-field">
          <label>Slack-kanal</label>
          <input type="text" id="admin-slack" placeholder="#team-navn"
                 value="${escapeHtml(team.slackChannel || "")}" />
        </div>
        <div class="team-admin-field">
          <label>Beskrivelse</label>
          <input type="text" id="admin-desc" placeholder="Kort beskrivelse av teamet"
                 value="${escapeHtml(team.description || "")}" />
        </div>
        <div class="team-admin-field">
          <label>Medlemmer <span class="team-admin-field-hint">(kommaseparert)</span></label>
          <input type="text" id="admin-members" placeholder="alice, bob, charlie"
                 value="${escapeHtml((team.members || []).join(", "))}" />
        </div>
        <button class="btn-save-meta" onclick="saveTeamMeta('${escapeHtml(team.id)}')">Lagre innstillinger</button>
      </div>
    </div>

    <div class="card card-full team-admin-card">
      <h3 class="card-title">📁 Repos eid av teamet (${teamRepoObjects.length})</h3>
      ${renderOwnedReposSection(team.id, teamRepoObjects)}
    </div>

    <div class="card card-full team-admin-card">
      <h3 class="card-title">➕ Legg til repos i teamet</h3>
      <p class="team-admin-hint">Repos som ikke er tilordnet dette teamet. Klikk for å legge til.</p>
      <input type="text" id="admin-repo-search" class="team-unowned-search"
             placeholder="Søk etter repo..." oninput="filterUnownedRepos()" />
      ${renderUnownedReposSection(team.id, teamRepoObjects)}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Admin-hjelpere — eide og ikke-eide repos
// ---------------------------------------------------------------------------

/**
 * Bygg HTML for listen over repos eid av teamet, gruppert per Bitbucket-prosjekt.
 * Eksplisitte repos (fra repos[]) får fjern-knapp; prosjekt-baserte repos får ℹ-indikator.
 */
function renderOwnedReposSection(teamId, teamRepoObjects) {
  if (teamRepoObjects.length === 0) {
    return `<p style="color:var(--text-muted); padding:0.5rem 0;">Ingen repos tilordnet dette teamet ennå.</p>`;
  }

  // Finn eksplisitte repos fra rå konfig
  const cfgTeam     = state.teamsConfig?.teams.find(t => t.id === teamId);
  const explicitSet = new Set((cfgTeam?.repos || []).map(r => `${r.project}/${r.repo}`));

  // Grupper etter prosjekt, sorter
  const byProject = new Map();
  for (const repo of teamRepoObjects) {
    if (!byProject.has(repo.project)) byProject.set(repo.project, []);
    byProject.get(repo.project).push(repo);
  }
  const sortedProjects = [...byProject.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return sortedProjects.map(([project, repos]) => {
    const reposSorted = [...repos].sort((a, b) => a.repo.localeCompare(b.repo));
    const rows = reposSorted.map(repo => {
      const key        = `${repo.project}/${repo.repo}`;
      const isExplicit = explicitSet.has(key);
      const action     = isExplicit
        ? `<button class="btn-remove-repo"
                   onclick="removeRepoFromTeam('${escapeHtml(teamId)}','${escapeHtml(repo.project)}','${escapeHtml(repo.repo)}')"
                   title="Fjern fra teamet">✕</button>`
        : `<span class="repo-implicit-badge"
                 title="Tilordnet via projects[]-mapping i konfigen — rediger konfig-filen for å endre.">ℹ</span>`;
      return `<div class="repo-row">
        <span class="repo-row-name">${escapeHtml(repo.repo)}</span>
        ${action}
      </div>`;
    }).join("");

    return `<div class="repo-group">
      <div class="repo-group-header">
        <span class="project-tag">${escapeHtml(project)}</span>
        <span class="repo-group-count">${repos.length}</span>
      </div>
      <div class="repo-group-list">${rows}</div>
    </div>`;
  }).join("");
}

/**
 * Bygg HTML for listen over repos IKKE eid av teamet, gruppert per Bitbucket-prosjekt.
 */
function renderUnownedReposSection(teamId, teamRepoObjects) {
  if (!state.report?.repos) return "";

  const ownedSet = new Set(teamRepoObjects.map(r => `${r.project}/${r.repo}`));
  const unowned  = state.report.repos.filter(r => !ownedSet.has(`${r.project}/${r.repo}`));

  if (unowned.length === 0) {
    return `<p style="color:var(--color-good); padding:0.5rem 0;">✓ Alle repos i rapporten er allerede tilordnet dette teamet.</p>`;
  }

  const byProject = new Map();
  for (const repo of unowned) {
    if (!byProject.has(repo.project)) byProject.set(repo.project, []);
    byProject.get(repo.project).push(repo);
  }
  const sortedProjects = [...byProject.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const groups = sortedProjects.map(([project, repos]) => {
    const reposSorted = [...repos].sort((a, b) => a.repo.localeCompare(b.repo));
    const rows = reposSorted.map(repo => `
      <div class="repo-row repo-unowned-item"
           data-search="${escapeHtml(repo.repo.toLowerCase())} ${escapeHtml(project.toLowerCase())}">
        <span class="repo-row-name">${escapeHtml(repo.repo)}</span>
        <button class="btn-add-repo"
                onclick="addRepoToTeam('${escapeHtml(teamId)}','${escapeHtml(repo.project)}','${escapeHtml(repo.repo)}')"
                title="Legg til i teamet">+ Legg til</button>
      </div>`).join("");

    return `<div class="repo-group repo-unowned-group">
      <div class="repo-group-header">
        <span class="project-tag">${escapeHtml(project)}</span>
        <span class="repo-group-count">${repos.length}</span>
      </div>
      <div class="repo-group-list">${rows}</div>
    </div>`;
  }).join("");

  return `<div id="unowned-repos-list">${groups}</div>`;
}

// ---------------------------------------------------------------------------
// Globale hjelpere eksponert via app.js → window
// ---------------------------------------------------------------------------

/** Klient-side søkefiltrering i ikke-eide repos-listen. */
export function filterUnownedRepos() {
  const input  = document.getElementById("admin-repo-search");
  const term   = (input?.value ?? "").toLowerCase().trim();
  const items  = document.querySelectorAll(".repo-unowned-item");
  const groups = document.querySelectorAll(".repo-unowned-group");

  items.forEach(item => {
    const match = !term || (item.dataset.search || "").includes(term);
    item.style.display = match ? "" : "none";
  });

  // Skjul prosjektgrupper uten synlige repos
  groups.forEach(group => {
    const anyVisible = [...group.querySelectorAll(".repo-unowned-item")]
      .some(el => el.style.display !== "none");
    group.style.display = anyVisible ? "" : "none";
  });
}

export function showTeamDetail(teamId) {
  state.activeTeam = teamId;
  switchView("team-detail");
}

export function showTeamAdmin(teamId) {
  state.activeTeam = teamId;
  switchView("team-admin");
}

export function switchToTeams() {
  state.activeTeam = null;
  switchView("teams");
}

export function setTeamSort(value) {
  const [sortBy, sortDir] = value.split("_");
  state.teamFilters.sortBy  = sortBy;
  state.teamFilters.sortDir = sortDir || "asc";
  renderTeamList();
}

export function setTeamFilter(key, value) {
  state.teamFilters[key] = value;
  renderTeamList();
}

export function toggleTeamCheckRow(checkId) {
  const row = document.getElementById(`chk-expand-${checkId}`);
  if (row) row.style.display = row.style.display === "none" ? "" : "none";
}

export function filterVulnsByTeam(teamId) {
  const team = getTeamData(teamId);
  if (!team) return;
  // Samle prosjektene til teamets repos og filtrer vulns
  const projects = [...new Set(team.repos.map(key => key.split("/")[0]))];
  state.vulnFilters = {
    severity: [], ecosystem: [], projects, fixAvailable: [], team: [teamId],
  };
  switchView("vulnerabilities");
}
