"use strict";

module.exports = {
  id: "branch-protection",
  label: "Branch-beskyttelse",
  run: async (projectKey, repoSlug, request) => {
    try {
      // Hent default branch for repoet
      const defaultBranch = await request(
        `/rest/api/1.0/projects/${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repoSlug)}/branches/default`
      );

      if (!defaultBranch) return false;

      const defaultId = defaultBranch.id || "";               // "refs/heads/main"
      const defaultDisplayId = defaultBranch.displayId || ""; // "main"

      // Hent alle branch-permissions for repoet
      const data = await request(
        `/rest/branch-permissions/2.0/projects/${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repoSlug)}/restrictions?limit=100`
      );

      if (!Array.isArray(data.values) || data.values.length === 0) {
        return false;
      }

      // Filtrer restriksjoner som gjelder default branch
      const defaultBranchRestrictions = data.values.filter((r) => {
        if (!r.matcher) return false;
        const matcherId = r.matcher.id || "";
        const matcherDisplayId = r.matcher.displayId || "";
        const matcherTypeId = r.matcher.type && r.matcher.type.id;

        // Eksakt branch-match
        if (matcherTypeId === "BRANCH") {
          return matcherId === defaultId || matcherDisplayId === defaultDisplayId;
        }

        // MODEL_BRANCH med id "production" tilsvarer typisk default/produksjons-branch
        if (matcherTypeId === "MODEL_BRANCH" && matcherId === "production") {
          return true;
        }

        return false;
      });

      // Sjekk at default branch har "no-rewrites"-restriksjon (hindrer rewriting av historikk)
      return defaultBranchRestrictions.some((r) => r.type === "no-rewrites");
    } catch {
      return false;
    }
  },
};
