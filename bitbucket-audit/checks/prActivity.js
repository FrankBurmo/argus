"use strict";

// Antall måneder tilbake vi ser etter PR-aktivitet
const PR_MONTHS = parseInt(process.env.PR_MONTHS, 10) || 6;

module.exports = {
  id: "pr-activity",
  label: "PR-praksis",
  run: async (projectKey, repoSlug, request) => {
    try {
      const data = await request(
        `/rest/api/1.0/projects/${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repoSlug)}/pull-requests?state=MERGED&limit=5`
      );

      if (!Array.isArray(data.values) || data.values.length === 0) {
        return false;
      }

      // Sjekk om det finnes en nylig merged PR innenfor tidsvinduet
      const cutoff = Date.now() - PR_MONTHS * 30 * 24 * 60 * 60 * 1000;
      const hasRecent = data.values.some(
        (pr) => pr.updatedDate >= cutoff || pr.closedDate >= cutoff
      );

      if (!hasRecent) return false;

      // Sjekk at minst én PR har hatt en reviewer
      const hasReviewer = data.values.some(
        (pr) => Array.isArray(pr.reviewers) && pr.reviewers.length > 0
      );

      return hasReviewer;
    } catch {
      return false;
    }
  },
};
