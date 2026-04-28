"use strict";

const https = require("https");
const http = require("http");
const { URL } = require("url");

/**
 * Oppretter en HTTP-klient bundet til en Bitbucket-instans.
 * `getToken` er en funksjon som returnerer gjeldende token (støtter at token settes etter oppstart).
 */
function createClient(baseUrl, getToken) {
  const parsedBase = new URL(baseUrl || "http://localhost");
  const transport = parsedBase.protocol === "https:" ? https : http;

  /**
   * Gjør en GET-forespørsel mot Bitbucket og returnerer JSON-body.
   * Kaster Error ved HTTP-statuskoder utenfor 2xx.
   */
  function request(apiPath) {
    const url = new URL(apiPath, baseUrl);

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method: "GET",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        Accept: "application/json",
      },
    };

    return new Promise((resolve, reject) => {
      const req = transport.request(options, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(
              new Error(
                `HTTP ${res.statusCode} for ${options.path}: ${body.slice(0, 200)}`
              )
            );
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`Ugyldig JSON fra ${options.path}: ${e.message}`));
          }
        });
      });
      req.on("error", reject);
      req.end();
    });
  }

  /**
   * Henter alle sider fra et paginert Bitbucket-endepunkt.
   * Returnerer flattet array av `.values`.
   */
  async function getAllPages(apiPath) {
    const results = [];
    let start = 0;
    const separator = apiPath.includes("?") ? "&" : "?";

    while (true) {
      const page = await request(
        `${apiPath}${separator}limit=100&start=${start}`
      );
      if (Array.isArray(page.values)) {
        results.push(...page.values);
      }
      if (page.isLastPage !== false) break;
      start = page.nextPageStart;
    }
    return results;
  }

  return { request, getAllPages };
}

module.exports = { createClient };
