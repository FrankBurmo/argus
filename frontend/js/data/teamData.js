/* ================================================================
   Argus Frontend — Team-data hjelpere
   ================================================================ */
"use strict";

import { state } from "../state.js";

export const CHECK_CATEGORIES = {
  sikkerhet:  ["secrets", "branch-protection", "dep-vulns", "npm-audit", "owasp-dep-check"],
  devops:     ["pipeline", "renovate", "linting", "tests", "pr-activity"],
  governance: ["readme", "stale", "codeowners"],
};

/** Returner alle team fra rapporten, eller tom liste om rapport ikke har team-data. */
export function getAllTeams() {
  return state.report?.teams ?? [];
}

/** Hent ett team på ID — returnerer null om ikke funnet. */
export function getTeamData(teamId) {
  return getAllTeams().find((t) => t.id === teamId) ?? null;
}

/** Hent repo-objekter (fra report.repos) som tilhører gitt team. */
export function getTeamRepos(teamId) {
  const team = getTeamData(teamId);
  if (!team || !state.report?.repos) return [];
  const repoKeys = new Set(team.repos);
  return state.report.repos.filter((r) => repoKeys.has(`${r.project}/${r.repo}`));
}

/** CSS-klasse basert på score (health-good / health-warn / health-critical). */
export function teamHealthClass(score) {
  if (score >= 80) return "health-good";
  if (score >= 50) return "health-warn";
  return "health-critical";
}

/** Lesebart statusord basert på score. */
export function teamHealthLabel(score) {
  if (score >= 80) return "God";
  if (score >= 50) return "Trenger tiltak";
  return "Kritisk";
}

/** Finn teamId for et gitt repo (PROJECT/slug). */
export function getTeamForRepo(projectKey, repoSlug) {
  const key = `${projectKey}/${repoSlug}`;
  for (const team of getAllTeams()) {
    if (team.repos.includes(key)) return team.id;
  }
  return null;
}
