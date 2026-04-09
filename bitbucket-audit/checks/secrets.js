"use strict";

const { listAllFiles } = require("./utils");

// Filnavn/-mønstre som tyder på commitetde hemmeligheter
const SUSPICIOUS_FILES = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.staging",
  "credentials.json",
  "service-account.json",
  "secrets.json",
  "id_rsa",
  "id_ed25519",
  "id_ecdsa",
  ".htpasswd",
];

// Filendelser som typisk inneholder hemmeligheter
const SUSPICIOUS_EXTENSIONS = [
  ".pem",
  ".key",
  ".pfx",
  ".p12",
  ".jks",
  ".keystore",
];

// Stier som indikerer sensitive filer uavhengig av filnavn
const SUSPICIOUS_PATTERNS = [
  ".npmrc",
  ".pypirc",
  ".docker/config.json",
  ".aws/credentials",
  ".ssh/",
];

module.exports = {
  id: "secrets",
  label: "Hemmeligheter i kode",
  run: async (projectKey, repoSlug, request) => {
    try {
      const list = await listAllFiles(projectKey, repoSlug, request);

      const hasSuspicious = list.some((f) => {
        const basename = f.split("/").pop();

        if (SUSPICIOUS_FILES.includes(basename)) return true;
        if (SUSPICIOUS_EXTENSIONS.some((ext) => basename.endsWith(ext))) return true;
        if (SUSPICIOUS_PATTERNS.some((p) => f.includes(p))) return true;

        return false;
      });

      // true = ingen mistenkelige filer (bestått), false = fant mistenkelige filer
      return !hasSuspicious;
    } catch {
      return false;
    }
  },
};
