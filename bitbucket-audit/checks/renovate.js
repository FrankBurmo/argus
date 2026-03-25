"use strict";

module.exports = {
  id: "renovate",
  label: "Renovate Bot",
  run: async (projectKey, repoSlug, request) => {
    try {
      const files = await request(
        `/rest/api/1.0/projects/${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repoSlug)}/files?limit=100`
      );
      return (files.values || []).some((f) =>
        [
          "renovate.json",
          "renovate.json5",
          ".renovaterc",
          ".renovaterc.json",
        ].includes(f)
      );
    } catch {
      return false;
    }
  },
};
