/* ================================================================
   Argus Code Security — Frontend-applikasjon (entry point)

   Denne filen er bevisst tynn: den importerer moduler, eksponerer
   funksjoner som inline onclick-handlere trenger på `window`, og
   binder DOM-event-lyttere ved oppstart. All forretningslogikk og
   rendering ligger i moduler under js/.
   ================================================================ */
"use strict";

import { state } from "./js/state.js";
import { $, $$, toast } from "./js/utils/dom.js";
import { handleFile, loadReport, reapplyTeams } from "./js/data/report.js";
import { loadTeamMappingFromStorage, saveTeamMapping, validateTeamMapping, updateTeamMetaInConfig, addRepoToTeamConfig, removeRepoFromTeamConfig, downloadTeamMappingJson } from "./js/data/teamMapping.js";
import { generateDemoData } from "./js/data/demo.js";
import { buildVulnIndex } from "./js/data/vulnIndex.js";
import { switchView } from "./js/views/router.js";
import { renderVulnList, toggleVulnFilter, exportFilteredIssuesJson } from "./js/views/vulnerabilities.js";
import { renderRepoTable, toggleFilter, filterByProject, filterByCheck, setRepoTeamFilter } from "./js/views/repos.js";
import { showVulnDetail, exportVulnDetailHtml, exportVulnDetailMarkdown } from "./js/details/vulnDetail.js";
import { showRepoDetail } from "./js/details/repoDetail.js";
import { closeDetail } from "./js/details/panel.js";
import { showTeamDetail, switchToTeams, setTeamSort, setTeamFilter, toggleTeamCheckRow, filterVulnsByTeam, filterUnownedRepos, showTeamAdmin } from "./js/views/teams.js";
import { exportTeamReport } from "./js/utils/download.js";

// ---------------------------------------------------------------------------
// Globale handlere — kreves av inline onclick="..." i innerHTML-strenger.
// ---------------------------------------------------------------------------
window.toggleVulnFilter = toggleVulnFilter;
window.toggleFilter = toggleFilter;
window.filterByProject = filterByProject;
window.filterByCheck = filterByCheck;
window.setRepoTeamFilter = setRepoTeamFilter;
window.showVulnDetail = showVulnDetail;
window.showRepoDetail = showRepoDetail;
window.exportVulnDetailHtml = exportVulnDetailHtml;
window.exportVulnDetailMarkdown = exportVulnDetailMarkdown;
window.exportFilteredIssuesJson = exportFilteredIssuesJson;
window.showTeamDetail = showTeamDetail;
window.switchToTeams = switchToTeams;
window.setTeamSort = setTeamSort;
window.setTeamFilter = setTeamFilter;
window.toggleTeamCheckRow = toggleTeamCheckRow;
window.filterVulnsByTeam = filterVulnsByTeam;
window.showTeamAdmin = showTeamAdmin;
window.exportTeamReport = exportTeamReport;
window.filterUnownedRepos = filterUnownedRepos;
window.downloadTeamMapping = () => downloadTeamMappingJson();
window.saveTeamMeta = function(teamId) {
  const slackInput   = document.getElementById("admin-slack");
  const descInput    = document.getElementById("admin-desc");
  const membersInput = document.getElementById("admin-members");
  updateTeamMetaInConfig(teamId, {
    slackChannel: slackInput?.value.trim() ?? "",
    description:  descInput?.value.trim()  ?? "",
    members: (membersInput?.value ?? "").split(",").map(m => m.trim()).filter(Boolean),
  });
  reapplyTeams();
  toast("Team-innstillinger lagret!");
};
window.addRepoToTeam = function(teamId, project, repo) {
  addRepoToTeamConfig(teamId, project, repo);
  reapplyTeams();
};
window.removeRepoFromTeam = function(teamId, project, repo) {
  removeRepoFromTeamConfig(teamId, project, repo);
  reapplyTeams();
};

// ---------------------------------------------------------------------------
// Event-lyttere
// ---------------------------------------------------------------------------
/** Oppdater visuell status-badge for team-mapping i topplinjen. */
function updateTeamMappingStatus(active) {
  const badge = document.getElementById("team-mapping-status");
  if (!badge) return;
  badge.textContent = active ? "Mapping aktiv" : "Ingen mapping";
  badge.classList.toggle("mapping-status--active", active);
}

document.addEventListener("DOMContentLoaded", () => {
  // Gjenopprett team-mapping fra localStorage (tar prioritet over statisk teams.json)
  const savedMapping = loadTeamMappingFromStorage();
  if (savedMapping) state.teamsConfig = savedMapping;
  updateTeamMappingStatus(!!savedMapping);

  // Last inn team-konfig fra teams.json (valgfri statisk fil i frontend-roten)
  fetch("teams.json")
    .then((r) => r.ok ? r.json() : null)
    .then((json) => {
      // Statisk teams.json settes bare om ingen localStorage-mapping allerede er satt
      if (json?.teams && !state.teamsConfig) state.teamsConfig = json;
    })
    .catch(() => {}); // Ignorer feil — teams.json er valgfri

  // Navigasjon
  $$(".nav-btn[data-view]").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  // Logo-klikk → Oversikt
  const logoBrand = $("#logo-home");
  if (logoBrand) logoBrand.addEventListener("click", () => switchView("summary"));

  // Fil-opplasting (alle inputs)
  const fileInputs = [$("#file-input"), $("#file-input-landing"), $("#file-input-landing-bottom")];
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

  // Demodata (begge knapper)
  const demoBtns = [$("#load-demo-btn"), $("#load-demo-btn-bottom")];
  demoBtns.forEach(btn => {
    if (btn) btn.addEventListener("click", () => loadReport(generateDemoData()));
  });

  // Team-mapping opplasting
  const teamMappingInput = $("#team-mapping-input");
  if (teamMappingInput) {
    teamMappingInput.addEventListener("change", (e) => {
      if (!e.target.files.length) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target.result);
          if (!validateTeamMapping(parsed)) {
            toast("Ugyldig team-mapping — filen mangler teams-array.");
            return;
          }
          saveTeamMapping(parsed);
          state.teamsConfig = parsed;
          updateTeamMappingStatus(true);
          reapplyTeams();
          toast("Team-mapping lastet!");
        } catch (err) {
          toast("Kunne ikke lese JSON: " + err.message);
        }
      };
      reader.readAsText(e.target.files[0]);
      e.target.value = ""; // Reset slik at samme fil kan lastes opp på nytt
    });
  }

  // Detaljpanel lukking
  const detailClose = $("#detail-close");
  if (detailClose) detailClose.addEventListener("click", closeDetail);

  const detailOverlay = $(".detail-overlay");
  if (detailOverlay) detailOverlay.addEventListener("click", closeDetail);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDetail();
  });

  // Søk — sårbarhets-explorer
  const vulnSearchInput = $("#vuln-search-input");
  if (vulnSearchInput) {
    vulnSearchInput.addEventListener("input", () => {
      if (state.report) renderVulnList(buildVulnIndex());
    });
  }

  // Søk — repo-tabell
  const repoSearchInput = $("#repo-search-input");
  if (repoSearchInput) {
    repoSearchInput.addEventListener("input", () => {
      if (state.report) renderRepoTable();
    });
  }
});
