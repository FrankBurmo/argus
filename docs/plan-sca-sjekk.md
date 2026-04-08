# Plan: Ny sjekk for sårbarheter i tredjepartsbiblioteker (SCA)

## 1. Bakgrunn

Argus reviderer Bitbucket-repos via REST API. De eksisterende sjekkene (`owasp`, `npmAudit`, `renovate`) verifiserer kun om repos **har konfigurert** SCA-verktøy i CI/CD-pipeline. De sjekker ikke faktiske sårbarheter.

En ny sjekk kan gå ett steg videre: **hente avhengighetsfiler fra repos og sjekke dem mot en sårbarhetsdatabase**.

---

## 2. Tilnærminger

### Alternativ A: Passiv sjekk (som dagens sjekker)

Sjekk om repoet har konfigurert et SCA-verktøy — utvider eksisterende `owasp.js` med flere verktøy.

**Fordeler:** Enkelt, raskt, ingen ekstern avhengighet.
**Ulemper:** Forteller ikke om faktiske sårbarheter.

### Alternativ B: Aktiv skanning via OSV.dev API ⭐ Anbefalt

Hent `package-lock.json`, `pom.xml`, `requirements.txt` osv. fra repoet via Bitbucket API, parse avhengighetene, og spør [OSV.dev API](https://osv.dev/) om kjente sårbarheter.

**Fordeler:** Finner faktiske sårbarheter, gratis, ingen API-nøkkel, åpen database.
**Ulemper:** Mer kompleks, krever parsing av avhengighetsfiler.

### Alternativ C: Aktiv skanning via npm audit registry API

For Node.js-prosjekter: Send `package-lock.json` direkte til npm registry sitt audit-endepunkt.

**Fordeler:** Offisiell npm-kilde, dekker npm-økosystemet godt.
**Ulemper:** Kun for npm, krever korrekt format.

---

## 3. Anbefalt løsning: OSV.dev API (Alternativ B)

### Hvorfor OSV.dev?

| Egenskap | OSV.dev | Snyk | OWASP DC | Trivy | Grype |
|---|---|---|---|---|---|
| **Gratis API uten nøkkel** | ✅ | ❌ (krever konto) | ❌ (lokal DB) | ❌ (CLI-verktøy) | ❌ (CLI-verktøy) |
| **REST API** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Krever kloning/bygging** | ❌ | Ja (CLI) | Ja | Ja | Ja |
| **Multi-økosystem** | ✅ (npm, Maven, PyPI, Go, m.fl.) | ✅ | ✅ | ✅ | ✅ |
| **Passer Argus-arkitekturen** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Åpen kildekode / åpen data** | ✅ (Google) | Delvis | ✅ (OWASP) | ✅ (Aqua) | ✅ (Anchore) |
| **GitHub-stjerner** | 8.7k | 5.5k | 7.5k | 34.4k | 12k |

**OSV.dev er det eneste verktøyet med gratis REST API som passer inn i Argus sin eksisterende arkitektur** (ren HTTP-basert, ingen kloning/bygging nødvendig).

### OSV.dev API-endepunkter

```
POST https://api.osv.dev/v1/query          — Spør om én pakke
POST https://api.osv.dev/v1/querybatch     — Spør om mange pakker samtidig (maks 1000)
```

**Eksempel — enkeltspørring:**
```json
{
  "package": {
    "name": "lodash",
    "ecosystem": "npm"
  },
  "version": "4.17.20"
}
```

**Eksempel — batch-spørring:**
```json
{
  "queries": [
    { "package": { "name": "lodash", "ecosystem": "npm" }, "version": "4.17.20" },
    { "package": { "name": "express", "ecosystem": "npm" }, "version": "4.17.1" }
  ]
}
```

**Respons:** Liste over kjente CVE-er/sårbarheter per pakke.

---

## 4. Implementasjonsplan

### Steg 1: Opprett `checks/depVulns.js`

```
checks/
  depVulns.js    ← NY
  index.js       ← Oppdateres med require("./depVulns")
  ...
```

### Steg 2: Sjekk-logikk

```
run(projectKey, repoSlug, request):
  1. Hent filliste via listAllFiles()
  2. Finn avhengighetsfiler (package-lock.json, package.json, pom.xml, build.gradle, requirements.txt, go.sum)
  3. Hvis ingen avhengighetsfiler → return null (ikke aktuelt)
  4. Hent filinnhold via Bitbucket browse-API
  5. Parse avhengigheter (navn + versjon + økosystem)
  6. Send batch-spørring til OSV.dev API
  7. Returner true (ingen sårbarheter) eller false (sårbarheter funnet)
```

### Steg 3: Parser-moduler (i `checks/parsers/`)

Trenger parsere for ulike filformater:

| Fil | Økosystem | Kompleksitet |
|---|---|---|
| `package-lock.json` | npm | Lav — JSON, flatt `dependencies`/`packages`-objekt |
| `package.json` | npm | Lav — men kun versjons-ranges, ikke eksakte versjoner |
| `pom.xml` | Maven | Medium — XML-parsing |
| `build.gradle` | Maven | Høy — Groovy DSL |
| `requirements.txt` | PyPI | Lav — én pakke per linje |
| `go.sum` / `go.mod` | Go | Lav — én pakke per linje |

**Anbefaling: Start med `package-lock.json`** (mest verdifullt for Node.js-prosjekter, enklest å parse).

### Steg 4: Assess-funksjon

```javascript
assess(projectKey, repoSlug, request, results) {
  // Hvis allerede dekket av OWASP DC eller npm audit i CI → "Dekket av eksisterende verktøy"
  // Ellers → "X sårbarheter funnet i Y pakker"
}
```

---

## 5. Skisse av `checks/depVulns.js`

```javascript
"use strict";

const { listAllFiles } = require("./utils");

// Økosystem-mapping for filtyper
const DEP_FILES = [
  { pattern: "package-lock.json", ecosystem: "npm", parser: parsePkgLock },
];

module.exports = {
  id: "dep-vulns",
  label: "Kjente sårbarheter i avhengigheter (OSV)",

  async run(projectKey, repoSlug, request) {
    try {
      const files = await listAllFiles(projectKey, repoSlug, request);

      // Finn avhengighetsfil(er)
      const depFile = files.find(f => f === "package-lock.json" || f.endsWith("/package-lock.json"));
      if (!depFile) return null; // Ikke aktuelt

      // Hent filinnhold fra Bitbucket
      const encoded = encodeURIComponent(depFile);
      const content = await request(
        `/rest/api/1.0/projects/${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repoSlug)}/browse/${encoded}?limit=50000`
      );

      // Parse avhengigheter
      const deps = parsePkgLock(content);
      if (deps.length === 0) return null;

      // Spør OSV.dev (batch, maks 1000 per kall)
      const vulns = await queryOsv(deps);

      return vulns.length === 0; // true = ingen sårbarheter
    } catch {
      return false;
    }
  },

  async assess(projectKey, repoSlug, request, results) {
    if (results["owasp-dep-check"] || results["npm-audit"]) {
      return "Dekket av eksisterende SCA-verktøy i CI/CD";
    }
    return "Anbefalt: Legg til sårbarhetsskanning av avhengigheter";
  },
};

function parsePkgLock(browseResponse) {
  // Bitbucket browse-API returnerer linjer, sett dem sammen
  const raw = browseResponse.lines.map(l => l.text).join("\n");
  const lock = JSON.parse(raw);

  const deps = [];
  // package-lock.json v2/v3 bruker "packages"-objekt
  const packages = lock.packages || {};
  for (const [path, info] of Object.entries(packages)) {
    if (!path || !info.version) continue; // Hopp over rot-pakken
    const name = path.replace("node_modules/", "");
    deps.push({ name, version: info.version, ecosystem: "npm" });
  }
  return deps;
}

async function queryOsv(deps) {
  const https = require("https");
  const BATCH_SIZE = 1000;
  const allVulns = [];

  for (let i = 0; i < deps.length; i += BATCH_SIZE) {
    const batch = deps.slice(i, i + BATCH_SIZE);
    const body = JSON.stringify({
      queries: batch.map(d => ({
        package: { name: d.name, ecosystem: d.ecosystem },
        version: d.version,
      })),
    });

    const result = await new Promise((resolve, reject) => {
      const req = https.request("https://api.osv.dev/v1/querybatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }, res => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => resolve(JSON.parse(data)));
      });
      req.on("error", reject);
      req.end(body);
    });

    // Samle sårbarheter
    result.results.forEach((r, idx) => {
      if (r.vulns && r.vulns.length > 0) {
        allVulns.push({ package: batch[idx].name, vulns: r.vulns });
      }
    });
  }

  return allVulns;
}
```

---

## 6. Registrering

Legg til i `checks/index.js`:

```javascript
module.exports = [
  require("./renovate"),
  require("./owasp"),
  require("./npmAudit"),
  require("./depVulns"),  // ← NY
];
```

---

## 7. Utvidelsesmuligheter (fase 2+)

| Fase | Beskrivelse |
|---|---|
| **Fase 1** | `package-lock.json` → OSV.dev (som beskrevet over) |
| **Fase 2** | Legg til `requirements.txt` (PyPI) og `go.sum` (Go) parsere |
| **Fase 3** | Legg til `pom.xml` (Maven) parser |
| **Fase 4** | Detaljert rapport med CVE-IDer, alvorlighetsgrad og anbefalte oppgraderinger |
| **Fase 5** | Caching av OSV-resultater for å redusere API-kall |

---

## 8. Open source-verktøy — referanseoversikt

### Verktøy som bruker API (passer Argus)

| Verktøy | Beskrivelse | Lisens |
|---|---|---|
| **[OSV.dev](https://osv.dev/)** | Googles åpne sårbarhetsdatabase med gratis REST API. Dekker npm, PyPI, Maven, Go, Rust, m.fl. | Apache 2.0 |
| **[OSV-Scanner](https://github.com/google/osv-scanner)** | CLI-frontend for OSV.dev. Go-basert. 8.7k ⭐ | Apache 2.0 |

### Verktøy som krever lokal kjøring (passer IKKE Argus direkte, men kan brukes i CI/CD)

| Verktøy | Beskrivelse | Lisens |
|---|---|---|
| **[OWASP Dependency-Check](https://owasp.org/www-project-dependency-check/)** | OWASP Flagship. Java-basert CLI med Maven/Gradle-plugin. Bruker NVD. 7.5k ⭐ | Apache 2.0 |
| **[Trivy](https://github.com/aquasecurity/trivy)** | Omfattende sikkerhetsskanner fra Aqua Security. Skanner container-images, filsystemer, Git-repos. 34.4k ⭐ | Apache 2.0 |
| **[Grype](https://github.com/anchore/grype)** | Sårbarhetsskanner fra Anchore. Rask, støtter mange økosystemer. 12k ⭐ | Apache 2.0 |
| **[Snyk CLI](https://github.com/snyk/cli)** | Kommersielt med gratis tier. Skanner kode, avhengigheter, containere, IaC. 5.5k ⭐ | Apache 2.0 |
| **[npm audit](https://docs.npmjs.com/cli/v10/commands/npm-audit)** | Innebygd i npm. Kun for Node.js-prosjekter. | — |

---

## 9. Risiko og hensyn

| Risiko | Tiltak |
|---|---|
| **OSV.dev API rate-limiting** | Bruk batch-endepunkt (1000 pakker per kall), legg inn pause mellom repos |
| **Store `package-lock.json`-filer** | Bitbucket browse-API har `limit`-parameter; sett høy nok verdi |
| **Falske positiver** | OSV.dev er generelt presis; vurder å filtrere på alvorlighetsgrad |
| **Parsing-feil** | Fang feil per repo og returner `false`, ikke krasj hele auditen |
| **Mange avhengigheter per repo** | Batch-endepunktet håndterer opptil 1000 per kall; del opp ved behov |

---

## 10. Oppsummering

**Anbefalt tilnærming:** Bruk OSV.dev sitt gratis REST API til å faktisk sjekke avhengigheter for kjente sårbarheter. Start med `package-lock.json` (npm), utvid til andre økosystemer etterhvert.

**Arbeidsmengde fase 1:** ~1 ny fil (`checks/depVulns.js`) + 1 linje i `checks/index.js`. Ingen nye npm-avhengigheter nødvendig (`https`-modulen er innebygd i Node.js).
