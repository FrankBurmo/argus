# Bitbucket Audit

CLI-verktøy som kobler til en Bitbucket Server/Data Center-instans via REST API, itererer gjennom alle tilgjengelige repos, kjører et sett med konfigurerbare sjekker, og produserer en revisjonsrapport — inkludert vurderinger for repos som mangler en eller flere sjekker.

## Installasjon

```bash
cd bitbucket-audit
npm install
```

## Oppsett

Kopier eksempelfilen og fyll inn din Bitbucket-URL:

```bash
cp .env.example .env
```

Rediger `.env`:

```dotenv
BITBUCKET_URL=https://bitbucket.eksempel.no
CONCURRENCY=5   # valgfri, default 5
```

**Token-håndtering** — `BITBUCKET_TOKEN` trenger du *ikke* i `.env`-filen.
Ved første kjøring vil verktøyet spørre deg om tokenet ditt og lagre det sikkert:

- **Windows**: kryptert med DPAPI (`~/.argus/token.enc`)
- **macOS**: Keychain
- **Linux**: freedesktop Secret Service (`secret-tool`)

Etter første kjøring hentes tokenet automatisk. Du kan fortsatt overstyre ved å sette `BITBUCKET_TOKEN` som miljøvariabel eller i `.env`.

| Variabel          | Kilde           | Beskrivelse                                            |
| ----------------- | --------------- | ------------------------------------------------------ |
| `BITBUCKET_URL`   | `.env` / shell  | Base-URL til Bitbucket Server/Data Center (**påkrevd**)|
| `BITBUCKET_TOKEN` | Sikker lagring  | Personal Access Token med `PROJECT_READ`/`REPO_READ`   |
| `CONCURRENCY`     | `.env` / shell  | Antall samtidige repo-sjekker (default `5`)            |
| `MAX_REPOS`       | `.env` / shell  | Maks antall repos å sjekke, sortert alfabetisk (default `0` = ingen grense) |

## Kjør

```bash
node index.js
```

Genererer:
- Fremdriftsvisning i terminalen
- Oppsummeringsrapport med vurderinger i konsollen
- `audit-report.json` i gjeldende mappe

## Eksempel på utskrift

```
Token hentet fra sikker lagring.
Sjekker 142 repos (5 samtidige) med 2 sjekker(e): renovate, owasp-dep-check
✓✓.✓..✓  [142/142]

════════════════════════════════════════════════════════════
              ARGUS — BITBUCKET REVISJONSRAPPORT
════════════════════════════════════════════════════════════

Renovate Bot           37 / 142     26.1%
OWASP Dependency-Check 89 / 142     62.7%

--- Repos med mangler og vurdering ---

  PLATTFORM/atlas-worker
    ✗ OWASP Dependency-Check: Anbefalt — har Jenkinsfile og avhengigheter (package.json), men OWASP Dependency-Check mangler i pipeline.
    ✗ Renovate Bot: Anbefalt — har avhengighetsfiler (package.json) uten automatisk oppdatering.

  PLATTFORM/docs-site
    ✗ OWASP Dependency-Check: Ikke nødvendig — ingen Jenkins-pipeline eller avhengighetsfiler.
    ✗ Renovate Bot: Ikke nødvendig — fant ingen avhengighetsfiler.
```

## Arkitektur

Appen er delt i fire lag:

1. **HTTP-klient** — `request(path)` og `getAllPages(path)` med Bearer-token og paginering
2. **Concurrency pool** — `pooledMap(items, fn, concurrency)` med delt indeks-teller
3. **Sjekker-rammeverk** — Pluggbare sjekker som følger et enkelt interface
4. **Hovedflyt** — Validering, henting, kjøring og rapportering

## Legg til en ny sjekker

1. Opprett `checks/minsjekker.js`:

```javascript
module.exports = {
  id: "minsjekker",           // maskinlesbar nøkkel, brukes i rapport
  label: "Min Sjekker",       // menneskelesbar visningstittel

  run: async (projectKey, repoSlug, request) => {
    try {
      const data = await request(
        `/rest/api/1.0/projects/${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repoSlug)}/files?limit=100`
      );
      return (data.values || []).some(f => f === "minfil.txt");
    } catch {
      return false;
    }
  },

  // Valgfri: kjøres kun når run() returnerer false
  assess: async (projectKey, repoSlug, request) => {
    try {
      // Hent informasjon og returner en kort vurderingstekst
      return "Anbefalt — repoet bør ha minfil.txt.";
    } catch {
      return "Kunne ikke vurdere.";
    }
  },
};
```

2. Legg til i `checks/index.js`:

```javascript
module.exports = [
  require("./renovate"),
  require("./owasp"),
  require("./minsjekker"),   // <-- ny linje
];
```

Det er alt. Resten av systemet plukker opp sjekken automatisk.

## Innebygde sjekker

### Avhengigheter og sikkerhet

| ID | Label | Beskrivelse | Hvorfor viktig |
|----|-------|-------------|----------------|
| `renovate` | Renovate Bot | Sjekker om repoet har Renovate Bot-konfigurasjon (`renovate.json`, `.renovaterc`, osv.) | Utdaterte avhengigheter er en av de vanligste angrepsvektorene. Automatisk oppdatering reduserer teknisk gjeld og risiko. |
| `owasp-dep-check` | OWASP Dependency-Check | Sjekker om OWASP Dependency-Check er integrert i Jenkinsfile eller byggfiler | Statisk analyse av kjente sårbarheter i avhengigheter (CVE-database). Særlig viktig for Java/Maven-prosjekter. |
| `npm-audit` | npm Audit | Sjekker om `npm audit` kjøres i CI/CD-pipeline eller som npm-script | Fanger kjente sårbarheter i Node.js-avhengigheter direkte i pipeline. Supplerer OWASP for JavaScript-repoer. |
| `dep-vulns` | Kjente sårbarheter (OSV) | Skanner avhengighetsfiler (`package-lock.json`, `pom.xml`, `requirements.txt`, `go.sum`) mot [OSV.dev](https://osv.dev/) API for HIGH/CRITICAL-sårbarheter | Aktiv sjekk som finner *reelle* sårbarheter — ikke bare om verktøy er konfigurert. Konfigurerbar terskel via `OSV_SEVERITY_THRESHOLD` (standard: `HIGH`). |
| `secrets` | Hemmeligheter i kode | Sjekker om repoet inneholder filer som tyder på lekkede hemmeligheter: `.env`, `id_rsa`, `*.pem`, `*.key`, `credentials.json`, `.npmrc`, osv. | Lekkede hemmeligheter i kode er en av de vanligste og mest alvorlige sikkerhetshendelsene. Lav kompleksitet, høy gevinst. |

### Governance og prosess

| ID | Label | Beskrivelse | Hvorfor viktig |
|----|-------|-------------|----------------|
| `codeowners` | CODEOWNERS | Sjekker om repoet har en `CODEOWNERS`- eller `CODEOWNERS.md`-fil | Definerer hvem som eier koden og er ansvarlig for code review. Viktig for onboarding og ansvarsfordeling. |
| `branch-protection` | Branch-beskyttelse | Sjekker om default branch har branch-permissions satt opp i Bitbucket (krav om PR, reviewers, restriksjoner på direkte push) | Uten branch-beskyttelse kan hvem som helst pushe direkte til produksjonskode. Grunnleggende for kode-integritet. |
| `pr-activity` | PR-praksis | Sjekker om repoet har nylige merged pull requests med reviewers de siste `PR_MONTHS` månedene (standard: 6) | Code review fanger feil og sårbarheter tidlig. Repoer uten PR-praksis har høyere risiko for feil og dårlig kodekvalitet. |

### DevOps-modenhet

| ID | Label | Beskrivelse | Hvorfor viktig |
|----|-------|-------------|----------------|
| `pipeline` | CI/CD-pipeline | Sjekker om repoet har en definert pipeline: Jenkinsfile, GitHub Actions (`.github/workflows/`), GitLab CI, Bitbucket Pipelines, osv. | Uten CI/CD er bygging, testing og deploy manuelt og feilbart. Grunnleggende for DevOps-modenhet — uten pipeline gir mange andre sjekker lite verdi. |
| `stale` | Aktivt repo | Sjekker om repoet har hatt commit-aktivitet de siste `STALE_MONTHS` månedene (standard: 12) | Inaktive repoer bør identifiseres for arkivering eller avvikling. Reduserer støy i revisjonen og synliggjør teknisk gjeld. |

### Kodekvalitet og dokumentasjon

| ID | Label | Beskrivelse | Hvorfor viktig |
|----|-------|-------------|----------------|
| `readme` | README | Sjekker om repoet har en `README.md` i roten | Et repo uten README er vanskelig å forstå og onboarde seg inn i. Grunnleggende dokumentasjonshygiene. |
| `tests` | Tester | Sjekker om repoet har testmapper (`test/`, `__tests__/`, `spec/`, osv.) eller testfiler (`.test.js`, `_test.go`, `Test.java`, osv.) | Repoer uten tester har ukjent kvalitet og er risikable å endre. Grunnleggende indikator for kodemodenhet. |
| `linting` | Linting/formatering | Sjekker om repoet har konfigurert linting- eller formateringsverktøy: ESLint, Prettier, Biome, Flake8, Pylint, Checkstyle, EditorConfig, osv. | Kodekvalitetsverktøy sikrer konsistent stil og fanger vanlige feil tidlig. Viktig for vedlikeholdbarhet på tvers av team. |

### Konfigurerbare terskler

| Miljøvariabel | Standard | Beskrivelse |
|---------------|----------|-------------|
| `OSV_SEVERITY_THRESHOLD` | `HIGH` | Minstealvorlighetsgrad for `dep-vulns`: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `STALE_MONTHS` | `12` | Antall måneder uten commit før repoet regnes som inaktivt |
| `PR_MONTHS` | `6` | Tidsvindu (måneder) for å vurdere PR-aktivitet |

## Rapportformat

Rapporten skrives til `audit-report.json` med følgende struktur:

```json
{
  "generatedAt": "2025-01-15T10:30:00.000Z",
  "checks": ["renovate", "owasp-dep-check"],
  "summary": {
    "total": 142,
    "byCheck": {
      "renovate":        { "passed": 37, "failed": 105, "coveragePercent": 26.1 },
      "owasp-dep-check": { "passed": 89, "failed": 53,  "coveragePercent": 62.7 }
    }
  },
  "repos": [
    {
      "project": "PLATTFORM",
      "repo": "atlas-api",
      "checks": { "renovate": true, "owasp-dep-check": false },
      "assessments": {
        "owasp-dep-check": "Anbefalt — har Jenkinsfile og avhengigheter (package.json), men OWASP Dependency-Check mangler i pipeline."
      }
    }
  ]
}
```

## Krav

- Node.js 18+
- Bitbucket Server/Data Center med REST API v1.0
- PAT med `PROJECT_READ` og `REPO_READ`-tilganger
- **Linux**: `secret-tool` (`sudo apt install libsecret-tools`) for sikker token-lagring
