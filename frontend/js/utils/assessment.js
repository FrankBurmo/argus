/* ================================================================
   Argus Frontend — Vurderings- og prioritetsberegning
   ================================================================ */
"use strict";

import { state } from "../state.js";

/**
 * Klassifiser en sjekk-vurdering til et prioriteringsnivå.
 * @returns {"pass"|"fail"|"action"|"na"|"unknown"}
 */
export function assessmentLevel(repo, checkId) {
  const val = repo.checks[checkId];
  if (val === true) return "pass";
  if (val === null) return "na";
  const text = repo.assessments && repo.assessments[checkId];
  if (!text) return "fail";
  if (text.startsWith("Anbefalt")) return "action";
  if (text.startsWith("Ikke nødvendig")) return "na";
  return "unknown";
}

/** Beregn en prioriterings-score for et repo (høyere = mer kritisk). */
export function repoPriorityScore(repo) {
  let score = 0;
  for (const checkId of state.report.checks) {
    const level = assessmentLevel(repo, checkId);
    if (level === "action") score += 10;
    else if (level === "fail") score += 5;
    else if (level === "unknown") score += 2;
  }
  return score;
}

/** Generer en samlet "severity" basert på antall feil/tiltak. */
export function repoSeverity(repo) {
  const checks = state.report.checks;
  const actionCount = checks.filter(c => assessmentLevel(repo, c) === "action").length;
  const failCount = checks.filter(c => assessmentLevel(repo, c) === "fail").length;
  const total = actionCount + failCount;
  if (total >= 5 || actionCount >= 3) return "critical";
  if (total >= 3 || actionCount >= 2) return "high";
  if (total >= 1) return "medium";
  return "low";
}
