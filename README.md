# Argus

Argus tar en grundig titt på alle Bitbucket-repoene dine og kommer tilbake med en rapport.

CLI-verktøy som kobler til Bitbucket Server/Data Center via REST API, kjører konfigurerbare sjekker på alle repos, og genererer en revisjon-rapport. Ingen eksterne avhengigheter — kun innebygde Node.js-moduler.

## Hurtigstart

```bash
export BITBUCKET_URL=https://bitbucket.eksempel.no
export BITBUCKET_TOKEN=ditt-token
export CONCURRENCY=5   # valgfri, default 5

node bitbucket-audit/index.js
```

Se [bitbucket-audit/README.md](bitbucket-audit/README.md) for fullstendig dokumentasjon.
