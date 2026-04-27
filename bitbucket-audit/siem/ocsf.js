"use strict";

/**
 * siem/ocsf.js — Transformerer en Argus-rapport til OCSF-hendelser (Open Cybersecurity Schema Framework).
 *
 * Støttede klasser:
 *   - Compliance Finding  (class_uid 2003) — bestått/feilet sjekker
 *   - Vulnerability Finding (class_uid 2002) — kjente sårbarheter fra dep-vulns
 *   - Detection Finding   (class_uid 2004) — hemmelige filer oppdaget (secrets-sjekk)
 *
 * OCSF-spesifikasjon: https://schema.ocsf.io/
 */

// ---------------------------------------------------------------------------
// Konfigurasjon
// ---------------------------------------------------------------------------

const OCSF_SCHEMA_VERSION = "1.3.0";

const PRODUCT_METADATA = {
  name: "Argus",
  vendor_name: "Internal",
  version: require("../package.json").version,
};

// OCSF severity_id-mapping fra Argus-alvorlighetsstrenger
const SEVERITY_ID = {
  CRITICAL: { id: 5, name: "Critical" },
  HIGH:     { id: 4, name: "High" },
  MEDIUM:   { id: 3, name: "Medium" },
  LOW:      { id: 2, name: "Low" },
  NONE:     { id: 1, name: "Informational" },
};

// Severity per sjekk-ID (basert på vektingen i forbedringsplanen)
const CHECK_SEVERITY = {
  "secrets":           { id: 4, name: "High" },
  "dep-vulns":         { id: 4, name: "High" },
  "owasp-dep-check":   { id: 4, name: "High" },
  "npm-audit":         { id: 4, name: "High" },
  "branch-protection": { id: 4, name: "High" },
  "pr-activity":       { id: 3, name: "Medium" },
  "codeowners":        { id: 3, name: "Medium" },
  "renovate":          { id: 3, name: "Medium" },
  "pipeline":          { id: 3, name: "Medium" },
  "readme":            { id: 2, name: "Low" },
  "tests":             { id: 2, name: "Low" },
  "linting":           { id: 2, name: "Low" },
  "stale":             { id: 2, name: "Low" },
};

// Krav/standarder per sjekk-ID (OpenSSF-referanser)
const CHECK_REQUIREMENTS = {
  "secrets":           ["OpenSSF Scorecard — Token-Permissions", "OWASP — Sensitive Data Exposure"],
  "dep-vulns":         ["OpenSSF Scorecard — Vulnerabilities", "OWASP — Known Vulnerable Components"],
  "owasp-dep-check":   ["OpenSSF Best Practices — OWASP Dependency-Check"],
  "npm-audit":         ["OpenSSF Best Practices — Dependency Audit in CI/CD"],
  "branch-protection": ["OpenSSF Scorecard — Branch-Protection"],
  "codeowners":        ["OpenSSF Best Practices — CODEOWNERS"],
  "renovate":          ["OpenSSF Best Practices — Automated Dependency Updates"],
  "pipeline":          ["OpenSSF Scorecard — CI-Tests", "DORA — Continuous Integration"],
  "pr-activity":       ["OpenSSF Scorecard — Code-Review"],
  "readme":            ["OpenSSF Best Practices — Documentation"],
  "tests":             ["OpenSSF Scorecard — CI-Tests"],
  "linting":           ["OpenSSF Best Practices — Static Analysis"],
  "stale":             ["DORA — Active Repository Maintenance"],
};

// ---------------------------------------------------------------------------
// Interne hjelpefunksjoner
// ---------------------------------------------------------------------------

function makeMetadata() {
  return {
    product: PRODUCT_METADATA,
    version: OCSF_SCHEMA_VERSION,
    log_name: "argus-compliance",
  };
}

function makeResource(repoResult) {
  return {
    type: "Repository",
    uid: `${repoResult.project}/${repoResult.repo}`,
    name: repoResult.repo,
    labels: [`project:${repoResult.project}`],
  };
}

/**
 * Bygger en OCSF Compliance Finding eller Detection Finding for én sjekk i ett repo.
 */
function makeCheckFinding(report, repoResult, checkId, checkLabel, bitbucketUrl) {
  const passed = repoResult.checks[checkId];
  const assessment = (repoResult.assessments && repoResult.assessments[checkId]) || "";
  const timeMs = new Date(report.generatedAt).getTime();

  const baseSeverity = CHECK_SEVERITY[checkId] || { id: 3, name: "Medium" };
  // Bestått sjekker er alltid Informational
  const severity = passed === true ? { id: 1, name: "Informational" } : baseSeverity;

  // Secrets-feiling => Detection Finding; alt annet => Compliance Finding
  const isDetection = checkId === "secrets" && passed === false;
  const classUid  = isDetection ? 2004 : 2003;
  const className = isDetection ? "Detection Finding" : "Compliance Finding";

  let status, statusDetail;
  if (passed === true) {
    status = "Pass";
    statusDetail = assessment || `${checkLabel} er konfigurert korrekt.`;
  } else {
    status = "Fail";
    statusDetail = assessment || `${checkLabel} mangler eller er ikke konfigurert.`;
  }

  const repoUrl = bitbucketUrl
    ? `${bitbucketUrl}/projects/${encodeURIComponent(repoResult.project)}/repos/${encodeURIComponent(repoResult.repo)}`
    : undefined;

  const event = {
    class_uid: classUid,
    class_name: className,
    category_uid: 2,
    category_name: "Findings",
    severity_id: severity.id,
    severity: severity.name,
    activity_id: 1,
    activity_name: "Create",
    time: timeMs,
    finding_info: {
      title: passed === true ? `${checkLabel} bestått` : `${checkLabel} ikke konfigurert`,
      uid: `argus:${checkId}:${repoResult.project}/${repoResult.repo}`,
      types: [isDetection ? "Detection" : "Compliance"],
    },
    compliance: {
      control: checkId,
      requirements: CHECK_REQUIREMENTS[checkId] || [],
      status,
      status_detail: statusDetail,
    },
    resources: [makeResource(repoResult)],
    metadata: makeMetadata(),
  };

  if (repoUrl) {
    event.finding_info.src_url = repoUrl;
  }

  return event;
}

/**
 * Bygger en OCSF Vulnerability Finding for én sårbarhet.
 */
function makeVulnerabilityFinding(report, repoResult, vuln, bitbucketUrl) {
  const timeMs = new Date(report.generatedAt).getTime();
  const sev = SEVERITY_ID[vuln.severity] || SEVERITY_ID.MEDIUM;

  const repoUrl = bitbucketUrl
    ? `${bitbucketUrl}/projects/${encodeURIComponent(repoResult.project)}/repos/${encodeURIComponent(repoResult.repo)}`
    : undefined;

  const cveObj = {
    uid: vuln.cveId || vuln.id,
    title: vuln.summary || vuln.id,
    references: vuln.references || [],
  };
  if (vuln.cvssScore != null) {
    cveObj.cvss = [{ base_score: vuln.cvssScore }];
  }

  const affectedPackage = {
    name: vuln.package,
    version: vuln.version,
    ecosystem: vuln.ecosystem,
  };
  if (vuln.fixedIn) {
    affectedPackage.fixed_in = vuln.fixedIn;
  }

  const event = {
    class_uid: 2002,
    class_name: "Vulnerability Finding",
    category_uid: 2,
    category_name: "Findings",
    severity_id: sev.id,
    severity: sev.name,
    activity_id: 1,
    activity_name: "Create",
    time: timeMs,
    finding_info: {
      title: vuln.summary || vuln.id,
      uid: `argus:vuln:${repoResult.project}/${repoResult.repo}:${vuln.id}`,
      types: ["Software Vulnerability"],
    },
    vulnerabilities: [
      {
        cve: cveObj,
        affected_packages: [affectedPackage],
      },
    ],
    resources: [makeResource(repoResult)],
    metadata: makeMetadata(),
  };

  if (repoUrl) {
    event.finding_info.src_url = repoUrl;
  }

  return event;
}

// ---------------------------------------------------------------------------
// Offentlig API
// ---------------------------------------------------------------------------

/**
 * Transformerer en Argus-rapport til en liste med OCSF-hendelser.
 *
 * @param {object}  report                    - Argus-rapport (fra buildReport)
 * @param {Array}   checks                    - Liste med sjekk-objekter ({id, label})
 * @param {object}  [options]
 * @param {string}  [options.bitbucketUrl]    - Base-URL til Bitbucket-instansen (default: BITBUCKET_URL)
 * @param {boolean} [options.includePassedChecks=false] - Inkluder bestått sjekker som hendelser
 * @returns {Array} OCSF-hendelser
 */
function toOcsfEvents(report, checks, options = {}) {
  const {
    bitbucketUrl = process.env.BITBUCKET_URL,
    includePassedChecks = false,
  } = options;

  const events = [];

  for (const repoResult of report.repos) {
    // Compliance / Detection-hendelser per sjekk
    for (const chk of checks) {
      const passed = repoResult.checks[chk.id];
      // null = ikke aktuelt — utelat alltid
      if (passed === null) continue;
      // Bestått — utelat med mindre flagget er satt
      if (passed === true && !includePassedChecks) continue;

      events.push(makeCheckFinding(report, repoResult, chk.id, chk.label, bitbucketUrl));
    }

    // Sårbarhetshendelser (Vulnerability Finding)
    if (Array.isArray(repoResult.vulnerabilities)) {
      for (const vuln of repoResult.vulnerabilities) {
        events.push(makeVulnerabilityFinding(report, repoResult, vuln, bitbucketUrl));
      }
    }
  }

  return events;
}

module.exports = { toOcsfEvents };
