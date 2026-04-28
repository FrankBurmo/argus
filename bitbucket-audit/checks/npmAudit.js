"use strict";

const { listAllFiles, findJenkinsfile, fetchFileContent } = require("./utils");

// Mønstre i Jenkinsfile som indikerer npm audit
const JENKINS_PATTERNS = [
  "npmAudit",        // Jenkins shared library-steg
  "npm audit",       // Direkte CLI-kall
  "npm run audit",   // Via package.json-script
];

// Mønstre i pom.xml som indikerer npm audit via Maven
const POM_PATTERNS = [
  "npm audit",               // frontend-maven-plugin mål
  "npm run audit",           // frontend-maven-plugin med script-referanse
  "frontend-maven-plugin",   // Plugin som ofte kjører npm audit
];

// Mønstre i package.json scripts som indikerer npm audit
const PKG_SCRIPT_PATTERNS = [
  "npm audit",
  "better-npm-audit",
  "audit-ci",
  "npm-audit-resolver",
];

module.exports = {
  id: "npm-audit",
  label: "npm Audit",
  run: async (projectKey, repoSlug, request) => {
    try {
      const list = await listAllFiles(projectKey, repoSlug, request);
      const jenkinsfile = findJenkinsfile(list);
      if (!jenkinsfile) return null; // Ingen pipeline — sjekken er ikke aktuell

      // 1. Sjekk Jenkinsfile for npm audit-mønstre
      const jenkinsText = await fetchFileContent(projectKey, repoSlug, jenkinsfile, request);
      if (JENKINS_PATTERNS.some((p) => jenkinsText.includes(p))) {
        return true;
      }

      // 2. Sjekk pom.xml-filer for npm audit via Maven (frontend-maven-plugin o.l.)
      const pomFiles = list.filter((f) => f === "pom.xml" || f.endsWith("/pom.xml"));
      for (const pom of pomFiles) {
        try {
          const pomText = await fetchFileContent(projectKey, repoSlug, pom, request, { limit: 10000 });
          // Sjekk at det faktisk er frontend-maven-plugin som kjører npm audit
          if (pomText.includes("frontend-maven-plugin") && POM_PATTERNS.some((p) => pomText.includes(p))) {
            return true;
          }
        } catch {
          // Feil ved lesing av enkelt pom.xml — fortsett
        }
      }

      // 3. Sjekk package.json-scripts for npm audit
      const pkgFiles = list.filter((f) => f === "package.json" || f.endsWith("/package.json"));
      for (const pkg of pkgFiles) {
        try {
          const pkgText = await fetchFileContent(projectKey, repoSlug, pkg, request);
          if (PKG_SCRIPT_PATTERNS.some((p) => pkgText.includes(p))) {
            return true;
          }
        } catch {
          // Feil ved lesing av enkelt package.json — fortsett
        }
      }

      return false;
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
      const hasPackageJson = list.some((f) => f === "package.json" || f.endsWith("/package.json"));

      if (!hasPackageJson) {
        return "Ikke nødvendig — ingen package.json, ikke et Node.js-prosjekt.";
      }

      return "Anbefalt — har package.json men mangler npm audit i pipeline.";
    } catch {
      return "Kunne ikke vurdere — feil ved henting av filer.";
    }
  },
};
