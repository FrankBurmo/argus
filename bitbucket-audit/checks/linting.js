"use strict";

const { listAllFiles } = require("./utils");

// Kjente konfigurasjonsfiler for linting/formatering
const LINTING_FILES = [
  // JavaScript/TypeScript
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.json",
  ".eslintrc.yml",
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  ".prettierrc",
  ".prettierrc.js",
  ".prettierrc.json",
  ".prettierrc.yml",
  "prettier.config.js",
  ".oxlintrc.json",
  ".oxlint.config.ts",
  "biome.json",
  "biome.jsonc",
  "tslint.json",
  // Python
  ".flake8",
  ".pylintrc",
  "pyproject.toml",
  "setup.cfg",
  ".ruff.toml",
  "ruff.toml",
  // Java
  "checkstyle.xml",
  ".pmd",
  // Generelt
  ".editorconfig",
  ".stylelintrc",
  ".stylelintrc.json",
];

// Mapping fra konfigurasjonsfil til menneskelesbart linter-navn
const LINTER_NAMES = {
  ".eslintrc":          "ESLint",
  ".eslintrc.js":       "ESLint",
  ".eslintrc.cjs":      "ESLint",
  ".eslintrc.json":     "ESLint",
  ".eslintrc.yml":      "ESLint",
  "eslint.config.js":   "ESLint",
  "eslint.config.mjs":  "ESLint",
  "eslint.config.cjs":  "ESLint",
  ".prettierrc":        "Prettier",
  ".prettierrc.js":     "Prettier",
  ".prettierrc.json":   "Prettier",
  ".prettierrc.yml":    "Prettier",
  "prettier.config.js": "Prettier",
  ".oxlintrc.json":     "oxlint",
  ".oxlint.config.ts":  "oxlint",
  "biome.json":         "Biome",
  "biome.jsonc":        "Biome",
  "tslint.json":        "TSLint",
  ".flake8":            "Flake8",
  ".pylintrc":          "Pylint",
  "pyproject.toml":     "Python linter (pyproject.toml)",
  "setup.cfg":          "Python linter (setup.cfg)",
  ".ruff.toml":         "Ruff",
  "ruff.toml":          "Ruff",
  "checkstyle.xml":     "Checkstyle",
  ".pmd":               "PMD",
  ".editorconfig":      "EditorConfig",
  ".stylelintrc":       "Stylelint",
  ".stylelintrc.json":  "Stylelint",
};

/**
 * Returnerer sortert liste av unike linter-navn funnet i fillisten.
 */
function detectLinters(files) {
  const found = new Set();
  for (const f of files) {
    const basename = f.split("/").pop();
    if (LINTER_NAMES[basename]) {
      found.add(LINTER_NAMES[basename]);
    }
  }
  return [...found].sort();
}

module.exports = {
  id: "linting",
  label: "Linting/formatering",
  run: async (projectKey, repoSlug, request) => {
    try {
      const list = await listAllFiles(projectKey, repoSlug, request);
      return list.some((f) => {
        const basename = f.split("/").pop();
        return LINTING_FILES.includes(basename);
      });
    } catch {
      return false;
    }
  },

  /**
   * Vurderer fravær av linterkonfigurasjon.
   */
  assess: async (projectKey, repoSlug, request) => {
    return "Anbefalt — ingen linterkonfigurasjon funnet.";
  },

  /**
   * Returnerer hvilke lintere som er i bruk (kalles når sjekken er bestått).
   */
  details: async (projectKey, repoSlug, request) => {
    try {
      const list = await listAllFiles(projectKey, repoSlug, request);
      const linters = detectLinters(list);
      return linters.length > 0 ? `Lintere funnet: ${linters.join(", ")}.` : null;
    } catch {
      return null;
    }
  },

  // Eksponert for testing
  detectLinters,
};
