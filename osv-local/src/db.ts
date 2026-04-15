import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import path from "path";
import fs from "fs";

// ---------------------------------------------------------------------------
// Konfigurasjon
// ---------------------------------------------------------------------------

/** Katalog for sqlite-db og zip-cache. Overstyres via OSV_LOCAL_DATA_DIR. */
export function getDataDir(): string {
  return process.env.OSV_LOCAL_DATA_DIR || path.join(__dirname, "..", "data");
}

function getDbPath(): string {
  return path.join(getDataDir(), "osv.db");
}

export function getCacheDir(): string {
  return path.join(getDataDir(), "cache");
}

// ---------------------------------------------------------------------------
// Database-singleton
// ---------------------------------------------------------------------------

let _db: SqlJsDatabase | null = null;
let _dbInitPromise: Promise<SqlJsDatabase> | null = null;

export async function getDb(): Promise<SqlJsDatabase> {
  if (_db) return _db;
  if (_dbInitPromise) return _dbInitPromise;

  _dbInitPromise = (async () => {
    const dataDir = getDataDir();
    const cacheDir = getCacheDir();

    // Opprett katalogene om de ikke finnes
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });

    const SQL = await initSqlJs();
    const dbPath = getDbPath();

    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      _db = new SQL.Database(buffer);
    } else {
      _db = new SQL.Database();
    }

    initSchema(_db);
    return _db;
  })();

  return _dbInitPromise;
}

/** Lagrer databasen til disk. Kalles etter skriveoperasjoner. */
export function saveDb(): void {
  if (!_db) return;
  const data = _db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(getDbPath(), buffer);
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

function initSchema(db: SqlJsDatabase): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS vulns (
      id            TEXT NOT NULL,
      ecosystem     TEXT NOT NULL,
      package_name  TEXT NOT NULL,
      introduced    TEXT,
      fixed         TEXT,
      last_affected TEXT,
      raw           TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_pkg
      ON vulns(ecosystem, package_name);
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sync_state (
      ecosystem      TEXT PRIMARY KEY,
      last_synced_at TEXT NOT NULL
    );
  `);
}

// ---------------------------------------------------------------------------
// Hjelpefunksjoner for sync_state
// ---------------------------------------------------------------------------

export async function getLastSyncedAt(ecosystem: string): Promise<string | null> {
  const db = await getDb();
  const stmt = db.prepare("SELECT last_synced_at FROM sync_state WHERE ecosystem = ?");
  stmt.bind([ecosystem]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return (row.last_synced_at as string) ?? null;
  }
  stmt.free();
  return null;
}

export async function setLastSyncedAt(ecosystem: string, ts: string): Promise<void> {
  const db = await getDb();
  db.run(
    "INSERT OR REPLACE INTO sync_state (ecosystem, last_synced_at) VALUES (?, ?)",
    [ecosystem, ts]
  );
  saveDb();
}

export async function getVulnCountForEcosystem(ecosystem: string): Promise<number> {
  const db = await getDb();
  const stmt = db.prepare("SELECT COUNT(*) as cnt FROM vulns WHERE ecosystem = ?");
  stmt.bind([ecosystem]);
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  return (row.cnt as number) ?? 0;
}

/** Sletter alle vulns-rader for et gitt økosystem (brukes før full synk). */
export async function deleteVulnsForEcosystem(ecosystem: string): Promise<void> {
  const db = await getDb();
  db.run("DELETE FROM vulns WHERE ecosystem = ?", [ecosystem]);
}

/** Sletter vulns-rader for en bestemt sårbarhet-ID (brukes ved delta-synk). */
export async function deleteVulnById(id: string): Promise<void> {
  const db = await getDb();
  db.run("DELETE FROM vulns WHERE id = ?", [id]);
}

/** Lukker databasetilkoblingen og lagrer til disk. */
export function closeDb(): void {
  if (_db) {
    saveDb();
    _db.close();
    _db = null;
    _dbInitPromise = null;
  }
}
