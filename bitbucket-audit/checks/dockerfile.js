"use strict";

module.exports = {
  id: "dockerfile",
  label: "Dockerfile",
  run: async (projectKey, repoSlug, request) => {
    try {
      const files = await request(
        `/rest/api/1.0/projects/${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repoSlug)}/files?limit=100`
      );
      return (files.values || []).some(
        (f) => f === "Dockerfile" || f.startsWith("Dockerfile.")
      );
    } catch {
      return false;
    }
  },
};
