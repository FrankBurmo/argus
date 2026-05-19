/* ================================================================
   Argus Frontend — Generisk fil-nedlasting via Blob
   ================================================================ */
"use strict";

import { state } from "../state.js";
import { getTeamData, getTeamRepos } from "../data/teamData.js";
import { toast } from "./dom.js";

export function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Eksporter team-spesifikk rapport som JSON. */
export function exportTeamReport(teamId) {
  const team = getTeamData(teamId);
  if (!team || !state.report) return;

  const teamRepos = getTeamRepos(teamId);
  const report = {
    generatedAt: new Date().toISOString(),
    team,
    checks: state.report.checks,
    repos: teamRepos,
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  downloadFile(
    `team-${teamId}-${stamp}.json`,
    JSON.stringify(report, null, 2),
    "application/json"
  );
  toast(`Eksporterte rapport for ${team.name}.`);
}
