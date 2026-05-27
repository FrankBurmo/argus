/* ================================================================
   Argus Frontend — Team-mapping: localStorage-hjelpere og validering

   Forventer format etter teams.example.json:
   { "version": "1", "teams": [{ "id", "name", "repos"/"projects", ... }] }
   ================================================================ */
"use strict";

import { state } from "../state.js";

const STORAGE_KEY = "argus_team_mapping";

/**
 * Enkel validering av team-mapping-format.
 * Krever at data.teams er en ikke-tom array.
 */
export function validateTeamMapping(data) {
  return data !== null &&
    typeof data === "object" &&
    Array.isArray(data.teams) &&
    data.teams.length > 0;
}

/**
 * Lagrer parsert team-mapping til localStorage.
 * Overskriver alltid eventuell eksisterende mapping.
 */
export function saveTeamMapping(parsedJson) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsedJson));
  } catch (err) {
    console.warn("Kunne ikke lagre team-mapping til localStorage:", err.message);
  }
}

/**
 * Leser og parser team-mapping fra localStorage.
 * Returnerer objektet om det finnes og er gyldig, ellers null.
 */
export function loadTeamMappingFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return validateTeamMapping(parsed) ? parsed : null;
  } catch (err) {
    console.warn("Kunne ikke lese team-mapping fra localStorage:", err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Mutasjonshjelpere — endrer state.teamsConfig og lagrer til localStorage
// ---------------------------------------------------------------------------

/**
 * Oppdater metadata for ett team i konfigurasjonen.
 * Felt som er undefined blir ikke rørt.
 */
export function updateTeamMetaInConfig(teamId, { slackChannel, description, members }) {
  if (!state.teamsConfig) { console.warn("Ingen team-mapping lastet."); return; }
  const team = state.teamsConfig.teams.find(t => t.id === teamId);
  if (!team) { console.warn(`Team '${teamId}' ikke funnet i config.`); return; }
  if (slackChannel !== undefined) team.slackChannel = slackChannel;
  if (description  !== undefined) team.description  = description;
  if (members      !== undefined) team.members       = members;
  saveTeamMapping(state.teamsConfig);
}

/**
 * Legg til et eksplisitt repo i et teams repos[]-liste.
 * Fjerner repoet fra andre teams' eksplisitte lister først (unngår duplikate tilordninger).
 */
export function addRepoToTeamConfig(teamId, project, repo) {
  if (!state.teamsConfig) { console.warn("Ingen team-mapping lastet."); return; }
  const targetTeam = state.teamsConfig.teams.find(t => t.id === teamId);
  if (!targetTeam) { console.warn(`Team '${teamId}' ikke funnet i config.`); return; }

  // Fjern fra andre teams' eksplisitte repos-liste
  for (const team of state.teamsConfig.teams) {
    if (team.id !== teamId && Array.isArray(team.repos)) {
      team.repos = team.repos.filter(r => !(r.project === project && r.repo === repo));
    }
  }

  if (!Array.isArray(targetTeam.repos)) targetTeam.repos = [];
  const alreadyPresent = targetTeam.repos.some(r => r.project === project && r.repo === repo);
  if (!alreadyPresent) targetTeam.repos.push({ project, repo });
  saveTeamMapping(state.teamsConfig);
}

/**
 * Fjern et eksplisitt repo fra et teams repos[]-liste.
 * Har ingen effekt på project[]-baserte tilordninger.
 */
export function removeRepoFromTeamConfig(teamId, project, repo) {
  if (!state.teamsConfig) { console.warn("Ingen team-mapping lastet."); return; }
  const team = state.teamsConfig.teams.find(t => t.id === teamId);
  if (!team || !Array.isArray(team.repos)) return;
  team.repos = team.repos.filter(r => !(r.project === project && r.repo === repo));
  saveTeamMapping(state.teamsConfig);
}

/**
 * Last ned gjeldende teamsConfig som JSON-fil.
 */
export function downloadTeamMappingJson() {
  if (!state.teamsConfig) { console.warn("Ingen team-mapping å eksportere."); return; }
  const content = JSON.stringify(state.teamsConfig, null, 2);
  const blob = new Blob([content], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  a.href     = url;
  a.download = `team-mapping-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
