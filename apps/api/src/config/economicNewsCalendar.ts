/**
 * Deterministic demo "high-impact" windows (UTC) — NOT a live brokerage calendar.
 * When a template opts into SYNTH_HIGH_IMPACT_BLACKOUT, new-risk orders block here.
 */

export type NewsWindowReason = "SYNTH_NONFARM_PAYROLL_STYLE" | "SYNTH_POLICY_EVENT_STYLE";

export function listSyntheticNewsWindows(nowMs = Date.now(), lookaheadHours = 72): Array<{ startIso: string; endIso: string; reason: NewsWindowReason }> {
  const out: Array<{ startIso: string; endIso: string; reason: NewsWindowReason }> = [];
  let t = Math.floor(nowMs / 86400000) * 86400000;
  const endLim = nowMs + lookaheadHours * 3600000;
  while (t < endLim) {
    const d = new Date(t);
    const dow = d.getUTCDay();
    if (dow === 5) {
      const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 45);
      const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 13, 45);
      if (end > nowMs) {
        out.push({
          startIso: new Date(start).toISOString(),
          endIso: new Date(end).toISOString(),
          reason: "SYNTH_NONFARM_PAYROLL_STYLE"
        });
      }
    }
    if (dow === 3) {
      const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 18, 55);
      const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 19, 35);
      if (end > nowMs) {
        out.push({
          startIso: new Date(start).toISOString(),
          endIso: new Date(end).toISOString(),
          reason: "SYNTH_POLICY_EVENT_STYLE"
        });
      }
    }
    t += 86400000;
  }
  return out.slice(0, 24);
}

export function isWithinSyntheticNewsBlackoutUtc(nowMs = Date.now()): boolean {
  const d = new Date(nowMs);
  const dow = d.getUTCDay();
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (dow === 5 && mins >= 12 * 60 + 45 && mins <= 13 * 60 + 45) return true;
  if (dow === 3 && mins >= 18 * 60 + 55 && mins <= 19 * 60 + 35) return true;
  return false;
}
