/* ================================================================
   Argus Frontend — Innlasting og validering av rapport
   ================================================================ */
"use strict";

import { state, resetFilters } from "../state.js";
import { CHECK_LABELS, CHECK_ICONS } from "../constants/checkLabels.js";
import { $, toast } from "../utils/dom.js";
import { formatDate } from "../utils/format.js";
import { renderActiveView } from "../views/router.js";

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
  state.report = data;
  state.checkMeta = data.checks.map(id => ({
    id,
    label: CHECK_LABELS[id] || id,
    icon: CHECK_ICONS[id] || "📋",
  }));

  resetFilters();

  $("#landing").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#report-meta").textContent = `Generert ${formatDate(data.generatedAt)} — ${data.summary.total} repos`;

  renderActiveView();
  toast("Rapport lastet!");
}
