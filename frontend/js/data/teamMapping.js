/* ================================================================
   Argus Frontend — Team-mapping: localStorage-hjelpere og validering

   Forventer format etter teams.example.json:
   { "version": "1", "teams": [{ "id", "name", "repos"/"projects", ... }] }
   ================================================================ */
"use strict";

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
