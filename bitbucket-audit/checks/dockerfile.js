"use strict";

// Filer som indikerer kjørbar applikasjon (kandidat for containerisering)
const APP_INDICATORS = [
  "package.json",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "requirements.txt",
  "setup.py",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
  "Gemfile",
  "Program.cs",
  "*.csproj",
];

// Filer som tyder på ren konfig / dokumentasjon / bibliotek uten deploy
const NON_APP_INDICATORS = ["mkdocs.yml", ".pages"];

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

  /**
   * Vurderer om repoet bør ha Dockerfile basert på filinnhold.
   * Returnerer en kort vurderingstekst.
   */
  assess: async (projectKey, repoSlug, request) => {
    try {
      const files = await request(
        `/rest/api/1.0/projects/${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repoSlug)}/files?limit=100`
      );
      const list = files.values || [];

      const hasCompose = list.some(
        (f) => f === "docker-compose.yml" || f === "docker-compose.yaml"
      );
      const appFiles = list.filter((f) =>
        APP_INDICATORS.some((pattern) =>
          pattern.includes("*") ? f.endsWith(pattern.slice(1)) : f === pattern
        )
      );
      const nonAppFiles = list.filter((f) => NON_APP_INDICATORS.includes(f));

      if (hasCompose) {
        return "Anbefalt — har docker-compose men mangler Dockerfile.";
      }
      if (appFiles.length > 0 && nonAppFiles.length === 0) {
        return `Anbefalt — ser ut som kjørbar app (fant ${appFiles.join(", ")}).`;
      }
      if (nonAppFiles.length > 0 && appFiles.length === 0) {
        return "Ikke nødvendig — repoet ser ut som dokumentasjon/konfig.";
      }
      if (list.length === 0) {
        return "Usikkert — repoet ser tomt ut.";
      }
      return "Usikkert — fant ingen tydelige app-indikatorer.";
    } catch {
      return "Kunne ikke vurdere — feil ved henting av filer.";
    }
  },
};
