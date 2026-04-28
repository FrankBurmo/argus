/* ================================================================
   Argus Frontend — Sårbarhets-indeks og filtrering
   ================================================================ */
"use strict";

import { state } from "../state.js";

/**
 * Bygg en flat, deduplisert liste over alle sårbarheter på tvers av repos.
 * Grupperer per vuln-ID (CVE), og sporer berørte repos med versjonsinfo.
 *
 * @returns {Array<{ vuln: object, repos: Array<{project, repo, version}> }>}
 *   Sortert med høyeste severity først, deretter høyeste CVSS-score.
 */
export function buildVulnIndex() {
  const index = new Map();

  for (const repo of state.report.repos) {
    if (!repo.vulnerabilities || repo.vulnerabilities.length === 0) continue;
    for (const v of repo.vulnerabilities) {
      if (!index.has(v.id)) {
        index.set(v.id, { vuln: v, repos: [] });
      }
      const entry = index.get(v.id);
      // Oppdater vuln med høyest tilgjengelig info (fiks, score etc.)
      if (v.fixedIn && !entry.vuln.fixedIn) entry.vuln.fixedIn = v.fixedIn;
      if (v.cvssScore && (!entry.vuln.cvssScore || v.cvssScore > entry.vuln.cvssScore)) {
        entry.vuln.cvssScore = v.cvssScore;
      }
      entry.repos.push({ project: repo.project, repo: repo.repo, version: v.version });
    }
  }

  return Array.from(index.values()).sort((a, b) => {
    if (b.vuln.severityRank !== a.vuln.severityRank) return b.vuln.severityRank - a.vuln.severityRank;
    return (b.vuln.cvssScore || 0) - (a.vuln.cvssScore || 0);
  });
}

/** Sjekk om en (vuln, repo) matcher gjeldende sårbarhetsfiltre + søk. */
export function vulnerabilityMatchesFilters(vuln, repo, searchTerm) {
  const f = state.vulnFilters;
  if (f.severity.length > 0 && !f.severity.includes(vuln.severity || "UNKNOWN")) return false;
  if (f.ecosystem.length > 0 && !f.ecosystem.includes(vuln.ecosystem || "Ukjent")) return false;
  if (f.projects.length > 0 && !f.projects.includes(repo.project)) return false;
  if (f.fixAvailable.length === 1) {
    const wantFix = f.fixAvailable[0] === "yes";
    if (wantFix ? !vuln.fixedIn : !!vuln.fixedIn) return false;
  }
  if (searchTerm) {
    const searchable = [
      vuln.id, vuln.cveId, vuln.summary, vuln.package, vuln.ecosystem, ...(vuln.aliases || []),
      repo.project, repo.repo, repo.version || vuln.version,
    ].join(" ").toLowerCase();
    if (!searchable.includes(searchTerm)) return false;
  }
  return true;
}

/** Filtrer en bygget vuln-indeks basert på filtre + søk. */
export function getFilteredVulns(allVulns, searchTerm) {
  return allVulns.filter(({ vuln, repos }) =>
    repos.some(repo => vulnerabilityMatchesFilters(vuln, repo, searchTerm))
  );
}

/** Beregn samme summary-format som CLI for et utvalg repos (brukes ved eksport). */
export function buildSummaryForRepos(repos, checks) {
  const byCheck = {};
  for (const checkId of checks) {
    const passed = repos.filter(r => r.checks[checkId] === true).length;
    const notApplicable = repos.filter(r => r.checks[checkId] === null).length;
    const coveredByAlt = repos.filter(r =>
      r.checks[checkId] === false && r.assessments?.[checkId]?.startsWith("Ikke nødvendig")
    ).length;
    const failed = repos.filter(r => r.checks[checkId] === false).length - coveredByAlt;
    const applicable = repos.length - notApplicable;
    const covered = passed + coveredByAlt;
    byCheck[checkId] = {
      passed, failed, coveredByAlt, notApplicable,
      coveragePercent: applicable ? +((covered / applicable) * 100).toFixed(1) : 0,
    };
  }
  return { total: repos.length, byCheck };
}
