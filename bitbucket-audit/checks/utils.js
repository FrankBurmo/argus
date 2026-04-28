"use strict";

/**
 * Bygger basis-API-sti for et repo.
 * Returnerer f.eks. "/rest/api/1.0/projects/PROJ/repos/my-repo"
 */
function repoApiPath(projectKey, repoSlug) {
  return `/rest/api/1.0/projects/${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repoSlug)}`;
}

/**
 * Henter alle filer i et repo (håndterer paginering).
 * Returnerer en flat array av filstier.
 */
async function listAllFiles(projectKey, repoSlug, request) {
  const results = [];
  let start = 0;
  const base = repoApiPath(projectKey, repoSlug);

  while (true) {
    const page = await request(
      `${base}/files?limit=100&start=${start}`
    );
    if (Array.isArray(page.values)) {
      results.push(...page.values);
    }
    if (page.isLastPage !== false) break;
    start = page.nextPageStart;
  }

  return results;
}

/**
 * Henter innholdet til en fil fra Bitbucket browse-API.
 * Enkoder hvert path-segment separat for å bevare skråstreker.
 * Håndterer paginering for store filer.
 */
async function fetchFileContent(projectKey, repoSlug, filePath, request, opts = {}) {
  const { limit = 5000, paginate = false } = opts;
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  const base = repoApiPath(projectKey, repoSlug);

  if (!paginate) {
    const content = await request(
      `${base}/browse/${encodedPath}?limit=${limit}`
    );
    return (content.lines || []).map((l) => l.text).join("\n");
  }

  // Paginert modus: hent alle sider for store filer
  const lines = [];
  let start = 0;
  while (true) {
    const content = await request(
      `${base}/browse/${encodedPath}?limit=${limit}&start=${start}`
    );
    if (Array.isArray(content.lines)) {
      lines.push(...content.lines.map((l) => l.text));
    }
    if (content.isLastPage !== false) break;
    start = content.nextPageStart;
    // Sikkerhetsbegrensning: maks 200 000 linjer per fil
    if (lines.length >= 200000) break;
  }
  return lines.join("\n");
}

// Filer som regnes som Jenkins-pipeline (dekker Jenkinsfile, Jenkinsfile.atlas, Jenkinsfile.groovy osv.)
function findJenkinsfile(fileList) {
  return fileList.find((f) => f === "Jenkinsfile" || f.startsWith("Jenkinsfile."));
}

module.exports = { repoApiPath, listAllFiles, fetchFileContent, findJenkinsfile };
