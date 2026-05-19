/* ================================================================
   Argus Frontend — Visningsruter
   ================================================================ */
"use strict";

import { state } from "../state.js";
import { $, $$ } from "../utils/dom.js";
import { renderSummary } from "./summary.js";
import { renderExplorer } from "./vulnerabilities.js";
import { renderRepos } from "./repos.js";
import { renderTeamList, renderTeamDetail } from "./teams.js";

/** Bytt aktiv visning og rendre den. */
export function switchView(view) {
  state.activeView = view;

  // team-detail er en delvisning av teams — hold "teams"-knappen aktiv
  const navView = view === "team-detail" ? "teams" : view;
  $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === navView));
  $$(".view").forEach(v => v.classList.add("hidden"));

  const section = $(`#view-${view}`);
  if (section) section.classList.remove("hidden");

  renderActiveView();
}

/** Rendre den aktive visningen — kalles ved navigasjon, filterendring m.m. */
export function renderActiveView() {
  if (!state.report) return;
  switch (state.activeView) {
    case "summary":        renderSummary(); break;
    case "vulnerabilities": renderExplorer(); break;
    case "repos":          renderRepos(); break;
    case "teams":
      if (!state.hasTeams) { switchView("summary"); return; }
      renderTeamList();
      break;
    case "team-detail":
      if (!state.hasTeams || !state.activeTeam) { switchView("teams"); return; }
      renderTeamDetail(state.activeTeam);
      break;
  }
}
