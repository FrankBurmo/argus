"use strict";

const { listAllFiles } = require("./utils");

// Aksepterte plasseringer og filnavn for CODEOWNERS
const CODEOWNERS_FILES = [
  "CODEOWNERS",
  "CODEOWNERS.md",
  ".github/CODEOWNERS",
  "docs/CODEOWNERS",
];

/**
 * Finn første matchende CODEOWNERS-fil i repoet.
 * Returnerer filstien som streng, eller null hvis ingen ble funnet.
 */
async function findCODEOWNERS(projectKey, repoSlug, request) {
  const list = await listAllFiles(projectKey, repoSlug, request);
  return list.find((f) => CODEOWNERS_FILES.includes(f)) ?? null;
}

module.exports = {
  id: "codeowners",
  label: "CODEOWNERS",

  run: async (projectKey, repoSlug, request) => {
    try {
      return (await findCODEOWNERS(projectKey, repoSlug, request)) !== null;
    } catch {
      return false;
    }
  },

  /**
   * Vurder manglende CODEOWNERS-fil.
   * Kalles kun når run() returnerer false.
   */
  assess: async () => {
    return "Anbefalt — repoet mangler en CODEOWNERS-fil. Opprett en for å definere hvem som eier koden og er ansvarlig for code review.";
  },

  /**
   * Returnerer hvilken CODEOWNERS-fil som ble funnet.
   * Kalles kun når run() returnerer true.
   */
  details: async (projectKey, repoSlug, request) => {
    try {
      const file = await findCODEOWNERS(projectKey, repoSlug, request);
      return file ? `Funnet: ${file}` : null;
    } catch {
      return null;
    }
  },
};
