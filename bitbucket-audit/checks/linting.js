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
};
