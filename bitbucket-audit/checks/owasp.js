"use strict";

const { listAllFiles } = require("./utils");

// Mønstre som indikerer bruk av OWASP Dependency-Check i en pipeline
const OWASP_PATTERNS = [
  "performDependencyCheck",
  "dependencyCheck",
  "dependency-check",
  "DependencyCheck",
  "owasp",
  "OWASP",
];

// Biblioteker/funksjoner som setter opp OWASP-scan automatisk
const IMPLICIT_OWASP_PATTERNS = [
  "springBootMavenDeploy",
];

// Byggfiler som kan inneholde OWASP-konfigurasjon (Maven/Gradle)
const BUILD_FILES = ["pom.xml", "build.gradle", "build.gradle.kts"];

// Mønstre som indikerer OWASP Dependency-Check i byggfiler
const BUILD_FILE_OWASP_PATTERNS = [
  "dependency-check-maven",
  "dependency-check-gradle",
  "org.owasp.dependencycheck",
  "org.owasp",
];

// Filer som regnes som Jenkins-pipeline (dekker Jenkinsfile, Jenkinsfile.atlas, Jenkinsfile.groovy osv.)
function findJenkinsfile(fileList) {
  return fileList.find((f) => f === "Jenkinsfile" || f.startsWith("Jenkinsfile."));
}

module.exports = {
  id: "owasp-dep-check",
  label: "OWASP Dependency-Check",
  run: async (projectKey, repoSlug, request) => {
    try {
      // 1. Sjekk om det finnes en Jenkinsfile
      const list = await listAllFiles(projectKey, repoSlug, request);
      const jenkinsfile = findJenkinsfile(list);
      if (!jenkinsfile) return null; // Ingen pipeline — sjekken er ikke aktuell

      // 2. Les innholdet i Jenkinsfile og sjekk for OWASP-mønstre
      const content = await request(
        `/rest/api/1.0/projects/${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repoSlug)}/browse/${encodeURIComponent(jenkinsfile)}?limit=5000`
      );

      // Bitbucket returnerer filinnhold som linjer i .lines[].text
      const text = (content.lines || []).map((l) => l.text).join("\n");
      if (
        OWASP_PATTERNS.some((p) => text.includes(p)) ||
        IMPLICIT_OWASP_PATTERNS.some((p) => text.includes(p))
      ) {
        return true;
      }

      // 3. Sjekk byggfiler (pom.xml, build.gradle) for OWASP-plugin-konfigurasjon
      const buildFiles = list.filter((f) => BUILD_FILES.some((bf) => f === bf || f.endsWith("/" + bf)));
      for (const bf of buildFiles) {
        try {
          const bfContent = await request(
            `/rest/api/1.0/projects/${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repoSlug)}/browse/${encodeURIComponent(bf)}?limit=10000`
          );
          const bfText = (bfContent.lines || []).map((l) => l.text).join("\n");
          if (BUILD_FILE_OWASP_PATTERNS.some((p) => bfText.includes(p))) {
            return true;
          }
        } catch {
          // Feil ved lesing av enkelt byggfil — fortsett med neste
        }
      }

      return false;
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
      const list = await listAllFiles(projectKey, repoSlug, request);

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
