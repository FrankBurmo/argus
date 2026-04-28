# Argus Frontend

Statisk HTML/CSS/JavaScript-applikasjon for visuell utforskning av Argus-rapporter. Kjører direkte i nettleseren — ingen byggesteg nødvendig.

## Filer

| Fil | Beskrivelse |
|---|---|
| `index.html` | Landingsside og hoved-app (én side) |
| `docs.html` | Dokumentasjonsside med sjekk-referanse |
| `styles.css` | Stilark-aggregator som `@import`-er partials fra `css/` |
| `css/` | CSS-partials (tokens, layout, landing, dashboard, vulnerabilities, …) |
| `app.js` | Tynt entry-script — binder events og eksponerer globale handlere |
| `js/` | ES-moduler: state, constants, utils, data, views, details |

## Kjøre lokalt

Siden dette er ren statisk HTML, kan du velge mellom flere metoder:

### Alternativ 1 — Direkte i nettleser

Åpne `index.html` direkte med nettleseren din:

```
# Windows
start frontend/index.html

# macOS
open frontend/index.html
```

> **Merk:** `app.js` bruker ES-moduler (`<script type="module">`), som ikke fungerer over `file://` i de fleste nettlesere. Bruk en lokal server (alternativ 2–4 under) for å laste appen.

### Alternativ 2 — npx serve (anbefalt)

Krever Node.js installert. Ingen global installasjon nødvendig:

```bash
cd frontend
npx serve .
```

Åpner på `http://localhost:3000` (eller neste ledige port).

### Alternativ 3 — VS Code Live Server

Installer utvidelsen [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer), høyreklikk på `index.html` og velg **Open with Live Server**.

### Alternativ 4 — Python HTTP-server

```bash
cd frontend
python -m http.server 8080
```

Åpner på `http://localhost:8080`.

## Bruk

1. Kjør Argus CLI fra `bitbucket-audit/` og generer en JSON-rapport:
   ```bash
   cd bitbucket-audit
   node index.js
   ```
2. Åpne frontend i nettleseren.
3. Last inn rapport-filen via filopplasting (knapp eller dra & slipp) — eller klikk **Se demo** for forhåndslastet eksempeldata.
4. I fanen **Sårbarheter** kan du bruke filtre og eksportere valgte issues til JSON som kan lastes inn igjen i dashboardet.

## Arkitektur

Applikasjonen er en enkeltsides applikasjon (SPA) uten rammeverk eller byggesteg, men oppdelt i ES-moduler for vedlikeholdbarhet:

```
app.js                  Entry — event-binding + window-globaler for inline onclick
js/
  state.js              Sentral mutable state (report, filters, activeView)
  constants/            CHECK_LABELS, CHECK_ICONS, CHECK_REMEDIATION
  utils/                dom, format, assessment, download
  data/                 report (innlasting), vulnIndex, demo
  views/                router, summary, vulnerabilities, repos
  details/              vulnDetail, repoDetail, panel
```

Sentrale konsepter:

- **Tilstand** — `state`-objektet i `js/state.js` holder rapport, filtre og aktiv visning. Modulene leser og skriver direkte på dette objektet.
- **Navigasjon** — `switchView()` (i `js/views/router.js`) bytter mellom `summary`, `vulnerabilities` og `repos`.
- **Rendering** — Direkte DOM-manipulasjon via `innerHTML` med `escapeHtml()` for XSS-beskyttelse.
- **Filhåndtering** — `FileReader` API for JSON-parsing, med validering av påkrevde felter.
- **Sårbarhet-index** — `buildVulnIndex()` flater ut CVE-er på tvers av repos for effektivt søk og filtrering.
- **Inline onclick** — Funksjoner som `showVulnDetail`, `toggleVulnFilter`, `filterByProject` m.fl. eksponeres på `window` i `app.js` siden de kalles fra dynamisk genererte `onclick`-attributter.

## Sjekk-dekning

Frontend viser resultater for alle 13 Argus-sjekker:

| ID | Sjekk |
|---|---|
| `renovate` | Renovate / Dependabot |
| `owasp-dep-check` | OWASP Dependency-Check |
| `npm-audit` | npm audit i CI |
| `dep-vulns` | Kjente sårbarheter (OSV) |
| `codeowners` | CODEOWNERS |
| `pipeline` | CI/CD-pipeline |
| `branch-protection` | Branch-beskyttelse |
| `secrets` | Hemmelighetsdeteksjon |
| `stale` | Vedlikeholdsstatus |
| `readme` | README |
| `tests` | Tester i CI |
| `pr-activity` | PR-aktivitet |
| `linting` | Linting i CI |

## Handlingskort (Remediation)

Når en sjekk feiler for et repo, viser detaljpanelet et **handlingskort** med konkret oppskrift for å fikse avviket. Kortene inneholder:

- **Alvorlighetsgrad** — `critical`, `high`, `medium` eller `low`.
- **Hvorfor dette er viktig** — Kort begrunnelse for sikkerhet/kvalitet.
- **Steg-for-steg-oppskrift** — Nummererte tiltak med konkrete kommandoer.
- **Dokumentasjonslenke** — Direkte lenke til relevant ekstern dokumentasjon.

Kortene er sammenleggbare (ekspanderbar via klikk) og fargekodet etter alvorlighetsgrad. Data defineres i `CHECK_REMEDIATION`-objektet i `app.js`.
