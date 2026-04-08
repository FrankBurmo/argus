"use strict";

module.exports = [
  require("./renovate"),
  require("./owasp"),
  require("./npmAudit"),
  // Legg til flere sjekkere her:
  // require("./minsjekker"),
];
