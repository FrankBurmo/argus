"use strict";

// ---------------------------------------------------------------------------
// Team-eierskap: berik rapport med team-felt basert på mapping hentet via URL
// ---------------------------------------------------------------------------

/**
 * Hent team-eierskap fra en absolutt URL.
 * Returnerer null hvis url er null.
 * Kaster Error ved HTTP-feil eller ugyldig JSON.
 *
 * JSON-struktur: { [product]: { [teamId]: [ { project, slug } ] } }
 *
 * @param {string|null} url     - Absolutt URL til JSON-mapping
 * @param {Function}    request - request()-funksjonen fra http.js
 * @returns {Promise<Object|null>}
 */
async function loadOwnership(url, request) {
  if (!url) return null;
  return request(url);
}

/**
 * Bygg oppslagstabell fra ownership-JSON.
 * Nøkkel: "PROJECT/slug"  Verdi: { product, teamId }
 * Første match vinner ved duplikater.
 *
 * @param {Object} ownershipJson - { [product]: { [teamId]: [ { project, slug } ] } }
 * @returns {Map<string, { product: string, teamId: string }>}
 */
function buildLookupMap(ownershipJson) {
  const map = new Map();
  for (const [product, teams] of Object.entries(ownershipJson)) {
    for (const [teamId, repos] of Object.entries(teams)) {
      if (!Array.isArray(repos)) continue;
      for (const { project, slug } of repos) {
        if (!project || !slug) continue;
        const key = `${project}/${slug}`;
        if (!map.has(key)) {
          map.set(key, { product, teamId });
        }
      }
    }
  }
  return map;
}

/**
 * Berik hvert repo med et 'team'-felt basert på oppslagstabellen.
 * Setter team = { product, id } eller team = null dersom ingen match.
 *
 * @param {Array} repos     - report.repos
 * @param {Map}   lookupMap - fra buildLookupMap()
 */
function enrichRepos(repos, lookupMap) {
  for (const repo of repos) {
    const key = `${repo.project}/${repo.repo}`;
    const match = lookupMap.get(key);
    repo.team = match ? { product: match.product, id: match.teamId } : null;
  }
}

/**
 * Bygg byTeam-oversikt for summary-seksjonen.
 * Nøkkel: "product/teamId" (compound for å unngå kollisjoner på tvers av produkter).
 * Inkluderer "unassigned"-gruppe for repos uten treff.
 *
 * @param {Array}  repos         - report.repos (allerede beriket med .team)
 * @param {Array}  checks        - Array av sjekk-objekter med .id
 * @param {Object} ownershipJson - { [product]: { [teamId]: [...] } }
 * @returns {Object} byTeam
 */
function buildByTeam(repos, checks, ownershipJson) {
  // Bygg opp teamMap: compound-nøkkel → { name, repos[] }
  const teamMap = new Map();

  // Registrer kjente team i riktig rekkefølge
  for (const [product, teams] of Object.entries(ownershipJson)) {
    for (const teamId of Object.keys(teams)) {
      const key = `${product}/${teamId}`;
      if (!teamMap.has(key)) {
        teamMap.set(key, { name: key, repos: [] });
      }
    }
  }

  // Sorter repos inn i riktig bøtte
  for (const repo of repos) {
    if (repo.team) {
      const key = `${repo.team.product}/${repo.team.id}`;
      if (!teamMap.has(key)) {
        teamMap.set(key, { name: key, repos: [] });
      }
      teamMap.get(key).repos.push(repo);
    } else {
      if (!teamMap.has("unassigned")) {
        teamMap.set("unassigned", { name: "Unassigned", repos: [] });
      }
      teamMap.get("unassigned").repos.push(repo);
    }
  }

  // Beregn statistikk per team
  const byTeam = {};

  for (const [teamKey, { name, repos: teamRepos }] of teamMap) {
    if (teamRepos.length === 0) continue;

    const total   = teamRepos.length;
    const byCheck = {};

    for (const chk of checks) {
      const passed        = teamRepos.filter((r) => r.checks[chk.id] === true).length;
      const notApplicable = teamRepos.filter((r) => r.checks[chk.id] === null).length;
      const coveredByAlt  = teamRepos.filter(
        (r) =>
          r.checks[chk.id] === false &&
          r.assessments &&
          r.assessments[chk.id] &&
          r.assessments[chk.id].startsWith("Ikke nødvendig")
      ).length;
      const failed      = teamRepos.filter((r) => r.checks[chk.id] === false).length - coveredByAlt;
      const applicable  = total - notApplicable;
      const covered     = passed + coveredByAlt;

      byCheck[chk.id] = {
        passed,
        failed,
        coveragePercent: applicable ? +((covered / applicable) * 100).toFixed(1) : 0,
      };
    }

    byTeam[teamKey] = { name, repoCount: total, byCheck };
  }

  return byTeam;
}

module.exports = { loadOwnership, buildLookupMap, enrichRepos, buildByTeam };
