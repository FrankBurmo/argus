/* ================================================================
   Argus Frontend — Demodata-generator
   ================================================================ */
"use strict";

export function generateDemoData() {
  const projects = ["PLATFORM", "FRONTEND", "BACKEND", "DATA", "MOBILE"];
  const repoNames = ["api-gateway", "user-service", "payment-service", "web-app", "admin-portal",
    "auth-service", "notification-svc", "analytics-engine", "mobile-app", "data-pipeline",
    "config-server", "cdn-proxy", "logging-service", "search-api", "report-generator",
    "identity-provider", "file-storage", "email-service", "webhook-handler", "rate-limiter"];
  const checkIds = ["renovate", "owasp-dep-check", "npm-audit", "dep-vulns", "codeowners",
    "pipeline", "branch-protection", "secrets", "stale", "readme", "tests", "pr-activity", "linting"];

  // Realistiske demo-sårbarheter
  const demoVulns = [
    { id: "GHSA-c2qf-rxjj-qqgw", cveId: "CVE-2021-44906", summary: "Prototype Pollution in minimist", severity: "CRITICAL", severityRank: 4, cvssScore: 9.8, package: "minimist", version: "1.2.5", ecosystem: "npm", fixedIn: "1.2.6", aliases: ["CVE-2021-44906", "GHSA-c2qf-rxjj-qqgw"], references: [{ type: "ADVISORY", url: "https://github.com/advisories/GHSA-c2qf-rxjj-qqgw" }] },
    { id: "GHSA-35jh-r3h4-6jhm", cveId: "CVE-2021-23337", summary: "Command Injection in lodash", severity: "HIGH", severityRank: 3, cvssScore: 7.2, package: "lodash", version: "4.17.20", ecosystem: "npm", fixedIn: "4.17.21", aliases: ["CVE-2021-23337"], references: [{ type: "ADVISORY", url: "https://github.com/advisories/GHSA-35jh-r3h4-6jhm" }] },
    { id: "GHSA-p6mc-m468-83gw", cveId: "CVE-2022-25883", summary: "ReDoS vulnerability in semver", severity: "HIGH", severityRank: 3, cvssScore: 7.5, package: "semver", version: "6.3.0", ecosystem: "npm", fixedIn: "6.3.1", aliases: ["CVE-2022-25883"], references: [] },
    { id: "GHSA-952p-6rrq-rcjv", cveId: "CVE-2023-42282", summary: "Server-Side Request Forgery in ip", severity: "CRITICAL", severityRank: 4, cvssScore: 9.8, package: "ip", version: "1.1.8", ecosystem: "npm", fixedIn: "1.1.9", aliases: ["CVE-2023-42282"], references: [] },
    { id: "GHSA-4q6p-r6v2-jvc5", cveId: "CVE-2020-15168", summary: "Denial of Service in node-fetch", severity: "MEDIUM", severityRank: 2, cvssScore: 5.3, package: "node-fetch", version: "2.6.0", ecosystem: "npm", fixedIn: "2.6.1", aliases: ["CVE-2020-15168"], references: [] },
    { id: "GHSA-ww39-953v-wcq6", cveId: "CVE-2022-25858", summary: "ReDoS in terser", severity: "HIGH", severityRank: 3, cvssScore: 7.5, package: "terser", version: "5.14.1", ecosystem: "npm", fixedIn: "5.14.2", aliases: ["CVE-2022-25858"], references: [] },
    { id: "GHSA-3xgq-45jj-v275", cveId: "CVE-2022-37601", summary: "Prototype Pollution in loader-utils", severity: "CRITICAL", severityRank: 4, cvssScore: 9.8, package: "loader-utils", version: "2.0.2", ecosystem: "npm", fixedIn: "2.0.3", aliases: ["CVE-2022-37601"], references: [] },
    { id: "GHSA-67hx-6x53-jw92", cveId: "CVE-2023-36665", summary: "Prototype Pollution in protobufjs", severity: "HIGH", severityRank: 3, cvssScore: 8.8, package: "protobufjs", version: "6.11.2", ecosystem: "npm", fixedIn: "6.11.4", aliases: ["CVE-2023-36665"], references: [] },
    { id: "GHSA-2m39-62fm-q8r3", cveId: "CVE-2022-26612", summary: "Path traversal in Hadoop", severity: "HIGH", severityRank: 3, cvssScore: 8.8, package: "org.apache.hadoop:hadoop-common", version: "2.9.2", ecosystem: "Maven", fixedIn: "3.2.3", aliases: ["CVE-2022-26612"], references: [] },
    { id: "GHSA-jfh8-c2jp-5v3q", cveId: "CVE-2021-45046", summary: "Log4j RCE via Thread Context", severity: "CRITICAL", severityRank: 4, cvssScore: 9.0, package: "org.apache.logging.log4j:log4j-core", version: "2.15.0", ecosystem: "Maven", fixedIn: "2.16.0", aliases: ["CVE-2021-45046"], references: [{ type: "ADVISORY", url: "https://logging.apache.org/log4j/2.x/security.html" }] },
    { id: "GHSA-jfhm-5ghh-2f97", cveId: "CVE-2020-36518", summary: "Denial of Service via deeply nested objects in jackson-databind", severity: "HIGH", severityRank: 3, cvssScore: 7.5, package: "com.fasterxml.jackson.core:jackson-databind", version: "2.12.6", ecosystem: "Maven", fixedIn: "2.12.6.1", aliases: ["CVE-2020-36518"], references: [] },
    { id: "PYSEC-2021-421", cveId: "CVE-2021-41496", summary: "Buffer overflow in numpy", severity: "MEDIUM", severityRank: 2, cvssScore: 5.5, package: "numpy", version: "1.21.2", ecosystem: "PyPI", fixedIn: "1.22.0", aliases: ["CVE-2021-41496"], references: [] },
    { id: "PYSEC-2022-203", cveId: "CVE-2022-42969", summary: "ReDoS in py library", severity: "MEDIUM", severityRank: 2, cvssScore: 5.3, package: "py", version: "1.11.0", ecosystem: "PyPI", fixedIn: null, aliases: ["CVE-2022-42969"], references: [] },
    { id: "GO-2023-1571", cveId: "CVE-2022-41723", summary: "Denial of service via crafted HTTP/2 stream in net/http", severity: "HIGH", severityRank: 3, cvssScore: 7.5, package: "golang.org/x/net", version: "0.5.0", ecosystem: "Go", fixedIn: "0.7.0", aliases: ["CVE-2022-41723"], references: [] },
    { id: "GHSA-vvpx-j8f3-3w6h", cveId: "CVE-2023-28155", summary: "SSRF in request", severity: "MEDIUM", severityRank: 2, cvssScore: 6.1, package: "request", version: "2.88.2", ecosystem: "npm", fixedIn: null, aliases: ["CVE-2023-28155"], references: [] },
  ];

  const repos = [];
  for (let i = 0; i < 35; i++) {
    const project = projects[Math.floor(Math.random() * projects.length)];
    const repoName = repoNames[i % repoNames.length] + (i >= repoNames.length ? `-${Math.floor(i / repoNames.length)}` : "");
    const checks = {};
    const assessments = {};
    const vulnerabilities = [];

    for (const checkId of checkIds) {
      const rand = Math.random();
      if (rand < 0.6) checks[checkId] = true;
      else if (rand < 0.75) checks[checkId] = null;
      else {
        checks[checkId] = false;
        if (Math.random() < 0.6) {
          assessments[checkId] = "Anbefalt — bør konfigureres for bedre sikkerhet.";
        } else if (Math.random() < 0.5) {
          assessments[checkId] = "Ikke nødvendig — dette repoet har ingen relevante avhengigheter.";
        } else {
          assessments[checkId] = "Usikkert — kunne ikke vurdere automatisk.";
        }
      }
    }

    if (checks["dep-vulns"] === false) {
      const numVulns = Math.floor(Math.random() * 5) + 1;
      const available = [...demoVulns].sort(() => Math.random() - 0.5);
      for (let v = 0; v < Math.min(numVulns, available.length); v++) {
        vulnerabilities.push({ ...available[v] });
      }
    }

    if (checks["linting"] === true) {
      const linterCombos = [
        "Lintere funnet: ESLint, Prettier.",
        "Lintere funnet: Biome.",
        "Lintere funnet: ESLint.",
        "Lintere funnet: ESLint, Prettier, Stylelint.",
        "Lintere funnet: Ruff.",
        "Lintere funnet: Pylint, Ruff.",
        "Lintere funnet: Checkstyle, EditorConfig.",
      ];
      assessments["linting"] = linterCombos[i % linterCombos.length];
    }

    if (checks["codeowners"] === true) {
      const demoFiles = ["CODEOWNERS", ".github/CODEOWNERS", "docs/CODEOWNERS", "CODEOWNERS.md"];
      assessments["codeowners"] = `Funnet: ${demoFiles[i % demoFiles.length]}`;
    }

    repos.push({ project, repo: repoName, checks, assessments, vulnerabilities });
  }

  const byCheck = {};
  for (const checkId of checkIds) {
    const passed = repos.filter(r => r.checks[checkId] === true).length;
    const notApplicable = repos.filter(r => r.checks[checkId] === null).length;
    const coveredByAlt = repos.filter(r =>
      r.checks[checkId] === false && r.assessments[checkId]?.startsWith("Ikke nødvendig")
    ).length;
    const failed = repos.filter(r => r.checks[checkId] === false).length - coveredByAlt;
    const applicable = repos.length - notApplicable;
    const covered = passed + coveredByAlt;
    byCheck[checkId] = {
      passed, failed, coveredByAlt, notApplicable,
      coveragePercent: applicable ? +((covered / applicable) * 100).toFixed(1) : 0,
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    checks: checkIds,
    summary: { total: repos.length, byCheck },
    repos,
  };
}
