/* ================================================================
   Argus Frontend — Sentral applikasjonstilstand
   ================================================================ */
"use strict";

/**
 * Mutable state-objekt for hele applikasjonen.
 *
 * Modulene leser og skriver direkte på dette objektet (ikke via re-assignment
 * av importerte variabler — det fungerer ikke med ES-moduler). Bruk settere
 * der det gir mening for å holde mutasjoner sporbare.
 */
export const state = {
  /** Rå JSON-rapport (eller null før innlasting). */
  report: null,
  /** Anriket sjekk-metadata: [{ id, label, icon }]. */
  checkMeta: [],
  /** Aktiv visning: "summary" | "vulnerabilities" | "repos" | "teams" | "team-detail". */
  activeView: "summary",
  /** Om den lastede rapporten inneholder team-data. Styrer synlighet av Team-UI. */
  hasTeams: false,
  /** Aktiv team-ID for detaljvisning (null = team-liste). */
  activeTeam: null,
  /** Filtre og sortering i Teams-fanen. */
  teamFilters: {
    sortBy: "score",       // "score" | "name" | "repos"
    sortDir: "asc",        // "asc" (lavest score først) | "desc"
    criticalOnly: false,
    withVulnsOnly: false,
  },
  /** Filtre i Repos-/Sammendrag-fanen. */
  activeFilters: {
    status: [],
    checks: [],
    projects: [],
    assessment: [],
    team: [],
  },
  /** Filtre i Sårbarheter-fanen. */
  vulnFilters: {
    severity: [],
    ecosystem: [],
    projects: [],
    fixAvailable: [],
    team: [],
  },
};

export function resetFilters() {
  state.activeFilters = { status: [], checks: [], projects: [], assessment: [], team: [] };
  state.vulnFilters = { severity: [], ecosystem: [], projects: [], fixAvailable: [], team: [] };
  state.hasTeams = false;
  state.activeTeam = null;
}
