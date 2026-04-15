import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import {
  getDb,
  getCacheDir,
  getLastSyncedAt,
  setLastSyncedAt,
  getVulnCountForEcosystem,
  deleteVulnsForEcosystem,
  deleteVulnById,
  saveDb,
} from "./db";

// ---------------------------------------------------------------------------
// Konfigurasjon
// ---------------------------------------------------------------------------

const OSV_BUCKET = "https://storage.googleapis.com/osv-vulnerabilities";

const DEFAULT_ECOSYSTEMS = [
  "npm",
  "PyPI",
  "Maven",
  "Go",
  "crates.io",
  "NuGet",
  "RubyGems",
];

/** Maks alder i timer før re-synk. Konfigurerbar via OSV_LOCAL_MAX_AGE_HOURS. */
function getMaxAgeHours(): number {
  const val = parseInt(process.env.OSV_LOCAL_MAX_AGE_HOURS ?? "", 10);
  return isNaN(val) ? 24 : val;
}

/** Henter konfigurerte økosystemer fra miljøvariabel eller standardliste. */
function getConfiguredEcosystems(): string[] {
  const envVal = process.env.OSV_LOCAL_ECOSYSTEMS;
  if (envVal) {
    return envVal
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return DEFAULT_ECOSYSTEMS;
}

// ---------------------------------------------------------------------------
// Guard — sikrer at ensureReady() kun kalles én gang per prosesslevetid
// ---------------------------------------------------------------------------

let ready = false;
let readyPromise: Promise<void> | null = null;

// ---------------------------------------------------------------------------
// Logging til stderr
// ---------------------------------------------------------------------------

function log(msg: string): void {
  process.stderr.write(`[osv-local] ${msg}\n`);
}

// ---------------------------------------------------------------------------
// HTTP-nedlasting (innebygd fetch, Node 18+)
// ---------------------------------------------------------------------------

async function downloadToFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ved nedlasting av ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

async function downloadText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ved nedlasting av ${url}`);
  }
  return res.text();
}

async function downloadJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ved nedlasting av ${url}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Indeksering av OSV-objekt til SQLite
// ---------------------------------------------------------------------------

interface OsvEvent {
  introduced?: string;
  fixed?: string;
  last_affected?: string;
}

interface OsvRange {
  type: string;
  events?: OsvEvent[];
}

interface OsvAffected {
  package?: { name?: string; ecosystem?: string };
  ranges?: OsvRange[];
}

interface OsvObject {
  id: string;
  affected?: OsvAffected[];
  [key: string]: any;
}

function indexOsvObject(
  db: Awaited<ReturnType<typeof getDb>>,
  obj: OsvObject
): void {
  for (const affected of obj.affected ?? []) {
    const pkgName = affected.package?.name;
    const ecosystem = affected.package?.ecosystem;
    if (!pkgName || !ecosystem) continue;

    for (const range of affected.ranges ?? []) {
      if (range.type !== "SEMVER" && range.type !== "ECOSYSTEM") continue;

      let introduced: string | null = null;
      let fixed: string | null = null;
      let lastAffected: string | null = null;

      for (const event of range.events ?? []) {
        if ("introduced" in event) introduced = event.introduced ?? null;
        if ("fixed" in event) fixed = event.fixed ?? null;
        if ("last_affected" in event) lastAffected = event.last_affected ?? null;
      }

      db.run(
        `INSERT INTO vulns (id, ecosystem, package_name, introduced, fixed, last_affected, raw)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [obj.id, ecosystem, pkgName, introduced, fixed, lastAffected, JSON.stringify(obj)]
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Full synk — last ned all.zip for et økosystem
// ---------------------------------------------------------------------------

async function fullSync(ecosystem: string): Promise<void> {
  const cacheDir = getCacheDir();
  const zipPath = path.join(cacheDir, `${ecosystem}-all.zip`);
  const url = `${OSV_BUCKET}/${encodeURIComponent(ecosystem)}/all.zip`;

  log(`${ecosystem}: laster ned all.zip...`);

  let retried = false;
  const attemptDownload = async () => {
    try {
      await downloadToFile(url, zipPath);
    } catch (err) {
      if (!retried) {
        retried = true;
        // Korrupt eller delvis nedlasting — slett og prøv igjen
        if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
        log(`${ecosystem}: ny nedlastingsforsøk...`);
        await downloadToFile(url, zipPath);
      } else {
        throw err;
      }
    }
  };

  await attemptDownload();

  log(`${ecosystem}: indekserer poster...`);

  const db = await getDb();
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();

  // Slett eksisterende rader for dette økosystemet
  await deleteVulnsForEcosystem(ecosystem);

  let count = 0;

  // Sett inn i én transaksjon for ytelse
  db.run("BEGIN TRANSACTION");
  try {
    for (const entry of entries) {
      if (entry.isDirectory || !entry.entryName.endsWith(".json")) continue;
      try {
        const content = entry.getData().toString("utf8");
        const obj: OsvObject = JSON.parse(content);
        if (obj.id) {
          indexOsvObject(db, obj);
          count++;
        }
      } catch {
        // Hopp over ugyldige JSON-filer
      }
    }
    db.run("COMMIT");
  } catch (err) {
    db.run("ROLLBACK");
    throw err;
  }

  await setLastSyncedAt(ecosystem, new Date().toISOString());
  log(`${ecosystem}: indeksert ${count} poster.`);

  // Rydd opp zip-filen for å spare diskplass
  try {
    fs.unlinkSync(zipPath);
  } catch {
    // Ikke kritisk
  }
}

// ---------------------------------------------------------------------------
// Delta-synk — hent bare endrede poster siden siste synk
// ---------------------------------------------------------------------------

async function deltaSync(ecosystem: string, lastSyncedAt: string): Promise<void> {
  const csvUrl = `${OSV_BUCKET}/${encodeURIComponent(ecosystem)}/modified_id.csv`;

  log(`${ecosystem}: sjekker endringer siden ${lastSyncedAt}...`);

  let csvText: string;
  try {
    csvText = await downloadText(csvUrl);
  } catch {
    log(`${ecosystem}: kunne ikke hente modified_id.csv — kjører full synk i stedet.`);
    await fullSync(ecosystem);
    return;
  }

  const lastSyncDate = new Date(lastSyncedAt);
  const linesToProcess: string[] = [];

  for (const line of csvText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Format: iso-dato,id
    const commaIdx = trimmed.indexOf(",");
    if (commaIdx === -1) continue;

    const dateStr = trimmed.slice(0, commaIdx);
    const lineDate = new Date(dateStr);

    // Stopp når vi når poster eldre enn siste synk
    if (lineDate <= lastSyncDate) break;

    const id = trimmed.slice(commaIdx + 1).trim();
    if (id) linesToProcess.push(id);
  }

  if (linesToProcess.length === 0) {
    log(`${ecosystem}: ingen endringer — oppdaterer tidsstempel.`);
    await setLastSyncedAt(ecosystem, new Date().toISOString());
    return;
  }

  log(`${ecosystem}: oppdaterer ${linesToProcess.length} poster...`);

  const db = await getDb();

  const CONCURRENCY = 10;
  let updated = 0;

  // Hent og indekser endrede poster i bolker
  for (let i = 0; i < linesToProcess.length; i += CONCURRENCY) {
    const batch = linesToProcess.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (id) => {
        const url = `${OSV_BUCKET}/${encodeURIComponent(ecosystem)}/${encodeURIComponent(id)}.json`;
        return downloadJson(url) as Promise<OsvObject>;
      })
    );

    db.run("BEGIN TRANSACTION");
    try {
      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        const obj = result.value;
        if (!obj.id) continue;
        // Slett gammel versjon og sett inn ny
        await deleteVulnById(obj.id);
        indexOsvObject(db, obj);
        updated++;
      }
      db.run("COMMIT");
    } catch (err) {
      db.run("ROLLBACK");
      throw err;
    }
  }

  await setLastSyncedAt(ecosystem, new Date().toISOString());
  log(`${ecosystem}: oppdatert ${updated} poster.`);
}

// ---------------------------------------------------------------------------
// Finner foreldet/manglende økosystemer
// ---------------------------------------------------------------------------

async function getStaleEcosystems(ecosystems: string[]): Promise<string[]> {
  const maxAgeMs = getMaxAgeHours() * 60 * 60 * 1000;
  const now = Date.now();
  const stale: string[] = [];

  for (const eco of ecosystems) {
    const lastSynced = await getLastSyncedAt(eco);
    if (!lastSynced) {
      stale.push(eco);
      continue;
    }
    const age = now - new Date(lastSynced).getTime();
    if (age > maxAgeMs) {
      stale.push(eco);
      continue;
    }
    // sync_state finnes men vulns-tabell er tom → tving full synk
    if ((await getVulnCountForEcosystem(eco)) === 0) {
      stale.push(eco);
    }
  }

  return stale;
}

// ---------------------------------------------------------------------------
// Synkronisering av økosystemer
// ---------------------------------------------------------------------------

async function syncEcosystems(ecosystems: string[]): Promise<void> {
  for (const eco of ecosystems) {
    const lastSynced = await getLastSyncedAt(eco);
    const hasData = lastSynced && (await getVulnCountForEcosystem(eco)) > 0;

    try {
      if (hasData) {
        await deltaSync(eco, lastSynced!);
      } else {
        log(`${eco}: database mangler eller foreldet, synkroniserer...`);
        await fullSync(eco);
      }
    } catch (err: any) {
      // Nettverket utilgjengelig — sjekk om vi har eksisterende data
      if (hasData) {
        log(`${eco}: synk feilet (${err.message}) — bruker eksisterende data.`);
      } else {
        throw new Error(
          `OSV-database for ${eco} mangler og kan ikke lastes ned: ${err.message}`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let _ecosystems: string[] | null = null;

export interface InitOptions {
  ecosystems?: string[];
}

/** Initialiserer modulen med ønskede økosystemer. Idempotent. */
export async function init(opts?: InitOptions): Promise<void> {
  const newEcosystems = opts?.ecosystems ?? getConfiguredEcosystems();

  // Kun reset hvis økosystemlisten faktisk endres
  const current = JSON.stringify(_ecosystems ?? []);
  const next = JSON.stringify(newEcosystems);
  if (current === next && ready) return;

  _ecosystems = newEcosystems;

  if (current !== next) {
    ready = false;
    readyPromise = null;
  }
}

/**
 * Sikrer at databasen er oppdatert for alle konfigurerte økosystemer.
 * Kalles automatisk fra query() — trenger ikke kalles manuelt.
 */
export async function ensureReady(ecosystems?: string[]): Promise<void> {
  if (ready) return;

  if (readyPromise) {
    await readyPromise;
    return;
  }

  const ecos = ecosystems ?? _ecosystems ?? getConfiguredEcosystems();

  readyPromise = (async () => {
    const stale = await getStaleEcosystems(ecos);
    if (stale.length > 0) {
      await syncEcosystems(stale);
    }
    ready = true;
    log("Klar.");
  })();

  await readyPromise;
}
