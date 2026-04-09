# Argus

Argus tar en grundig titt på alle Bitbucket-repoene dine og kommer tilbake med en rapport.

CLI-verktøy som kobler til Bitbucket Server/Data Center via REST API, kjører konfigurerbare sjekker på alle repos, og genererer en revisjonsrapport med vurderinger for funn som mangler.

## Innhold

- **[`bitbucket-audit/`](bitbucket-audit/)** — CLI-verktøyet som skanner repos og produserer JSON-rapport
- **[`frontend/`](frontend/)** — Nettleser-dashboard for å visualisere rapporten

---

## Dashboard (GitHub Pages)

**Åpne dashboardet: [frankburmo.github.io/argus](https://frankburmo.github.io/argus)**

Last inn en `audit-*.json`-fil fra `reports/`-mappen for å:

- Se **oversikt og prioritert tiltaksliste** over hele porteføljen
- Utforske **faktiske CVE-er og sårbarheter** fanget av OSV-sjekken — i Datadog Code Security-stil
- Bla gjennom alle **repositories med sjekk-status** i en matrise
- Filtrere på alvorlighetsgrad, økosystem, prosjekt og fiks-tilgjengelighet
- Klikke seg inn på enkelt-sårbarheter med lenker til OSV.dev, NVD og GitHub Advisories

Dashboardet kjører helt i nettleseren — ingen server, ingen opplasting av data.

---

## Hurtigstart (CLI)

```bash
cd bitbucket-audit
npm install

# Kopier eksempelfilen og fyll inn din Bitbucket-URL:
cp .env.example .env

# Kjør — du blir spurt om token første gang:
node index.js
```

Rapporten skrives til `reports/audit-<tidsstempel>.json` og `reports/audit-<tidsstempel>.md`.
Åpne JSON-filen i dashboardet for visuell analyse.

Se [bitbucket-audit/README.md](bitbucket-audit/README.md) for fullstendig CLI-dokumentasjon.
