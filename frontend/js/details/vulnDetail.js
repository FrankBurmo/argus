/* ================================================================
   Argus Frontend — Detaljpanel for enkelt-sårbarhet (CVE)
   ================================================================ */
"use strict";

import { state } from "../state.js";
import { $, escapeHtml } from "../utils/dom.js";
import { sevLabelNo, ecoClass } from "../utils/format.js";
import { downloadFile } from "../utils/download.js";
import { buildVulnIndex } from "../data/vulnIndex.js";

export function showVulnDetail(vulnId) {
  const allVulns = buildVulnIndex();
  const entry = allVulns.find(e => e.vuln.id === vulnId);
  if (!entry) return;

  const { vuln, repos } = entry;
  const panel = $("#detail-panel");
  const body = $("#detail-body");
  const sevClass = (vuln.severity || "UNKNOWN").toLowerCase();

  const osvUrl = `https://osv.dev/vulnerability/${encodeURIComponent(vuln.id)}`;
  const nvdUrl = vuln.cveId ? `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(vuln.cveId)}` : null;
  const ghsaUrl = (vuln.aliases || []).find(a => a.startsWith("GHSA-"))
    ? `https://github.com/advisories/${(vuln.aliases || []).find(a => a.startsWith("GHSA-"))}`
    : null;

  const byProject = {};
  for (const r of repos) {
    if (!byProject[r.project]) byProject[r.project] = [];
    byProject[r.project].push(r);
  }

  const uniqueRepoCount = new Set(repos.map(r => `${r.project}|${r.repo}`)).size;
  const uniqueVersions = [...new Set(repos.map(r => r.version))].sort();

  let html = `
    <div class="detail-header">
      <h2>${escapeHtml(vuln.summary)}</h2>
      <div class="detail-project" style="margin-top: 0.25rem;">${escapeHtml(vuln.id)}${vuln.cveId && vuln.cveId !== vuln.id ? ` · ${escapeHtml(vuln.cveId)}` : ""}</div>
    </div>

    <div class="vuln-detail-severity">
      <span class="vuln-sev-badge ${sevClass}" style="font-size: 0.85rem; padding: 0.4rem 0.8rem;">${sevLabelNo(vuln.severity || "UNKNOWN").toUpperCase()}</span>
      ${vuln.cvssScore ? `<span class="big-score" style="color: var(--severity-${sevClass})">${vuln.cvssScore.toFixed(1)}</span>` : ""}
    </div>

    <div class="detail-section">
      <h3>Pakke</h3>
      <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
        <span class="vuln-pkg-badge ${ecoClass(vuln.ecosystem)}" style="font-size: 0.85rem; padding: 0.3rem 0.6rem;">
          📦 ${escapeHtml(vuln.package)}
        </span>
        <span style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(vuln.ecosystem || "")}</span>
        ${vuln.fixedIn ? `<span class="vuln-tag fix-available" style="font-size: 0.8rem;">✅ Oppgrader til ${escapeHtml(vuln.fixedIn)}</span>` : `<span class="vuln-tag no-fix" style="font-size: 0.8rem;">Ingen kjent fiks</span>`}
      </div>
      <div style="margin-top: 0.5rem; font-size: 0.8rem; color: var(--text-muted);">
        Sårbare versjoner funnet: ${uniqueVersions.map(v => `<code>${escapeHtml(v)}</code>`).join(", ")}
      </div>
    </div>

    <div class="detail-section">
      <h3>Oppdaget i ${uniqueRepoCount} repositor${uniqueRepoCount === 1 ? "y" : "ies"}</h3>
      <div class="vuln-detail-repos">
        ${Object.entries(byProject).map(([proj, projRepos]) => `
          <div style="margin-bottom: 0.5rem;">
            <div style="font-size: 0.75rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.25rem;">${escapeHtml(proj)}</div>
            ${projRepos.map(r => `
              <div class="vuln-detail-repo-item" onclick="showRepoDetail('${escapeHtml(r.project)}', '${escapeHtml(r.repo)}')">
                <span class="repo-name">${escapeHtml(r.repo)}</span>
                <code style="font-size: 0.75rem; color: var(--text-muted); margin-left: auto;">${escapeHtml(r.version)}</code>
              </div>
            `).join("")}
          </div>
        `).join("")}
      </div>
    </div>

    <div class="detail-section">
      <h3>Referanser</h3>
      <div class="vuln-detail-refs">
        <a href="${osvUrl}" target="_blank" rel="noopener">🔗 OSV.dev — ${escapeHtml(vuln.id)}</a>
        ${nvdUrl ? `<a href="${nvdUrl}" target="_blank" rel="noopener">🔗 NVD — ${escapeHtml(vuln.cveId)}</a>` : ""}
        ${ghsaUrl ? `<a href="${ghsaUrl}" target="_blank" rel="noopener">🔗 GitHub Advisory</a>` : ""}
        ${(vuln.references || []).map(ref => `
          <a href="${escapeHtml(ref.url)}" target="_blank" rel="noopener">🔗 ${escapeHtml(ref.type || "Referanse")} — ${escapeHtml(new URL(ref.url).hostname)}</a>
        `).join("")}
      </div>
    </div>

    ${vuln.aliases && vuln.aliases.length > 0 ? `
    <div class="detail-section">
      <h3>Aliaser</h3>
      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
        ${vuln.aliases.map(a => `<a href="https://osv.dev/vulnerability/${encodeURIComponent(a)}" target="_blank" rel="noopener" class="badge badge-info">${escapeHtml(a)}</a>`).join("")}
      </div>
    </div>
    ` : ""}

    <div class="detail-export-footer">
      <span style="font-size: 0.8rem; color: var(--text-muted);">Eksporter</span>
      <button class="export-btn" onclick="exportVulnDetailHtml('${escapeHtml(vuln.id)}')">⬇ HTML</button>
      <button class="export-btn" onclick="exportVulnDetailMarkdown('${escapeHtml(vuln.id)}')">⬇ Markdown</button>
    </div>
  `;

  body.innerHTML = html;
  panel.classList.remove("hidden");
}

function buildVulnDetailData(vulnId) {
  const allVulns = buildVulnIndex();
  const entry = allVulns.find(e => e.vuln.id === vulnId);
  if (!entry) return null;
  const { vuln, repos } = entry;
  const byProject = {};
  for (const r of repos) {
    if (!byProject[r.project]) byProject[r.project] = [];
    byProject[r.project].push(r);
  }
  const uniqueVersions = [...new Set(repos.map(r => r.version))].sort();
  const uniqueRepoCount = new Set(repos.map(r => `${r.project}|${r.repo}`)).size;
  return { vuln, repos, byProject, uniqueVersions, uniqueRepoCount };
}

export function exportVulnDetailHtml(vulnId) {
  const d = buildVulnDetailData(vulnId);
  if (!d) return;
  const { vuln, byProject, uniqueVersions, uniqueRepoCount } = d;

  const sevColors = { CRITICAL: "#ef4444", HIGH: "#f97316", MEDIUM: "#eab308", LOW: "#3b82f6", NONE: "#6b7280", UNKNOWN: "#6b7280" };
  const sevColor = sevColors[vuln.severity] || sevColors.UNKNOWN;
  const cveDisplay = vuln.cveId || vuln.id;
  const osvUrl = `https://osv.dev/vulnerability/${encodeURIComponent(vuln.id)}`;
  const nvdUrl = vuln.cveId ? `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(vuln.cveId)}` : null;
  const ghsaId = (vuln.aliases || []).find(a => a.startsWith("GHSA-"));
  const ghsaUrl = ghsaId ? `https://github.com/advisories/${ghsaId}` : null;

  const repoRows = Object.entries(byProject).map(([proj, projRepos]) =>
    projRepos.map(r => `
      <tr>
        <td>${escapeHtml(proj)}</td>
        <td>${escapeHtml(r.repo)}</td>
        <td><code>${escapeHtml(r.version)}</code></td>
      </tr>`).join("")
  ).join("");

  const refLinks = [
    `<a href="${osvUrl}">OSV.dev — ${escapeHtml(vuln.id)}</a>`,
    nvdUrl ? `<a href="${nvdUrl}">NVD — ${escapeHtml(vuln.cveId)}</a>` : "",
    ghsaUrl ? `<a href="${ghsaUrl}">GitHub Advisory — ${escapeHtml(ghsaId)}</a>` : "",
    ...(vuln.references || []).map(ref => `<a href="${escapeHtml(ref.url)}">${escapeHtml(ref.type || "Referanse")} — ${escapeHtml(new URL(ref.url).hostname)}</a>`),
  ].filter(Boolean).map(l => `<li>${l}</li>`).join("");

  const timestamp = state.report?.generatedAt
    ? new Date(state.report.generatedAt).toLocaleString("nb-NO")
    : new Date().toLocaleString("nb-NO");

  const html = `<!DOCTYPE html>
<html lang="nb">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(cveDisplay)} — Argus Sårbarhetrapport</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 14px; line-height: 1.6; color: #1a1a2e; background: #f8f9fa; padding: 2rem; }
    .container { max-width: 900px; margin: 0 auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); padding: 2rem 2.5rem; }
    h1 { font-size: 1.4rem; font-weight: 700; margin-bottom: 0.25rem; color: #111; }
    h2 { font-size: 1rem; font-weight: 600; margin: 1.5rem 0 0.5rem; color: #333; border-bottom: 1px solid #eee; padding-bottom: 0.25rem; }
    .meta { font-size: 0.8rem; color: #666; margin-bottom: 1rem; }
    .badge { display: inline-block; padding: 0.25rem 0.6rem; border-radius: 4px; font-size: 0.78rem; font-weight: 700; color: #fff; background: ${sevColor}; }
    .cvss { font-size: 1.2rem; font-weight: 700; color: ${sevColor}; margin-left: 0.5rem; }
    .fix { background: #dcfce7; color: #166534; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem; display: inline-block; margin-top: 0.25rem; }
    .nofix { background: #fee2e2; color: #991b1b; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem; display: inline-block; margin-top: 0.25rem; }
    .versions { font-size: 0.82rem; color: #555; margin-top: 0.4rem; }
    code { font-family: "Consolas", "Fira Code", monospace; background: #f3f4f6; padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.85em; }
    table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
    th { text-align: left; font-size: 0.78rem; font-weight: 600; color: #555; padding: 0.4rem 0.6rem; border-bottom: 2px solid #eee; }
    td { padding: 0.35rem 0.6rem; border-bottom: 1px solid #f0f0f0; font-size: 0.85rem; }
    tr:last-child td { border-bottom: none; }
    ul { padding-left: 1.2rem; }
    li { margin-bottom: 0.2rem; font-size: 0.85rem; }
    a { color: #2563eb; }
    .header-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
    .footer { margin-top: 2rem; font-size: 0.75rem; color: #999; border-top: 1px solid #eee; padding-top: 0.75rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-row">
      <span class="badge">${escapeHtml(sevLabelNo(vuln.severity || "UNKNOWN").toUpperCase())}</span>
      ${vuln.cvssScore ? `<span class="cvss">CVSS ${vuln.cvssScore.toFixed(1)}</span>` : ""}
    </div>
    <h1>${escapeHtml(vuln.summary)}</h1>
    <div class="meta">${escapeHtml(vuln.id)}${vuln.cveId && vuln.cveId !== vuln.id ? ` · ${escapeHtml(vuln.cveId)}` : ""}</div>

    <h2>Pakke</h2>
    <p>📦 <strong>${escapeHtml(vuln.package)}</strong> (${escapeHtml(vuln.ecosystem || "")})</p>
    ${vuln.fixedIn ? `<span class="fix">✅ Oppgrader til ${escapeHtml(vuln.fixedIn)}</span>` : `<span class="nofix">Ingen kjent fiks</span>`}
    <p class="versions">Sårbare versjoner funnet: ${uniqueVersions.map(v => `<code>${escapeHtml(v)}</code>`).join(", ")}</p>

    <h2>Oppdaget i ${uniqueRepoCount} repositor${uniqueRepoCount === 1 ? "y" : "ies"}</h2>
    <table>
      <thead><tr><th>Prosjekt</th><th>Repository</th><th>Versjon</th></tr></thead>
      <tbody>${repoRows}</tbody>
    </table>

    <h2>Referanser</h2>
    <ul>${refLinks}</ul>

    ${vuln.aliases && vuln.aliases.length > 0 ? `
    <h2>Aliaser</h2>
    <p>${vuln.aliases.map(a => `<code>${escapeHtml(a)}</code>`).join(" &nbsp; ")}</p>
    ` : ""}

    <div class="footer">Generert av Argus — ${timestamp}</div>
  </div>
</body>
</html>`;

  downloadFile(`${vulnId}.html`, html, "text/html");
}

export function exportVulnDetailMarkdown(vulnId) {
  const d = buildVulnDetailData(vulnId);
  if (!d) return;
  const { vuln, byProject, uniqueVersions, uniqueRepoCount } = d;

  const osvUrl = `https://osv.dev/vulnerability/${encodeURIComponent(vuln.id)}`;
  const nvdUrl = vuln.cveId ? `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(vuln.cveId)}` : null;
  const ghsaId = (vuln.aliases || []).find(a => a.startsWith("GHSA-"));
  const ghsaUrl = ghsaId ? `https://github.com/advisories/${ghsaId}` : null;
  const timestamp = state.report?.generatedAt
    ? new Date(state.report.generatedAt).toLocaleString("nb-NO")
    : new Date().toLocaleString("nb-NO");

  const sevLabel = sevLabelNo(vuln.severity || "UNKNOWN").toUpperCase();
  const cvssStr = vuln.cvssScore ? ` · CVSS ${vuln.cvssScore.toFixed(1)}` : "";

  let md = `# ${vuln.summary}\n\n`;
  md += `**ID:** ${vuln.id}${vuln.cveId && vuln.cveId !== vuln.id ? ` · ${vuln.cveId}` : ""}  \n`;
  md += `**Alvorlighet:** ${sevLabel}${cvssStr}  \n`;
  md += `**Pakke:** ${vuln.package} (${vuln.ecosystem || ""})  \n`;
  md += vuln.fixedIn
    ? `**Fiks:** Oppgrader til \`${vuln.fixedIn}\`  \n`
    : `**Fiks:** Ingen kjent fiks  \n`;
  md += `**Sårbare versjoner:** ${uniqueVersions.map(v => `\`${v}\``).join(", ")}  \n\n`;

  md += `## Oppdaget i ${uniqueRepoCount} repositor${uniqueRepoCount === 1 ? "y" : "ies"}\n\n`;
  md += `| Prosjekt | Repository | Versjon |\n`;
  md += `|----------|------------|----------|\n`;
  for (const [proj, projRepos] of Object.entries(byProject)) {
    for (const r of projRepos) {
      md += `| ${proj} | ${r.repo} | \`${r.version}\` |\n`;
    }
  }

  md += `\n## Referanser\n\n`;
  md += `- [OSV.dev — ${vuln.id}](${osvUrl})\n`;
  if (nvdUrl) md += `- [NVD — ${vuln.cveId}](${nvdUrl})\n`;
  if (ghsaUrl) md += `- [GitHub Advisory — ${ghsaId}](${ghsaUrl})\n`;
  for (const ref of vuln.references || []) {
    md += `- [${ref.type || "Referanse"} — ${new URL(ref.url).hostname}](${ref.url})\n`;
  }

  if (vuln.aliases && vuln.aliases.length > 0) {
    md += `\n## Aliaser\n\n${vuln.aliases.map(a => `\`${a}\``).join(", ")}\n`;
  }

  md += `\n---\n_Generert av Argus — ${timestamp}_\n`;

  downloadFile(`${vulnId}.md`, md, "text/markdown");
}
