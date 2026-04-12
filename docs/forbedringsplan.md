# Argus — Plan for nye sjekker og frontend-forbedringer

> **Dato:** 2026-04-11  
> **Formål:** Identifisere verdifulle nye sjekker Argus kan utføre på repoer den skanner, samt funksjonelle frontend-forbedringer som øker sannsynligheten for at utviklerteam tar verktøyet i bruk og faktisk gjennomfører tiltak.  
> **Kilder:** OpenSSF Scorecard, OpenSSF Best Practices Badge, DORA-metrikker, Backstage Developer Portal

---

## Innholdsfortegnelse

**Del A — Nye sjekker**
1. [Eksisterende sjekker — oppsummering](#1-eksisterende-sjekker--oppsummering)
2. [Nye sjekker — Sikkerhet og forsyningskjede](#2-nye-sjekker--sikkerhet-og-forsyningskjede)
3. [Nye sjekker — Governance og kodekvalitet](#3-nye-sjekker--governance-og-kodekvalitet)
4. [Nye sjekker — DevOps-modenhet](#4-nye-sjekker--devops-modenhet)

**Del B — Frontend-forbedringer**
5. [Designprinsipper for adopsjon](#5-designprinsipper-for-adopsjon)
6. [Handlingsorientering](#6-handlingsorientering)
7. [Trendvisning og historikk](#7-trendvisning-og-historikk)
8. [Teamengasjement og gamification](#8-teamengasjement-og-gamification)
9. [Integrasjon og distribusjon](#9-integrasjon-og-distribusjon)
10. [Brukervennlighet og UX](#10-brukervennlighet-og-ux)

**Del C — Sikkerhets-awareness og organisasjonskultur**
11. [Kontekstuell sikkerhetslæring](#11-kontekstuell-sikkerhetslæring)
12. [Policy Gates — Sikkerhetsterskel i CI/CD](#12-policy-gates--sikkerhetsterskel-i-cicd)
13. [CISO-rapportering, MTTR og risikomodenhet](#13-ciso-rapportering-mttr-og-risikomodenhet)

**Prioritering**
14. [Prioritert tiltaksliste](#14-prioritert-tiltaksliste)
15. [Referanser](#15-referanser)

---

# Del A — Nye sjekker

## 1. Eksisterende sjekker — oppsummering

Argus har i dag 13 sjekker fordelt på fire kategorier:

| Kategori | ID | Hva den sjekker |
|----------|-----|----------------|
| **Sikkerhet** | `dep-vulns` | Kjente sårbarheter via OSV.dev (npm, Maven, PyPI, Go) |
| | `secrets` | Sensitive filer i repoet (.env, .pem, .key, credentials, etc.) |
| | `owasp-dep-check` | OWASP Dependency-Check i pipeline |
| | `npm-audit` | npm audit / audit-ci i CI/CD |
| **Avhengigheter** | `renovate` | Renovate Bot konfigurert |
| **Governance** | `codeowners` | CODEOWNERS-fil finnes |
| | `branch-protection` | Default branch har no-rewrites |
| | `pr-activity` | Nylige PRs med reviewer |
| **DevOps** | `pipeline` | CI/CD-pipeline finnes |
| | `stale` | Repo har nylig aktivitet |
| **Kodekvalitet** | `readme` | README finnes |
| | `tests` | Testmapper eller testfiler finnes |
| | `linting` | Linter-konfigurasjon finnes |

**Gap-analyse mot OpenSSF Scorecard:** Scorecard har 19 sjekker. Følgende områder dekkes ikke av Argus i dag:
- Lisens/lisensfil
- Security Policy (SECURITY.md)
- SAST (statisk kodeanalyse)
- Binærartefakter i kildekode
- Pinning av avhengigheter
- Signerte releaser
- Code review (eksplisitt, utover PR-aktivitet)
- SBOM

---

## 2. Nye sjekker — Sikkerhet og forsyningskjede

### 2.1 `security-policy` — SECURITY.md

**Hva:** Sjekk om repoet har en `SECURITY.md`-fil (eller tilsvarende) som beskriver hvordan sårbarheter skal rapporteres.

**Hvorfor:** OpenSSF Scorecard gir dette **Medium** risiko. Uten en sikkerhetspolicy vet ikke funnere av sårbarheter hvordan de skal rapportere — noe som kan føre til offentlig avsløring uten forhåndsvarsel. OpenSSF Best Practices Badge krever dette på alle nivåer.

**Implementasjon:**
- Sjekk stier: `SECURITY.md`, `.github/SECURITY.md`, `docs/SECURITY.md`, `security.md`
- `assess()`: «Repoet mangler en SECURITY.md-fil. Opprett én som beskriver hvordan utviklere kan rapportere sikkerhetsproblemer privat.»
- `details()`: Returner plassering av filen som ble funnet

**Verdi for team:** Gir organisasjonen én enkel, konkret ting alle repoer bør ha — lett å fikse, stor signaleffekt.

---

### 2.2 `license` — Lisensfil

**Hva:** Sjekk om repoet har en gjenkjennbar lisensfil.

**Hvorfor:** OpenSSF Scorecard gir dette **Lav** risiko, men OpenSSF Best Practices krever det på Passing-nivå. Manglende lisens skaper juridisk usikkerhet og hindrer gjenbruk og sikkerhetsrevisjon av koden.

**Implementasjon:**
- Sjekk filer: `LICENSE`, `LICENSE.md`, `LICENSE.txt`, `LICENCE`, `COPYING`, `COPYING.md` (case-insensitive)
- Sjekk også `LICENSES/`-katalog (REUSE-standarden)
- `assess()`: «Repoet mangler en lisensfil. Uten lisens er det juridisk uklart hvordan koden kan brukes.»

**Verdi for team:** Viktig for intern gjenbruk av kode mellom team — et konkret compliance-tiltak.

---

### 2.3 `sast` — Statisk kodeanalyse i pipeline

**Hva:** Sjekk om repoet har integrert SAST-verktøy i sin CI/CD-pipeline.

**Hvorfor:** OpenSSF Scorecard gir dette **Medium** risiko. SAST fanger kjente sårbarhetsmønstre automatisk. Mange organisasjoner har lisenser for SonarQube, Checkmarx, Fortify eller CodeQL uten at alle team bruker dem.

**Implementasjon:**
- Søk i Jenkinsfile, `.gitlab-ci.yml`, GitHub Actions workflows etter:
  - SonarQube/SonarCloud: `sonar-scanner`, `sonarqube`, `sonar.projectKey`, `org.sonarsource`
  - CodeQL: `github/codeql-action`, `codeql`
  - Checkmarx: `checkmarx`, `cx-scan`
  - Semgrep: `semgrep`
  - SpotBugs/FindBugs: `spotbugs`, `findbugs`
  - Bandit (Python): `bandit`
  - ESLint security plugin: `eslint-plugin-security`
- Søk i `build.gradle`, `pom.xml`, `package.json` etter SAST-relaterte konfigurasjoner
- `assess()`: Differensier mellom «ingen SAST funnet» og «SAST funnet i X»
- `details()`: Returner hvilke SAST-verktøy som ble oppdaget

**Verdi for team:** Gir synlighet på hvem som bruker organisasjonens SAST-lisenser — verdifull info for Platform/Security-teamet.

---

### 2.4 `binary-artifacts` — Binærartefakter i kildekode

**Hva:** Sjekk om repoet inneholder kompilerte binærartefakter (`.jar`, `.war`, `.dll`, `.exe`, `.so`, `.class`, `.pyc`, minifisert JS-bundles, etc.) som er committet i kildekoden.

**Hvorfor:** OpenSSF Scorecard gir dette **Høy** risiko. Binærer kan ikke kode-reviewes, kan inneholde ondsinnet kode, og tyder på dårlig build-prosess.

**Implementasjon:**
- Søk i filtreet etter kjente binærfilendelser:
  - Java: `.jar`, `.war`, `.ear`, `.class`
  - .NET: `.dll`, `.exe`, `.nupkg`
  - Native: `.so`, `.dylib`, `.o`, `.a`
  - Python: `.pyc`, `.pyo`
  - JS: Mapper med `dist/`, `build/` som inneholder `.min.js`
- Ignorer filer i typiske tillatte stier (`docs/`, `test/fixtures/`)
- `assess()`: «Fant X binærartefakter i kildekoden. Binærer bør bygges fra kildekode, ikke committes direkte.»
- `details()`: List opp de funne filene (maks 20)

**Verdi for team:** Enkel å fikse, god opplæringseffekt, hindrer at noen «gjemmer» urevisjonsbar kode.

---

### 2.5 `pinned-deps` — Pinning og lockfiler for avhengigheter

**Hva:** Sjekk om repoet har lockfiler som pinner avhengigheter til eksakte versjoner.

**Hvorfor:** OpenSSF Scorecard gir dette **Medium** risiko. Uten lockfiler kan ulike byggmiljøer installere ulike versjoner, noe som gir «it works on my machine»-problemer og forsyningskjedesvakheter.

**Implementasjon:**
- Per økosystem, sjekk at lockfil finnes ved siden av manifestfil:
  - npm: `package.json` → `package-lock.json` eller `yarn.lock` eller `pnpm-lock.yaml`
  - Python: `requirements.txt` → OK (allerede pinnet), `Pipfile` → `Pipfile.lock`, `pyproject.toml` → `poetry.lock` eller `uv.lock`
  - Maven: `pom.xml` → anses som ok (versioner er eksplisitte i POM)
  - Go: `go.mod` → `go.sum`
  - .NET: `*.csproj` → `packages.lock.json`
- `assess()`: «Fant package.json uten package-lock.json. Generer lockfil med `npm install --package-lock-only` og commit den.»

**Verdi for team:** Veldig konkret og handlingsorientert — én kommando fikser det. Reduserer reelt risiko.

---

### 2.6 `docker-security` — Docker/Container-sikkerhet

**Hva:** Sjekk Dockerfile(s) for kjente sikkerhetsproblemer.

**Hvorfor:** Mange team lager containerimages uten å tenke på sikkerhetsbest practices. Dårlige Dockerfiler er en vanlig kilde til sårbare produksjonsmiljøer.

**Implementasjon:**
- Finn alle `Dockerfile`, `Dockerfile.*`, `*.dockerfile` i repoet
- Sjekk for:
  - `FROM ... AS ...` med `:latest`-tag (upinnet baseimage)
  - `USER root` uten etterfølgende `USER <non-root>` (kjører som root)
  - `COPY . .` med manglende `.dockerignore` (lekker hemmeligheter)
  - `RUN apt-get install` uten `--no-install-recommends`
  - `ADD` brukt der `COPY` er tilstrekkelig (ADD kan laste ned vilkårlige URL-er)
- Egne nivåer: bestått = ingen funn, varsel = noen funn, avvik = alvorlige funn
- `assess()`: List opp funnene med linje-referanser
- `details()`: Detaljer per Dockerfile

**Verdi for team:** Svært praktisk for team som deployer til Kubernetes — gir dem en konkret huskeliste.

---

### 2.7 `secret-scanning-config` — Hemmelighetsskanning i pipeline

**Hva:** Sjekk om repoet har konfigurert hemmelighetsskanning (secret scanning) i CI/CD eller pre-commit.

**Hvorfor:** Den eksisterende `secrets`-sjekken ser på om hemmeligheter *allerede finnes* i repoet. Denne nye sjekken vurderer om teamet har *proaktive tiltak* for å *forhindre* at hemmeligheter committes.

**Implementasjon:**
- Søk etter:
  - `.gitleaks.toml`, `gitleaks.yml` (Gitleaks)
  - `.pre-commit-config.yaml` med `detect-secrets` eller `gitleaks`
  - GitHub Actions med `trufflesecurity/trufflehog`, `gitleaks/gitleaks-action`
  - Jenkinsfile med `gitleaks`, `detect-secrets`, `trufflehog`
  - GitGuardian config: `.gitguardian.yml`
- `assess()`: «Ingen hemmelighetsskanning konfigurert. Vurder gitleaks eller detect-secrets som pre-commit hook eller i pipeline.»

**Verdi for team:** Komplementerer `secrets`-sjekken — viser forskjellen mellom «har du et problem» og «har du en prosess for å unngå problemet».

---

## 3. Nye sjekker — Governance og kodekvalitet

### 3.1 `contributing-guide` — Bidragsveiledning

**Hva:** Sjekk om repoet har en `CONTRIBUTING.md` eller tilsvarende bidragsveiledning.

**Hvorfor:** OpenSSF Best Practices Badge krever dette. For interne organisasjoner er det like viktig — det senker terskelen for at andre team kan bidra, og dokumenterer kvalitetskrav.

**Implementasjon:**
- Sjekk filer: `CONTRIBUTING.md`, `.github/CONTRIBUTING.md`, `CONTRIBUTING`, `docs/CONTRIBUTING.md`
- `assess()`: «Repoet mangler en bidragsveiledning. En CONTRIBUTING.md gjør det enklere for andre team å forstå hvordan de kan bidra.»

---

### 3.2 `code-review-enforcement` — Tvungen kode-review

**Hva:** Sjekk om branch-beskyttelse krever minimum antall godkjenninger (approvals) før merge til default branch.

**Hvorfor:** OpenSSF Scorecard gir dette **Høy** risiko. Argus sjekker i dag kun `no-rewrites`-restriksjonen. Kode-review er den mest effektive kontrollen mot uønsket kode — og krever eksplisitt konfigurasjon i Bitbucket.

**Implementasjon:**
- Bruk Bitbucket REST API: `GET /rest/branch-utils/latest/projects/{key}/repos/{slug}/restrictions`
- Sjekk for restriksjoner av typen:
  - `pull-request-only` (krev PR for alle endringer)
  - `required-all-approvers-merge-check` eller tilsvarende merge-checks
- Sjekk antall påkrevde godkjenninger (ideelt ≥1, optimalt ≥2)
- Vurder å sjekke om «dismiss stale approvals»-lignende innstillinger er aktivert
- `assess()`: Differensiert vurdering basert på konfigurasjonsnivå

**Verdi for team:** Synliggjør det viktigste governance-tiltaket — forhindrer at kode kommer i produksjon uten review.

---

### 3.3 `changelog` — Endringslogg

**Hva:** Sjekk om repoet har en `CHANGELOG.md` eller bruker konvensjonelle commits / release notes.

**Hvorfor:** OpenSSF Best Practices krever release notes. En endringslogg er essensielt for å kommunisere sikkerhetsfikser og breaking changes til konsumenter av koden.

**Implementasjon:**
- Sjekk filer: `CHANGELOG.md`, `CHANGELOG`, `CHANGES.md`, `HISTORY.md`, `RELEASE_NOTES.md`
- Sjekk også om `package.json` har `standard-version`, `semantic-release`, `conventional-changelog`, eller `release-it`
- `assess()`: «Ingen endringslogg funnet. Vurder CHANGELOG.md eller automatisert changelog med conventional-changelog.»

---

### 3.4 `test-coverage-config` — Testdekningskonfigurasjon

**Hva:** Sjekk om repoet har *konfigurert* code coverage-rapportering (ikke bare at tester finnes, men at det er satt opp verktøy for å *måle* dekning).

**Hvorfor:** Den eksisterende `tests`-sjekken sjekker bare om testfiler/-mapper finnes. Denne sjekken gjør et steg videre: Er det oppsatt infrastruktur for å faktisk spore testdekning? Det er stor forskjell.

**Implementasjon:**
- Søk etter:
  - `.nycrc`, `.nycrc.json`, `nyc.config.js` (nyc/Istanbul)
  - `jest.config.*` med `coverageThreshold` eller `collectCoverage`
  - `codecov.yml`, `.codecov.yml`
  - `coveralls.yml`
  - `.coveragerc`, `setup.cfg` med `[tool:coverage]` (Python)
  - Coverage-relaterte plugins i `pom.xml`: JaCoCo (`jacoco-maven-plugin`)
  - `sonar-project.properties` med `sonar.coverage`
- `assess()`: «Tester finnes, men ingen coverage-konfigurasjon ble funnet. Vurder å sette opp coverage-rapportering i CI.»

**Verdi for team:** Komplementerer `tests`-sjekken og gir innsikt i modenheten til testpraksisen.

---

### 3.5 `gitignore` — .gitignore-kvalitet

**Hva:** Sjekk om repoet har en `.gitignore` som dekker typiske problematiske filer for det aktuelle økosystemet.

**Hvorfor:** Manglende eller utilstrekkelig `.gitignore` fører til at byggeartefakter, IDE-filer, og potensielt sensitive filer ender opp i kildekoden.

**Implementasjon:**
- Sjekk at `.gitignore` finnes
- Basert på hvilke språk/rammeverk som er detektert (via avhengighetsfiler), sjekk at typiske ignore-mønstre er inkludert:
  - Node.js: `node_modules/`
  - Java: `target/`, `*.class`
  - Python: `__pycache__/`, `*.pyc`, `.venv/`
  - .NET: `bin/`, `obj/`
- `assess()`: «.gitignore mangler ignorering av node_modules/ — dette kan føre til at avhengigheter committes.»

---

## 4. Nye sjekker — DevOps-modenhet

### 4.1 `multi-env-config` — Miljøseparasjon

**Hva:** Sjekk om repoet har spor av separasjon mellom utviklings-, test- og produksjonsmiljøer.

**Hvorfor:** Miljøseparasjon er et grunnleggende DevOps-modenhetsprinsipp. Repos som ikke skiller mellom miljøer har høyere risiko for å deploye uferdig kode til produksjon.

**Implementasjon:**
- Søk etter indikatorer:
  - Flere environment-filer: `.env.development`, `.env.production`, `.env.test`
  - Kubernetes-manifester med flere miljøer: `k8s/dev/`, `k8s/prod/`
  - Helm values: `values-dev.yaml`, `values-prod.yaml`
  - Docker Compose: `docker-compose.override.yml`, `docker-compose.prod.yml`
  - CI/CD-stages for deploy til ulike miljøer
- `assess()`: «Ingen indikatorer på miljøseparasjon funnet. Vurder å separere konfigurasjoner for dev/staging/prod.»

---

### 4.2 `documentation-quality` — Dokumentasjonskvalitet

**Hva:** Gå utover «finnes README» og vurder om README-filen inneholder essensiell informasjon.

**Hvorfor:** En tom eller minimal README er ikke mye bedre enn ingen README. OpenSSF Best Practices krever at dokumentasjonen dekker hva prosjektet gjør, how to install, how to contribute, etc.

**Implementasjon:**
- Hent README-filens innhold
- Sjekk for tilstedeværelse av (regex/heading-matching):
  - Beskrivelse av hva prosjektet gjør
  - Installasjonsinstruksjoner (heading matches: `install`, `getting started`, `oppsett`, `setup`)
  - Bruksveiledning (heading matches: `usage`, `bruk`, `example`)
  - Kontaktinfo eller link til issue tracker
- Sjekk filstørrelse (< 200 bytes = sannsynligvis utilstrekkelig)
- `assess()`: «README finnes men mangler installasjonsinstruksjoner og bruksveiledning. En god README bør dekke: hva prosjektet gjør, hvordan det installeres, og hvordan det brukes.»
- `details()`: Returner hvilke seksjoner som ble funnet/mangler

---

### 4.3 `issue-tracking` — Aktiv saksbehandling

**Hva:** Sjekk om repoet bruker Bitbucket/Jira-integrasjon aktivt for issue tracking.

**Hvorfor:** OpenSSF Best Practices krever en sporbar prosess for bug-rapporter. Uten aktiv issue tracking er det vanskelig å vite om rapporterte problemer faktisk blir adressert.

**Implementasjon:**
- Sjekk Bitbucket issue tracker (om aktivert): `GET /rest/api/latest/projects/{key}/repos/{slug}/issues` (om tilgjengelig)
- Sjekk om Jira-integrasjon er aktivert (via repo-hooks eller branch-naming med issue-nøkler)
- Sjekk commit-meldinger for issue-referanser (Jira-nøkler som `PROJ-123`)
- `assess()`: Differensiert vurdering basert på om issue tracking er aktivt brukt

---

### Oversikt: alle foreslåtte nye sjekker

| # | ID | Kategori | Inspirert av | Innsats |
|---|-----|----------|-------------|---------|
| 1 | `security-policy` | Sikkerhet | Scorecard Security-Policy | Liten |
| 2 | `license` | Governance | Scorecard License | Liten |
| 3 | `sast` | Sikkerhet | Scorecard SAST | Medium |
| 4 | `binary-artifacts` | Sikkerhet | Scorecard Binary-Artifacts | Medium |
| 5 | `pinned-deps` | Forsyningskjede | Scorecard Pinned-Dependencies | Medium |
| 6 | `docker-security` | Sikkerhet | Best Practices + egendefinert | Stor |
| 7 | `secret-scanning-config` | Sikkerhet | Best Practices + egendefinert | Medium |
| 8 | `contributing-guide` | Governance | Best Practices | Liten |
| 9 | `code-review-enforcement` | Governance | Scorecard Code-Review | Medium |
| 10 | `changelog` | Kodekvalitet | Best Practices | Liten |
| 11 | `test-coverage-config` | Kodekvalitet | Best Practices | Medium |
| 12 | `gitignore` | Kodekvalitet | Egendefinert | Medium |
| 13 | `multi-env-config` | DevOps | Egendefinert | Medium |
| 14 | `documentation-quality` | Kodekvalitet | Best Practices | Medium |
| 15 | `issue-tracking` | Governance | Best Practices | Medium |

---

# Del B — Frontend-forbedringer

## 5. Designprinsipper for adopsjon

For at utviklerteam faktisk tar Argus i bruk og gjennomfører tiltak, må dashboardet følge disse prinsippene:

1. **Handlingsorientert, ikke bare informativ** — Hver visning bør lede til «hva gjør jeg nå?», ikke bare «her er fakta»
2. **Progressiv avsløring** — Vis det viktigste først, la brukeren drille ned for detaljer
3. **Positiv forsterkning** — Feir fremgang, ikke bare vis mangler
4. **Lav friksjon** — Minst mulig steg fra «ser problemet» til «vet hvordan jeg fikser det»
5. **Sosial motivasjon** — Synliggjør forbedringer og team som gjør det bra
6. **Historisk kontekst** — Vis trenden, ikke bare øyeblikksbildet

Kilde: DORA-forskningen viser at måling og synlighet driver forbedring, men kun når det kombineres med psykologisk trygghet og handlingsfrihet.

---

## 6. Handlingsorientering

### 6.1 Handlingskort per sjekk — «Slik fikser du det»

**Hva:** Når en bruker klikker på et avvik i repo-detaljvisningen, vis en oppskrift for hvordan det fikses — ikke bare hva som er galt.

**Eksempler:**
- **`renovate` feiler** → «Opprett `renovate.json` med innhold: `{ "$schema": "...", "extends": ["config:base"] }` og commit til default branch.»
- **`codeowners` feiler** → «Opprett `CODEOWNERS` i roten med format: `* @team-navn` — se Bitbucket-dokumentasjonen.»
- **`security-policy` feiler** → «Lag en `SECURITY.md` med [denne malen](link til mal).»
- **`pinned-deps` feiler** → «Kjør `npm install --package-lock-only` og commit `package-lock.json`.»

**Implementasjon:** Hver sjekk kan eksportere en valgfri `remediation`-streng som inkluderes i rapporten og vises i frontend. Frontend kan også ha statiske remediation-maler per sjekk-ID.

**Verdi:** Dette er den viktigste enkeltforbedringen. Forskjellen mellom «du har et problem» og «her er løsningen, copy-paste dette» er enorm for adopsjon.

---

### 6.2 Generer Jira/Bitbucket-issues direkte fra dashboardet

**Hva:** Knapp i frontend: «Opprett oppgave i Jira» / «Opprett issue i Bitbucket» for hvert avvik. Forhåndsfylt med tittel, beskrivelse og remediation-steg.

**Eksempel:** Bruker klikker «Opprett oppgave» på `renovate`-avvik → generert issue:
> **Tittel:** [Argus] Konfigurer Renovate Bot for atlas-api  
> **Beskrivelse:** Argus-auditen viser at atlas-api mangler automatisk avhengighetsoppdatering. Opprett `renovate.json` med standardkonfigurasjon...  
> **Labels:** argus, sikkerhet, avhengigheter

**Implementasjon:** 
- Alternativ 1: Generer URL med forhåndsfylte query-parametere (Bitbucket og Jira støtter dette)
- Alternativ 2: Legg til valgfri API-integrasjon (krever Jira-token)

**Verdi:** Senker terskelen fra «vi bør gjøre noe» til «oppgaven er opprettet og kan prioriteres i backlog».

---

### 6.3 Eksport-funksjoner for rapportdeling

**Hva:** Utvid eksportmulighetene utover JSON:

- **PDF-eksport** av oversikten for ledermøter/styrerapporter
- **CSV-eksport** av repo-matrisen for videre analyse i Excel/Google Sheets
- **Kopier deeplink til spesifikt filter** for å dele fokusert visning med et team
- **E-post-sammendrag** — generer HTML-e-post med key findings for et prosjekt

**Verdi:** Gjør det enkelt for tech leads å dele funn med teamet sitt uten å be alle logge inn.

---

## 7. Trendvisning og historikk

### 7.1 Sammenlign rapporter over tid

**Hva:** La brukere laste inn flere JSON-rapporter (f.eks. uke 1, uke 4, uke 8) og vis utviklingen over tid.

**Visning:**
- **Overordnet trendgraf:** Antall bestått sjekker, antall avvik, gjennomsnittlig dekning-% — over tid
- **Per-prosjekt sparklines:** Små trendlinjer i prosjektkortet som viser om det går riktig vei
- **Per-sjekk trendlinjer:** Vis dekning-% for `renovate`, `codeowners`, etc. over tid i dekning-diagrammet
- **Sårbarhetstrend:** Antall CRITICAL/HIGH-sårbarheter over tid

**Implementasjon:**
- Frontend lagrer rapporter i `localStorage` med timestamp
- Ny tab/view: «Utvikling over tid» med tidsvelger
- Rapportformat inkluderer allerede `generatedAt` — dette er nøkkelen for tidslinje

**Verdi:** Historisk kontekst er enormt motiverende. «Vi har gått fra 40% til 72% dekning på 3 måneder» driver videre innsats. DORA-forskningen bekrefter at synlig forbedringstrend er nøkkelen til at team fortsetter å investere.

---

### 7.2 Delta-rapport — «Hva er nytt siden sist»

**Hva:** Når en ny rapport lastes inn, vis automatisk hva som har endret seg:

- **Nye avvik** (repos som nå feiler en sjekk de tidligere bestod)
- **Fikset** (repos som nå består en sjekk de tidligere feilet)
- **Nye sårbarheter** / **lukkede sårbarheter**
- **Nye repos** (lagt til siden sist) / **fjernede repos**

**Visning:** Badge-notifikasjoner på tab-ene: «3 nye avvik», «12 fikset ✅», «5 nye CVE-er»

**Verdi:** Gir umiddelbar feedback på tiltakene som er gjort. «Vi opprettet CODEOWNERS for 8 repos forrige uke — se, de er grønne nå!»

---

## 8. Teamengasjement og gamification

### 8.1 Sikkerhetspoeng (Security Score) per repo

**Hva:** Beregn en numerisk poengsum (0–100) per repo basert på vektet sjekk-resultat, inspirert av OpenSSF Scorecards vektingsmodell.

**Vekting (forslag):**

| Sjekkgruppe | Vekt | Eksempler |
|-------------|------|-----------|
| Sikkerhet (kritisk) | 10 | dep-vulns, secrets, sast, secret-scanning-config |
| Sikkerhet (høy) | 7.5 | branch-protection, code-review-enforcement, pinned-deps |
| Governance (medium) | 5 | codeowners, security-policy, renovate, pipeline |
| Kodekvalitet (lav) | 2.5 | readme, tests, linting, changelog, license |

**Visning:**
- Stor poengsum-badge i repo-detaljvisningen
- Fargekoding: 80–100 = grønn, 50–79 = gul, 0–49 = rød
- Vis poengsum i repo-matrisen som sorterbar kolonne

**Verdi:** En enkelttall gir enkel kommunikasjon: «vår ambisjon er at alle repos skal være over 70» — mye mer intuitivt enn «13 individuelle sjekker».

---

### 8.2 Leaderboard — Topp forbedringer og topp score

**Hva:** Vis to rangeringer:

1. **Topp score:** Repos/prosjekter med høyest sikkerhetspoeng — «disse gjør det bra, lær av dem»
2. **Topp forbedring:** Repos/prosjekter med størst poengsumøkning siste periode — «disse har jobbet hardest»

**Viktig:** Vis **forbedring** fremfor **absolutt score** som primær rangering. Dette motiverer alle team, ikke bare de som allerede var gode.

**Verdi:** Sosial motivasjon fra DORA-prinsippene — team vil se seg selv bevege seg oppover. Unngå «naming and shaming» — fokuser på positive resultater.

---

### 8.3 Målsetting og milepæler

**Hva:** La organisasjonen (eller hvert team) definere mål:
- «Alle repos skal ha CODEOWNERS innen Q3»
- «Gjennomsnittlig sikkerhetspoeng over 60 innen desember»
- «Null CRITICAL-sårbarheter uten fiks»

**Visning:**
- Progress bar mot målet på oversiktssiden
- Konfetti/feiring når et mål nås (subtilt men synlig)
- Historisk sporing av mål-oppnåelse

**Implementasjon:** Mål kan defineres i en konfigurasjonsfil (JSON) eller som en del av frontend-innstillingene (lagret i `localStorage`).

---

### 8.4 Badges/shields for repoer

**Hva:** Generer [shields.io](https://shields.io/)-kompatible badges som team kan legge i sin README:

```markdown
![Argus Score](https://img.shields.io/badge/Argus%20Score-87%2F100-brightgreen)
![Argus Checks](https://img.shields.io/badge/Argus-12%2F13%20passed-green)
```

**Implementasjon:** Frontend genererer badge-URL basert på rapportdata. Alternativt eksporter SVG direkte.

**Verdi:** Synlighet i repository-visningen i Bitbucket — signaliserer at teamet tar sikkerhet på alvor.

---

## 9. Integrasjon og distribusjon

### 9.1 Slack/Teams-integrasjon for nye resultater

**Hva:** Generer en formatert melding (Slack Block Kit / Teams Adaptive Card) med oppsummering av rapporten som kan postes i team-kanaler.

**Eksempel output:**
```
🔍 Argus audit — 15. april 2026
📊 142 repos skannet | Score: 68/100 (+4 fra forrige uke)
✅ 12 nye repos bestod alle sjekker
⚠️ 5 nye CRITICAL-sårbarheter
🏆 Topp forbedring: PLATTFORM-teamet (+12 poeng)
🔗 Se full rapport: [link til dashboard]
```

**Implementasjon:** CLI generer Slack/Teams-meldingsformat som output (`.json` eller `.md`). Frontend kan ha en «Kopier til Slack»-knapp.

**Verdi:** Møter teamene der de er (i chat) i stedet for at de aktivt må besøke et dashboard.

---

### 9.2 Planlagt kjøring med historisk lagring

**Hva:** Dokumenter og støtt automatisk periodisk kjøring (cron/scheduled pipeline) med lagring av rapporter.

- Legg til en mal for Jenkins/GitHub Actions som kjører Argus ukentlig
- Lagre rapporter med dato-prefix: `reports/argus-2026-04-11.json`
- Frontend kan laste alle rapporter fra en mappe/URL for trendvisning

**Verdi:** Uten planlagt kjøring dør adopsjon — noen må huske å kjøre det manuelt. Automatisering er grunnlaget for alt annet.

---

### 9.3 API/URL-basert rapport-lasting

**Hva:** I tillegg til drag-and-drop, la frontend laste rapport fra URL (query-parameter).

```
https://argus.example.com/?report=https://reports.internal/argus-latest.json
```

**Implementasjon:** Hent JSON-fil via `fetch()` fra URL i query-parameter. Krev at URL-en er på en tillatt domene-liste (konfiguerbar) for sikkerhet.

**Verdi:** Muliggjør bokmerker og direkte lenker til oppdaterte rapporter.

---

### 9.4 SIEM-integrasjon — Sikkerhetshendelser fra kodebase til SOC

**Visjon:** Argus-funn skal ikke leve isolert i et dashboard — de skal strømme inn i organisasjonens Security Operations Center (SOC) via SIEM-systemet, slik at repo-sikkerhetsstatus behandles på linje med infrastruktur- og nettverkshendelser.

**Hvorfor dette er viktig:**
- SOC-teamet ser i dag infrastruktur- og nettverksalarmer, men har **null synlighet** på kodebase-hygiene
- En repo som mister branch-beskyttelse eller får nye CRITICAL-sårbarheter er en sikkerhetshendelse — like reell som en åpen port
- SIEM-korrelasjon muliggjør kraftige regler: «repo X fikk ny CRITICAL-sårbarhet OG har ingen SAST OG er eksponert eksternt» → automatisk eskalering
- Compliance-rapportering (ISO 27001, SOC 2) krever ofte at sikkerhetsfunn er **sentralt logget** — SIEM-integrasjon løser dette

---

#### Strategi: Tre integrasjonslag

**Lag 1 — OCSF-formatert hendelsesstrøm (CLI-output)**

Bruk [Open Cybersecurity Schema Framework (OCSF)](https://schema.ocsf.io/) — en åpen standard utviklet av AWS, Splunk, IBM, CrowdStrike m.fl. — for å formatere Argus-funn som strukturerte sikkerhetshendelser.

OCSF-hendelsestyper for Argus-funn:

| Argus-funn | OCSF-klasse | Klasse-UID | Eksempel |
|------------|-------------|------------|----------|
| Sjekk bestått/feilet | Compliance Finding | 2003 | `branch-protection: fail` |
| Sårbarhet funnet | Vulnerability Finding | 2002 | `CVE-2024-1234 i lodash` |
| Hemmelig fil oppdaget | Detection Finding | 2004 | `.env med API-nøkkel` |
| Regresjonsalarm | Incident Finding | 2001 | `branch-protection gikk fra pass → fail` |

**Fordel:** OCSF er leverandøragnostisk og støttes direkte av Splunk, Amazon Security Lake, Elastic, Google Chronicle og Microsoft Sentinel (via mapping). Argus trenger bare å produsere OCSF — og alle SIEM-er kan konsumere det.

CLI-flagg: `--output-format ocsf` → skriver OCSF JSON-filer ved siden av vanlig rapport.

---

**Lag 2 — Push-integrasjon mot vanlige SIEM-plattformer**

Konfigurerbar push etter hver audit-kjøring, via nye miljøvariabler:

| SIEM | Protokoll | Miljøvariabler |
|------|-----------|----------------|
| **Splunk** | HTTP Event Collector (HEC) | `SIEM_TYPE=splunk`, `SIEM_URL`, `SIEM_TOKEN` |
| **Elastic/OpenSearch** | Bulk API | `SIEM_TYPE=elastic`, `SIEM_URL`, `SIEM_INDEX` |
| **Microsoft Sentinel** | Log Analytics Data Collector API | `SIEM_TYPE=sentinel`, `SIEM_WORKSPACE_ID`, `SIEM_SHARED_KEY` |
| **Generisk (syslog)** | CEF over syslog | `SIEM_TYPE=cef`, `SYSLOG_HOST`, `SYSLOG_PORT` |
| **Generisk (webhook)** | HTTP POST (JSON) | `SIEM_TYPE=webhook`, `SIEM_WEBHOOK_URL` |

Eksempel `.env`:
```
SIEM_TYPE=splunk
SIEM_URL=https://splunk.internal:8088/services/collector/event
SIEM_TOKEN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SIEM_INDEX=argus_security
SIEM_SOURCETYPE=argus:compliance
```

CLI-bruk: `node index.js PROJ --siem` → kjører audit og pusher resultater til konfigurert SIEM.

---

**Lag 3 — Frontend: «Synkroniser til SIEM»-knapp**

En knapp i dashboardet som:
1. Transformerer gjeldende rapport til OCSF/CEF-hendelser
2. Sender til konfigurert SIEM-endepunkt via proxy/backend
3. Viser bekreftelse: «42 hendelser sendt til Splunk — [åpne i SIEM →]»

Frontend-konfigurasjon (innstillingsmodal):
```json
{
  "siem": {
    "type": "splunk",
    "url": "https://splunk.internal:8088/services/collector/event",
    "index": "argus_security",
    "sourcetype": "argus:compliance"
  }
}
```

Statusindikator i rapportvisningen: «Sist synkronisert: 2026-04-11 14:30 ✓»

> **Sikkerhetsnotat:** Tokenet bør aldri lagres i frontend/localStorage. Bruk en tynn backend-proxy eller konfigurer SIEM-endepunktet til å godta forespørsler fra dashboardets domene uten token (IP-basert tilgangskontroll).

---

#### Innovativ funksjon: Regresjonsalarmer med forhøyet severity

Argus kan automatisk generere SIEM-alarmer med **høyere severity** når en sjekk *regrederer* (gikk fra bestått til ikke-bestått mellom to kjøringer):

| Hendelse | Normal severity | Regresjon-severity | SIEM-aksjon |
|----------|----------------|-------------------|-------------|
| `branch-protection: fail` | Medium | **High** | SOC-varsling |
| Ny CRITICAL-sårbarhet uten SAST | High | **Critical** | Automatisk Jira-issue |
| Secrets funnet uten secret-scanning | High | **Critical** | Umiddelbar eskalering |
| `renovate: fail` (var pass) | Low | **Medium** | Registrering |

**Implementasjon:** Sammenlign forrige og nåværende rapport. For alle sjekker som gikk fra `pass` → `fail`, øk OCSF `severity_id` med ett nivå og sett `activity_name: "Update"` i stedet for `"Create"`.

**Verdi:** SOC-teamet får **handlingsbar informasjon** — ikke bare «her er status», men «noe ble verre, handle nå». Dette er fundamentalt annerledes enn et statisk compliance-dashboard.

---

#### Innovativ funksjon: SIEM-dashboard-maler («Argus Security Posture»)

Lever ferdige, importerbare dashboard-maler for de vanligste SIEM-ene:

- **Splunk:** Dashboard XML med paneler for compliance-oversikt, sårbarhetstrend, regresjonsalarmer og «worst repos»
- **Elastic/Kibana:** Saved objects JSON med visualiseringer, index pattern og dashboard
- **Microsoft Sentinel:** KQL-spørringer og Azure Workbook-template
- **Grafana:** Dashboard JSON for team som bruker Grafana for observability

Eksempel på paneler i SIEM-dashboardet:
1. **Compliance Posture** — Kakediagram: % repos som består alle sjekker
2. **Regression Timeline** — Tidslinje over regresjoner siste 30 dager
3. **Critical Vulnerabilities** — Tabell med CRITICAL CVE-er, påvirket repo og alder
4. **Score Distribution** — Histogram over sikkerhetspoeng
5. **Alert Correlation** — Koblet visning: «repo med lav score + nylig deploy + eksternt eksponert»

**Verdi:** Team kan importere et ferdig SIEM-dashboard på minutter og ha operasjonell synlighet fra dag én — uten å måtte bygge spørringer selv.

---

#### OCSF-hendelseseksempel (Compliance Finding)

```json
{
  "class_uid": 2003,
  "class_name": "Compliance Finding",
  "category_uid": 2,
  "category_name": "Findings",
  "severity_id": 4,
  "severity": "High",
  "activity_id": 1,
  "activity_name": "Create",
  "time": 1744531200000,
  "finding_info": {
    "title": "Branch protection ikke konfigurert",
    "uid": "argus:branch-protection:PROJ/my-repo",
    "types": ["Compliance"],
    "src_url": "https://bitbucket.example.com/projects/PROJ/repos/my-repo"
  },
  "compliance": {
    "control": "branch-protection",
    "requirements": ["OpenSSF Scorecard — Branch-Protection"],
    "status": "Fail",
    "status_detail": "Default branch mangler no-rewrite-beskyttelse"
  },
  "resources": [
    {
      "type": "Repository",
      "uid": "PROJ/my-repo",
      "name": "my-repo",
      "labels": ["project:PROJ", "language:javascript"]
    }
  ],
  "metadata": {
    "product": {
      "name": "Argus",
      "vendor_name": "Internal",
      "version": "1.0.0"
    },
    "version": "1.3.0",
    "log_name": "argus-compliance"
  }
}
```

---

#### Implementasjonsplan

**Ny modul:** `siem/`

| Fil | Ansvar |
|-----|--------|
| `siem/index.js` | Felles grensesnitt: `pushToSiem(report, prevReport, config)` |
| `siem/ocsf.js` | Transformer Argus-rapport → OCSF-hendelser |
| `siem/regression.js` | Sammenlign to rapporter og generer regresjonsalarmer |
| `siem/splunk.js` | Splunk HEC-klient (HTTP POST) |
| `siem/elastic.js` | Elasticsearch Bulk API-klient |
| `siem/sentinel.js` | Azure Log Analytics Data Collector-klient |
| `siem/cef.js` | CEF/Syslog-formatter |
| `siem/webhook.js` | Generisk webhook-klient (JSON POST) |

**Frontend:**
- SIEM-konfigurasjonsmodal i innstillinger
- «Synkroniser til SIEM»-knapp med fremdriftsindikator
- Statuslinje: sist synkronisert, antall hendelser

**Dashboard-maler:**
- `siem/dashboards/splunk-argus-posture.xml`
- `siem/dashboards/kibana-argus-posture.ndjson`
- `siem/dashboards/sentinel-argus-workbook.json`
- `siem/dashboards/grafana-argus-posture.json`

**Verdi:** Argus transformeres fra et isolert auditverktøy til en **integrert del av organisasjonens security fabric**. SOC kan korrelere repo-sikkerhet med deploy-hendelser, nettverkstrafikk og incident-rapporter — og reagere proaktivt før sårbarheter utnyttes.

---

## 10. Brukervennlighet og UX

### 10.1 Prosjekt-fokusert visning for tech leads

**Hva:** Ny hovedvisning: «Mitt prosjekt», der bruker velger sitt Bitbucket-prosjekt og får en dedikert dashboard-visning bare for sine repos.

**Innhold:**
- Sikkerhetspoeng for prosjektet (gjennomsnitt)
- Trend (sammenlignet med forrige rapport)
- Liste over repos sortert etter prioritet
- «Lavthengende frukt»-seksjon: repos som trenger kun 1–2 tiltak for å nå neste nivå
- Prosjekt-spesifikke mål/milepæler

**Verdi:** Tech leads bryr seg om sine egne repos — en organisasjonsdekkende oversikt føles overveldende. «Mitt prosjekt»-visningen gir eierskap.

---

### 10.2 Filtrering på tvers av dimensjoner

**Hva:** Utvid filtreringen med:
- **Etter team/eier** (krever metadata i rapporten eller CODEOWNERS-info)
- **Etter teknologi** (Node.js, Java, Python, Go — basert på avhengighetsfiler funnet)
- **Etter «hva kan fikses raskt»** — filtrer til repos der alle avvik har remediation-steg
- **Lagrede filtre** — lagre favoritt-filtere i localStorage

**Verdi:** Gjør det mulig for ulike roller å bruke dashboardet effektivt — CISO ser oversikten, tech lead ser sitt team, utvikler ser sine repos.

---

### 10.3 Søk med autofullføring

**Hva:** Utvid søkefeltet med autofullføring for repo-navn, prosjektnavn, CVE-IDer og sjekk-IDer. Vis resultatkategorier i dropdown.

**Verdi:** For store organisasjoner med hundrevis av repos er rask navigasjon viktig.

---

### 10.4 Tastaturnavigasjon og tilgjengelighet

**Hva:** Legg til tastaturnavigasjon for effektive brukere:
- `j`/`k` for å navigere opp/ned i lister
- `Enter` for å åpne detaljer
- `Escape` for å lukke panel
- `/` for å fokusere søkefeltet
- Tab-indeks og ARIA-labels for skjermlesere

**Verdi:** Power users (= de folka som faktisk fikser ting) elsker tastaturnavigasjon.

---

### 10.5 Onboarding-opplevelse

**Hva:** Når dashboardet åpnes for første gang (ingen rapport lastet), vis:
- Kort intro til Argus med illustrasjon
- Step-by-step guide for å kjøre CLI og generere rapport
- Mulighet til å laste en demo-rapport for å utforske grensesnittet
- Link til README og dokumentasjon

**Verdi:** Første møtet med verktøyet definerer om brukeren fortsetter eller gir opp. En kald «dra og slipp JSON»-melding mister mange.

---

# Del C — Sikkerhets-awareness og organisasjonskultur

## 11. Kontekstuell sikkerhetslæring

### 11.1 Læringskort per sjekk — «Hvorfor er dette viktig?»

**Hva:** Koble hvert avvik til et forklaringskort som svarer på *hvorfor* dette er et sikkerhetsproblem — ikke bare *hva* som er galt og *hvordan* det fikses. Uten denne konteksten vil mange utviklere bare «fikse det grønne lyset» uten å internalisere sikkerheten.

**Innhold per kort:**

| Felt | Eksempel (`branch-protection`) |
|------|--------------------------------|
| **Risikoscenario** | «En kompromittert utviklerkonto kan pushe skadelig kode direkte til main uten review» |
| **Kjent hendelse** | SolarWinds (2020): kompromittert build-pipeline uten tilstrekkelig branch-policy |
| **Estimert fiksetid** | ~15 minutter |
| **Risikonivå** | Høy |
| **Compliance-kobling** | NIST CSF PR.AC-4, ISO 27001 A.12.1 |

**Implementasjon:** Hvert sjekk-objekt eksporterer valgfri `awareness`-struct:

```javascript
module.exports = {
  id: "branch-protection",
  awareness: {
    risk: "high",
    scenario: "En kompromittert konto kan pushe direkte til main uten review.",
    realWorldExample: "SolarWinds-angrepet (2020) utnyttet en kompromittert build-pipeline.",
    estimatedFix: "15 min",
    references: ["https://owasp.org/www-project-top-ten/"]
  },
  run: async (projectKey, repoSlug, request) => { /* ... */ }
};
```

Frontend: Expanderbar «Lær mer»-seksjon under hvert avvik i repo-detaljvisningen.

**Verdi:** Forståelse driver varig endring. Utviklere som forstår *hvorfor* branch-protection hindrer supply chain-angrep, vedlikeholder konfigurasjonen aktivt — ikke bare som en engangsøvelse.

---

### 11.2 Kobling til opplæringsplattformer og intern wiki

**Hva:** Koble Argus-funn direkte til organisasjonens læringsressurser.

- **Konfigurerbar wiki-URL:** `LEARNING_BASE_URL=https://wiki.example.com/security/` → hvert funn linker automatisk til `wiki.example.com/security/{check-id}`
- **OWASP-referanser:** Statisk mapping av `dep-vulns` → OWASP Top 10 A06, `secrets` → A02, `sast` → A03, etc.
- **Interne kurs:** Lenke til relevant modul i LMS/e-læring-system
- **Compliance-mapping:** Vis hvilke ISO 27001- eller NIST CSF-kontroller sjekken dekker

**Implementasjon:** Statisk kart i ny fil `checks/awareness-map.js`:

```javascript
module.exports = {
  "branch-protection": { iso27001: ["A.12.1.2"], nistCsf: ["PR.AC-4"] },
  "dep-vulns":         { owasp: "A06:2021",  iso27001: ["A.12.6.1"], nistCsf: ["ID.RA-1"] },
  "secrets":           { owasp: "A02:2021",  iso27001: ["A.9.4.3"],  nistCsf: ["PR.AC-1"] }
};
```

**Verdi:** Gjør sikkerhetsfunn relevante for review-team, revisorer og compliance-ansvarlige — ikke bare for utviklere.

---

### 11.3 Sikkerhetsbevissthet for AI-generert kode

**Hva:** AI-kodeverktøy (GitHub Copilot, Claude, Cursor m.fl.) introduserer risikoer tradisjonelle sjekker ikke fanger:

- **Hallusinerte pakkenavn** → typosquatting- og dependency confusion-risiko
- **Usikre kode-mønstre** kopiert ukritisk fra LLM-treningsdata
- **Svekket menneskelig review-disiplin** når AI genererer store kodeblokker

**Tiltak:**
- Ny sjekk: `ai-package-integrity` — krysssjekker at pakkenavn i `package.json` faktisk finnes i npm-registeret via `GET https://registry.npmjs.org/{name}` (fanger hallusinerte avhengigheter)
- Innsiktsbanner i dashboardet: «Bruker teamet AI-kodeverktøy? AI-generert kode krever samme sikkerhetsgjennomgang som menneskelig kode — og noen ganger mer.»
- Kobing til [OWASP LLM Top 10](https://owasp.org/www-project-top-10-for-large-language-model-applications/) for fremtidig utvidelse

**Verdi:** Fremtidssikrer Argus for det nye trusselbildet der LLM-hallusinering og supply chain via AI-generert kode er reelle og voksende risikoer.

---

## 12. Policy Gates — Sikkerhetsterskel i CI/CD

### 12.1 Argus som CI/CD-håndhever

**Hva:** Legg til en håndhevelses-modus der Argus returnerer exit code 1 (og feiler bygget) hvis et prosjekt bryter definerte sikkerhetspolicyer. Konverterer Argus fra passivt rapporteringsverktøy til aktiv sikkerhetsbarriere.

**Eksempel `argus-policy.json`:**

```json
{
  "minimumScore": 60,
  "requiredChecks": ["branch-protection", "secrets", "pipeline"],
  "forbiddenFindings": [
    { "check": "dep-vulns", "maxSeverity": "CRITICAL" },
    { "check": "secrets",   "failOnAny": true }
  ],
  "gracePeriodDays": 14,
  "exemptions": [
    { "repoPattern": "sandbox-*", "reason": "Utviklingssandbox, ikke produksjon" }
  ]
}
```

```
node index.js PROJ --enforce --policy argus-policy.json
```

- Exit 0 → alle repos overholder policy, pipeline fortsetter
- Exit 1 → policy-brudd, rapport med detaljer og remediation-lenker

**Verdi:** Det kraftigste enkelttiltaket for security awareness. Teams bryr seg om sikkerhet når den blokkerer deployment. SANS Institute og Gartner anbefaler policy gates som primærdriver for «shift left»-sikkerhet.

---

### 12.2 Gradvis innstramming (Ratchet-mekanisme)

**Hva:** For å unngå «security shock» hos team som plutselig møter nye krav, innfør en forutsigbar ratchet-overgang:

| Fase | Varighet | Konsekvens |
|------|----------|------------|
| Varslingsfase | Uke 1–2 | Bygg passerer; rapport med advarsler sendes til team |
| Myk håndhevelse | Uke 3–4 | Bygg passerer; kommentar postes automatisk på PR |
| Hard håndhevelse | Uke 5+ | Bygg feiler ved policy-brudd |

**Ratchet-prinsipp:** Minimumsscore kan økes kvartalvis basert på organisasjonsmål — aldri senkes. Eksisterende godkjente repos «låses» til sitt nåværende score-nivå.

**Verdi:** Kombinert med læringskortene (11.1) vet teamene nøyaktig hva de må gjøre og hvorfor, lenge før bygget faktisk feiler. Overgangen blir forutsigbar, ikke sjokkerende.

---

### 12.3 Bitbucket Server merge checks (langsiktig)

**Hva:** En Bitbucket Server-plugin som eksponerer utvalgte Argus-sjekker som native merge checks — direkte i Bitbucket, uten ekstern CI-pipeline.

- Merge til default branch blokkeres hvis repo feiler konfigurerbare «must-pass»-sjekker (`secrets`, `branch-protection` etc.)
- Konfigurerbart per Bitbucket-prosjekt fra admin-UI
- Inline feedback direkte i pull request-visningen

**Verdi:** Lavest mulig friksjon — utvikleren ser hva som mangler i sin PR, fikser det der og da, og PR-en godtas. Sikker kode som en naturlig del av pull request-arbeidsflyten.

---

## 13. CISO-rapportering, MTTR og risikomodenhet

### 13.1 Eksekutiv sikkerhetsoppsummering

**Hva:** En dedikert rapportmodus (`--report-mode executive`) for CISO, CTO og sikkerhetsledergruppen — aggregerer tekniske funn til business-risk-innsikt uten teknisk støy.

**Nøkkelinnhold:**

| Panel | Innhold |
|-------|---------|
| Organisatorisk sikkerhetspoeng | Vektet gjennomsnitt 0–100, fargekodert og trendlinjet |
| Risikokartlegging | Antall repos i rød/gul/grønn sone |
| Top 5 organisasjonsrisici | Sjekk-kategorier med høyest failure rate × severity-vekt |
| Kvartalstrend | Graf: gjennomsnittlig score og andel compliant repos |
| Åpne kritiske funn | CRITICAL CVE-er eldre enn 30 dager uten tildelt eier/fix |
| Compliance-status | Mapping mot ISO 27001 A.12/A.14 eller NIST CSF-funksjoner |

**Eksport:** PDF med organisasjons-branding, klar for styrepresentasjon eller ekstern revisjon.

**Verdi:** Security awareness starter på toppen. En rapport CISO kan presentere for styret driver organisatorisk forpliktelse og ressursallokering — noe tekniske dashboards alene aldri oppnår.

---

### 13.2 MTTR — Mean Time to Remediate

**Hva:** Det viktigste enkeltmålet på om sikkerhetsprogrammet faktisk endrer adferd. Mål tid fra et funn *oppdages* (første rapport med avviket) til det er *lukket* (første rapport uten).

| Severity | God MTTR | Varsle ved |
|----------|----------|------------|
| Critical | < 24 timer | > 72 timer |
| High | < 7 dager | > 14 dager |
| Medium | < 30 dager | > 60 dager |
| Low | < 90 dager | > 180 dager |

**Visning:**
- MTTR per prosjekt, per sjekk-kategori og per severity — som nøkkeltall og trendgraf
- MTTR-kolonne i repo-matrisen og aggregert MTTR i eksekutivrapporten
- Automatisk SIEM-alarm / Slack-varsel ved brudd på MTTR-terskel

**Verdi:** Uten MTTR vet ikke sikkerhetsleder om awareness-programmet gir reell effekt. MTTR er bindeleddet mellom «vi fant et problem» og «vi kan dokumentere at vi løste det raskt».

---

### 13.3 Formell risikoaksept-prosess

**Hva:** Erstatt «evig røde repos» med en styrt prosess for bevisst, tidsavgrenset risikoaksept.

**Flyt:**
1. Teamleder registrerer aksept i `argus-risk-accept.json` i repoet (eller via Jira-issue med label `argus-risk-accepted`)
2. Argus markerer funnet som **Akseptert risiko** (ikke **Avvik**) med eier og akseptdato
3. Aksepten utløper automatisk etter X dager — konfigurerbar per severity
4. CISO-rapporten skiller tydelig mellom «Åpent avvik», «Akseptert risiko (utløper DD.MM)» og «Under utbedring»
5. Utløpt aksept → automatisk re-eskalering via SIEM/Slack/e-post

```json
// argus-risk-accept.json
{
  "accepted": [
    {
      "check": "dep-vulns",
      "cve": "CVE-2024-1234",
      "reason": "Ingen tilgjengelig patch. Ekstern tilgang blokkert via WAF.",
      "owner": "alice@example.com",
      "acceptedUntil": "2026-07-01"
    }
  ]
}
```

**Verdi:** Uten en formell prosess er risikoaksept usynlig — en «fixed it by ignoring it»-kultur. Med prosessen gjør organisasjonen et dokumentert, tidsavgrenset, navngitt valg. Det alene øker awareness og juridisk ansvarlighet betraktelig.

---

## 14. Prioritert tiltaksliste

### Fase 1 — Høy verdi, lav innsats (1–3 uker)

| # | Tiltak | Type | Innsats |
|---|--------|------|---------|
| 1 | ~~Handlingskort med remediation-oppskrift per sjekk~~ | Frontend | ✅ Ferdig |
| 2 | `security-policy`-sjekk (SECURITY.md) | Sjekk | Liten |
| 3 | `license`-sjekk (lisensfil) | Sjekk | Liten |
| 4 | `contributing-guide`-sjekk | Sjekk | Liten |
| 5 | `changelog`-sjekk | Sjekk | Liten |
| 6 | CSV-eksport av repo-matrisen | Frontend | Liten |
| 7 | Onboarding-opplevelse for nye brukere | Frontend | Liten |

### Fase 2 — Høy verdi, medium innsats (3–6 uker)

| # | Tiltak | Type | Innsats |
|---|--------|------|---------|
| 8 | Sikkerhetspoeng per repo (vektet score) | Frontend | Medium |
| 9 | `pinned-deps`-sjekk (lockfiler) | Sjekk | Medium |
| 10 | `sast`-sjekk (statisk analyse i pipeline) | Sjekk | Medium |
| 11 | `code-review-enforcement`-sjekk | Sjekk | Medium |
| 12 | Delta-rapport — «hva er nytt siden sist» | Frontend | Medium |
| 13 | Prosjekt-fokusert visning for tech leads | Frontend | Medium |
| 14 | Rapport-sammenligning over tid (trend) | Frontend | Medium |
| 15 | `secret-scanning-config`-sjekk | Sjekk | Medium |
| 16 | SIEM-push: OCSF-formatert output (`--output-format ocsf`) | Backend | Medium |
| 17 | SIEM-push: Splunk HEC / Webhook-integrasjon (`--siem`) | Backend | Medium |

### Fase 3 — Medium verdi, variabel innsats (6–12 uker)

| # | Tiltak | Type | Innsats |
|---|--------|------|---------|
| 18 | `binary-artifacts`-sjekk | Sjekk | Medium |
| 19 | `docker-security`-sjekk | Sjekk | Stor |
| 20 | `test-coverage-config`-sjekk | Sjekk | Medium |
| 21 | `documentation-quality`-sjekk | Sjekk | Medium |
| 22 | Leaderboard (forbedring + toppscore) | Frontend | Medium |
| 23 | Jira/Bitbucket-issue-generering | Frontend | Medium |
| 24 | Slack/Teams-integrasjon | Backend | Medium |
| 25 | URL-basert rapport-lasting | Frontend | Liten |
| 26 | SIEM: Regresjonsalarmer (diff mellom rapporter) | Backend | Medium |
| 27 | SIEM: Elastic/Sentinel-integrasjon + CEF/syslog | Backend | Medium |
| 28 | SIEM: Frontend «Synkroniser til SIEM»-knapp | Frontend | Medium |
| 29 | SIEM: Ferdige dashboard-maler (Splunk/Kibana/Sentinel) | Ressurser | Medium |

### Fase 4 — Langsiktige forbedringer

| # | Tiltak | Type | Innsats |
|---|--------|------|---------|
| 30 | `gitignore`-sjekk | Sjekk | Medium |
| 31 | `multi-env-config`-sjekk | Sjekk | Medium |
| 32 | `issue-tracking`-sjekk | Sjekk | Medium |
| 33 | Målsetting og milepæler | Frontend | Medium |
| 34 | Badges/shields-generering | Frontend | Liten |
| 35 | Flerdimensjonal filtrering (team, teknologi) | Frontend | Medium |
| 36 | Tastaturnavigasjon og tilgjengelighet | Frontend | Medium |
| 37 | PDF-eksport | Frontend | Medium |
| 38 | Planlagt kjøring med CI-mal | Backend | Medium |
| 39 | Læringskort per sjekk (`awareness`-struct + «Lær mer» i frontend) | Backend + Frontend | Liten |
| 40 | Wiki/LMS-kobling per sjekk (`LEARNING_BASE_URL` + `awareness-map.js`) | Backend | Liten |
| 41 | CISO eksekutivrapport (PDF, aggregert risiko, ISO/NIST-mapping) | Frontend | Medium |
| 42 | Policy Gates CLI (`--enforce --policy argus-policy.json`) | Backend | Medium |
| 43 | MTTR-sporing og dashboard-visning | Frontend | Medium |
| 44 | Risikoaksept-prosess (`argus-risk-accept.json`) | Backend + Frontend | Medium |
| 45 | Ratchet-mekanisme (gradvis policy-innstramning) | Backend | Medium |
| 46 | `ai-package-integrity`-sjekk (hallusinerte npm-pakker) | Sjekk | Medium |
| 47 | Bitbucket Server merge checks-plugin | Plugin | Stor |

---

## 15. Referanser

| Kilde | Beskrivelse |
|-------|-------------|
| [OpenSSF Scorecard — Checks](https://github.com/ossf/scorecard/blob/main/docs/checks.md) | 19 detaljerte sjekk-beskrivelser med scoring og remediation |
| [OpenSSF Scorecard — README](https://github.com/ossf/scorecard) | Oversikt, arkitektur, bruk |
| [scorecard.dev](https://scorecard.dev/) | Interaktivt dashboard, forklaring av sjekker |
| [OpenSSF Best Practices Badge](https://www.bestpractices.dev/en/criteria) | Passing/Silver/Gold-kriterier for OSS-prosjekter |
| [DORA Metrics](https://dora.dev/guides/dora-metrics-four-keys/) | Måling og forbedring av software delivery performance |
| [Backstage Software Catalog](https://backstage.io/docs/features/software-catalog/) | Developer portal-prinsipper for organisering av tjenester |
| [OWASP Node.js Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html) | Best practices for sikkerhetssjekker |
| [OSSF SBOM Everywhere SIG](https://github.com/ossf/SBOM-everywhere) | Standards for SBOM-navngivning og plassering |
| [OCSF — Open Cybersecurity Schema Framework](https://schema.ocsf.io/) | Åpen standard for strukturerte sikkerhetshendelser (brukt av Splunk, AWS, IBM m.fl.) |
| [Splunk HTTP Event Collector](https://docs.splunk.com/Documentation/Splunk/latest/Data/UsetheHTTPEventCollector) | Dokumentasjon for push av hendelser til Splunk via HEC |
| [Elastic Common Schema (ECS)](https://www.elastic.co/guide/en/ecs/current/index.html) | Fellesformat for sikkerhetshendelser i Elastic Stack |
| [NIST Cybersecurity Framework (CSF)](https://www.nist.gov/cyberframework) | Rammeverk for risikostyring — Identifisér / Beskytt / Oppdag / Responder / Gjenopprett |
| [ISO/IEC 27001:2022 — Annex A](https://www.iso.org/standard/27001) | Kontrollsett for informasjonssikkerhetsstyring, koblet til Argus-sjekker via awareness-map |
| [OWASP LLM Top 10](https://owasp.org/www-project-top-10-for-large-language-model-applications/) | Topp 10 sikkerhetsrisikoer for LLM-applikasjoner og AI-generert kode |
| [SANS «Shift Left» Security](https://www.sans.org/blog/shift-left-and-embrace-devsecops/) | Policy gates og DevSecOps-prinsipper for tidlig sikkerhetshåndhevelse |

---

*Dokumentet bør oppdateres etter hvert som sjekker implementeres og frontend-funksjoner prioriteres.*
