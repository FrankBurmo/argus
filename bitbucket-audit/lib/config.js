"use strict";

const path = require("path");
const { URL } = require("url");

// Last inn .env fra arbeidsmappen (overstyrer IKKE allerede satte variabler)
require("dotenv").config({ path: path.join(process.cwd(), ".env") });

// Filtrer på ett Bitbucket-prosjekt: søk i CLI-argument først, deretter miljøvariabel
const PROJECT_KEY = (process.argv[2] || process.env.PROJECT_KEY || "").toUpperCase().trim() || null;

// Støttede utdataformater: "default" (tekst + JSON + MD) eller "ocsf" (inkl. OCSF JSON-fil)
const OUTPUT_FORMAT = (() => {
  const flag = process.argv.find((a) => a.startsWith("--output-format="));
  if (flag) return flag.split("=")[1].toLowerCase();
  const idx = process.argv.indexOf("--output-format");
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1].toLowerCase();
  return "default";
})();

const config = {
  BITBUCKET_URL: process.env.BITBUCKET_URL,
  BITBUCKET_TOKEN: process.env.BITBUCKET_TOKEN || null,
  CONCURRENCY: Math.max(1, parseInt(process.env.CONCURRENCY, 10) || 5),
  MAX_REPOS: parseInt(process.env.MAX_REPOS, 10) || 0, // 0 = ingen grense
  PROJECT_KEY,
  OUTPUT_FORMAT,
};

function validateEnv() {
  if (!config.BITBUCKET_URL) {
    console.error(
      "Feil: Manglende miljøvariabel: BITBUCKET_URL\n" +
        "Sett den før du kjører:\n" +
        "  export BITBUCKET_URL=https://bitbucket.eksempel.no"
    );
    process.exit(1);
  }
  const parsedUrl = new URL(config.BITBUCKET_URL);
  if (parsedUrl.protocol !== "https:") {
    console.error(
      "Feil: BITBUCKET_URL må bruke HTTPS for å beskytte tokenet under overføring.\n" +
        "  Bruk: https://bitbucket.eksempel.no"
    );
    process.exit(1);
  }
}

module.exports = { config, validateEnv };
