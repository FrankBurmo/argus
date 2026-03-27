"use strict";

// Filer som indikerer avhengigheter som bør vedlikeholdes
const DEPENDENCY_FILES = [
  "package.json",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "requirements.txt",
  "Pipfile",
  "pyproject.toml",
  "poetry.lock",
  "go.mod",
  "go.sum",
  "Cargo.toml",
  "Gemfile",
  "composer.json",
  "Dockerfile",
];

// Alternative verktøy for avhengighetsoppdatering
const ALT_DEPENDENCY_TOOLS = [
  "dependabot.yml",
  ".dependabot/config.yml",
  ".github/dependabot.yml",
];

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

  /**
   * Vurderer om repoet bør ha Renovate basert på avhengigheter.
   * Returnerer en kort vurderingstekst.
   */
  assess: async (projectKey, repoSlug, request) => {
    try {
      const files = await request(
        `/rest/api/1.0/projects/${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repoSlug)}/files?limit=100`
      );
      const list = files.values || [];

      const hasAltTool = list.some((f) =>
        ALT_DEPENDENCY_TOOLS.some((alt) => f === alt || f.endsWith("/" + alt))
      );
      if (hasAltTool) {
        return "Ikke nødvendig — bruker allerede Dependabot eller tilsvarende.";
      }

      const depFiles = list.filter((f) => DEPENDENCY_FILES.includes(f));
      if (depFiles.length > 0) {
        return `Anbefalt — har avhengighetsfiler (${depFiles.join(", ")}) uten automatisk oppdatering.`;
      }

      if (list.length === 0) {
        return "Usikkert — repoet ser tomt ut.";
      }
      return "Ikke nødvendig — fant ingen avhengighetsfiler.";
    } catch {
      return "Kunne ikke vurdere — feil ved henting av filer.";
    }
  },
};
