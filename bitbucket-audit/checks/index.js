"use strict";

module.exports = [
  require("./renovate"),
  require("./owasp"),
  require("./npmAudit"),
  require("./depVulns"),
  require("./codeowners"),
  require("./pipeline"),
  require("./branchProtection"),
  require("./secrets"),
  require("./stale"),
  require("./readme"),
  require("./tests"),
  require("./prActivity"),
  require("./linting"),
];
