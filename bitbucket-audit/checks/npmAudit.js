"use strict";

const { listAllFiles, findJenkinsfile } = require("./utils");

module.exports = {
  id: "npm-audit",
  label: "npm Audit",
  run: async (projectKey, repoSlug, request) => {
    try {
      const list = await listAllFiles(projectKey, repoSlug, request);
      const jenkinsfile = findJenkinsfile(list);
      if (!jenkinsfile) return null; // Ingen pipeline — sjekken er ikke aktuell

      const content = await request(
        `/rest/api/1.0/projects/${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repoSlug)}/browse/${encodeURIComponent(jenkinsfile)}?limit=5000`
      );
      const text = (content.lines || []).map((l) => l.text).join("\n");

      return text.includes("npmAudit");
    } catch {
      return false;
    }
  },

  assess: async (projectKey, repoSlug, request, result) => {
    try {
      // Sjekk om OWASP Dependency-Check allerede dekker sårbarhetsskanning
      if (result && result.checks["owasp-dep-check"] === true) {
        return "Ikke nødvendig — dekkes av OWASP Dependency-Check.";
      }

      const list = await listAllFiles(projectKey, repoSlug, request);
      const hasPackageJson = list.some((f) => f === "package.json");

      if (!hasPackageJson) {
        return "Ikke nødvendig — ingen package.json, ikke et Node.js-prosjekt.";
      }

      return "Anbefalt — har package.json men mangler npmAudit i pipeline.";
    } catch {
      return "Kunne ikke vurdere — feil ved henting av filer.";
    }
  },
};
