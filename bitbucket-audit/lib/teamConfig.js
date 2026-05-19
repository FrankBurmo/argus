"use strict";

// ---------------------------------------------------------------------------
// Sjekk-kategorier — brukes ved beregning av kategoriscore
// ---------------------------------------------------------------------------

const CHECK_CATEGORIES = {
  sikkerhet:  ["secrets", "branch-protection", "dep-vulns", "npm-audit", "owasp-dep-check"],
  devops:     ["pipeline", "renovate", "linting", "tests", "pr-activity"],
  governance: ["readme", "stale", "codeowners"],
};

// ---------------------------------------------------------------------------
// loadTeamConfig — les og valider teams.json
// ---------------------------------------------------------------------------

function loadTeamConfig(filePath) {
  const fs = require("fs");

  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    throw new Error(`Kunne ikke lese teams.json: ${err.message}`);
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Ugyldig JSON i teams.json: ${err.message}`);
  }

  if (!config.teams || !Array.isArray(config.teams)) {
    throw new Error("teams.json mangler 'teams'-array.");
  }

  const teamIds = new Set();
  for (const team of config.teams) {
    if (!team.id)   throw new Error(`Et team mangler påkrevd felt 'id'.`);
    if (!team.name) throw new Error(`Team '${team.id}' mangler påkrevd felt 'name'.`);
    if (teamIds.has(team.id)) {
      throw new Error(`Duplisert team-ID funnet: '${team.id}'. Hver team-ID må være unik.`);
    }
    teamIds.add(team.id);
  }

  return config;
}

// ---------------------------------------------------------------------------
// assignReposToTeams — kart repoKey → teamId for alle repos
// ---------------------------------------------------------------------------

function assignReposToTeams(repos, teamConfig) {
  // Bygg eksplisitt repo-til-team-mapping (høyest prioritet)
  const explicitMap = new Map();
  for (const team of teamConfig.teams) {
    if (!team.repos) continue;
    for (const entry of team.repos) {
      const key = `${entry.project}/${entry.repo}`;
      if (explicitMap.has(key)) {
        throw new Error(
          `Repo '${key}' er tilordnet til to team: '${explicitMap.get(key)}' og '${team.id}'. ` +
          `Et repo kan kun tilhøre ett team.`
        );
      }
      explicitMap.set(key, team.id);
    }
  }

  const assignment = new Map();
  for (const repo of repos) {
    const key = `${repo.project}/${repo.repo}`;

    // Prioritet 1: eksplisitt repos[]-liste
    if (explicitMap.has(key)) {
      assignment.set(key, explicitMap.get(key));
      continue;
    }

    // Prioritet 2: projects[]-liste — matcher alle repos i et Bitbucket-prosjekt
    let found = false;
    for (const team of teamConfig.teams) {
      if (team.projects && team.projects.includes(repo.project)) {
        assignment.set(key, team.id);
        found = true;
        break;
      }
    }

    // Prioritet 3: ukjent → unassigned
    if (!found) {
      assignment.set(key, "unassigned");
    }
  }

  return assignment;
}

// ---------------------------------------------------------------------------
// buildTeamReport — bygg teams[]-seksjonen for rapport-JSON
// ---------------------------------------------------------------------------

function buildTeamReport(repoResults, teamConfig, checks) {
  const assignment = assignReposToTeams(repoResults, teamConfig);

  // Grupper repo-resultater per team
  const teamReposMap = new Map();
  for (const repo of repoResults) {
    const key    = `${repo.project}/${repo.repo}`;
    const teamId = assignment.get(key) || "unassigned";
    if (!teamReposMap.has(teamId)) teamReposMap.set(teamId, []);
    teamReposMap.get(teamId).push(repo);
  }

  const teams = [];

  // Bygg data for konfigurerte team
  for (const team of teamConfig.teams) {
    const repos = teamReposMap.get(team.id) || [];
    teams.push(_buildTeamEntry(
      team.id, team.name, team.description || "",
      team.slackChannel || null, team.members || [],
      repos, checks
    ));
  }

  // Bygg "Ikke tilordnet"-team for repos uten match
  const unassignedRepos = teamReposMap.get("unassigned") || [];
  if (unassignedRepos.length > 0) {
    teams.push(_buildTeamEntry(
      "unassigned", "Ikke tilordnet",
      "Repos som ikke er tilordnet noe team.",
      null, [], unassignedRepos, checks
    ));
  }

  return teams;
}

// ---------------------------------------------------------------------------
// Intern hjelper: bygg ett team-oppslag
// ---------------------------------------------------------------------------

function _buildTeamEntry(id, name, description, slackChannel, members, repos, checks) {
  const byCheck = {};

  for (const chk of checks) {
    const passed  = repos.filter((r) => r.checks[chk.id] === true).length;
    const na      = repos.filter((r) => r.checks[chk.id] === null).length;
    const failed  = repos.filter((r) => r.checks[chk.id] === false).length;
    const applicable = repos.length - na;
    const score = applicable > 0 ? +((passed / applicable) * 100).toFixed(1) : null;
    byCheck[chk.id] = { passed, failed, na, score };
  }

  // Kategoriscore = uvektet gjennomsnitt av sjekker i kategorien (NA-sjekker ekskludert)
  const categoryScores = {};
  for (const [cat, checkIds] of Object.entries(CHECK_CATEGORIES)) {
    const scores = checkIds
      .map((id) => byCheck[id]?.score)
      .filter((s) => s !== null && s !== undefined);
    categoryScores[cat] = scores.length > 0
      ? +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
      : null;
  }

  // Samlet score = uvektet gjennomsnitt av alle sjekker
  const allScores = Object.values(byCheck)
    .map((c) => c.score)
    .filter((s) => s !== null && s !== undefined);
  const overallScore = allScores.length > 0
    ? +(allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(1)
    : 0;

  // Summer sårbarheter på tvers av teamets repos
  const vulnerabilities = { total: 0, critical: 0, high: 0, medium: 0, low: 0 };
  for (const repo of repos) {
    for (const v of (repo.vulnerabilities || [])) {
      vulnerabilities.total++;
      const sev = (v.severity || "").toUpperCase();
      if (sev === "CRITICAL")     vulnerabilities.critical++;
      else if (sev === "HIGH")    vulnerabilities.high++;
      else if (sev === "MEDIUM")  vulnerabilities.medium++;
      else if (sev === "LOW")     vulnerabilities.low++;
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

module.exports = { loadTeamConfig, assignReposToTeams, buildTeamReport, CHECK_CATEGORIES };
