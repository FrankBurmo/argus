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
  /** Aktiv visning: "summary" | "vulnerabilities" | "repos". */
  activeView: "summary",
  /** Filtre i Repos-/Sammendrag-fanen. */
  activeFilters: {
    status: [],
    checks: [],
    projects: [],
    assessment: [],
  },
  /** Filtre i Sårbarheter-fanen. */
  vulnFilters: {
    severity: [],
    ecosystem: [],
    projects: [],
    fixAvailable: [],
  },
};

export function resetFilters() {
  state.activeFilters = { status: [], checks: [], projects: [], assessment: [] };
  state.vulnFilters = { severity: [], ecosystem: [], projects: [], fixAvailable: [] };
}
