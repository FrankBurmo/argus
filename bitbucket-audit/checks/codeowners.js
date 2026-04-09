"use strict";

const { listAllFiles } = require("./utils");

// Aksepterte plasseringer og filnavn for CODEOWNERS
const CODEOWNERS_FILES = [
  "CODEOWNERS",
  "CODEOWNERS.md",
  ".github/CODEOWNERS",
  "docs/CODEOWNERS",
];

module.exports = {
  id: "codeowners",
  label: "CODEOWNERS",
  run: async (projectKey, repoSlug, request) => {
    try {
      const list = await listAllFiles(projectKey, repoSlug, request);
      return list.some((f) => CODEOWNERS_FILES.includes(f));
    } catch {
      return false;
    }
  },
};
