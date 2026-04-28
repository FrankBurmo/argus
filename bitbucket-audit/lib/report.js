"use strict";

// ---------------------------------------------------------------------------
// Delte hjelpefunksjoner for rapportmoduler
// ---------------------------------------------------------------------------

/**
 * Klassifiser sjekk-resultat til ikon for markdown-rapport.
 */
function assessIcon(chk, r) {
  const val = r.checks[chk.id];
  if (val === true)  return "✅";
  if (val === null)  return "➖"; // Ikke aktuelt (ingen pipeline)
  const text = r.assessments && r.assessments[chk.id];
  if (!text) return "❌";
  if (text.startsWith("Anbefalt"))       return "⚠️";
  if (text.startsWith("Ikke nødvendig")) return "➖";
  return "❓"; // Usikkert / Kunne ikke vurdere
}

/**
 * Har repoet minst én sjekk som er eksplisitt feilet og anbefalt korrigert?
 */
function isActionable(r, checks) {
  return checks.some((chk) => {
    if (r.checks[chk.id] !== false) return false;
    const text = r.assessments && r.assessments[chk.id];
    return text && text.startsWith("Anbefalt");
  });
}

/**
 * Grupper repos per prosjektnøkkel.
 */
function groupByProject(repos) {
  const byProject = {};
  for (const r of repos) {
    if (!byProject[r.project]) byProject[r.project] = [];
    byProject[r.project].push(r);
  }
  return byProject;
}

// ---------------------------------------------------------------------------
// Hovedfunksjon: bygg strukturert rapport
// ---------------------------------------------------------------------------

function buildReport(repoResults, checks) {
  const total = repoResults.length;
  const byCheck = {};

  for (const chk of checks) {
    const passed       = repoResults.filter((r) => r.checks[chk.id] === true).length;
    const notApplicable = repoResults.filter((r) => r.checks[chk.id] === null).length;
    const coveredByAlt = repoResults.filter((r) =>
      r.checks[chk.id] === false &&
      r.assessments && r.assessments[chk.id] &&
      r.assessments[chk.id].startsWith("Ikke nødvendig")
    ).length;
    const failed       = repoResults.filter((r) => r.checks[chk.id] === false).length - coveredByAlt;
    const applicable   = total - notApplicable;
    const covered      = passed + coveredByAlt;
    byCheck[chk.id] = {
      passed,
      failed,
      coveredByAlt,
      notApplicable,
      coveragePercent: applicable ? +((covered / applicable) * 100).toFixed(1) : 0,
    };
  }

  const repos = repoResults
    .slice()
    .sort((a, b) =>
      `${a.project}/${a.repo}`.localeCompare(`${b.project}/${b.repo}`)
    );

  return {
    generatedAt: new Date().toISOString(),
    checks: checks.map((c) => c.id),
    summary: { total, byCheck },
    repos,
  };
}

module.exports = { buildReport, assessIcon, isActionable, groupByProject };
