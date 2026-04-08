"use strict";

/**
 * Henter alle filer i et repo (håndterer paginering).
 * Returnerer en flat array av filstier.
 */
async function listAllFiles(projectKey, repoSlug, request) {
  const results = [];
  let start = 0;

  while (true) {
    const page = await request(
      `/rest/api/1.0/projects/${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repoSlug)}/files?limit=100&start=${start}`
    );
    if (Array.isArray(page.values)) {
      results.push(...page.values);
    }
    if (page.isLastPage !== false) break;
    start = page.nextPageStart;
  }

  return results;
}

// Filer som regnes som Jenkins-pipeline (dekker Jenkinsfile, Jenkinsfile.atlas, Jenkinsfile.groovy osv.)
function findJenkinsfile(fileList) {
  return fileList.find((f) => f === "Jenkinsfile" || f.startsWith("Jenkinsfile."));
}

module.exports = { listAllFiles, findJenkinsfile };
