# Spesifikasjon: lokal OSV-API-erstatning

## Kontekst

En eksisterende Node.js/TypeScript CLI-tjeneste scanner Bitbucket-repositorier og bygger opp `{name, version, ecosystem}`-par fra avhengighetsfiler (f.eks. `package.json`, `pom.xml`). I dag kaller tjenesten `https://api.osv.dev/v1/query` per pakke for å sjekke kjente sårbarheter. Målet er å legge til  en feature som kan erstatte disse utgående API-kallene med et lokalt alternativ slik at avhengighetsinformasjon ikke lekkes til eksterne tjenester. MERK: eksisterende funksjonalitet for API-tilgang skal bestå, men det spesifiseres i .env-filen hvorhvidt man skal kjøre offline eller online sjekker. I env-filen skal de også defineres hvilke osv-zip filer som skal lastes ned og brukes. Typisk spesifiserer man da npm, maven og lignende.

OSV-filene hentes herfra: https://storage.googleapis.com/osv-vulnerabilities/index.html , dokumentasjon her: https://google.github.io/osv.dev/data/#current-data-sources . Eksempel: download over HTTP via https://storage.googleapis.com/osv-vulnerabilities/PyPI/all.zip

Tjenesten kjøres som et **CLI-verktøy** — ikke som en langlevende prosess. Det finnes ingen bakgrunnsjobb eller scheduler. Synkronisering av OSV-databasen skjer som en del av selve skannekommandoen.

---

## Mål

Bygg en TypeScript-modul (`osv-local`) som:

1. Holder en lokal SQLite-database med OSV-sårbarhetsposter
2. Synkroniserer databasen automatisk ved behov, uten eksplisitt brukerhandling
3. Eksponerer en query-funksjon med **identisk interface** som det eksisterende kallet mot `api.osv.dev/v1/query`

Tjenesten som kaller modulen skal ikke trenge å endre noe annet enn importen.

---

## Teknisk stack

- **Språk:** TypeScript
- **Runtime:** Node.js 20+
- **Database:** SQLite via `better-sqlite3`
- **Semver-matching:** `semver`-pakken (npm)
- **HTTP-klient (for synk):** innebygd `fetch` (Node.js 18+)
- **Zip-håndtering:** `adm-zip`

Ingen ekstern scheduler eller bakgrunnsprosess.

---

## Filstruktur

```
osv-local/
  src/
    db.ts          ← SQLite-oppsett, schema, migrasjoner
    sync.ts        ← last ned zip-filer, pakk ut, indekser i SQLite
    query.ts       ← query-logikk inkl. semver-matching
    index.ts       ← public API
  data/
    osv.db         ← SQLite-databasefil (gitignorert)
    cache/         ← nedlastede zip-filer (gitignorert)
  package.json
  tsconfig.json
```

Plasseringen av `data/` skal kunne overstyres via miljøvariabel `OSV_LOCAL_DATA_DIR`, slik at CLI-verktøyet kan styre hvor databasen lagres (f.eks. `~/.config/mitt-verktøy/osv/`).

---

## SQLite-schema

```sql
CREATE TABLE IF NOT EXISTS vulns (
  id            TEXT NOT NULL,
  ecosystem     TEXT NOT NULL,
  package_name  TEXT NOT NULL,
  introduced    TEXT,           -- semver eller "0"
  fixed         TEXT,           -- semver eller NULL (betyr "ingen fix")
  last_affected TEXT,           -- alternativ til fixed i noen OSV-poster
  raw           TEXT NOT NULL   -- hele OSV-JSON-objektet serialisert
);

CREATE INDEX IF NOT EXISTS idx_pkg
  ON vulns(ecosystem, package_name);

CREATE TABLE IF NOT EXISTS sync_state (
  ecosystem      TEXT PRIMARY KEY,
  last_synced_at TEXT NOT NULL   -- ISO 8601 tidsstempel
);
```

Hver rad representerer én `affected[].ranges[].events`-kombinasjon fra et OSV-objekt. Et OSV-objekt med flere pakker eller ranges gir flere rader, men `raw` inneholder alltid det fulle originale objektet.

---

## Synkroniseringsstrategi

### Prinsipp: automatisk synk ved behov, ikke eksplisitt

Modulen skal selv avgjøre om databasen er fersk nok, uten at kallende kode trenger å bry seg om det. Dette skjer som en del av `ensureReady()`-funksjonen som kalles internt før første query i en kjøring.

### Alder-terskel

Konfigurerbar via miljøvariabel `OSV_LOCAL_MAX_AGE_HOURS` (standard: `24`). Hvis alle relevante økosystemer har en `last_synced_at` nyere enn terskelen, hoppes synk over og skanningen starter umiddelbart. Hvis ett eller flere økosystemer mangler eller er foreldet, kjøres synk for disse.

```typescript
async function ensureReady(ecosystems: string[]): Promise<void> {
  const stale = getStaleEcosystems(ecosystems); // sjekker sync_state mot MAX_AGE_HOURS
  if (stale.length > 0) {
    await sync(stale);
  }
}
```

`ensureReady()` kalles automatisk fra `query()` og `queryBatch()` første gang de brukes i en prosesslevetid — én gang per CLI-kjøring, ikke per kall. Bruk en modul-nivå boolean `let ready = false` som guard.

### Hvilke økosystemer som synkes

Konfigurerbart via miljøvariabel `OSV_LOCAL_ECOSYSTEMS` (kommaseparert) eller som argument til `init()`. Standardliste:

```typescript
const DEFAULT_ECOSYSTEMS = [
  "npm",
  "PyPI",
  "Maven",
  "Go",
  "crates.io",
  "NuGet",
  "RubyGems",
];
```

Modulen synker kun de økosystemene som faktisk er i bruk i gjeldende skanning. Kallende kode kan signalere dette ved initialisering:

```typescript
await init({ ecosystems: ["npm", "Maven"] });
```

### Full synk vs. delta-synk

**Full synk** kjøres når et økosystem ikke finnes i `sync_state` (første kjøring, eller etter manuell sletting av databasen):

1. Last ned `https://storage.googleapis.com/osv-vulnerabilities/{ECOSYSTEM}/all.zip`
2. Pakk ut alle `.json`-filer
3. Iterer over hvert OSV-objekt og kall `indexOsvObject()` (se under)
4. Sett inn alle rader i én enkelt transaksjon
5. Oppdater `sync_state` med nåværende tidsstempel

**Delta-synk** kjøres når et økosystem finnes i `sync_state` men er eldre enn `MAX_AGE_HOURS`:

1. Last ned `https://storage.googleapis.com/osv-vulnerabilities/{ECOSYSTEM}/modified_id.csv`
2. Formatet er `<iso-dato>,<id>` sortert synkende på dato
3. Les linjer til datoen er eldre enn `last_synced_at` — stopp der
4. Last ned og re-indekser kun de endrede postene individuelt:
   ```
   https://storage.googleapis.com/osv-vulnerabilities/{ECOSYSTEM}/{ID}.json
   ```
5. Oppdater `sync_state`

### Parsing av OSV-objekt

Brukes av begge synk-typer:

```typescript
function indexOsvObject(db: Database, obj: OsvObject): void {
  for (const affected of obj.affected ?? []) {
    const pkgName = affected.package?.name;
    const ecosystem = affected.package?.ecosystem;
    if (!pkgName || !ecosystem) continue;

    for (const range of affected.ranges ?? []) {
      if (range.type !== "SEMVER" && range.type !== "ECOSYSTEM") continue;

      let introduced: string | null = null;
      let fixed: string | null = null;
      let lastAffected: string | null = null;

      for (const event of range.events ?? []) {
        if ("introduced" in event) introduced = event.introduced;
        if ("fixed" in event) fixed = event.fixed;
        if ("last_affected" in event) lastAffected = event.last_affected;
      }

      db.prepare(`
        INSERT OR REPLACE INTO vulns
          (id, ecosystem, package_name, introduced, fixed, last_affected, raw)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(obj.id, ecosystem, pkgName, introduced, fixed, lastAffected, JSON.stringify(obj));
    }
  }
}
```

### Fremdriftslogging

Under synk skal modulen skrive fremdrift til `stderr` (ikke `stdout`, som er reservert for maskinlesbar output i CLI-kontekst):

```
[osv-local] npm: database mangler eller foreldet, synkroniserer...
[osv-local] npm: laster ned all.zip (52 MB)...
[osv-local] npm: indekserer 48 234 poster... ferdig (18s)
[osv-local] Klar.
```

---

## Query-logikk (`query.ts`)

### Input-interface (identisk med osv.dev)

```typescript
interface OsvQueryRequest {
  version: string;
  package: {
    name: string;
    ecosystem: string;
  };
}
```

### Output-interface (identisk med osv.dev)

```typescript
interface OsvQueryResponse {
  vulns?: OsvVulnerability[];  // undefined = ingen treff
}
```

### Query-prosess

1. Kall `ensureReady()` hvis ikke allerede gjort i denne prosesslevetiden
2. Slå opp alle rader i `vulns` der `ecosystem` og `package_name` matcher (case-insensitive)
3. For hver rad: sjekk om `version` faller innenfor `[introduced, fixed)` med `semver`
4. Samle unike `id`-er som matcher
5. Parse `raw`-feltet for de matchende id-ene og returner dem

### Semver-matching

```typescript
import semver from "semver";

function isVersionAffected(
  version: string,
  introduced: string | null,
  fixed: string | null,
  lastAffected: string | null
): boolean {
  const v = semver.valid(semver.coerce(version));
  if (!v) return false;

  const introducedOk =
    !introduced || introduced === "0" || semver.gte(v, semver.coerce(introduced)!);

  if (fixed) {
    return introducedOk && semver.lt(v, semver.coerce(fixed)!);
  }

  if (lastAffected) {
    return introducedOk && semver.lte(v, semver.coerce(lastAffected)!);
  }

  // Ingen upper bound — alt fra introduced og oppover er berørt
  return introducedOk;
}
```

> **OBS:** Ikke alle OSV-poster bruker gyldig semver. Bruk `semver.coerce()` for å normalisere, og hopp over rader der coerce returnerer `null`.

### Batching

```typescript
async function queryBatch(
  requests: OsvQueryRequest[]
): Promise<{ results: OsvQueryResponse[] }> {
  return {
    results: await Promise.all(requests.map(query))
  };
}
```

---

## Public API (`index.ts`)

```typescript
export { query, queryBatch } from "./query";
export { init } from "./sync";
```

### Bruk i eksisterende tjeneste — eneste endring som trengs

```typescript
// Før:
import { osvQuery } from "./osv-client"; // kaller api.osv.dev

// Etter:
import { init, query as osvQuery } from "osv-local";

// Én gang ved oppstart av CLI-kjøringen:
await init({ ecosystems: ["npm", "Maven"] });

// Deretter brukes osvQuery() nøyaktig som før — ingen andre endringer
```

`init()` er idempotent og trygg å kalle flere ganger. `query()` og `queryBatch()` kan kalles uten eksplisitt `init()` — de kaller `ensureReady()` selv med standardkonfigurasjon.

---

## Feilhåndtering

| Situasjon | Håndtering |
|---|---|
| Nettverket utilgjengelig under synk, men db finnes | Logg advarsel til stderr, fortsett med eksisterende data |
| Nettverket utilgjengelig og db mangler | Kast feil med klar melding: "OSV-database mangler og kan ikke lastes ned" |
| Ugyldig semver i OSV-post | Hopp over raden, logg advarsel til stderr |
| Korrupt zip-fil | Slett cache-fil, prøv nedlasting på nytt én gang |
| `sync_state` eksisterer men `vulns` er tom | Tving full synk |

---

## Ytelseshensyn

- `better-sqlite3` er synkron og svært rask — query-kall tar typisk < 5ms
- Full synk av npm (~50k poster) tar ca. 30–60 sekunder første gang
- Delta-synk er typisk under 5 sekunder på en vanlig dag
- SQLite-filen for alle støttede økosystemer er typisk 300–600 MB
- Sett inn poster i én transaksjon per zip-fil for å unngå tusenvis av enkelt-commits

---

## Det som bevisst er utelatt

- Bakgrunnsjobb, cron, scheduler eller langlevende prosess av noe slag
- Commit-hash-basert matching (brukes ikke i `{name, version}`-flyten)
- Container image-scanning
- ECOSYSTEM-type ranges (kun SEMVER i første versjon)
- HTTP-server / sidecar-modus — dette er en importerbar modul, ikke en prosess
