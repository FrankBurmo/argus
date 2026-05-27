/* ================================================================
   Argus Frontend — Innlasting og validering av rapport
   ================================================================ */
"use strict";

import { state, resetFilters } from "../state.js";
import { CHECK_LABELS, CHECK_ICONS } from "../constants/checkLabels.js";
import { $, toast } from "../utils/dom.js";
import { formatDate } from "../utils/format.js";
import { renderActiveView } from "../views/router.js";
import { buildTeamsFromConfig } from "./teamData.js";

/**
 * Re-anvender gjeldende teamsConfig på allerede lastet rapport.
 * Brukes når en ny team-mapping lastes opp etter at rapport er lastet inn.
 */
export function reapplyTeams() {
  if (!state.report) return;
  delete state.report.teams;
  normalizeTeams(state.report);
  state.hasTeams = Array.isArray(state.report.teams) && state.report.teams.length > 0;
  const teamsNavBtn = document.querySelector('[data-view="teams"]');
  if (teamsNavBtn) teamsNavBtn.classList.toggle("hidden", !state.hasTeams);
  renderActiveView();
}

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
// Normalisering av team-data
// ---------------------------------------------------------------------------

/**
 * Bygger data.teams[]-arrayen fra teams.json-konfig og rapport-repos.
 * Gjør ingenting hvis data.teams allerede finnes (bakoverkompatibilitet).
 */
function normalizeTeams(data) {
  if (Array.isArray(data.teams) && data.teams.length > 0) return;
  if (!state.teamsConfig) return;
  data.teams = buildTeamsFromConfig(data.repos || [], state.teamsConfig, data.checks || []);
}
