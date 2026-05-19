# Team-dimensjon i Argus — Implementeringsplan

> **Inspirasjon:** Datadog Scorecards (Service Catalog) og deres interne bruk av scorecard for kontinuerlig evaluering av tjenestekvalitet på tvers av team.
> **Dato:** Mai 2026
> **Status:** Plan / ikke implementert

---

## 1. Bakgrunn og motivasjon

### Problemet
Argus viser i dag sikkerhets- og DevOps-modenhetsstatus per repo, gruppert etter Bitbucket-prosjektnøkkel (`BACKEND`, `FRONTEND` osv.). Dette er en teknisk gruppering — ikke en organisatorisk en. Ingen vet hvem som faktisk *eier* et repo, og det er umulig å stille én enkelt person eller ett team til ansvar for status.

### Datadogs løsning
Datadog Scorecards løser akkurat dette problemet: de kobler *tjenestekatalog-oppføringer* til *team*, og beregner scorecard (andel av regler som passerer) per team — ikke bare per tjeneste. Engineering managers kan filtrere på sitt eget team, se status for alle tjenestene teamet eier, og få automatiske rapporter rett i Slack. Regler er gruppert i kategorier (Production Readiness, Observability, Documentation & Ownership), og hvert team ser tydelig hva de er gode på og hva de må rette opp.

### Argus sin tilpasning
I Argus-kontekst betyr dette:
- Et **team** eier vedlikeholdet av ett eller flere repos
- Hvert repo tilhører nøyaktig ett team
- Frontenden får en ny **Teams-visning** med oversiktlige «scorecard-kort» per team
- Klikk på et team → **team-detaljside** med per-sjekk-breakdown og repo-liste

Filosofien fra Datadog vi viderefører:
- **Kontinuerlig synlighet** — Ikke en engangsrevisjon, men et levende bilde oppdatert ved ny rapport
- **Actionable feedback** — Tydelig hva som er grønt/gult/rødt og *hvorfor*
- **Distributed ownership** — Hvert team er ansvarlig for sine egne repo, ingen kan skylde på at de ikke visste
- **Kategoriserte regler** — Gruppering gjør det lettere å forstå helhetsbildet

---

## 2. Overordnet arkitektur

```
┌─────────────────────────────────────────────────────────────────┐
│                       KONFIGURASJON                              │
│  teams.json  — mapping team → repos (eller prosjektnøkler)       │
└───────────────────────────┬─────────────────────────────────────┘
                            │ leses av
┌───────────────────────────▼─────────────────────────────────────┐
│                       BACKEND (Node.js CLI)                      │
│  bitbucket-audit/index.js                                        │
│  lib/report.js  — ny: buildTeamReport()                         │
│  Output: rapport JSON nå med  rapport.teams[]  i tillegg        │
└───────────────────────────┬─────────────────────────────────────┘
                            │ rapport.json
┌───────────────────────────▼─────────────────────────────────────┐
│                       FRONTEND (statisk HTML/JS)                 │
│  js/state.js     — ny: teams-filtre og activeTeam               │
│  js/views/teams.js  — ny: team-liste og team-detaljside         │
│  js/data/teamData.js  — ny: beregning av team-score             │
│  js/views/router.js  — ny: "teams" og "team-detail" views       │
│  css/teams.css   — ny: stil for scorecard-kort                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Datamodell

### 3.1 Konfigurasjonsfil: `teams.json`

Plasseres i prosjektets rotmappe (samme katalog som `bitbucket-audit/`) og  
lastes av CLI-appen ved kjøring. Frontend kan også laste denne ved demo-modus.

```json
{
  "version": "1",
  "teams": [
    {
      "id": "platform",
      "name": "Platform Team",
      "description": "Drifter og utvikler kjerne-infrastruktur og felles tjenester.",
      "members": ["alice", "bob", "charlie"],
      "slackChannel": "#team-platform",
      "repos": [
        { "project": "INFRA", "repo": "api-gateway" },
        { "project": "INFRA", "repo": "auth-service" }
      ]
    },
    {
      "id": "frontend",
      "name": "Frontend Team",
      "description": "Eier alle brukergrensesnitt og webtjenester.",
      "members": ["diana", "erik"],
      "slackChannel": "#team-frontend",
      "projects": ["FRONTEND", "WEB"]
    },
    {
      "id": "data",
      "name": "Data Team",
      "description": "Datapipelines, ML-modeller og analytiske tjenester.",
      "members": ["frank"],
      "slackChannel": "#team-data",
      "repos": [
        { "project": "DATA", "repo": "etl-pipeline" }
      ],
      "projects": ["ANALYTICS"]
    }
  ]
}
```

**Prioriteringsregler for repo-tilordning:**
1. Eksplisitt `repos`-liste har høyest prioritet
2. `projects`-liste matcher alle repos med matchende Bitbucket-prosjektnøkkel
3. Repos uten treff tilordnes automatisk et **«Ukjent Team»** (`id: "unassigned"`)

### 3.2 Utvidet rapport-JSON (`rapport.teams`)

Backend legger til en `teams`-seksjon i rapport-JSON:

```json
{
  "generatedAt": "2026-05-19T12:00:00Z",
  "checks": ["renovate", "owasp-dep-check", ...],
  "teams": [
    {
      "id": "platform",
      "name": "Platform Team",
      "description": "...",
      "slackChannel": "#team-platform",
      "members": ["alice", "bob"],
      "repoCount": 12,
      "overallScore": 71.4,
      "categoryScores": {
        "sikkerhet": 58.3,
        "devops": 82.1,
        "governance": 75.0
      },
      "byCheck": {
        "renovate":          { "passed": 9, "failed": 2, "na": 1, "score": 81.8 },
        "owasp-dep-check":   { "passed": 5, "failed": 6, "na": 1, "score": 45.5 },
        "branch-protection": { "passed": 11, "failed": 1, "na": 0, "score": 91.7 }
      },
      "vulnerabilities": {
        "total": 23,
        "critical": 2,
        "high": 8,
        "medium": 10,
        "low": 3
      },
      "repos": ["INFRA/api-gateway", "INFRA/auth-service"]
    }
  ],
  "summary": { ... },
  "repos": [ ... ]
}
```

### 3.3 Sjekk-kategorier

De 13 eksisterende sjekkene grupperes i tre kategorier inspirert av Datadog:

| Kategori | Sjekk-IDer | Farge |
|---|---|---|
| **Sikkerhet** | `secrets`, `branch-protection`, `dep-vulns`, `npm-audit`, `owasp-dep-check` | Rød (`#e74c3c`) |
| **DevOps-modenhet** | `pipeline`, `renovate`, `linting`, `tests`, `pr-activity` | Blå (`#3498db`) |
| **Governance** | `readme`, `stale`, `codeowners` | Grønn (`#2ecc71`) |

Kategoriscore = gjennomsnitt av `score` for alle sjekker i kategorien (NA ekskludert).

---

## 4. Backend-endringer

### 4.1 Ny modul: `bitbucket-audit/lib/teamConfig.js`

```
Ansvar:
- loadTeamConfig(path)  → laster og validerer teams.json
- assignReposToTeams(repos, teamConfig)  → returnerer Map<repoKey, teamId>
- buildTeamReport(repoResults, teamConfig, checks)  → bygger teams[]-seksjonen
```

**Pseudokode `buildTeamReport`:**
```
For hvert team i teamConfig:
  1. Finn alle repoResults der repoKey er mappet til dette teamet
  2. For hver sjekk: tell passed/failed/na → beregn score (passed / (total - na) * 100)
  3. Beregn categoryScores basert på check-kategori-mapping
  4. Summer vulnerabilities på tvers av teamets repos
  5. Beregn overallScore = gjennomsnitt av alle check-scores
  
Lag "unassigned"-team for repos uten treff.
```

### 4.2 Endring i `bitbucket-audit/index.js`

```javascript
// Etter buildReport() — legg til team-data om teams.json finnes:
const teamConfigPath = path.join(__dirname, "..", "teams.json");
if (fs.existsSync(teamConfigPath)) {
  const teamConfig = loadTeamConfig(teamConfigPath);
  const teamAssignment = assignReposToTeams(report.repos, teamConfig);
  report.teams = buildTeamReport(report.repos, teamConfig, checks);
  report.teamAssignment = Object.fromEntries(teamAssignment);
}
```

### 4.3 Validering av `teams.json`

Klar feilmelding ved:
- Dupliserte team-IDer
- Duplisert repo-tilordning (et repo kan ikke tilhøre to team)
- Ugyldig struktur (manglende `id` eller `name`)

### 4.4 Ny Markdown-rapport per team: `lib/reportTeam.js`

Genererer `reports/team-{id}-{dato}.md` per team med:
- Header: teamnavn, score, dato
- Tabell: sjekk-status per repo
- Sårbarhetsliste (topp 5 kritiske)
- Anbefalt handlingsliste sortert etter prioritet

---

## 5. Frontend-endringer

### 5.0 Bakoverkompatibilitet — rapport uten team-data

Frontenden **må fungere fullt ut** med eldre rapport-JSON som ikke inneholder `teams`-feltet. Dette er et hardt krav: brukere som laster inn historiske rapporter skal ikke oppleve feil, tomme visninger eller brutte views.

**Regel:** Tilstedeværelsen av `report.teams` er valgfri. All team-funksjonalitet er additivt — ingenting i de eksisterende visningene (Oversikt, Repositories, Sårbarheter) endrer seg om `teams` mangler.

#### Konkrete tiltak per del av frontend

| Del | Atferd uten `report.teams` |
|---|---|
| **Nav-knapp «Team»** | Skjules med `hidden`-klassen. Vises kun om `report.teams?.length > 0`. |
| **Router `switchView("teams")`** | Avvises med guard: redirecter til "summary" og logger advarsel i konsoll. |
| **`getAllTeams()`** | Returnerer `[]` om `report.teams` er `undefined` eller `null`. |
| **`getTeamData(id)`** | Returnerer `null` om team ikke finnes — kallers ansvar å håndtere. |
| **Team-filter i Repos-visning** | Filterkontroll rendres ikke om `getAllTeams()` returnerer tom liste. |
| **Team-filter i Sårbarheter-visning** | Samme som over. |
| **«Dårligste team»-widget i Summary** | Seksjonen rendres ikke (`return`) om teamlisten er tom. |
| **`js/data/report.js`** | Ved innlasting settes `state.hasTeams = Array.isArray(report.teams) && report.teams.length > 0`. |

#### Implementeringsmønster i `js/data/report.js`

```javascript
// Etter eksisterende report-parsing:
state.hasTeams = Array.isArray(report.teams) && report.teams.length > 0;

// Skjul/vis Team-knappen basert på dette:
const teamsNavBtn = document.querySelector('[data-view="teams"]');
if (teamsNavBtn) teamsNavBtn.classList.toggle("hidden", !state.hasTeams);
```

#### Implementeringsmønster i `js/data/teamData.js`

```javascript
export function getAllTeams() {
  return state.report?.teams ?? [];
}

export function getTeamData(teamId) {
  return getAllTeams().find(t => t.id === teamId) ?? null;
}
```

#### Implementeringsmønster i router

```javascript
case "teams":
  if (!state.hasTeams) { switchView("summary"); return; }
  renderTeams();
  break;
case "team-detail":
  if (!state.hasTeams || !state.activeTeam) { switchView("summary"); return; }
  renderTeamDetail(state.activeTeam);
  break;
```

---

### 5.1 Navigasjon

Legg til ny nav-knapp i `index.html`:

```html
<button class="nav-btn hidden" data-view="teams">Team</button>
```

Merk: knappen starter med `hidden`-klassen og vises kun programmatisk ved innlasting av rapport med team-data (se seksjon 5.0).

Plasseres mellom «Oversikt» og «Sårbarheter» i topplinja.

Routeren `js/views/router.js` utvides med bakoverkompatible guards:
```javascript
case "teams":      if (!state.hasTeams) { switchView("summary"); return; } renderTeams(); break;
case "team-detail": if (!state.hasTeams || !state.activeTeam) { switchView("summary"); return; } renderTeamDetail(state.activeTeam); break;
```

### 5.2 Tilstandsobjekt `js/state.js`

Ny felter:
```javascript
export const state = {
  // ... eksisterende felt ...
  
  /** Om den lastede rapporten inneholder team-data. Styrer synlighet av Team-UI. */
  hasTeams: false,

  /** Aktiv team-ID for detaljvisning (null = team-liste). */
  activeTeam: null,
  
  /** Filtre i Teams-fanen. */
  teamFilters: {
    category: [],    // "sikkerhet" | "devops" | "governance"
    sortBy: "score", // "score" | "name" | "repos"
    sortDir: "asc",  // "asc" | "desc"
  },
};
```

`hasTeams` settes til `false` av `resetFilters()` slik at state alltid er konsistent om brukeren laster inn en ny rapport.

### 5.3 Ny modul: `js/data/teamData.js`

```javascript
// Henter team-data fra rapport, supplerer med beregninger
export function getTeamData(teamId) { ... }
export function getAllTeams() { ... }
export function getTeamRepos(teamId) { ... }
export function teamHealthClass(score) {
  if (score >= 80) return "health-good";
  if (score >= 50) return "health-warn";
  return "health-critical";
}
```

### 5.4 Ny fil: `js/views/teams.js`

Inneholder to funksjonar:

#### `renderTeamList()` — Team-oversiktssiden

Renderer et responsivt **kort-grid** der hvert kort viser:

```
┌─────────────────────────────────────────────────┐
│  🏢  Platform Team              ● God  (71 %)   │
│  Drifter kjerne-infrastruktur…                  │
│                                                 │
│  ████████████████░░░░  Sikkerhet      58 %     │
│  ████████████████████  DevOps         82 %     │
│  █████████████████░░░  Governance     75 %     │
│                                                 │
│  12 repos · 23 sårbarheter (2 kritiske)        │
│                           [Vis detaljer →]      │
└─────────────────────────────────────────────────┘
```

Elementer per kort:
- **Teamnavn** + avatar/ikon (initialer eller emoji)
- **Helsestatus-badge**: «God» / «Trenger tiltak» / «Kritisk» med grønn/gul/rød farge
- **Totalscoreindikator** (stor prosent-tall, evt. donut-sirkel)
- **Tre horisontale mini-stolper** for kategoriscore (Sikkerhet / DevOps / Governance)
- **Metadata**: antall repos, antall sårbarheter, antall kritiske
- **Knapp** «Vis detaljer →»

Sortering (dropdown øverst):
- Etter score (lavest først — de som trenger hjelp vises øverst som standard)
- Etter score (høyest først)
- Alfabetisk etter teamnavn
- Etter antall repos

Filtrering (toggle-knapper):
- Vis bare team med kritisk status
- Vis bare team med sårbarheter

#### `renderTeamDetail(teamId)` — Team-detaljside

Toppseksjon:
```
← Alle team    Platform Team                     📋 Eksporter
               12 repos · alice, bob, charlie
               ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
               Samlet score: 71.4 %       ● Trenger tiltak
```

Tre infokort:
```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Sikkerhet   │  │    DevOps    │  │  Governance  │
│    58 %      │  │    82 %      │  │    75 %      │
│  ● Kritisk   │  │  ● God       │  │  ● Moderat   │
└──────────────┘  └──────────────┘  └──────────────┘
```

Sjekk-breakdown-tabell (inspirert av Datadogs scorecard-visning):
```
Sjekk                  Dekning    Repos som passer   Status
─────────────────────────────────────────────────────────
branch-protection      ████████   11 / 12  (91.7%)   ✅
renovate               ████████   9 / 12   (81.8%)   ✅
readme                 ████████   9 / 12   (75.0%)   ⚠️
tests                  ██████░░   8 / 12   (66.7%)   ⚠️
dep-vulns              █████░░░   7 / 12   (58.3%)   ⚠️
owasp-dep-check        █████░░░   5 / 11   (45.5%)   ❌
secrets                ███░░░░░   4 / 12   (33.3%)   ❌
```

Klikk på en rad → utvider med liste over hvilke repos som feiler den sjekken.

Repo-tabell (filtrert til dette teamets repos):
- Samme kolonne-layout som eksisterende Repositories-visning
- Prioritetsscore beregnet som før
- Klikk → åpner repo-detaljpanel (eksisterende funksjonalitet)

Sårbarhetsseksjon:
- Kompakt CVE-liste for teamets repos (topp 10 etter alvorlighetsgrad)
- Link «Vis alle →» filtrerer den globale Sårbarheter-fanen til teamets repos

---

## 6. CSS-design: `css/teams.css`

Designprinsipper inspirert av Datadog Scorecards UI:
- Mørkt kort-design konsistent med eksisterende `dashboard.css`
- Tydelig statussystem med fargekoding:
  - `--color-good: #27ae60` (score ≥ 80)
  - `--color-warn: #f39c12` (score 50–79)
  - `--color-critical: #e74c3c` (score < 50)
- Kategori-striplar med kategorispesifikke farger
- Hover-effekt på kort → subtle glow + cursor: pointer
- Responsivt grid: 3 kolonner (desktop) → 2 (tablet) → 1 (mobil)

Viktige CSS-klasser:
```css
.teams-grid { ... }           /* Responsive grid container */
.team-card { ... }            /* Hvert scorecard-kort */
.team-card:hover { ... }      /* Hover-state */
.team-score-ring { ... }      /* Sirkulær score-indikator */
.team-category-bar { ... }    /* Horisontal kategori-stolpe */
.health-badge { ... }         /* God / Trenger tiltak / Kritisk */
.health-good { ... }          /* Grønn badge */
.health-warn { ... }          /* Gul badge */
.health-critical { ... }      /* Rød badge */
.team-detail-header { ... }   /* Detaljside-header */
.check-breakdown-table { ... }/* Sjekk-oversikts-tabell */
.check-bar { ... }            /* Dekningstolpe */
```

---

## 7. Integrasjon med eksisterende views

### 7.1 Filtrering etter team i Repos-visning

Legg til et «Team»-filter i filterkolonnen i Repositories-visningen. Valg av team filtrerer repolisten til bare de tilhørende repos.

```javascript
// Ny fil: js/constants/teamLabels.js
// Mapper team-IDer til visningsnavn
```

### 7.2 Filtrering etter team i Sårbarheter-visning

Team-filtre i sidefilteret (likt eksisterende prosjektfilter).

### 7.3 Sammendrag-visning (Summary)

I den eksisterende sammendragsvisningen — legg til en **«Dårligste team»-widget**:
```
Team med lavest score:
  1. Data Team         — 41.2 %  ❌
  2. Legacy Team       — 48.7 %  ⚠️
  3. Platform Team     — 71.4 %  ⚠️
```

---

## 8. Implementeringsfaser

### Fase 1 — Fundament: Konfigurasjon og backend (estimert størrelse: middels)

**Mål:** `teams.json` leses og team-data lagres i rapport-JSON.

**Filer som opprettes/endres:**
- ✨ `bitbucket-audit/lib/teamConfig.js` — ny
- ✨ `bitbucket-audit/lib/reportTeam.js` — ny
- ✏️ `bitbucket-audit/index.js` — integrer team-konfig
- ✏️ `bitbucket-audit/lib/report.js` — legg til `teams[]` i output

**Akseptansekriterier:**
- Kjøring uten `teams.json` fungerer som før (bakoverkompatibel)
- Kjøring med `teams.json` → `rapport.teams[]` eksisterer i output-JSON
- Alle repos tilordnet (ukjente havner i «Unassigned»-team)
- Tydelig feilmelding ved ugyldig konfig

**Testscenario:**
```bash
# Kopier eksempel-teams.json til prosjektrot
node bitbucket-audit/index.js
# → rapport.json inneholder "teams": [...]
```

---

### Fase 2 — Demo-data og state (liten)

**Mål:** Frontend kan laste team-data fra rapport og holde det i state.

**Filer som opprettes/endres:**
- ✨ `frontend/js/data/teamData.js` — ny
- ✨ `frontend/js/data/demo-teams.js` — utvid demo-rapport med teams[]
- ✏️ `frontend/js/state.js` — legg til `activeTeam` og `teamFilters`
- ✏️ `frontend/js/data/report.js` — populate `state.teams` ved innlasting

**Akseptansekriterier:**
- `getAllTeams()` returnerer tom liste `[]` om `report.teams` mangler — kaster aldri feil
- `getTeamData(id)` returnerer `null` (ikke feil) om team-ID ikke finnes
- `state.hasTeams` settes korrekt til `false` for rapport uten `teams`-felt
- Team-nav-knapp er skjult etter innlasting av gammel rapport
- Alle eksisterende views (Oversikt, Repositories, Sårbarheter) fungerer uendret med gammel rapport
- Demo-modus inkluderer 4–5 eksempelteam med realistiske data

---

### Fase 3 — Team-liste (stor)

**Mål:** Fungerende «Teams»-fane med scorecard-kortgrid.

**Filer som opprettes/endres:**
- ✨ `frontend/js/views/teams.js` — `renderTeamList()`
- ✨ `frontend/css/teams.css` — all team-stilsetting
- ✏️ `frontend/index.html` — ny nav-knapp + `<section id="view-teams">`
- ✏️ `frontend/js/views/router.js` — ny case for "teams"
- ✏️ `frontend/styles.css` — import av teams.css

**Akseptansekriterier:**
- Grid vises med ett kort per team
- Hvert kort viser: navn, totalscaore, tre kategori-stolper, repo-count, vuln-count
- Helsebadge farge-kodes korrekt
- Sortering og filtrering fungerer
- Responsivt på mobil

---

### Fase 4 — Team-detaljside (stor)

**Mål:** Klikk på team-kort åpner detaljert team-scorecard.

**Filer som opprettes/endres:**
- ✏️ `frontend/js/views/teams.js` — `renderTeamDetail()`
- ✏️ `frontend/index.html` — `<section id="view-team-detail">`
- ✏️ `frontend/js/views/router.js` — ny case for "team-detail"
- ✏️ `frontend/css/teams.css` — detaljside-stiler

**Akseptansekriterier:**
- Tilbakeknapp navigerer til team-liste
- Tre kategori-infokort vises øverst
- Sjekk-breakdown-tabell viser alle 13 sjekker med dekningstolpe og antall
- Klikk på sjekk-rad → ekspanderer liste over feilende repos
- Repo-tabell viser teamets repos (klikkbar som i Repos-visning)
- Sårbarhetsseksjon viser topp-CVEer for teamets repos

---

### Fase 5 — Integrasjon og polering (liten)

**Mål:** Team-filter i Repos og Sårbarheter-visning, Summary-widget, export.

**Filer som endres:**
- ✏️ `frontend/js/views/repos.js` — team-filter
- ✏️ `frontend/js/views/vulnerabilities.js` — team-filter
- ✏️ `frontend/js/views/summary.js` — «Dårligste team»-widget
- ✏️ `frontend/js/utils/download.js` — eksporter team-rapport til JSON/MD

**Akseptansekriterier:**
- Team-filter i Repos-fanen fungerer
- Team-filter i Sårbarheter-fanen fungerer
- Summary viser «Dårligste team»-lista om teams[] finnes i rapport
- Eksport av team-spesifikk rapport fungerer

---

## 9. `teams.json` — Eksempelfil

Plasseres i `bitbucket-audit/teams.example.json` og dokumenteres i README:

```json
{
  "version": "1",
  "teams": [
    {
      "id": "platform",
      "name": "Platform Team",
      "description": "Drifter og utvikler kjerne-infrastruktur og felles tjenester.",
      "members": ["alice", "bob", "charlie"],
      "slackChannel": "#team-platform",
      "repos": [
        { "project": "INFRA", "repo": "api-gateway" },
        { "project": "INFRA", "repo": "auth-service" },
        { "project": "INFRA", "repo": "service-mesh" }
      ]
    },
    {
      "id": "frontend",
      "name": "Frontend Team",
      "description": "Eier alle brukergrensesnitt og web-tjenester.",
      "members": ["diana", "erik"],
      "slackChannel": "#team-frontend",
      "projects": ["FRONTEND", "WEB"]
    },
    {
      "id": "data",
      "name": "Data & Analytics Team",
      "description": "Datapipelines, ML-modeller og analytiske tjenester.",
      "members": ["frank", "greta"],
      "slackChannel": "#team-data",
      "projects": ["ANALYTICS"],
      "repos": [
        { "project": "DATA", "repo": "etl-pipeline" },
        { "project": "DATA", "repo": "ml-serving" }
      ]
    },
    {
      "id": "mobile",
      "name": "Mobile Team",
      "description": "iOS- og Android-applikasjoner.",
      "members": ["hans", "ingrid"],
      "slackChannel": "#team-mobile",
      "projects": ["MOBILE", "IOS", "ANDROID"]
    }
  ]
}
```

---

## 10. Tekniske avveininger

### A. Team-konfigurasjon: statisk fil vs. Bitbucket API

**Valg: Statisk `teams.json`**

*Fordeler:*
- Enkel, ingen ekstra API-avhengigheter
- Fungerer for alle Bitbucket-versjoner (Server, Data Center)
- Kan versjoneres i kildekode

*Ulemper:*
- Må manuelt holdes oppdatert
- Bitbucket har ikke et innebygd team-API som er pålitelig på tvers av versjoner

*Alternativ vurdert:* CODEOWNERS-filen kunne implisitt definere eierskap, men dette gir ingen teamstruktur, bare filnivå-eierskap.

### B. Repo-til-team-mapping: prosjekt vs. eksplisitt liste

Planen støtter **begge**: `projects`-liste for grovkornet mapping (ett team eier et helt Bitbucket-prosjekt) og `repos`-liste for finkornet kontroll. Dette gir fleksibilitet uten å tvinge én tilnærming.

### C. Scoreberegning: vektet vs. uvektet

**Valg: Uvektet gjennomsnitt** i første iterasjon.

Alle 13 sjekker teller likt innenfor sin kategori. Datadog lar brukere konfigurere vekting, men for Argus er dette for tidlig kompleksitet i v1.

*Fremtidig utvidelse:* Legg til `"weight"` per sjekk i `checks/index.js`-registreringen.

### D. Håndtering av repos uten team

Alle umappede repos samles i et implisitt **«Ikke tilordnet»-team** (`id: "unassigned"`). Dette vises i team-listen (sortert sist) slik at ingen repos «forsvinner» fra team-visningen.

---

## 11. Fremtidige utvidelser (utenfor scope v1)

| Funksjon | Beskrivelse | Prioritet |
|---|---|---|
| **Historisk trendsporing** | Lagre scorecard-historikk og vis score over tid (inspirert av Datadogs timeseries) | Høy |
| **Slack-varsling** | Send automatisk team-rapport til Slack-kanal (se `slackChannel` i konfig) | Høy |
| **Mål/benchmarks** | La team sette målscore per sjekk og vise fremgang mot målet | Middels |
| **PR/commit-statistikk** | Vis aktivitetsnivå (PR-frekvens, commit-frekvens) per team | Middels |
| **Vekting av sjekker** | La administrator vekte sjekker forskjellig (sikkerhet viktigere enn linting) | Middels |
| **Unntak / exemptions** | Tillat team å dokumentere unntak fra en regel med begrunnelse | Lav |
| **API-integrasjon** | REST-endepunkt for CI/CD-integrasjon (fail build om team-score < terskel) | Lav |
| **Sammenligning mellom team** | «Leaderboard»-visning for gamification av best practices | Lav |

---

## 12. Referanser

- [Datadog Scorecards — Dogfooding-artikkel](https://www.datadoghq.com/blog/scorecards-dogfooding/)
- [Datadog Scorecards — Produktlansering](https://www.datadoghq.com/blog/service-scorecards/)
- [Datadog Scorecards — Dokumentasjon](https://docs.datadoghq.com/internal_developer_portal/scorecards/)
- [Argus eksisterende arkitektur](../bitbucket-audit/README.md)
- [Google SRE — Production Readiness Review](https://sre.google/sre-book/evolving-sre-engagement-model/)
