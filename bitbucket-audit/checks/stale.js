"use strict";

// Standard terskel: 12 måneder uten commit = inaktivt
const STALE_MONTHS = parseInt(process.env.STALE_MONTHS, 10) || 12;

module.exports = {
  id: "stale",
  label: "Aktivt repo",
  run: async (projectKey, repoSlug, request) => {
    try {
      const data = await request(
        `/rest/api/1.0/projects/${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repoSlug)}/commits?limit=1`
      );

      if (!Array.isArray(data.values) || data.values.length === 0) {
        return false;
      }

      const lastCommitTs = data.values[0].authorTimestamp;
      const cutoff = Date.now() - STALE_MONTHS * 30 * 24 * 60 * 60 * 1000;
      return lastCommitTs >= cutoff;
    } catch {
      return false;
    }
  },
};
