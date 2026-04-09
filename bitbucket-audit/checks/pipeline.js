"use strict";

const { listAllFiles, findJenkinsfile } = require("./utils");

// Filer/mapper som indikerer en CI/CD-pipeline
const PIPELINE_FILES = [
  "Jenkinsfile",
  ".gitlab-ci.yml",
  "bitbucket-pipelines.yml",
  "azure-pipelines.yml",
  ".circleci/config.yml",
  ".travis.yml",
];

// Prefiks-mønstre for GitHub Actions workflow-filer
const GH_ACTIONS_PREFIX = ".github/workflows/";

module.exports = {
  id: "pipeline",
  label: "CI/CD-pipeline",
  run: async (projectKey, repoSlug, request) => {
    try {
      const list = await listAllFiles(projectKey, repoSlug, request);

      // Sjekk Jenkinsfile (inkl. varianter som Jenkinsfile.groovy)
      if (findJenkinsfile(list)) return true;

      // Sjekk kjente pipeline-filer
      if (list.some((f) => PIPELINE_FILES.includes(f))) return true;

      // Sjekk GitHub Actions workflows
      if (list.some((f) => f.startsWith(GH_ACTIONS_PREFIX) && f.endsWith(".yml"))) return true;

      return false;
    } catch {
      return false;
    }
  },
};
