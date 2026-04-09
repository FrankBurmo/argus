"use strict";

module.exports = {
  id: "branch-protection",
  label: "Branch-beskyttelse",
  run: async (projectKey, repoSlug, request) => {
    try {
      const data = await request(
        `/rest/branch-permissions/2.0/projects/${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repoSlug)}/restrictions?limit=100`
      );
      return Array.isArray(data.values) && data.values.length > 0;
    } catch {
      return false;
    }
  },
};
