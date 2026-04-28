"use strict";

const https = require("https");
const { listAllFiles, fetchFileContent } = require("./utils");

// Offline OSV-modus via lokal SQLite-database
const OSV_OFFLINE = (process.env.OSV_OFFLINE || "").toLowerCase() === "true";
let osvLocal = null;
if (OSV_OFFLINE) {
  try {
    osvLocal = require("../../osv-local/dist");
  } catch (err) {
    console.error("[depVulns] Kunne ikke laste osv-local — kjør 'npm run build' i osv-local/:", err.message);
  }
}

// ---------------------------------------------------------------------------
// Konfigurasjon
// ---------------------------------------------------------------------------

// Avhengighetsfiler vi leter etter, med tilhørende økosystem og parser
const DEP_FILE_DEFS = [
  { filename: "package-lock.json", ecosystem: "npm", parse: parsePkgLock },
  // mvn-dependency-list.txt (output fra «mvn dependency:list -DoutputFile=mvn-dependency-list.txt»)
  // gir fullstendige transitive avhengigheter med oppløste versjoner — foretrekkes over pom.xml
  { filename: "mvn-dependency-list.txt", ecosystem: "Maven", parse: parseMvnDepList },
  { filename: "pom.xml", ecosystem: "Maven", parse: parsePomXml },
  { filename: "requirements.txt", ecosystem: "PyPI", parse: parseRequirementsTxt },
  { filename: "go.mod", ecosystem: "Go", parse: parseGoMod },
];

// OSV alvorlighetsgrad-rangering (lavest → høyest)
const SEVERITY_RANK = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

// In-memory cache per kjøring: "ecosystem|name|version" → vulns-array
const vulnCache = new Map();

// Cache for fullstendige sårbarhetsobjekter fra GET /v1/vulns/{id}
const vulnDetailCache = new Map();

// ---------------------------------------------------------------------------
// Hjelpefunksjoner
// ---------------------------------------------------------------------------

/**
 * Henter høyeste alvorlighetsgrad fra en OSV-sårbarhet.
 * Primærkilde: database_specific.severity (tekstlabel satt av kilden).
 * Sekundær: CVSS-numerisk score der score-feltet faktisk er et tall (ikke vektor).
 */
function getMaxSeverity(vuln) {
  let max = 0;

  // Sjekk database_specific.severity (brukt av GHSA, NVD m.fl.)
  // GitHub bruker "MODERATE" der standard OSV bruker "MEDIUM" — normaliser
  if (vuln.database_specific && vuln.database_specific.severity) {
    const raw = vuln.database_specific.severity.toUpperCase();
    const sev = raw === "MODERATE" ? "MEDIUM" : raw;
    if (SEVERITY_RANK[sev] !== undefined) {
      max = Math.max(max, SEVERITY_RANK[sev]);
    }
  }

  // Fallback: sjekk ecosystem_specific
  if (vuln.ecosystem_specific && vuln.ecosystem_specific.severity) {
    const raw = vuln.ecosystem_specific.severity.toUpperCase();
    const sev = raw === "MODERATE" ? "MEDIUM" : raw;
    if (SEVERITY_RANK[sev] !== undefined) {
      max = Math.max(max, SEVERITY_RANK[sev]);
    }
  }

  // Siste fallback: numerisk CVSS-score i severity[].score (kun der det faktisk er et tall)
  if (max === 0 && Array.isArray(vuln.severity)) {
    for (const s of vuln.severity) {
      if (s.score) {
        const cvss = parseFloat(s.score);
        if (!isNaN(cvss)) {
          if (cvss >= 9.0) max = Math.max(max, SEVERITY_RANK.CRITICAL);
          else if (cvss >= 7.0) max = Math.max(max, SEVERITY_RANK.HIGH);
          else if (cvss >= 4.0) max = Math.max(max, SEVERITY_RANK.MEDIUM);
          else if (cvss > 0) max = Math.max(max, SEVERITY_RANK.LOW);
        }
      }
    }
  }

  return max;
}

// ---------------------------------------------------------------------------
// Parsere — henter ut avhengigheter (navn + versjon) fra ulike filformater
// ---------------------------------------------------------------------------

/**
 * Parser for package-lock.json (v2/v3).
 * Returnerer [{ name, version, ecosystem }].
 */
function parsePkgLock(raw) {
  const deps = [];
  try {
    const lock = JSON.parse(raw);

    // v2/v3: "packages"-objekt
    if (lock.packages) {
      for (const [pkgPath, info] of Object.entries(lock.packages)) {
        if (!pkgPath || !info.version) continue;
        // Ekstraherer pakkenavn fra stien (f.eks. "node_modules/@scope/pkg" → "@scope/pkg")
        const name = pkgPath.replace(/^node_modules\//, "");
        if (!name) continue;
        deps.push({ name, version: info.version, ecosystem: "npm" });
      }
    }

    // v1 fallback: "dependencies"-objekt
    if (deps.length === 0 && lock.dependencies) {
      for (const [name, info] of Object.entries(lock.dependencies)) {
        if (!info.version) continue;
        deps.push({ name, version: info.version, ecosystem: "npm" });
      }
    }
  } catch {
    // Ugyldig JSON — returner tom liste
  }
  return deps;
}

/**
 * Parser for pom.xml (Maven).
 * Henter <dependency>-blokker med groupId, artifactId og versjon.
 * Løser opp ${property}-referanser fra <properties>-blokken.
 * Hopper over <dependencyManagement>-seksjoner (kun versjonskatalog).
 * OSV Maven-format: "groupId:artifactId".
 */
function parsePomXml(raw) {
  const deps = [];

  // Fjern <dependencyManagement>-blokken slik at dens <dependency>-entries
  // ikke feiltolkes som faktiske runtime-avhengigheter
  const rawWithoutDm = raw.replace(/<dependencyManagement>[\s\S]*?<\/dependencyManagement>/gi, "");

  // Trekk ut <properties> og bygg opp et oppslag for property-oppløsning
  const propsMap = {};
  const propsMatch = rawWithoutDm.match(/<properties>([\s\S]*?)<\/properties>/i);
  if (propsMatch) {
    const propRe = /<([a-zA-Z0-9._-]+)>\s*([^<]+?)\s*<\/[a-zA-Z0-9._-]+>/g;
    let pm;
    while ((pm = propRe.exec(propsMatch[1])) !== null) {
      propsMap[pm[1]] = pm[2].trim();
    }
  }

  // Løser opp ${key}-referanser mot propsMap
  function resolveVersion(v) {
    if (!v) return null;
    const m = v.match(/^\$\{([^}]+)\}$/);
    if (m) return propsMap[m[1]] || null; // ukjent property → hopp over
    if (v.includes("${")) return null;   // blandet uttrykk → ikke støttet
    return v;
  }

  // Match <dependency>-blokker (ikke-grådig for å håndtere flere blokker)
  const depBlockRe = /<dependency>([\s\S]*?)<\/dependency>/gi;
  let block;
  while ((block = depBlockRe.exec(rawWithoutDm)) !== null) {
    const inner = block[1];
    const groupId = extractXmlTag(inner, "groupId");
    const artifactId = extractXmlTag(inner, "artifactId");
    const version = resolveVersion(extractXmlTag(inner, "version"));

    if (!groupId || !artifactId || !version) continue;

    deps.push({
      name: `${groupId}:${artifactId}`,
      version,
      ecosystem: "Maven",
    });
  }
  return deps;
}

/**
 * Henter tekst-innholdet i en XML-tag (enkel, ikke-rekursiv).
 */
function extractXmlTag(xml, tagName) {
  const re = new RegExp(`<${tagName}>\\s*([^<]+?)\\s*</${tagName}>`, "i");
  const m = xml.match(re);
  return m ? m[1] : null;
}

/**
 * Parser for utdata fra «mvn dependency:list».
 *
 * Støttede linjeformater:
 *   groupId:artifactId:type:version:scope
 *   groupId:artifactId:type:version:classifier:scope
 *   [INFO]    groupId:artifactId:type:version:scope   (konsollog-format)
 *
 * Fordeler over parsePomXml:
 *   - Inkluderer transitive avhengigheter
 *   - Alle versjoner er allerede oppløst (ingen ${property}-referanser)
 *   - Fanger avhengigheter styrt av BOM/parent-POM uten eksplisitt <version>
 *
 * Generer filen med:
 *   mvn dependency:list -DoutputFile=mvn-dependency-list.txt -DappendOutput=false
 *
 * OSV Maven-format: "groupId:artifactId".
 */
function parseMvnDepList(raw) {
  const deps = [];
  const seen = new Set();

  for (const line of raw.split("\n")) {
    // Fjern ledende/følgende mellomrom og valgfri [INFO]-prefiks fra konsollog
    const trimmed = line.trim().replace(/^\[INFO\]\s*/, "").trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Format: groupId:artifactId:type:version[:classifier]:scope
    // Minimum 5 deler (uten klassifiserer); 6 deler med klassifiserer.
    // Versjonen er alltid på indeks 3 i begge formater.
    const parts = trimmed.split(":");
    if (parts.length < 5) continue;

    const groupId = parts[0].trim();
    const artifactId = parts[1].trim();
    const version = parts[3].trim();

    // Hopp over linjer som ikke ser ut som Maven-koordinater
    // (gruppeId og artifaktId skal ikke inneholde mellomrom)
    if (!groupId || !artifactId || !version) continue;
    if (/\s/.test(groupId) || /\s/.test(artifactId) || /\s/.test(version)) continue;

    const name = `${groupId}:${artifactId}`;
    const key = `${name}@${version}`;
    if (seen.has(key)) continue;
    seen.add(key);

    deps.push({ name, version, ecosystem: "Maven" });
  }

  return deps;
}

/**
 * Parser for requirements.txt (Python).
 * Støtter "pakke==versjon"-format.
 */
function parseRequirementsTxt(raw) {
  const deps = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) continue;
    const match = trimmed.match(/^([a-zA-Z0-9_.-]+)==([^\s;#]+)/);
    if (match) {
      deps.push({ name: match[1], version: match[2], ecosystem: "PyPI" });
    }
  }
  return deps;
}

/**
 * Parser for go.mod.
 * Henter require-blokker med modul og versjon.
 * go.mod representerer hva som faktisk er kompilert — i motsetning til go.sum
 * som også inneholder hashes for moduler som ikke er i aktiv bruk.
 */
function parseGoMod(raw) {
  const deps = [];
  const seen = new Set();
  let inBlock = false;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("//")) continue;

    if (/^require\s*\(/.test(trimmed)) {
      inBlock = true;
      continue;
    }
    if (trimmed === ")") {
      inBlock = false;
      continue;
    }

    let match;
    if (inBlock) {
      // Inne i require-blokk: "modulsti versjon [// indirect]"
      match = trimmed.match(/^([^\s]+)\s+(v[^\s]+)/);
    } else {
      // Enkelt require: "require modulsti versjon"
      match = trimmed.match(/^require\s+([^\s]+)\s+(v[^\s]+)/);
    }

    if (match) {
      const name = match[1];
      const version = match[2].replace(/^v/, "");
      const key = `${name}@${version}`;
      if (!seen.has(key)) {
        seen.add(key);
        deps.push({ name, version, ecosystem: "Go" });
      }
    }
  }

  return deps;
}

/**
 * Parser for go.sum (beholdt for referanse/testing).
 * Format: "modul versjon hash"
 * NB: go.sum inneholder hashes for alle nedlastede moduler, inkludert
 * indirekte avhengigheter som ikke nødvendigvis er i aktiv bruk.
 */
function parseGoSum(raw) {
  const seen = new Set();
  const deps = [];
  for (const line of raw.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) continue;
    const name = parts[0];
    // Fjern "v"-prefiks og "/go.mod"-suffix fra versjon
    const version = parts[1].replace(/\/go\.mod$/, "").replace(/^v/, "");
    const key = `${name}@${version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deps.push({ name, version, ecosystem: "Go" });
  }
  return deps;
}

// ---------------------------------------------------------------------------
// OSV.dev API-integrasjon
// ---------------------------------------------------------------------------

/**
 * Henter ett fullstendig sårbarhetsobjekt fra OSV via GET /v1/vulns/{id}.
 */
function osvGet(vulnId) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      `https://api.osv.dev/v1/vulns/${encodeURIComponent(vulnId)}`,
      { method: "GET" },
      (res) => {
        let buf = "";
        res.on("data", (chunk) => (buf += chunk));
        res.on("end", () => {
          try { resolve(JSON.parse(buf)); }
          catch { reject(new Error(`Ugyldig OSV-respons for ${vulnId}: ${buf.slice(0, 100)}`)); }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

/**
 * Enricher en liste med avkortede sårbarhetsobjekter (kun id+modified fra querybatch)
 * ved å hente fullstendige detaljer fra GET /v1/vulns/{id} for unkjente IDer.
 * Bruker vulnDetailCache for å unngå duplikatkall på tvers av repos.
 */
async function enrichVulns(rawVulns) {
  const CONCURRENCY = 10;

  // Finn IDer vi ikke allerede har cachet
  const toFetch = [...new Set(
    rawVulns.map((v) => v.id).filter((id) => !vulnDetailCache.has(id))
  )];

  // Hent detaljer parallelt i bolker for å ikke overvelde API-et
  for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
    const batch = toFetch.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (id) => {
        try {
          vulnDetailCache.set(id, await osvGet(id));
        } catch {
          // Marker som null for å unngå gjentatte forsøk
          vulnDetailCache.set(id, null);
        }
      })
    );
  }

  // Bytt ut avkortede objekter med fullstendige (behold original som fallback)
  return rawVulns.map((v) => vulnDetailCache.get(v.id) || v);
}

/**
 * Sender en POST-forespørsel til OSV.dev og returnerer JSON-respons.
 */
function osvRequest(endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(`https://api.osv.dev/v1/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    }, (res) => {
      let buf = "";
      res.on("data", (chunk) => (buf += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(buf));
        } catch {
          reject(new Error(`Ugyldig OSV-respons: ${buf.slice(0, 200)}`));
        }
      });
    });
    req.on("error", reject);
    req.end(data);
  });
}

/**
 * Plukker ut nøkkelinfo fra en OSV-sårbarhet til et kompakt format
 * egnet for rapportgenerering og GUI-visning.
 */
function summarizeVuln(vuln, pkgName, pkgVersion, ecosystem) {
  const sevRank = getMaxSeverity(vuln);
  const sevLabel = Object.entries(SEVERITY_RANK)
    .find(([, v]) => v === sevRank)?.[0] || "UNKNOWN";

  // Hent CVSS-score (v3 foretrukket).
  // NB: OSV severity[].score er en CVSS-vektorstreng (eks. "CVSS:3.1/AV:N/..."),
  // ikke et flytall — hent numerisk score fra database_specific i stedet.
  let cvssScore = null;
  if (vuln.database_specific && typeof vuln.database_specific.cvss_score === "number") {
    cvssScore = vuln.database_specific.cvss_score;
  } else if (vuln.database_specific && typeof vuln.database_specific.cvss === "number") {
    cvssScore = vuln.database_specific.cvss;
  }

  // Hent CVE-alias
  const aliases = vuln.aliases || [];
  const cveId = aliases.find((a) => a.startsWith("CVE-")) || null;

  // Hent fikset versjon fra affected-blokker
  let fixedIn = null;
  if (Array.isArray(vuln.affected)) {
    for (const aff of vuln.affected) {
      if (!aff.ranges) continue;
      for (const range of aff.ranges) {
        if (!range.events) continue;
        for (const ev of range.events) {
          if (ev.fixed) fixedIn = ev.fixed;
        }
      }
    }
  }

  // Hent referanselenker (maks 5)
  const references = (vuln.references || [])
    .slice(0, 5)
    .map((r) => ({ type: r.type, url: r.url }));

  return {
    id: vuln.id,
    aliases,
    cveId,
    summary: vuln.summary || (vuln.details ? vuln.details.slice(0, 200) : "Ingen beskrivelse"),
    severity: sevLabel,
    severityRank: sevRank,
    cvssScore,
    package: pkgName,
    version: pkgVersion,
    ecosystem,
    fixedIn,
    references,
  };
}

/**
 * Spør OSV lokalt (offline) om sårbarheter for en liste avhengigheter.
 * Bruker osv-local-modulen med lokal SQLite-database.
 * Returnerer [{ package, version, ecosystem, vulns }] — kun pakker med treff.
 */
async function queryOsvLocal(deps) {
  if (!osvLocal) throw new Error("osv-local er ikke tilgjengelig");

  const results = [];

  for (const dep of deps) {
    const key = `${dep.ecosystem}|${dep.name}|${dep.version}`;
    if (vulnCache.has(key)) {
      const cached = vulnCache.get(key);
      if (cached.length > 0) {
        results.push({ package: dep.name, version: dep.version, ecosystem: dep.ecosystem, vulns: cached });
      }
      continue;
    }

    try {
      const response = await osvLocal.query({
        package: { name: dep.name, ecosystem: dep.ecosystem },
        version: dep.version,
      });
      const vulns = response.vulns || [];
      vulnCache.set(key, vulns);
      if (vulns.length > 0) {
        results.push({ package: dep.name, version: dep.version, ecosystem: dep.ecosystem, vulns });
      }
    } catch (err) {
      console.error(`[depVulns] Lokal OSV-feil for ${dep.name}@${dep.version}: ${err.message}`);
    }
  }

  return results;
}

/**
 * Spør OSV.dev om sårbarheter for en liste avhengigheter.
 * Bruker in-memory cache per kjøring for å unngå dupliserte kall.
 * Returnerer [{ package, version, ecosystem, vulns }] — kun pakker med treff.
 */
async function queryOsvBatch(deps) {
  const BATCH_SIZE = 1000;
  const results = [];

  // Skille cached fra ikke-cached
  const uncached = [];
  const uncachedIdx = [];
  for (let i = 0; i < deps.length; i++) {
    const key = `${deps[i].ecosystem}|${deps[i].name}|${deps[i].version}`;
    if (vulnCache.has(key)) {
      const cached = vulnCache.get(key);
      if (cached.length > 0) {
        results.push({ package: deps[i].name, version: deps[i].version, ecosystem: deps[i].ecosystem, vulns: cached });
      }
    } else {
      uncached.push(deps[i]);
      uncachedIdx.push(i);
    }
  }

  // Spør OSV for ukjente avhengigheter i batches
  for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
    const batch = uncached.slice(i, i + BATCH_SIZE);
    const body = {
      queries: batch.map((d) => ({
        package: { name: d.name, ecosystem: d.ecosystem },
        version: d.version,
      })),
    };

    try {
      const response = await osvRequest("querybatch", body);
      if (!response.results) continue;

      // Samle alle unike vuln-IDer på tvers av batch for enrichment i ett pass
      const allRawVulns = response.results.flatMap((r) => r.vulns || []);
      await enrichVulns(allRawVulns);

      for (let j = 0; j < response.results.length; j++) {
        const dep = batch[j];
        const key = `${dep.ecosystem}|${dep.name}|${dep.version}`;
        // Bytt ut avkortede objekter med fullstendige fra cache
        const fullVulns = (response.results[j].vulns || []).map(
          (v) => vulnDetailCache.get(v.id) || v
        );

        // Legg i cache (også tomme resultater for å unngå nye kall)
        vulnCache.set(key, fullVulns);

        if (fullVulns.length > 0) {
          results.push({ package: dep.name, version: dep.version, ecosystem: dep.ecosystem, vulns: fullVulns });
        }
      }
    } catch (err) {
      // Ved feil mot OSV — marker uncached deps som ukjent (ikke cache feil)
      console.error(`[depVulns] OSV-batch-feil (${batch.length} pakker): ${err.message}`);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Intern skannefunksjon (delt mellom run og collectVulnerabilities)
// ---------------------------------------------------------------------------

async function scanRepo(projectKey, repoSlug, request) {
  const files = await listAllFiles(projectKey, repoSlug, request);

  let allDeps = [];

  for (const def of DEP_FILE_DEFS) {
    const match = files.find(
      (f) => f === def.filename || f.endsWith("/" + def.filename)
    );
    if (!match) continue;

    try {
      const raw = await fetchFileContent(projectKey, repoSlug, match, request, { paginate: true });
      const deps = def.parse(raw);
      allDeps = allDeps.concat(deps);
    } catch {
      // Feil ved lesing/parsing av enkelt fil — fortsett med neste
    }
  }

  if (allDeps.length === 0) return { passed: null, vulnerabilities: [] };

  // Velg online (osv.dev API) eller offline (lokal SQLite) basert på OSV_OFFLINE
  const hits = OSV_OFFLINE && osvLocal
    ? await queryOsvLocal(allDeps)
    : await queryOsvBatch(allDeps);

  // Transformer hits til flat liste med kompakt sårbarhetsinformasjon
  const vulnerabilities = [];
  const seenVulns = new Set();
  for (const hit of hits) {
    for (const vuln of hit.vulns) {
      // Dedupliser: samme sårbarhet fra ulike stier i samme repo
      const key = `${vuln.id}|${hit.package}|${hit.version}`;
      if (seenVulns.has(key)) continue;
      seenVulns.add(key);
      vulnerabilities.push(summarizeVuln(vuln, hit.package, hit.version, hit.ecosystem));
    }
  }

  // Sorter: CRITICAL → HIGH → MEDIUM → LOW → UNKNOWN
  vulnerabilities.sort((a, b) => b.severityRank - a.severityRank);

  return { passed: hits.length === 0, vulnerabilities };
}

// ---------------------------------------------------------------------------
// Sjekk-eksport
// ---------------------------------------------------------------------------

module.exports = {
  id: "dep-vulns",
  label: "Kjente sårbarheter i avhengigheter (OSV)",

  /**
   * Sjekker om repoet har tredjepartsavhengigheter med kjente sårbarheter.
   *
   * Returnerer:
   *   true  — ingen sårbarheter funnet
   *   false — sårbarheter funnet
   *   null  — ingen gjenkjente avhengighetsfiler (ikke aktuelt)
   */
  async run(projectKey, repoSlug, request) {
    try {
      const result = await scanRepo(projectKey, repoSlug, request);
      return result.passed;
    } catch {
      return false;
    }
  },

  /**
   * Returnerer detaljert liste over faktiske sårbarheter funnet i repoet.
   * Bruker OSV-cache fra run(), så kall dette etter run().
   *
   * Returnerer [{ id, cveId, summary, severity, cvssScore, package, version,
   *               ecosystem, fixedIn, references, aliases }]
   */
  async collectVulnerabilities(projectKey, repoSlug, request) {
    try {
      const result = await scanRepo(projectKey, repoSlug, request);
      return result.vulnerabilities;
    } catch {
      return [];
    }
  },

  /**
   * Vurderer om repoet bør ha sårbarhetsskanning.
   */
  async assess(projectKey, repoSlug, request, result) {
    try {
      // Allerede dekket av CI/CD-basert skanning?
      if (result && (result.checks["owasp-dep-check"] === true || result.checks["npm-audit"] === true)) {
        return "Dekket — har allerede SCA-verktøy i CI/CD-pipeline.";
      }

      const files = await listAllFiles(projectKey, repoSlug, request);
      const depIndicators = [
        "package.json", "pom.xml", "build.gradle", "build.gradle.kts",
        "requirements.txt", "Pipfile", "pyproject.toml", "go.mod",
        "Cargo.toml", "Gemfile", "composer.json",
      ];
      const hasDeps = files.some((f) => depIndicators.includes(f));

      if (!hasDeps) {
        return "Ikke nødvendig — ingen gjenkjente avhengighetsfiler.";
      }

      return "Anbefalt — har avhengigheter med kjente sårbarheter over terskelverdi.";
    } catch {
      return "Kunne ikke vurdere — feil ved henting av filer.";
    }
  },

  // Eksponert for testing
  _parsePkgLock: parsePkgLock,
  _parseMvnDepList: parseMvnDepList,
  _parsePomXml: parsePomXml,
  _parseRequirementsTxt: parseRequirementsTxt,
  _parseGoMod: parseGoMod,
  _parseGoSum: parseGoSum,
  _vulnCache: vulnCache,
};
