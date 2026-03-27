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
Sjekker 142 repos (5 samtidige) med 2 sjekker(e): renovate, dockerfile
✓✓.✓..✓  [142/142]

========== RAPPORT ==========

Renovate Bot           37 / 142  (26.1%)
Dockerfile             89 / 142  (62.7%)

--- Repos med mangler og vurdering ---

  PLATTFORM/atlas-worker
    ✗ Dockerfile: Anbefalt — ser ut som kjørbar app (fant package.json).
    ✗ Renovate Bot: Anbefalt — har avhengighetsfiler (package.json) uten automatisk oppdatering.

  PLATTFORM/docs-site
    ✗ Dockerfile: Ikke nødvendig — repoet ser ut som dokumentasjon/konfig.
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
  require("./dockerfile"),
  require("./minsjekker"),   // <-- ny linje
];
```

Det er alt. Resten av systemet plukker opp sjekken automatisk.

## Innebygde sjekker

| ID          | Beskrivelse                                               |
| ----------- | --------------------------------------------------------- |
| `renovate`  | Sjekker om repoet har Renovate Bot-konfigurasjon          |
| `dockerfile`| Sjekker om repoet har en `Dockerfile`                     |

## Rapportformat

Rapporten skrives til `audit-report.json` med følgende struktur:

```json
{
  "generatedAt": "2025-01-15T10:30:00.000Z",
  "checks": ["renovate", "dockerfile"],
  "summary": {
    "total": 142,
    "byCheck": {
      "renovate":   { "passed": 37, "failed": 105, "coveragePercent": 26.1 },
      "dockerfile": { "passed": 89, "failed": 53,  "coveragePercent": 62.7 }
    }
  },
  "repos": [
    {
      "project": "PLATTFORM",
      "repo": "atlas-api",
      "checks": { "renovate": true, "dockerfile": false },
      "assessments": {
        "dockerfile": "Anbefalt — ser ut som kjørbar app (fant package.json)."
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
