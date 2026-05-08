/** Enforced simulated conduct policy (demo thresholds — tune per program). */

export const CONDUCT_BOT_BURST_WINDOW_MS = 12_000;
/** Count includes the current submission if it crosses the threshold. */
export const CONDUCT_BOT_BURST_MIN_ORDERS = 8;

/** Positions closed faster than this (seconds) count toward scalping tally. */
export const CONDUCT_SCALP_MAX_HOLD_SEC = 42;
/** Rolling window for counting short-Hold closes. */
export const CONDUCT_SCALP_WINDOW_MS = 18 * 60 * 1000;
/** Freeze after this many short holds inside the rolling window. */
export const CONDUCT_SCALP_MIN_SHORT_HOLDS = 6;

/** Opposite-account fills within this UTC window (ms) can count as mirrored "copy" echoes. */
export const CONDUCT_COPY_MIRROR_PAIR_WINDOW_MS = 38_000;
/** Allowed relative deviation between mirrored lot sizes vs max(lota, lotb, 0.01). */
export const CONDUCT_COPY_MIRROR_LOT_REL_TOLERANCE = 0.13;
/** Hit timestamps kept for escalating copy echoes. */
export const CONDUCT_COPY_MIRROR_HITS_WINDOW_MS = 22 * 60 * 1000;
/** Locks after enough mirrored echoes in rolling window (demo heuristic). */
export const CONDUCT_COPY_MIRROR_MIN_HITS = 4;

/** Martingale/grid-style re-entry: lot must not exceed multiple of last closed-loss lot after this many sequential losses on the symbol. */
export const CONDUCT_MARTINGALE_LOT_MULTIPLIER = 1.48;
/** Minimum sequential realized losses before oversized re-entry is evaluated. */
export const CONDUCT_MARTINGALE_MIN_LOSS_LEGS = 2;

/** Global echoed risk ring-buffer bounds (fills / opens). */
export const CONDUCT_GLOBAL_ECHO_TRIM_MS = 180_000;
export const CONDUCT_GLOBAL_ECHO_MAX_ROWS = 400;

export function getTradingRulesPublicPayload(): Record<string, unknown> {
  return {
    disclaimer:
      "PropPrime is a simulation/education stack. Templates labeled FTMO-inspired or FXIFY-inspired are heuristic presets only — they are NOT affiliated with, endorsed by, or guaranteed to match FTMO, FXIFY, or any live prop firm. Always read each firm's current legal terms before trading real capital.",
    firmInspiredPresets: [
      {
        id: "preset-ftmo-two-phase",
        label: "FTMO-inspired (sim)",
        summary:
          "Stricter template: synthetic high-impact news blackout windows, martingale/copy heuristics ON. Drawdown rails roughly in line with common two-step marketing (5% / 10% style) — not a copy of FTMO's legal rulebook."
      },
      {
        id: "preset-fxify-two-phase",
        label: "FXIFY-inspired (sim)",
        summary:
          "Permissive template: martingale/copy heuristics OFF, news blackout OFF, optional 60-calendar-day minimum activity breach. Drawdowns tuned toward published two-step style figures (e.g. ~4% daily / 10% max style) — verify against FXIFY's live FAQs."
      }
    ],
    notModeledHere: [
      "Cross-broker or multi-account \"group\" hedging beyond single-account opposing hedge rejection",
      "High-frequency / latency arbitrage detection",
      "Real economic calendar feeds — only deterministic UTC blackout slots when a template opts in",
      "Payout-time drawdown locking at initial balance (some firms move the trailing floor after withdrawals)"
    ],
    allowances: [
      {
        id: "news",
        title: "News trading",
        policy: "template-dependent",
        detail:
          "Strict presets use SYNTH HIGH-IMPACT BLACKOUT (Friday 12:45–13:45 UTC, Wednesday 18:55–19:35 UTC) blocking NEW exposure. Others allow news in simulation."
      },
      {
        id: "weekend",
        title: "Weekend / overnight holding",
        policy: "allowed",
        detail: "Carry through weekends is permitted in this demo (many live firms allow; confirm your real program)."
      },
      {
        id: "qualifying-days",
        title: "Minimum activity days",
        policy: "qualifying",
        detail: "Phase profit targets require N distinct UTC days with at least one filled entry (not calendar days only)."
      },
      {
        id: "inactivity",
        title: "Inactivity / dormancy",
        policy: "template-dependent",
        detail:
          "Some presets enforce a HARD breach if there is no open or close fill for N calendar days (e.g. 60 on FXIFY-inspired). Timer anchors from last trade or account start."
      }
    ],
    prohibited: [
      {
        id: "automation",
        title: "Automated / bot-style execution",
        detail: "No algorithmic blasting that exceeds human baselines. Rapid-fire order submission is monitored."
      },
      {
        id: "scalping",
        title: "Fast tick scalping",
        detail: "Systematic sub-minute in-and-out trading intended to farm micro-moves is prohibited — repeated ultra-short holds trigger review."
      },
      {
        id: "hedge",
        title: "Opposing hedge on same symbol",
        detail: "Simultaneous long and short exposure on identical instruments is prohibited; pending fills that would create a hedge are rejected."
      },
      {
        id: "copy-mirror",
        title: "Copy / mirror trading across accounts",
        detail:
          "When enabled on a template: repeated cross-account mirrored fills (deterministic heuristic) can RULE_FREEZE. Disabled on permissive presets (similar to firms that allow copy on some programs)."
      },
      {
        id: "martingale-grid",
        title: "Martingale / loss-chasing size ramps",
        detail:
          "When enabled: oversized re-entry after sequential losses can RULE_FREEZE. Disabled on presets that mimic firms allowing grid/martingale in documentation."
      },
      {
        id: "payout-consistency",
        title: "Payout consistency",
        detail:
          "Funded payout requests can be blocked until cumulative gross profit is large enough and the template's max single-day share of gross profit is satisfied (UTC-day realized PnL since funded start). WARNING violation logged when a request hits this gate."
      }
    ],
    enforcement:
      "Conduct breaches (bots / scalping / optional copy-martingale) freeze trading (LOCKED). Drawdown, size limits, timers, hedging, inactivity, and payout gates can fail the simulated prop account (BREACHED). After passing evaluations, simulated funded accounts keep drawdown monitoring. Payout simulation requires APPROVED KYC and profit above template minimum.",
    detection: {
      burstWindowMs: CONDUCT_BOT_BURST_WINDOW_MS,
      burstMinOrders: CONDUCT_BOT_BURST_MIN_ORDERS,
      scalpMaxHoldSec: CONDUCT_SCALP_MAX_HOLD_SEC,
      scalpWindowMs: CONDUCT_SCALP_WINDOW_MS,
      scalpMinShortHolds: CONDUCT_SCALP_MIN_SHORT_HOLDS,
      copyMirrorPairWindowMs: CONDUCT_COPY_MIRROR_PAIR_WINDOW_MS,
      copyMirrorLotRelTolerance: CONDUCT_COPY_MIRROR_LOT_REL_TOLERANCE,
      copyMirrorHitsWindowMs: CONDUCT_COPY_MIRROR_HITS_WINDOW_MS,
      copyMirrorMinHits: CONDUCT_COPY_MIRROR_MIN_HITS,
      martingaleLotMultiplier: CONDUCT_MARTINGALE_LOT_MULTIPLIER,
      martingaleMinLossLegs: CONDUCT_MARTINGALE_MIN_LOSS_LEGS
    }
  };
}
