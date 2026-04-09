"use strict";

const { listAllFiles } = require("./utils");

// Mapper som typisk inneholder tester
const TEST_DIRS = [
  "test/",
  "tests/",
  "__tests__/",
  "spec/",
  "src/test/",
  "src/__tests__/",
];

// Filsuffiks-mønstre som indikerer testfiler
const TEST_FILE_PATTERNS = [
  ".test.js",
  ".test.ts",
  ".test.jsx",
  ".test.tsx",
  ".spec.js",
  ".spec.ts",
  ".spec.jsx",
  ".spec.tsx",
  "_test.go",
  "_test.py",
  "Test.java",
  "Tests.cs",
];

// Prefiks-mønstre for Python-testar
const TEST_FILE_PREFIXES = ["test_"];

module.exports = {
  id: "tests",
  label: "Tester",
  run: async (projectKey, repoSlug, request) => {
    try {
      const list = await listAllFiles(projectKey, repoSlug, request);

      // Sjekk om noen filer ligger i en testmappe
      if (list.some((f) => TEST_DIRS.some((d) => f.startsWith(d) || f.includes("/" + d)))) {
        return true;
      }

      // Sjekk om noen filer matcher testfil-mønstre
      if (list.some((f) => {
        const basename = f.split("/").pop();
        if (TEST_FILE_PATTERNS.some((p) => basename.endsWith(p))) return true;
        if (TEST_FILE_PREFIXES.some((p) => basename.startsWith(p))) return true;
        return false;
      })) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  },
};
