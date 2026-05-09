import type { ChallengeProgress } from "@paper-trader/shared";

/** Checkout-style program keys aligned with apps/web/src/programCatalog ProgramKey (+ instant). */

export type ProgramFamily = "ONE_PHASE" | "TWO_PHASE" | "THREE_PHASE" | "INSTANT_FUNDING" | "LIGHTNING" | "HEURISTIC";

export interface ProgramSignupPreset {
  templateId: string;
  simulatedBalanceUsd: number;
  packageTypeLabel: string;
  /** Sticker price (USD) shown on the catalog + checkout. Simulated billing only. */
  priceUsd: number;
  /** Short marketing tagline rendered on the catalog card. */
  tagline?: string;
  instantFundedPassthrough?: boolean;
  /** Visual grouping in the portal catalog ("One Phase", "Two Phase", …). */
  family?: ProgramFamily;
  /** Excluded from the public catalog (kept for legacy/data resolution only). */
  hideFromCatalog?: boolean;
}

/**
 * Source-of-truth for every purchasable package in the portal.
 *
 * The first 15 SKUs mirror the tiers shown on the public marketing site
 * (`ProgramsPage` → `programCatalog.ts`) — five program families × three
 * size tiers each — plus two heuristic alternates (FTMO / FXIFY).
 *
 * The legacy short keys (`TWO_PHASE`, `ONE_PHASE`, …) are kept as resolution
 * aliases so terminal-account rows already persisted in `state.json` keep
 * pointing at a valid preset; they're hidden from the catalog listing so the
 * portal grid doesn't show them as duplicate cards.
 */
export const PROGRAM_SIGNUP_PRESETS: Record<string, ProgramSignupPreset> = {
  // ── One Phase ──────────────────────────────────────────────────────────
  ONE_PHASE_5K: {
    templateId: "prog-one-phase",
    simulatedBalanceUsd: 5000,
    priceUsd: 59,
    family: "ONE_PHASE",
    packageTypeLabel: "One Phase · simulated $5k desk",
    tagline: "Single evaluation step. Entry-level account."
  },
  ONE_PHASE_25K: {
    templateId: "prog-one-phase",
    simulatedBalanceUsd: 25000,
    priceUsd: 199,
    family: "ONE_PHASE",
    packageTypeLabel: "One Phase · simulated $25k desk",
    tagline: "Single evaluation on a mid-size desk."
  },
  ONE_PHASE_100K: {
    templateId: "prog-one-phase",
    simulatedBalanceUsd: 100000,
    priceUsd: 549,
    family: "ONE_PHASE",
    packageTypeLabel: "One Phase · simulated $100k desk",
    tagline: "Faster path to a $100k simulated desk."
  },

  // ── Two Phase ──────────────────────────────────────────────────────────
  TWO_PHASE_10K: {
    templateId: "std-two-step",
    simulatedBalanceUsd: 10000,
    priceUsd: 99,
    family: "TWO_PHASE",
    packageTypeLabel: "Two Phase · simulated $10k desk",
    tagline: "Most popular. Standard two-step evaluation."
  },
  TWO_PHASE_50K: {
    templateId: "std-two-step",
    simulatedBalanceUsd: 50000,
    priceUsd: 349,
    family: "TWO_PHASE",
    packageTypeLabel: "Two Phase · simulated $50k desk",
    tagline: "Two-step evaluation on a $50k simulated desk."
  },
  TWO_PHASE_100K: {
    templateId: "std-two-step",
    simulatedBalanceUsd: 100000,
    priceUsd: 549,
    family: "TWO_PHASE",
    packageTypeLabel: "Two Phase · simulated $100k desk",
    tagline: "Two-step evaluation on a $100k simulated desk."
  },
  TWO_PHASE_200K: {
    templateId: "std-two-step",
    simulatedBalanceUsd: 200000,
    priceUsd: 849,
    family: "TWO_PHASE",
    packageTypeLabel: "Two Phase · simulated $200k desk",
    tagline: "Top-tier two-step. Maximum simulated capital."
  },

  /** Same tier sizes as Classic Two Phase — alternate rule packs (template differs). */
  TWO_PHASE_FXI_10K: {
    templateId: "preset-fxify-two-phase",
    simulatedBalanceUsd: 10000,
    priceUsd: 109,
    family: "TWO_PHASE",
    packageTypeLabel: "Two Phase · FXIFY-style rails · $10k desk",
    tagline: "4% daily loss · inactivity clock · permissive conduct heuristics."
  },
  TWO_PHASE_FXI_50K: {
    templateId: "preset-fxify-two-phase",
    simulatedBalanceUsd: 50000,
    priceUsd: 379,
    family: "TWO_PHASE",
    packageTypeLabel: "Two Phase · FXIFY-style rails · $50k desk",
    tagline: "Scaled FXIFY-style rails on a $50k simulated desk."
  },
  TWO_PHASE_FXI_100K: {
    templateId: "preset-fxify-two-phase",
    simulatedBalanceUsd: 100000,
    priceUsd: 579,
    family: "TWO_PHASE",
    packageTypeLabel: "Two Phase · FXIFY-style rails · $100k desk",
    tagline: "Scaled FXIFY-style rails on a $100k simulated desk."
  },
  TWO_PHASE_FTM_10K: {
    templateId: "preset-ftmo-two-phase",
    simulatedBalanceUsd: 10000,
    priceUsd: 149,
    family: "TWO_PHASE",
    packageTypeLabel: "Two Phase · FTMO-style · $10k desk",
    tagline: "News blackout windows · stricter Martingale / copy-mirror checks."
  },
  TWO_PHASE_FTM_50K: {
    templateId: "preset-ftmo-two-phase",
    simulatedBalanceUsd: 50000,
    priceUsd: 449,
    family: "TWO_PHASE",
    packageTypeLabel: "Two Phase · FTMO-style · $50k desk",
    tagline: "FTMO-inspired rails scaled to $50k simulated capital."
  },
  TWO_PHASE_FTM_100K: {
    templateId: "preset-ftmo-two-phase",
    simulatedBalanceUsd: 100000,
    priceUsd: 699,
    family: "TWO_PHASE",
    packageTypeLabel: "Two Phase · FTMO-style · $100k desk",
    tagline: "FTMO-inspired rails scaled to $100k simulated capital."
  },

  // ── Three Phase ────────────────────────────────────────────────────────
  THREE_PHASE_25K: {
    templateId: "prog-three-cycle",
    simulatedBalanceUsd: 25000,
    priceUsd: 379,
    family: "THREE_PHASE",
    packageTypeLabel: "Three Phase · simulated $25k progressive",
    tagline: "Three progressive cycles. Builds discipline."
  },
  THREE_PHASE_100K: {
    templateId: "prog-three-cycle",
    simulatedBalanceUsd: 100000,
    priceUsd: 649,
    family: "THREE_PHASE",
    packageTypeLabel: "Three Phase · simulated $100k progressive",
    tagline: "Three progressive cycles to a $100k desk."
  },
  THREE_PHASE_400K: {
    templateId: "prog-three-cycle",
    simulatedBalanceUsd: 400000,
    priceUsd: 1299,
    family: "THREE_PHASE",
    packageTypeLabel: "Three Phase · simulated $400k progressive",
    tagline: "Top-tier progressive cycle program."
  },

  // ── Lightning ──────────────────────────────────────────────────────────
  LIGHTNING_5K: {
    templateId: "prog-lightning",
    simulatedBalanceUsd: 5000,
    priceUsd: 59,
    family: "LIGHTNING",
    packageTypeLabel: "Lightning · $5k fast-turn sprint",
    tagline: "Tight-window sprint. Entry-level SKU."
  },
  LIGHTNING_10K: {
    templateId: "prog-lightning",
    simulatedBalanceUsd: 10000,
    priceUsd: 99,
    family: "LIGHTNING",
    packageTypeLabel: "Lightning · $10k fast-turn sprint",
    tagline: "Fast-turn challenge with strict news blackout."
  },
  LIGHTNING_25K: {
    templateId: "prog-lightning",
    simulatedBalanceUsd: 25000,
    priceUsd: 179,
    family: "LIGHTNING",
    packageTypeLabel: "Lightning · $25k fast-turn sprint",
    tagline: "Step up your sprint to a $25k desk."
  },

  // ── Instant Funding ────────────────────────────────────────────────────
  INSTANT_FUNDING_10K: {
    templateId: "instant-funded-sim",
    simulatedBalanceUsd: 10000,
    priceUsd: 499,
    instantFundedPassthrough: true,
    family: "INSTANT_FUNDING",
    packageTypeLabel: "Instant funding · $10k live-style desk",
    tagline: "Skip evaluation. $10k from day one."
  },
  INSTANT_FUNDING_25K: {
    templateId: "instant-funded-sim",
    simulatedBalanceUsd: 25000,
    priceUsd: 799,
    instantFundedPassthrough: true,
    family: "INSTANT_FUNDING",
    packageTypeLabel: "Instant funding · $25k live-style desk",
    tagline: "Skip evaluation. $25k from day one."
  },
  INSTANT_FUNDING_50K: {
    templateId: "instant-funded-sim",
    simulatedBalanceUsd: 50000,
    priceUsd: 1499,
    instantFundedPassthrough: true,
    family: "INSTANT_FUNDING",
    packageTypeLabel: "Instant funding · $50k live-style desk",
    tagline: "Skip evaluation. $50k from day one."
  },

  // ── Heuristic alternates ───────────────────────────────────────────────
  FTMO_STYLE: {
    templateId: "preset-ftmo-two-phase",
    simulatedBalanceUsd: 10000,
    priceUsd: 149,
    family: "HEURISTIC",
    packageTypeLabel: "FTMO-style two-step · stricter conduct + news blackout",
    tagline: "Heuristic FTMO-flavoured ruleset. Stricter conduct."
  },
  FXIFY_STYLE: {
    templateId: "preset-fxify-two-phase",
    simulatedBalanceUsd: 10000,
    priceUsd: 109,
    family: "HEURISTIC",
    packageTypeLabel: "FXIFY-style two-step · 60-day activity, permissive heuristics",
    tagline: "Heuristic FXIFY-flavoured ruleset. 60-day activity window."
  },

  // ── Legacy aliases (kept for resolution of existing state, hidden from grid) ─
  TWO_PHASE: {
    templateId: "std-two-step",
    simulatedBalanceUsd: 10000,
    priceUsd: 99,
    family: "TWO_PHASE",
    packageTypeLabel: "Two Phase · simulated $10k desk",
    hideFromCatalog: true
  },
  ONE_PHASE: {
    templateId: "prog-one-phase",
    simulatedBalanceUsd: 5000,
    priceUsd: 59,
    family: "ONE_PHASE",
    packageTypeLabel: "One Phase · simulated $5k desk",
    hideFromCatalog: true
  },
  THREE_PHASE: {
    templateId: "prog-three-cycle",
    simulatedBalanceUsd: 25000,
    priceUsd: 379,
    family: "THREE_PHASE",
    packageTypeLabel: "Three Phase · simulated $25k progressive",
    hideFromCatalog: true
  },
  LIGHTNING: {
    templateId: "prog-lightning",
    simulatedBalanceUsd: 10000,
    priceUsd: 99,
    family: "LIGHTNING",
    packageTypeLabel: "Lightning · $10k fast-turn sprint",
    hideFromCatalog: true
  },
  INSTANT_FUNDING: {
    templateId: "instant-funded-sim",
    simulatedBalanceUsd: 25000,
    priceUsd: 799,
    instantFundedPassthrough: true,
    family: "INSTANT_FUNDING",
    packageTypeLabel: "Instant funding · $25k live-style desk",
    hideFromCatalog: true
  }
};

/** Optional tier slug e.g. "ONE_PHASE:TIER_MID" resolved to preset key before colon. */
export function resolveSignupProgramSlug(raw: string | undefined): ProgramSignupPreset {
  const trimmed = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  const key = trimmed.split(":")[0] ?? "";
  if (key && PROGRAM_SIGNUP_PRESETS[key]) return PROGRAM_SIGNUP_PRESETS[key];
  return PROGRAM_SIGNUP_PRESETS.TWO_PHASE_10K ?? PROGRAM_SIGNUP_PRESETS.TWO_PHASE!;
}

export function supportedProgramSignupKeys(): string[] {
  return Object.keys(PROGRAM_SIGNUP_PRESETS);
}

/**
 * Catalog list shown in the client portal — excludes legacy aliases so the
 * portal grid maps 1:1 to the public marketing site.
 */
export function listProgramSignupOptions(): Array<ProgramSignupPreset & { slug: string }> {
  return supportedProgramSignupKeys()
    .filter((slug) => !PROGRAM_SIGNUP_PRESETS[slug]!.hideFromCatalog)
    .map((slug) => ({
      slug,
      ...PROGRAM_SIGNUP_PRESETS[slug]!
    }));
}

/** Build baseline progress row — caller supplies accountId/templateId/start balance. */
export function buildStarterProgress(opts: {
  accountId: string;
  templateId: string;
  balance: number;
  nowMs: number;
  instantFundedPassthrough?: boolean;
}): ChallengeProgress {
  const now = opts.nowMs;
  if (!opts.instantFundedPassthrough) {
    return {
      accountId: opts.accountId,
      templateId: opts.templateId,
      phase: "PHASE_1",
      status: "ACTIVE",
      startedAt: now,
      tradingDays: 0,
      highWatermarkBalance: opts.balance,
      phaseStartBalance: opts.balance,
      currentDailyStartBalance: opts.balance,
      qualifiedTradingDayKeys: [],
      realizedPnLUsdByUtcDay: {}
    };
  }
  return {
    accountId: opts.accountId,
    templateId: opts.templateId,
    phase: "FUNDED",
    status: "ACTIVE",
    startedAt: now,
    tradingDays: 0,
    highWatermarkBalance: opts.balance,
    phaseStartBalance: opts.balance,
    currentDailyStartBalance: opts.balance,
    qualifiedTradingDayKeys: [],
    fundedPhaseStartedAt: now,
    realizedPnLUsdByUtcDay: {}
  };
}
