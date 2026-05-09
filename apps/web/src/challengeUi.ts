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

/** Maps server-side ViolationCode strings to short trader-facing reasons. */
export function formatViolationCodeLabel(code: string): string {
  switch (code) {
    case "DAILY_DRAWDOWN_BREACH":
      return "Daily drawdown limit breached";
    case "MAX_DRAWDOWN_BREACH":
      return "Max overall drawdown breached";
    case "MAX_POSITION_SIZE_BREACH":
      return "Max position size exceeded";
    case "MAX_LOT_SIZE_BREACH":
      return "Single-trade lot size exceeded";
    case "MAX_TOTAL_LOTS_BREACH":
      return "Total open lots exceeded";
    case "AUTOMATED_TRADING_PATTERN":
      return "Automated trading pattern detected";
    case "FAST_SCALPING_PATTERN":
      return "Hyper-fast scalping pattern";
    case "EVALUATION_TIME_EXPIRED":
      return "Evaluation window expired";
    case "PROHIBITED_OPPOSED_HEDGE":
      return "Opposing hedge prohibited";
    case "COPY_TRADING_MIRROR_PATTERN":
      return "Copy / mirror trading pattern";
    case "MARTINGALE_GRID_PATTERN":
      return "Martingale / grid pattern";
    case "PAYOUT_CONSISTENCY_BLOCKED":
      return "Payout consistency rule blocked";
    case "INACTIVITY_BREACH":
      return "Inactivity breach";
    default:
      return code.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

/** Pretty-print a violation evidence value (e.g. lot, % drawdown, USD). */
export function formatViolationEvidenceValue(key: string, value: number | string | boolean | null): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") {
    const k = key.toLowerCase();
    if (/(usd|balance|equity|profit|amount|drawdown.*usd|threshold.*usd)/.test(k)) {
      return `$${value.toFixed(2)}`;
    }
    if (/(pct|percent|ratio|share)/.test(k)) {
      return `${value.toFixed(2)}%`;
    }
    if (/(lots?|size)/.test(k)) {
      return value.toFixed(2);
    }
    if (/(at|time|ms|timestamp)/.test(k) && value > 1_000_000_000_000) {
      return new Date(value).toLocaleString();
    }
    return Number.isInteger(value) ? value.toString() : value.toFixed(2);
  }
  return String(value);
}

/** Convert e.g. "currentDrawdownPct" → "Current drawdown pct". */
export function formatViolationEvidenceKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}
