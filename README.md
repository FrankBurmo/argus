# Argus

Argus tar en grundig titt på alle Bitbucket-repoene dine og kommer tilbake med en rapport.

CLI-verktøy som kobler til Bitbucket Server/Data Center via REST API, kjører konfigurerbare sjekker på alle repos, og genererer en revisjonsrapport med vurderinger for funn som mangler.

## Hurtigstart

```bash
cd bitbucket-audit
npm install

# Kopier eksempelfilen og fyll inn din Bitbucket-URL:
cp .env.example .env

# Kjør — du blir spurt om token første gang:
node index.js
```

Se [bitbucket-audit/README.md](bitbucket-audit/README.md) for fullstendig dokumentasjon.
