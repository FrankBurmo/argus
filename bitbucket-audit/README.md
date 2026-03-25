# Bitbucket Audit

CLI-verktøy som kobler til en Bitbucket Server/Data Center-instans via REST API, itererer gjennom alle tilgjengelige repos, kjører et sett med konfigurerbare sjekker, og produserer en revisjon-rapport.

**Ingen eksterne avhengigheter** — kun innebygde Node.js-moduler.

## Oppsett

```bash
export BITBUCKET_URL=https://bitbucket.eksempel.no
export BITBUCKET_TOKEN=ditt-token
export CONCURRENCY=5   # valgfri, default 5
```

| Variabel          | Påkrevd | Beskrivelse                                              |
| ----------------- | ------- | -------------------------------------------------------- |
| `BITBUCKET_URL`   | Ja      | Base-URL til Bitbucket Server/Data Center                |
| `BITBUCKET_TOKEN` | Ja      | Personal Access Token med `PROJECT_READ` / `REPO_READ`   |
| `CONCURRENCY`     | Nei     | Antall samtidige repo-sjekker (default `5`)              |

## Kjør

```bash
node bitbucket-audit/index.js
```

Genererer:
- Fremdriftsvisning i terminalen
- Oppsummeringsrapport i konsollen
- `audit-report.json` i gjeldende mappe

## Eksempel på utskrift

```
Sjekker 142 repos (5 samtidige) med 2 sjekker(e): renovate, dockerfile
✓✓.✓..✓  [142/142]

========== RAPPORT ==========

Renovate Bot           37 / 142  (26.1%)
Dockerfile             89 / 142  (62.7%)

--- Mangler alle ---
  PLATTFORM/atlas-worker
  ...
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
      // Bruk request() for å hente data fra Bitbucket API
      const data = await request(
        `/rest/api/1.0/projects/${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repoSlug)}/files?limit=100`
      );
      // Returner true/false basert på sjekken
      return (data.values || []).some(f => f === "minfil.txt");
    } catch {
      return false;
    }
  }
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
      "checks": { "renovate": true, "dockerfile": false }
    }
  ]
}
```

## Krav

- Node.js 18+
- Bitbucket Server/Data Center med REST API v1.0
- PAT med `PROJECT_READ` og `REPO_READ`-tilganger
