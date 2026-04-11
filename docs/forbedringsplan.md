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

**Prioritering**
11. [Prioritert tiltaksliste](#11-prioritert-tiltaksliste)
12. [Referanser](#12-referanser)

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

## 11. Prioritert tiltaksliste

### Fase 1 — Høy verdi, lav innsats (1–3 uker)

| # | Tiltak | Type | Innsats |
|---|--------|------|---------|
| 1 | Handlingskort med remediation-oppskrift per sjekk | Frontend | Liten |
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

### Fase 3 — Medium verdi, variabel innsats (6–12 uker)

| # | Tiltak | Type | Innsats |
|---|--------|------|---------|
| 16 | `binary-artifacts`-sjekk | Sjekk | Medium |
| 17 | `docker-security`-sjekk | Sjekk | Stor |
| 18 | `test-coverage-config`-sjekk | Sjekk | Medium |
| 19 | `documentation-quality`-sjekk | Sjekk | Medium |
| 20 | Leaderboard (forbedring + toppscore) | Frontend | Medium |
| 21 | Jira/Bitbucket-issue-generering | Frontend | Medium |
| 22 | Slack/Teams-integrasjon | Backend | Medium |
| 23 | URL-basert rapport-lasting | Frontend | Liten |

### Fase 4 — Langsiktige forbedringer

| # | Tiltak | Type | Innsats |
|---|--------|------|---------|
| 24 | `gitignore`-sjekk | Sjekk | Medium |
| 25 | `multi-env-config`-sjekk | Sjekk | Medium |
| 26 | `issue-tracking`-sjekk | Sjekk | Medium |
| 27 | Målsetting og milepæler | Frontend | Medium |
| 28 | Badges/shields-generering | Frontend | Liten |
| 29 | Flerdimensjonal filtrering (team, teknologi) | Frontend | Medium |
| 30 | Tastaturnavigasjon og tilgjengelighet | Frontend | Medium |
| 31 | PDF-eksport | Frontend | Medium |
| 32 | Planlagt kjøring med CI-mal | Backend | Medium |

---

## 12. Referanser

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

---

*Dokumentet bør oppdateres etter hvert som sjekker implementeres og frontend-funksjoner prioriteres.*
