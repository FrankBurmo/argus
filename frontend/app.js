/* ================================================================
   Argus Code Security — Frontend-applikasjon (entry point)

   Denne filen er bevisst tynn: den importerer moduler, eksponerer
   funksjoner som inline onclick-handlere trenger på `window`, og
   binder DOM-event-lyttere ved oppstart. All forretningslogikk og
   rendering ligger i moduler under js/.
   ================================================================ */
"use strict";

import { state } from "./js/state.js";
import { $, $$ } from "./js/utils/dom.js";
import { handleFile, loadReport } from "./js/data/report.js";
import { generateDemoData } from "./js/data/demo.js";
import { buildVulnIndex } from "./js/data/vulnIndex.js";
import { switchView } from "./js/views/router.js";
import { renderVulnList, toggleVulnFilter, exportFilteredIssuesJson } from "./js/views/vulnerabilities.js";
import { renderRepoTable, toggleFilter, filterByProject, filterByCheck } from "./js/views/repos.js";
import { showVulnDetail, exportVulnDetailHtml, exportVulnDetailMarkdown } from "./js/details/vulnDetail.js";
import { showRepoDetail } from "./js/details/repoDetail.js";
import { closeDetail } from "./js/details/panel.js";

// ---------------------------------------------------------------------------
// Globale handlere — kreves av inline onclick="..." i innerHTML-strenger.
// ---------------------------------------------------------------------------
window.toggleVulnFilter = toggleVulnFilter;
window.toggleFilter = toggleFilter;
window.filterByProject = filterByProject;
window.filterByCheck = filterByCheck;
window.showVulnDetail = showVulnDetail;
window.showRepoDetail = showRepoDetail;
window.exportVulnDetailHtml = exportVulnDetailHtml;
window.exportVulnDetailMarkdown = exportVulnDetailMarkdown;
window.exportFilteredIssuesJson = exportFilteredIssuesJson;

// ---------------------------------------------------------------------------
// Event-lyttere
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
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
