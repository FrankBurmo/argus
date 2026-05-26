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

// ---------------------------------------------------------------------------
// Team-konfig fra teams.json — tilordning og statistikkbygging
// ---------------------------------------------------------------------------

/**
 * Bygg Map fra "PROJECT/slug" → teamId basert på teams.json-konfig.
 * Prioritet: eksplisitt repos[] > projects[] > "unassigned"
 */
export function assignReposToTeams(repos, teamsConfig) {
  // Bygg eksplisitt repo-til-team-mapping (høyest prioritet)
  const explicitMap = new Map();
  for (const team of teamsConfig.teams) {
    if (!team.repos) continue;
    for (const entry of team.repos) {
      const key = `${entry.project}/${entry.repo}`;
      if (!explicitMap.has(key)) explicitMap.set(key, team.id);
    }
  }

  const assignment = new Map();
  for (const repo of repos) {
    const key = `${repo.project}/${repo.repo}`;

    if (explicitMap.has(key)) {
      assignment.set(key, explicitMap.get(key));
      continue;
    }

    let found = false;
    for (const team of teamsConfig.teams) {
      if (team.projects && team.projects.includes(repo.project)) {
        assignment.set(key, team.id);
        found = true;
        break;
      }
    }

    if (!found) assignment.set(key, "unassigned");
  }

  return assignment;
}

/**
 * Bygg data.teams[]-array fra repos og teams.json-konfig.
 * checkIds er arrayen fra rapport-JSON: ["secrets", "pipeline", ...]
 */
export function buildTeamsFromConfig(repos, teamsConfig, checkIds) {
  const assignment = assignReposToTeams(repos, teamsConfig);

  // Grupper repos per team
  const teamReposMap = new Map();
  for (const repo of repos) {
    const key = `${repo.project}/${repo.repo}`;
    const teamId = assignment.get(key) || "unassigned";
    if (!teamReposMap.has(teamId)) teamReposMap.set(teamId, []);
    teamReposMap.get(teamId).push(repo);
  }

  const teams = [];

  for (const team of teamsConfig.teams) {
    const teamRepos = teamReposMap.get(team.id) || [];
    teams.push(_buildTeamEntry(
      team.id, team.name, team.description || null,
      team.slackChannel || null, team.members || [],
      teamRepos, checkIds
    ));
  }

  const unassignedRepos = teamReposMap.get("unassigned") || [];
  if (unassignedRepos.length > 0) {
    teams.push(_buildTeamEntry(
      "unassigned", "Ikke tilordnet",
      "Repos som ikke er tilordnet noe team.",
      null, [], unassignedRepos, checkIds
    ));
  }

  return teams;
}

function _buildTeamEntry(id, name, description, slackChannel, members, repos, checkIds) {
  const byCheck = {};

  for (const checkId of checkIds) {
    const passed = repos.filter((r) => r.checks[checkId] === true).length;
    const na     = repos.filter((r) => r.checks[checkId] === null).length;
    const failed = repos.filter((r) => r.checks[checkId] === false).length;
    const applicable = repos.length - na;
    const score = applicable > 0 ? +((passed / applicable) * 100).toFixed(1) : null;
    byCheck[checkId] = { passed, failed, na, score };
  }

  const categoryScores = {};
  for (const [cat, ids] of Object.entries(CHECK_CATEGORIES)) {
    const scores = ids
      .map((cid) => byCheck[cid]?.score)
      .filter((s) => s !== null && s !== undefined);
    categoryScores[cat] = scores.length > 0
      ? +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
      : null;
  }

  const allScores = Object.values(byCheck)
    .map((c) => c.score)
    .filter((s) => s !== null && s !== undefined);
  const overallScore = allScores.length > 0
    ? +(allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(1)
    : 0;

  const vulnerabilities = { total: 0, critical: 0, high: 0, medium: 0, low: 0 };
  for (const repo of repos) {
    for (const v of (repo.vulnerabilities || [])) {
      vulnerabilities.total++;
      const sev = (v.severity || "").toUpperCase();
      if (sev === "CRITICAL")    vulnerabilities.critical++;
      else if (sev === "HIGH")   vulnerabilities.high++;
      else if (sev === "MEDIUM") vulnerabilities.medium++;
      else if (sev === "LOW")    vulnerabilities.low++;
    }
  }

  return {
    id,
    name,
    description,
    slackChannel,
    members,
    repoCount: repos.length,
    overallScore,
    categoryScores,
    byCheck,
    vulnerabilities,
    repos: repos.map((r) => `${r.project}/${r.repo}`),
  };
}
