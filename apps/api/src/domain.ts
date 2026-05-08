import type {
  AccountState,
  AuditEvent,
  ChallengeProgress,
  ChallengeTemplate,
  ForexSymbol,
  Order,
  OrderSide,
  Position,
  PriceTick,
  PayoutRequest,
  ViolationRecord
} from "@paper-trader/shared";

export const symbols: ForexSymbol[] = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "XAGUSD", "USOILUSD"];

export interface ClientAuthUser {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  accountId: string;
  createdAt: number;
  /** Platform partner / manager who referred this trader (if any). */
  referredByManagerId?: string;
  /**
   * Signup had no code, an invalid code, or a non-partner code — simulated commission accrues to the platform (operator) pool instead of a partner.
   */
  referredByHouseCommission?: boolean;
}

/** Ledger / metrics recipient id when commission goes to the platform pool (not a partner JWT). */
export const PLATFORM_HOUSE_COMMISSION_MANAGER_ID = "__platform_house__";

/** Promotes the platform and earns simulated revenue share from referred traders. */
export interface PlatformManagerRecord {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  /** Unique code shown in referral links, e.g. PP-A1B2C3D4 */
  referralCode: string;
  /** Optional upline manager (sub-partner tree). */
  parentManagerId?: string | null;
  createdAt: number;
  /** Running total of simulated partner earnings (USD). */
  accruedEarningsUsd: number;
}

export type ManagerCommissionType =
  | "REFERRAL_SIGNUP"
  | "SIMULATED_PROP_FEE_SHARE"
  | "PLATFORM_REFERRAL_SIGNUP"
  | "PLATFORM_PROP_FEE_SHARE";

export interface ManagerCommissionLedgerEntry {
  id: string;
  managerId: string;
  clientUserId?: string;
  clientAccountId?: string;
  type: ManagerCommissionType;
  amountUsd: number;
  note?: string;
  createdAt: number;
}

export type KycDocumentType = "PASSPORT" | "NATIONAL_ID" | "DRIVERS_LICENSE";

export interface KycCaseRecord {
  id: string;
  accountId: string;
  submittedAt: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  documentType?: KycDocumentType;
  notes?: string;
  rejectionReason?: string;
  reviewedAt?: number;
}

export type ClientDocumentKind = "GOVT_ID" | "PROOF_OF_ADDRESS" | "SELFIE" | "OTHER";

export interface ClientUploadedDocument {
  id: string;
  filename: string;
  kind: ClientDocumentKind;
  uploadedAt: number;
}

export interface ClientProfile {
  phone: string;
  dateOfBirth: string;
  street: string;
  city: string;
  stateRegion: string;
  postalCode: string;
  country: string;
  occupation: string;
  documents: ClientUploadedDocument[];
}

export function emptyClientProfile(): ClientProfile {
  return {
    phone: "",
    dateOfBirth: "",
    street: "",
    city: "",
    stateRegion: "",
    postalCode: "",
    country: "",
    occupation: "",
    documents: []
  };
}

/** Single operator account for the admin console (not client traders). */
export interface AdminOperatorRecord {
  username: string;
  passwordHash: string;
  /** Receives approval + password-reset emails */
  notificationEmail: string;
}

export type AdminPasswordResetStatus = "PENDING_APPROVAL" | "AWAITING_PASSWORD" | "COMPLETED" | "EXPIRED";

export interface AdminPasswordResetRequest {
  id: string;
  createdAt: number;
  approvalToken: string;
  /** Set after admin approves via email link */
  resetToken?: string;
  status: AdminPasswordResetStatus;
  expiresAt: number;
  resetExpiresAt?: number;
  completedAt?: number;
  /** Optional note from hidden request page */
  requesterNote?: string;
}

/** Per-account signals for prohibited conduct (persisted). */
export interface AccountTradingConduct {
  orderPlacedTimestampsMs: number[];
  shortHoldCloses: Array<{ atMs: number; holdSec: number }>;
  copyMirrorHitTimestampsMs?: number[];
  martingaleContext?: {
    symbol: ForexSymbol;
    consecutiveLossLegsOnSymbol: number;
    lastLossClosedLot: number;
  } | null;
}

export interface GlobalRiskEntryEcho {
  atMs: number;
  accountId: string;
  symbol: ForexSymbol;
  side: OrderSide;
  lotSize: number;
}

/**
 * Per-package "terminal account" — the credentials a client types into the
 * desktop app or web terminal section. One client (ClientAuthUser) can own
 * many of these (one per package they purchase). The numeric `login` is the
 * username shown to the trader; `passwordHash` is bcrypt of the plaintext
 * (the plaintext is only ever returned once on creation / regeneration).
 *
 * `accountId` here is the same trading account id used by orders / positions
 * / progress / ledger so all existing trading services continue to work
 * unchanged once the terminal token resolves to it.
 */
export interface TerminalAccountRecord {
  id: string;
  /** Numeric login string, e.g. "100001". Globally unique across terminal accounts. */
  login: string;
  passwordHash: string;
  /** ClientAuthUser.id (the portal owner of this package). */
  ownerUserId: string;
  /** Trading account id reused by progress / orders / positions / ledger. */
  accountId: string;
  /** Original signup SKU (TWO_PHASE / FTMO_STYLE / …) for display. */
  programSlug: string;
  /** Human-readable label e.g. "Two Phase · simulated $10k desk". */
  packageLabel: string;
  /** True until the trader has rotated the autogenerated password at least once. */
  mustChangePassword: boolean;
  createdAt: number;
  lastLoginAt?: number;
  /** Operator/portal can deactivate without deleting (login then 401s). */
  status: "ACTIVE" | "DISABLED";
}

export interface SupportTicket {
  id: string;
  accountId: string;
  clientUserId: string;
  type: "RULE_APPEAL" | "EVALUATION_RESET";
  title: string;
  body: string;
  status: "OPEN" | "RESOLVED_APPROVE" | "RESOLVED_REJECT";
  createdAt: number;
  resolvedAt?: number;
  resolutionNote?: string;
}

export interface PlatformState {
  prices: Record<ForexSymbol, PriceTick>;
  orders: Order[];
  positions: Position[];
  account: AccountState;
  /** Per-trader simulated ledger (balance / margin). Mirrors legacy `account` for demo-user while migrating. */
  ledgerByAccountId: Record<string, AccountState>;
  clientUsers: ClientAuthUser[];
  /** Extended KYC / address profile keyed by trader account id */
  clientProfilesByAccountId: Record<string, ClientProfile>;
  challengeTemplates: ChallengeTemplate[];
  progressByAccountId: Record<string, ChallengeProgress>;
  violations: ViolationRecord[];
  payouts: PayoutRequest[];
  auditEvents: AuditEvent[];
  traders: Array<{
    accountId: string;
    name: string;
    email: string;
    country: string;
    packageType: string;
    kycStatus: "PENDING" | "APPROVED" | "REJECTED";
    accountStatus: "ACTIVE" | "LOCKED" | "BREACHED";
  }>;
  kycCases: KycCaseRecord[];
  adminOperator: AdminOperatorRecord;
  adminPasswordResetRequests: AdminPasswordResetRequest[];
  platformManagers: PlatformManagerRecord[];
  managerCommissionLedger: ManagerCommissionLedgerEntry[];
  /** Simulated commission pool for traders without a valid partner referral (USD). */
  platformHouseCommissionAccruedUsd: number;
  tradingConductByAccountId: Record<string, AccountTradingConduct>;
  /** Ring buffer-ish log for mirrored-across-account detection (deterministic heuristic). */
  globalRecentRiskEntries: GlobalRiskEntryEcho[];
  supportTickets: SupportTicket[];
  /** Per-package desktop / web-terminal credentials owned by clientUsers. */
  terminalAccounts: TerminalAccountRecord[];
  /** Monotonic counter for the next numeric terminal login (e.g. 100001). */
  nextTerminalLoginSeq: number;
  settings: {
    marketLoopMs: number;
    priceSourceMode: "demo" | "tvc-reference";
    executionProvider: "paper" | "broker-demo" | "broker-live";
  };
}

export const defaultAccountId = "demo-user";

export function createDefaultState(): PlatformState {
  const now = Date.now();
  const starterLedger: AccountState = {
    balance: 10000,
    equity: 10000,
    usedMargin: 0,
    freeMargin: 10000,
    leverage: 100
  };
  return {
    prices: {
      EURUSD: { symbol: "EURUSD", bid: 1.082, ask: 1.0822, timestamp: now },
      GBPUSD: { symbol: "GBPUSD", bid: 1.263, ask: 1.2632, timestamp: now },
      USDJPY: { symbol: "USDJPY", bid: 154.21, ask: 154.23, timestamp: now },
      XAUUSD: { symbol: "XAUUSD", bid: 4683.9, ask: 4684.1, timestamp: now },
      XAGUSD: { symbol: "XAGUSD", bid: 27.48, ask: 27.5, timestamp: now },
      USOILUSD: { symbol: "USOILUSD", bid: 78.32, ask: 78.35, timestamp: now }
    },
    orders: [],
    positions: [],
    account: { ...starterLedger },
    ledgerByAccountId: {
      [defaultAccountId]: { ...starterLedger }
    },
    clientUsers: [],
    clientProfilesByAccountId: {},
    challengeTemplates: [
      {
        id: "std-two-step",
        name: "Standard Two-Step",
        payoutSplitPct: 80,
        fundedDailyDrawdownPct: 5,
        fundedMaxDrawdownPct: 12,
        payoutMinProfitUsd: 75,
        payoutConsistencyMaxSingleDayProfitPct: 40,
        newsTradingPolicy: "ALLOWED",
        ruleStyleNote: "GENERIC_PROP",
        phases: [
          {
            phase: "PHASE_1",
            profitTargetPct: 8,
            minTradingDays: 5,
            maxTradingDays: 30,
            dailyDrawdownPct: 5,
            maxDrawdownPct: 10,
            maxPositionLots: 2,
            maxTotalLots: 5
          },
          {
            phase: "PHASE_2",
            profitTargetPct: 5,
            minTradingDays: 5,
            maxTradingDays: 60,
            dailyDrawdownPct: 5,
            maxDrawdownPct: 10,
            maxPositionLots: 2,
            maxTotalLots: 5
          }
        ]
      },
      {
        id: "preset-ftmo-two-phase",
        name: "FTMO-inspired two-step (simulation — not affiliated)",
        payoutSplitPct: 80,
        fundedDailyDrawdownPct: 5,
        fundedMaxDrawdownPct: 10,
        payoutMinProfitUsd: 100,
        payoutConsistencyMaxSingleDayProfitPct: 40,
        newsTradingPolicy: "SYNTH_HIGH_IMPACT_BLACKOUT",
        enforceMartingaleHeuristic: true,
        enforceCopyMirrorHeuristic: true,
        ruleStyleNote: "FTMO_INSPIRED",
        phases: [
          {
            phase: "PHASE_1",
            profitTargetPct: 10,
            minTradingDays: 4,
            maxTradingDays: 30,
            dailyDrawdownPct: 5,
            maxDrawdownPct: 10,
            maxPositionLots: 2,
            maxTotalLots: 5
          },
          {
            phase: "PHASE_2",
            profitTargetPct: 5,
            minTradingDays: 4,
            maxTradingDays: 60,
            dailyDrawdownPct: 5,
            maxDrawdownPct: 10,
            maxPositionLots: 2,
            maxTotalLots: 5
          }
        ]
      },
      {
        id: "preset-fxify-two-phase",
        name: "FXIFY-inspired two-step (simulation — not affiliated)",
        payoutSplitPct: 80,
        fundedDailyDrawdownPct: 5,
        fundedMaxDrawdownPct: 10,
        payoutMinProfitUsd: 100,
        payoutConsistencyMaxSingleDayProfitPct: 40,
        newsTradingPolicy: "ALLOWED",
        enforceMartingaleHeuristic: false,
        enforceCopyMirrorHeuristic: false,
        inactivityMaxCalendarDaysWithoutTrade: 60,
        ruleStyleNote: "FXIFY_INSPIRED",
        phases: [
          {
            phase: "PHASE_1",
            profitTargetPct: 10,
            minTradingDays: 4,
            maxTradingDays: 35,
            dailyDrawdownPct: 4,
            maxDrawdownPct: 10,
            maxPositionLots: 2,
            maxTotalLots: 5
          },
          {
            phase: "PHASE_2",
            profitTargetPct: 5,
            minTradingDays: 4,
            maxTradingDays: 60,
            dailyDrawdownPct: 4,
            maxDrawdownPct: 10,
            maxPositionLots: 2,
            maxTotalLots: 5
          }
        ]
      },
      {
        id: "prog-one-phase",
        name: "One-phase evaluation · PropPrime SKU",
        payoutSplitPct: 80,
        fundedDailyDrawdownPct: 5,
        fundedMaxDrawdownPct: 12,
        payoutMinProfitUsd: 75,
        payoutConsistencyMaxSingleDayProfitPct: 40,
        phases: [
          {
            phase: "PHASE_1",
            profitTargetPct: 8,
            minTradingDays: 4,
            maxTradingDays: 45,
            dailyDrawdownPct: 5,
            maxDrawdownPct: 10,
            maxPositionLots: 2,
            maxTotalLots: 5
          }
        ]
      },
      {
        id: "prog-lightning",
        name: "Lightning sprint SKU",
        payoutSplitPct: 75,
        fundedDailyDrawdownPct: 4,
        fundedMaxDrawdownPct: 10,
        payoutMinProfitUsd: 50,
        payoutConsistencyMaxSingleDayProfitPct: 35,
        newsTradingPolicy: "SYNTH_HIGH_IMPACT_BLACKOUT",
        phases: [
          {
            phase: "PHASE_1",
            profitTargetPct: 6,
            minTradingDays: 3,
            maxTradingDays: 14,
            dailyDrawdownPct: 5,
            maxDrawdownPct: 10,
            maxPositionLots: 1,
            maxTotalLots: 3
          },
          {
            phase: "PHASE_2",
            profitTargetPct: 5,
            minTradingDays: 2,
            maxTradingDays: 14,
            dailyDrawdownPct: 5,
            maxDrawdownPct: 10,
            maxPositionLots: 1,
            maxTotalLots: 3
          }
        ]
      },
      {
        id: "prog-three-cycle",
        name: "Three-cycle progressive SKU",
        payoutSplitPct: 82,
        fundedDailyDrawdownPct: 5,
        fundedMaxDrawdownPct: 12,
        payoutMinProfitUsd: 120,
        payoutConsistencyMaxSingleDayProfitPct: 38,
        phases: [
          {
            phase: "PHASE_1",
            profitTargetPct: 6,
            minTradingDays: 5,
            maxTradingDays: 28,
            dailyDrawdownPct: 5,
            maxDrawdownPct: 10,
            maxPositionLots: 2,
            maxTotalLots: 4
          },
          {
            phase: "PHASE_2",
            profitTargetPct: 6,
            minTradingDays: 5,
            maxTradingDays: 35,
            dailyDrawdownPct: 5,
            maxDrawdownPct: 10,
            maxPositionLots: 2,
            maxTotalLots: 4
          },
          {
            phase: "PHASE_3",
            profitTargetPct: 4,
            minTradingDays: 4,
            maxTradingDays: 40,
            dailyDrawdownPct: 5,
            maxDrawdownPct: 10,
            maxPositionLots: 2,
            maxTotalLots: 5
          }
        ]
      },
      {
        id: "instant-funded-sim",
        name: "Instant-funded simulation desk",
        payoutSplitPct: 80,
        fundedDailyDrawdownPct: 4,
        fundedMaxDrawdownPct: 10,
        payoutMinProfitUsd: 250,
        payoutConsistencyMaxSingleDayProfitPct: 35,
        newsTradingPolicy: "ALLOWED",
        enforceMartingaleHeuristic: false,
        enforceCopyMirrorHeuristic: true,
        inactivityMaxCalendarDaysWithoutTrade: 60,
        ruleStyleNote: "INSTANT_FUNDED_SIM",
        phases: [
          {
            phase: "PHASE_1",
            profitTargetPct: 99,
            minTradingDays: 99,
            maxTradingDays: 999,
            dailyDrawdownPct: 99,
            maxDrawdownPct: 99,
            maxPositionLots: 5,
            maxTotalLots: 10
          }
        ]
      }
    ],
    progressByAccountId: {
      [defaultAccountId]: {
        accountId: defaultAccountId,
        templateId: "std-two-step",
        phase: "PHASE_1",
        status: "ACTIVE",
        startedAt: now,
        tradingDays: 0,
        highWatermarkBalance: 10000,
        phaseStartBalance: 10000,
        currentDailyStartBalance: 10000,
        qualifiedTradingDayKeys: [],
        realizedPnLUsdByUtcDay: {}
      }
    },
    violations: [],
    payouts: [],
    auditEvents: [],
    traders: [
      {
        accountId: "demo-user",
        name: "Demo Trader",
        email: "client1@propprime.local",
        country: "PK",
        packageType: "Two Phase 100K",
        kycStatus: "APPROVED",
        accountStatus: "ACTIVE"
      },
      {
        accountId: "demo-user-2",
        name: "Alpha Trader",
        email: "alpha@propprime.local",
        country: "AE",
        packageType: "One Phase 50K",
        kycStatus: "PENDING",
        accountStatus: "ACTIVE"
      }
    ],
    kycCases: [
      {
        id: "kyc-001",
        accountId: "demo-user-2",
        submittedAt: now - 3600_000,
        status: "PENDING"
      }
    ],
    adminOperator: {
      username: "AWSVISION",
      passwordHash: "",
      notificationEmail: "ops@propprime.local"
    },
    adminPasswordResetRequests: [],
    platformManagers: [],
    managerCommissionLedger: [],
    platformHouseCommissionAccruedUsd: 0,
    tradingConductByAccountId: {},
    globalRecentRiskEntries: [],
    supportTickets: [],
    terminalAccounts: [],
    nextTerminalLoginSeq: 100001,
    settings: {
      marketLoopMs: 250,
      priceSourceMode: "demo",
      executionProvider: "paper"
    }
  };
}
