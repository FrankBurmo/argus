import semver from "semver";
import { getDb } from "./db";
import { ensureReady } from "./sync";

// ---------------------------------------------------------------------------
// Interfaces — identisk med osv.dev v1/query
// ---------------------------------------------------------------------------

export interface OsvQueryRequest {
  version: string;
  package: {
    name: string;
    ecosystem: string;
  };
}

export interface OsvQueryResponse {
  vulns?: any[];
}

// ---------------------------------------------------------------------------
// Semver-matching
// ---------------------------------------------------------------------------

function isVersionAffected(
  version: string,
  introduced: string | null,
  fixed: string | null,
  lastAffected: string | null
): boolean {
  const v = semver.valid(semver.coerce(version));
  if (!v) return false;

  const introducedOk =
    !introduced ||
    introduced === "0" ||
    semver.gte(v, semver.coerce(introduced)!.version);

  if (!introducedOk) return false;

  if (fixed) {
    const fixedV = semver.coerce(fixed);
    if (!fixedV) return false;
    return semver.lt(v, fixedV.version);
  }

  if (lastAffected) {
    const lastV = semver.coerce(lastAffected);
    if (!lastV) return false;
    return semver.lte(v, lastV.version);
  }

  // Ingen upper bound — alt fra introduced og oppover er berørt
  return true;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

interface VulnRow {
  id: string;
  ecosystem: string;
  package_name: string;
  introduced: string | null;
  fixed: string | null;
  last_affected: string | null;
  raw: string;
}

export async function query(req: OsvQueryRequest): Promise<OsvQueryResponse> {
  await ensureReady();

  const db = await getDb();
  const stmt = db.prepare(
    "SELECT * FROM vulns WHERE ecosystem = ? COLLATE NOCASE AND package_name = ? COLLATE NOCASE"
  );
  stmt.bind([req.package.ecosystem, req.package.name]);

  const matchedIds = new Set<string>();
  const vulns: any[] = [];

  while (stmt.step()) {
    const row = stmt.getAsObject() as unknown as VulnRow;
    if (matchedIds.has(row.id)) continue;

    if (isVersionAffected(req.version, row.introduced, row.fixed, row.last_affected)) {
      matchedIds.add(row.id);
      try {
        vulns.push(JSON.parse(row.raw));
      } catch {
        // Hopp over korrupte rader
      }
    }
  }
  stmt.free();

  return vulns.length > 0 ? { vulns } : {};
}

export async function queryBatch(
  requests: OsvQueryRequest[]
): Promise<{ results: OsvQueryResponse[] }> {
  await ensureReady();

  return {
    results: await Promise.all(requests.map((r) => query(r))),
  };
}
