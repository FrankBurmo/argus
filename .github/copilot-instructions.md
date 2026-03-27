# Copilot Instructions — Argus (Bitbucket Audit)

## Prosjektoversikt

Argus er en Node.js CLI-app som reviderer Bitbucket Server/Data Center-repos via REST API.
Bruker `dotenv` for miljøvariabler og sikker OS-lagring for tokens.

## Konvensjoner

- **Språk:** JavaScript (CommonJS), `"use strict"` øverst i alle filer.
- **Runtime:** Node.js 18+. Aldri bruk `import`/`export`-syntaks — bruk `require`/`module.exports`.
- **Svar på norsk** i kommentarer, README og brukerrettede meldinger.

## Arkitektur

Appen har fire lag:

1. **HTTP-klient** (`index.js`) — `request(path)` og `getAllPages(path)` med Bearer-token og Bitbucket-paginering.
2. **Concurrency pool** (`index.js`) — `pooledMap(items, fn, concurrency)` med delt indeks-teller.
3. **Sjekker-rammeverk** (`checks/`) — Pluggbare sjekker med interface `{ id, label, run }`.
4. **Hovedflyt** (`index.js`) — Validering, henting, kjøring og rapportering.

## Sjekker-interface

Hver sjekker i `checks/` eksporterer:

```javascript
module.exports = {
  id: "maskinlesbar-nøkkel",
  label: "Menneskelesbar tittel",
  run: async (projectKey, repoSlug, request) => boolean
};
```

- `run` mottar `request`-funksjonen — bruk den for API-kall, ikke global state.
- Fanger egne feil og returnerer alltid `boolean`.
- Registreres i `checks/index.js`.

## Når du legger til en ny sjekker

1. Opprett `checks/minsjekker.js` som følger interface-et over.
2. Legg til `require("./minsjekker")` i `checks/index.js`.
3. Ikke endre noe annet — resten plukkes opp automatisk.

## Feilhåndtering

- Sjekkere fanger egne feil → `false`.
- `request()` kaster `Error` ved HTTP-statuskoder utenfor 2xx.
- Manglende miljøvariabler → tydelig melding + `process.exit(1)`.

## Sikkerhet

- Aldri logg tokens eller sensitive verdier.
- Bruk `encodeURIComponent` på alle dynamiske URL-segmenter.
- Bruk `Bearer`-token i `Authorization`-header, aldri i URL.
