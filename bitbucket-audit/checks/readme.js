"use strict";

const { listAllFiles } = require("./utils");

module.exports = {
  id: "readme",
  label: "README",
  run: async (projectKey, repoSlug, request) => {
    try {
      const list = await listAllFiles(projectKey, repoSlug, request);
      return list.some((f) =>
        ["README.md", "README", "README.txt", "readme.md"].includes(f)
      );
    } catch {
      return false;
    }
  },
};
