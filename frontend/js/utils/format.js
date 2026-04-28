/* ================================================================
   Argus Frontend — Formaterings-hjelpere
   ================================================================ */
"use strict";

/** Format ISO-dato til lokalisert nb-NO-streng. */
export function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString("nb-NO", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

/** Norsk etikett for repo-vurderingsnivå (assessmentLevel). */
export function levelLabel(level) {
  switch (level) {
    case "pass": return "Bestått";
    case "fail": return "Feilet";
    case "action": return "Anbefalt tiltak";
    case "na": return "Ikke aktuelt";
    case "unknown": return "Usikkert";
    default: return level;
  }
}

/** Norsk etikett for samlet repo-severity. */
export function severityLabel(sev) {
  switch (sev) {
    case "critical": return "Kritisk";
    case "high": return "Høy";
    case "medium": return "Middels";
    case "low": return "Lav";
    default: return sev;
  }
}

/** Norsk etikett for OSV-severity (CRITICAL/HIGH/...). */
export function sevLabelNo(sev) {
  switch (sev) {
    case "CRITICAL": return "Kritisk";
    case "HIGH": return "Høy";
    case "MEDIUM": return "Middels";
    case "LOW": return "Lav";
    case "NONE": return "Ingen";
    default: return "Ukjent";
  }
}

/** Pakkeøkosystem → CSS-klassesuffiks. */
export function ecoClass(ecosystem) {
  switch ((ecosystem || "").toLowerCase()) {
    case "npm": return "npm";
    case "maven": return "maven";
    case "pypi": return "pypi";
    case "go": return "go";
    default: return "default";
  }
}
