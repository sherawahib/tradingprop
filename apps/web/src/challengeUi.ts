/**
 * Human-readable evaluation row for portal + terminal UIs.
 * Shared package is built as CJS; Vite cannot reliably consume named exports from it, so this helper lives in the web app.
 */
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
