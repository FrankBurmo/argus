"use strict";

// Mønstre som indikerer bruk av OWASP Dependency-Check i en pipeline
const OWASP_PATTERNS = [
  "performDependencyCheck",
  "dependencyCheck",
  "dependency-check",
  "DependencyCheck",
  "owasp",
  "OWASP",
];

// Kjente Jenkinsfile-navn
const JENKINSFILE_NAMES = [
  "Jenkinsfile",
  "jenkinsfile",
  "Jenkinsfile.groovy",
];

module.exports = {
  id: "owasp-dep-check",
  label: "OWASP Dependency-Check",
  run: async (projectKey, repoSlug, request) => {
    try {
      // 1. Sjekk om det finnes en Jenkinsfile
      const files = await request(
        `/rest/api/1.0/projects/${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repoSlug)}/files?limit=100`
      );
      const list = files.values || [];
      const jenkinsfile = list.find((f) => JENKINSFILE_NAMES.includes(f));
      if (!jenkinsfile) return true; // Ingen pipeline — sjekken er ikke relevant

      // 2. Les innholdet i Jenkinsfile og sjekk for OWASP-mønstre
      const content = await request(
        `/rest/api/1.0/projects/${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repoSlug)}/browse/${encodeURIComponent(jenkinsfile)}?limit=5000`
      );

      // Bitbucket returnerer filinnhold som linjer i .lines[].text
      const text = (content.lines || []).map((l) => l.text).join("\n");
      return OWASP_PATTERNS.some((p) => text.includes(p));
    } catch {
      return false;
    }
  },

  /**
   * Vurderer om repoet bør ha OWASP Dependency-Check i pipeline.
   * Returnerer en kort vurderingstekst.
   */
  assess: async (projectKey, repoSlug, request) => {
    try {
      // assess kalles kun når run() returnerer false,
      // dvs. repoet har Jenkinsfile men OWASP-sjekk mangler.
      const files = await request(
        `/rest/api/1.0/projects/${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repoSlug)}/files?limit=100`
      );
      const list = files.values || [];

      const depIndicators = [
        "package.json", "pom.xml", "build.gradle", "build.gradle.kts",
        "requirements.txt", "Pipfile", "pyproject.toml", "go.mod",
        "Cargo.toml", "Gemfile", "composer.json",
      ];
      const depFiles = list.filter((f) => depIndicators.includes(f));

      if (depFiles.length === 0) {
        return "Ikke nødvendig — har pipeline men ingen skannbare avhengigheter.";
      }

      return `Anbefalt — har Jenkinsfile og avhengigheter (${depFiles.join(", ")}), men OWASP Dependency-Check mangler i pipeline.`;
    } catch {
      return "Kunne ikke vurdere — feil ved henting av filer.";
    }
  },
};
