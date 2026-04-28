/* ================================================================
   Argus Frontend — Visningsruter
   ================================================================ */
"use strict";

import { state } from "../state.js";
import { $, $$ } from "../utils/dom.js";
import { renderSummary } from "./summary.js";
import { renderExplorer } from "./vulnerabilities.js";
import { renderRepos } from "./repos.js";

/** Bytt aktiv visning og rendre den. */
export function switchView(view) {
  state.activeView = view;
  $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  $$(".view").forEach(v => v.classList.add("hidden"));
  $(`#view-${view}`).classList.remove("hidden");
  renderActiveView();
}

/** Rendre den aktive visningen — kalles ved navigasjon, filterendring m.m. */
export function renderActiveView() {
  if (!state.report) return;
  switch (state.activeView) {
    case "summary": renderSummary(); break;
    case "vulnerabilities": renderExplorer(); break;
    case "repos": renderRepos(); break;
  }
}
