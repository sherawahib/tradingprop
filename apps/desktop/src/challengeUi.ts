/** Same logic as web — kept local because @paper-trader/shared is CJS and bundlers vary. */
export function formatChallengeStatusLabel(phase: string, status: string): string {
  const u = status.toUpperCase();
  const ph = phase.toUpperCase();
  if (u === "BREACHED") return "Failed";
  if (u === "LOCKED") return "Locked";
  if (u === "ACTIVE") return ph === "FUNDED" ? "Ongoing (funded desk)" : "Ongoing";
  if (u === "PASSED") {
    if (ph === "FUNDED") return "Ongoing (funded desk)";
    return "Passed";
  }
  return status.replace(/_/g, " ");
}
