/* ================================================================
   Argus Frontend — Remediation-oppskrifter (handlingskort)
   ================================================================ */
"use strict";

export const CHECK_REMEDIATION = {
  "secrets": {
    severity: "critical",
    why: "Eksponerte hemmeligheter (API-nøkler, tokens, passord) kan gi angripere direkte tilgang til systemer og data.",
    steps: [
      "Fjern sensitive filer (.env, .pem, .key, id_rsa, credentials) fra repoet med `git rm --cached`.",
      "Legg til filene i .gitignore for å forhindre fremtidige commits.",
      "Roter alle eksponerte hemmeligheter umiddelbart — generer nye nøkler/tokens.",
      "Vurder å bruke en secrets manager (Vault, AWS Secrets Manager) i stedet for filer."
    ],
    docUrl: "https://owasp.org/www-community/vulnerabilities/Use_of_hard-coded_password",
    docLabel: "OWASP — Hardkodede hemmeligheter",
  },
  "dep-vulns": {
    severity: "critical",
    why: "Kjente sårbarheter i avhengigheter kan utnyttes av angripere uten at koden din endres.",
    steps: [
      "Gå til Sårbarheter-fanen for å se detaljer om hver CVE.",
      "Oppgrader pakkene til versjonene angitt i «Fiks»-kolonnen.",
      "Kjør `npm audit fix` (npm) eller tilsvarende for din pakkebehandler.",
      "For sårbarheter uten kjent fiks — vurder alternative pakker eller workarounds."
    ],
    docUrl: "https://osv.dev/",
    docLabel: "OSV.dev — Sårbarhetsdatabase",
  },
  "owasp-dep-check": {
    severity: "high",
    why: "OWASP Dependency-Check fanger kjente CVE-er i avhengighetene dine under bygging.",
    steps: [
      "Legg til OWASP Dependency-Check-plugin i pom.xml eller build.gradle.",
      "Alternativt: Legg til et steg i Jenkinsfile som kjører `dependency-check`.",
      "Konfigurer terskel for å feile bygget ved kritiske funn.",
      "Sett opp automatisk oppdatering av NVD-databasen."
    ],
    docUrl: "https://owasp.org/www-project-dependency-check/",
    docLabel: "OWASP Dependency-Check",
  },
  "npm-audit": {
    severity: "high",
    why: "npm audit identifiserer kjente sårbarheter i npm-avhengigheter under CI/CD.",
    steps: [
      "Legg til `npm audit --audit-level=high` som steg i Jenkinsfile.",
      "Alternativt: Bruk `audit-ci` for mer fleksibel konfigurasjon.",
      "Vurder å legge til et audit-script i package.json: `\"audit\": \"npm audit --audit-level=high\"`.",
      "Konfigurer terskelen (critical/high/moderate) etter prosjektets risikoprofil."
    ],
    docUrl: "https://docs.npmjs.com/cli/v10/commands/npm-audit",
    docLabel: "npm audit-dokumentasjon",
  },
  "branch-protection": {
    severity: "high",
    why: "Uten branch-beskyttelse kan hvem som helst force-pushe eller skrive om historikk på hovedbranchen.",
    steps: [
      "Gå til Bitbucket → Repository Settings → Branch Permissions.",
      "Aktiver «Prevent rewriting history» (no-rewrites) for default branch.",
      "Vurder å kreve pull requests for endringer til main/master.",
      "Aktiver «Prevent deletion» for beskyttede brancher."
    ],
    docUrl: "https://support.atlassian.com/bitbucket-cloud/docs/use-branch-permissions/",
    docLabel: "Bitbucket Branch Permissions",
  },
  "pipeline": {
    severity: "high",
    why: "Uten CI/CD-pipeline kjøres ikke automatiserte bygg, tester eller sikkerhetssjekker.",
    steps: [
      "Opprett en Jenkinsfile i roten av repoet.",
      "Definer stages for bygg, test og deploy.",
      "Legg til sikkerhetssjekker (npm audit, OWASP DC) som egne stages.",
      "Konfigurer triggere for automatisk kjøring ved push og PR."
    ],
    docUrl: "https://www.jenkins.io/doc/book/pipeline/",
    docLabel: "Jenkins Pipeline-dokumentasjon",
  },
  "renovate": {
    severity: "medium",
    why: "Uten automatisk oppdatering av avhengigheter hoper teknisk gjeld og sikkerhetshull seg opp.",
    steps: [
      "Opprett renovate.json i roten av repoet med ønsket konfigurasjon.",
      "Alternativt: Bruk Dependabot med .github/dependabot.yml.",
      "Start med `\"extends\": [\"config:recommended\"]` for fornuftige standardinnstillinger.",
      "Konfigurer automerge for patch-oppdateringer for å redusere støy."
    ],
    docUrl: "https://docs.renovatebot.com/",
    docLabel: "Renovate-dokumentasjon",
  },
  "codeowners": {
    severity: "medium",
    why: "CODEOWNERS sikrer at riktige personer automatisk blir forespurt som reviewere ved endringer.",
    steps: [
      "Opprett filen CODEOWNERS i roten, .github/ eller docs/.",
      "Definer eierskap per mappe/fil-mønster, f.eks.: `* @team-lead`.",
      "Bruk spesifikke mønstre for kritiske deler: `/src/auth/ @security-team`.",
      "Aktiver «Require approval from code owners» i branch-beskyttelse."
    ],
    docUrl: "https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners",
    docLabel: "CODEOWNERS-dokumentasjon",
  },
  "pr-activity": {
    severity: "medium",
    why: "Code review via pull requests fanger feil, sikkerhetshull og arkitekturproblemer før de når produksjon.",
    steps: [
      "Etabler en PR-basert arbeidsflyt — ingen direkte push til main/master.",
      "Konfigurer minimum 1 godkjenner per PR i branch-beskyttelse.",
      "Sett opp PR-maler som minner om relevante sjekker.",
      "Gjennomfør regelmessige code review-workshops for teamet."
    ],
    docUrl: "https://support.atlassian.com/bitbucket-cloud/docs/pull-requests/",
    docLabel: "Bitbucket Pull Requests",
  },
  "tests": {
    severity: "medium",
    why: "Automatiserte tester fanger regresjoner og sikrer at koden fungerer som forventet etter endringer.",
    steps: [
      "Opprett en test/-mappe med enhetstester for kritisk forretningslogikk.",
      "Bruk et testrammeverk for din stack (Jest, JUnit, pytest, etc.).",
      "Navngi testfiler med .test.js/.spec.ts eller test_*.py-konvensjon.",
      "Integrer testkjøring i CI/CD-pipelinen."
    ],
    docUrl: "https://jestjs.io/docs/getting-started",
    docLabel: "Jest — Kom i gang",
  },
  "linting": {
    severity: "low",
    why: "Linting håndhever konsistent kodestil og fanger vanlige feil automatisk.",
    steps: [
      "Velg en linter for din stack: ESLint (JS/TS), Ruff (Python), Checkstyle (Java).",
      "Opprett konfigurasjonsfil (.eslintrc.json, pyproject.toml, etc.) i roten.",
      "Legg til et lint-script i package.json eller tilsvarende byggsystem.",
      "Integrer linting som et steg i CI/CD-pipelinen."
    ],
    docUrl: "https://eslint.org/docs/latest/use/getting-started",
    docLabel: "ESLint — Kom i gang",
  },
  "readme": {
    severity: "low",
    why: "En README gir utviklere konteksten de trenger for å forstå, kjøre og bidra til prosjektet.",
    steps: [
      "Opprett README.md i roten av repoet.",
      "Inkluder: prosjektbeskrivelse, installasjon, kjøring og bidragsguide.",
      "Legg til badges for byggestatus, testdekning og lisens.",
      "Hold README oppdatert ved større endringer i prosjektet."
    ],
    docUrl: "https://www.makeareadme.com/",
    docLabel: "Make a README",
  },
  "stale": {
    severity: "low",
    why: "Inaktive repoer kan inneholde utdaterte avhengigheter med kjente sårbarheter.",
    steps: [
      "Vurder om repoet fortsatt er i bruk — arkiver det hvis ikke.",
      "Hvis aktivt: Prioriter oppdatering av avhengigheter og sikkerhetsfikser.",
      "Sett opp regelmessige vedlikeholdsøkter for eldre repoer.",
      "Konfigurer Renovate/Dependabot for automatiske oppdateringer selv for lite aktive repoer."
    ],
    docUrl: "https://docs.github.com/en/repositories/archiving-a-github-repository",
    docLabel: "Arkivering av repoer",
  },
};
