import fs from "node:fs";
import path from "path";
import type { ChallengeProgress, ChallengeTemplate, ForexSymbol } from "@paper-trader/shared";
import type {
  AccountTradingConduct,
  GlobalRiskEntryEcho,
  PlatformState,
  SupportTicket,
  TerminalAccountRecord
} from "../domain";
import { createDefaultState, defaultAccountId } from "../domain";

function mergeDayPnlMaps(
  prev: Record<string, number> | undefined,
  incoming: Partial<Record<string, number>> | undefined
): Record<string, number> | undefined {
  const base = { ...(prev ?? {}) };
  if (incoming && typeof incoming === "object") {
    for (const [k, v] of Object.entries(incoming)) {
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      base[k] = Number(v.toFixed(2));
    }
  }
  return Object.keys(base).length ? base : {};
}

function mergeProgressByAccountId(
  defaults: Record<string, ChallengeProgress>,
  parsed: Partial<Record<string, Partial<ChallengeProgress>>> | undefined
): Record<string, ChallengeProgress> {
  const out: Record<string, ChallengeProgress> = { ...defaults };
  if (!parsed || typeof parsed !== "object") return out;
  for (const [aid, inc] of Object.entries(parsed)) {
    if (!inc || typeof inc !== "object") continue;
    const prev = out[aid];
    const qIn = Array.isArray(inc.qualifiedTradingDayKeys)
      ? inc.qualifiedTradingDayKeys.filter((x): x is string => typeof x === "string")
      : Array.isArray(prev?.qualifiedTradingDayKeys)
        ? prev!.qualifiedTradingDayKeys
        : [];
    const uniq = [...new Set(qIn)];
    const mergedBase = prev ?? { ...(inc as ChallengeProgress) };
    const dayMap = mergeDayPnlMaps(prev?.realizedPnLUsdByUtcDay ?? mergedBase.realizedPnLUsdByUtcDay, inc.realizedPnLUsdByUtcDay);
    out[aid] = {
      ...mergedBase,
      ...inc,
      qualifiedTradingDayKeys: uniq,
      tradingDays: uniq.length
    };
    if (dayMap !== undefined) out[aid].realizedPnLUsdByUtcDay = dayMap;
    const lt = inc.lastTradeAtMs;
    if (typeof lt === "number" && Number.isFinite(lt)) out[aid].lastTradeAtMs = lt;
    else if (typeof mergedBase.lastTradeAtMs === "number" && Number.isFinite(mergedBase.lastTradeAtMs))
      out[aid].lastTradeAtMs = mergedBase.lastTradeAtMs;
    else delete out[aid].lastTradeAtMs;
    if (!out[aid].qualifiedTradingDayKeys) out[aid].qualifiedTradingDayKeys = [];
    if (!out[aid].realizedPnLUsdByUtcDay) out[aid].realizedPnLUsdByUtcDay = {};
  }
  return out;
}

function mergeTradingConduct(
  fallback: Record<string, AccountTradingConduct>,
  parsed: Record<string, Partial<AccountTradingConduct>> | undefined
): Record<string, AccountTradingConduct> {
  if (!parsed || typeof parsed !== "object") return { ...fallback };
  const out: Record<string, AccountTradingConduct> = { ...fallback };
  for (const [aid, partial] of Object.entries(parsed)) {
    if (!partial || typeof partial !== "object") continue;
    const base = fallback[aid] ?? {
      orderPlacedTimestampsMs: [],
      shortHoldCloses: []
    };
    let mart: AccountTradingConduct["martingaleContext"] =
      partial.martingaleContext === undefined ? base.martingaleContext : partial.martingaleContext;
    if (partial.martingaleContext !== undefined) {
      if (partial.martingaleContext === null) mart = null;
      else if (typeof partial.martingaleContext === "object") {
        const m = partial.martingaleContext as {
          symbol?: unknown;
          consecutiveLossLegsOnSymbol?: unknown;
          lastLossClosedLot?: unknown;
        };
        if (
          typeof m.symbol === "string" &&
          typeof m.consecutiveLossLegsOnSymbol === "number" &&
          typeof m.lastLossClosedLot === "number"
        ) {
          mart = {
            symbol: m.symbol as ForexSymbol,
            consecutiveLossLegsOnSymbol: m.consecutiveLossLegsOnSymbol,
            lastLossClosedLot: m.lastLossClosedLot
          };
        }
      }
    }

    const copyMir = Array.isArray(partial.copyMirrorHitTimestampsMs)
      ? partial.copyMirrorHitTimestampsMs.filter((x): x is number => typeof x === "number")
      : base.copyMirrorHitTimestampsMs ?? [];

    out[aid] = {
      orderPlacedTimestampsMs: Array.isArray(partial.orderPlacedTimestampsMs)
        ? partial.orderPlacedTimestampsMs.filter((x) => typeof x === "number")
        : base.orderPlacedTimestampsMs,
      shortHoldCloses: Array.isArray(partial.shortHoldCloses)
        ? partial.shortHoldCloses.filter(
            (x): x is { atMs: number; holdSec: number } =>
              typeof x === "object" &&
              x !== null &&
              typeof (x as { atMs?: unknown }).atMs === "number" &&
              typeof (x as { holdSec?: unknown }).holdSec === "number"
          )
        : base.shortHoldCloses,
      copyMirrorHitTimestampsMs: copyMir,
      martingaleContext: mart
    };
  }
  return out;
}

function mergeGlobalRiskEcho(parsed: unknown, fallback: GlobalRiskEntryEcho[]): GlobalRiskEntryEcho[] {
  if (!Array.isArray(parsed)) return [...fallback];
  const rows: GlobalRiskEntryEcho[] = [];
  for (const x of parsed) {
    if (typeof x !== "object" || x === null) continue;
    const o = x as Record<string, unknown>;
    const atMs = o.atMs;
    const accountId = o.accountId;
    const symbol = o.symbol;
    const side = o.side;
    const lotSize = o.lotSize;
    if (
      typeof atMs !== "number" ||
      typeof accountId !== "string" ||
      typeof symbol !== "string" ||
      (side !== "BUY" && side !== "SELL") ||
      typeof lotSize !== "number"
    )
      continue;
    rows.push({ atMs, accountId, symbol: symbol as GlobalRiskEntryEcho["symbol"], side, lotSize });
  }
  return rows.slice(-500);
}

function mergeTerminalAccounts(parsed: unknown, fallback: TerminalAccountRecord[]): TerminalAccountRecord[] {
  if (!Array.isArray(parsed)) return [...fallback];
  const rows: TerminalAccountRecord[] = [];
  for (const x of parsed) {
    if (typeof x !== "object" || x === null) continue;
    const o = x as Record<string, unknown>;
    if (
      typeof o.id !== "string" ||
      typeof o.login !== "string" ||
      typeof o.passwordHash !== "string" ||
      typeof o.ownerUserId !== "string" ||
      typeof o.accountId !== "string" ||
      typeof o.createdAt !== "number"
    )
      continue;
    rows.push({
      id: o.id,
      login: o.login,
      passwordHash: o.passwordHash,
      ownerUserId: o.ownerUserId,
      accountId: o.accountId,
      programSlug: typeof o.programSlug === "string" ? o.programSlug : "TWO_PHASE",
      packageLabel: typeof o.packageLabel === "string" ? o.packageLabel : "Trading account",
      mustChangePassword: o.mustChangePassword !== false,
      createdAt: o.createdAt,
      lastLoginAt: typeof o.lastLoginAt === "number" ? o.lastLoginAt : undefined,
      status: o.status === "DISABLED" ? "DISABLED" : "ACTIVE"
    });
  }
  return rows;
}

function mergeSupportTickets(parsed: unknown, fallback: SupportTicket[]): SupportTicket[] {
  if (!Array.isArray(parsed)) return [...fallback];
  const rows: SupportTicket[] = [];
  for (const x of parsed) {
    if (typeof x !== "object" || x === null) continue;
    const o = x as Record<string, unknown>;
    const id = o.id;
    const accountId = o.accountId;
    const clientUserId = o.clientUserId;
    const typ = o.type;
    const title = o.title;
    const body = o.body;
    const status = o.status;
    const createdAt = o.createdAt;
    if (
      typeof id !== "string" ||
      typeof accountId !== "string" ||
      typeof clientUserId !== "string" ||
      (typ !== "RULE_APPEAL" && typ !== "EVALUATION_RESET") ||
      typeof title !== "string" ||
      typeof body !== "string" ||
      (status !== "OPEN" && status !== "RESOLVED_APPROVE" && status !== "RESOLVED_REJECT") ||
      typeof createdAt !== "number"
    )
      continue;
    const resolvedAt = typeof o.resolvedAt === "number" ? o.resolvedAt : undefined;
    const resolutionNote = typeof o.resolutionNote === "string" ? o.resolutionNote : undefined;
    rows.push({
      id,
      accountId,
      clientUserId,
      type: typ,
      title,
      body,
      status,
      createdAt,
      resolvedAt,
      resolutionNote
    });
  }
  return rows.slice(-1200);
}

const dataDir = path.resolve(process.cwd(), "data");
const stateFile = path.join(dataDir, "state.json");

export class StateStore {
  private state: PlatformState;

  constructor() {
    this.state = this.load();
  }

  get(): PlatformState {
    return this.state;
  }

  update(mutator: (draft: PlatformState) => void): PlatformState {
    mutator(this.state);
    this.persist();
    return this.state;
  }

  persist(): void {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const payload = JSON.stringify(this.state, null, 2);
    const tmpFile = `${stateFile}.tmp-${process.pid}`;
    /**
     * Atomic write with retry. Windows occasionally returns EPERM / UNKNOWN
     * when AV scans the file during write — previously this killed the whole
     * API process. We now write to a sibling .tmp and rename over the target,
     * retrying a few times before giving up (state stays in memory either way).
     */
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        fs.writeFileSync(tmpFile, payload, "utf-8");
        fs.renameSync(tmpFile, stateFile);
        return;
      } catch (err) {
        lastErr = err;
        try {
          if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
        } catch {
          /* ignore tmp cleanup */
        }
        const ms = 60 + attempt * 120;
        const until = Date.now() + ms;
        while (Date.now() < until) {
          /* tight backoff — total < 1s across all attempts */
        }
      }
    }
    console.warn("[stateStore] persist failed after retries; in-memory state retained:", lastErr);
  }

  private load(): PlatformState {
    const defaults = createDefaultState();
    if (!fs.existsSync(stateFile)) return defaults;
    try {
      const raw = fs.readFileSync(stateFile, "utf-8");
      const parsed = JSON.parse(raw) as Partial<PlatformState>;
      const merged: PlatformState = {
        ...defaults,
        ...parsed,
        settings: { ...defaults.settings, ...(parsed.settings ?? {}) },
        progressByAccountId: mergeProgressByAccountId(
          defaults.progressByAccountId,
          parsed.progressByAccountId as Partial<Record<string, Partial<ChallengeProgress>>> | undefined
        ),
        prices: { ...defaults.prices, ...(parsed.prices ?? {}) },
        ledgerByAccountId: { ...defaults.ledgerByAccountId, ...(parsed.ledgerByAccountId ?? {}) },
        clientUsers: Array.isArray(parsed.clientUsers) ? parsed.clientUsers : defaults.clientUsers,
        clientProfilesByAccountId: {
          ...defaults.clientProfilesByAccountId,
          ...(parsed.clientProfilesByAccountId && typeof parsed.clientProfilesByAccountId === "object"
            ? parsed.clientProfilesByAccountId
            : {})
        },
        traders: Array.isArray(parsed.traders) ? parsed.traders : defaults.traders,
        kycCases: Array.isArray(parsed.kycCases) ? parsed.kycCases : defaults.kycCases,
        challengeTemplates:
          Array.isArray(parsed.challengeTemplates) && parsed.challengeTemplates.length > 0
            ? parsed.challengeTemplates
            : defaults.challengeTemplates,
        adminOperator:
          parsed.adminOperator &&
          typeof parsed.adminOperator === "object" &&
          typeof (parsed.adminOperator as { username?: string }).username === "string"
            ? { ...defaults.adminOperator, ...parsed.adminOperator }
            : defaults.adminOperator,
        adminPasswordResetRequests: Array.isArray(parsed.adminPasswordResetRequests)
          ? parsed.adminPasswordResetRequests
          : defaults.adminPasswordResetRequests,
        platformManagers: Array.isArray(parsed.platformManagers) ? parsed.platformManagers : defaults.platformManagers,
        managerCommissionLedger: Array.isArray(parsed.managerCommissionLedger)
          ? parsed.managerCommissionLedger
          : defaults.managerCommissionLedger,
        platformHouseCommissionAccruedUsd:
          typeof parsed.platformHouseCommissionAccruedUsd === "number"
            ? parsed.platformHouseCommissionAccruedUsd
            : defaults.platformHouseCommissionAccruedUsd,
        tradingConductByAccountId: mergeTradingConduct(
          defaults.tradingConductByAccountId,
          parsed.tradingConductByAccountId as Record<string, Partial<AccountTradingConduct>> | undefined
        ),
        globalRecentRiskEntries: mergeGlobalRiskEcho(parsed.globalRecentRiskEntries, defaults.globalRecentRiskEntries),
        supportTickets: mergeSupportTickets(parsed.supportTickets, defaults.supportTickets),
        terminalAccounts: mergeTerminalAccounts(parsed.terminalAccounts, defaults.terminalAccounts),
        nextTerminalLoginSeq:
          typeof parsed.nextTerminalLoginSeq === "number" && Number.isFinite(parsed.nextTerminalLoginSeq)
            ? Math.max(defaults.nextTerminalLoginSeq, parsed.nextTerminalLoginSeq)
            : defaults.nextTerminalLoginSeq
      };

      merged.orders = Array.isArray(parsed.orders) ? parsed.orders : defaults.orders;
      merged.positions = Array.isArray(parsed.positions) ? parsed.positions : defaults.positions;
      merged.account = parsed.account && typeof parsed.account === "object" ? { ...defaults.account, ...parsed.account } : merged.account;
      merged.violations = Array.isArray(parsed.violations) ? parsed.violations : defaults.violations;
      merged.payouts = Array.isArray(parsed.payouts) ? parsed.payouts : defaults.payouts;
      merged.auditEvents = Array.isArray(parsed.auditEvents) ? parsed.auditEvents : defaults.auditEvents;

      if (!merged.ledgerByAccountId[defaultAccountId] && merged.account) {
        merged.ledgerByAccountId[defaultAccountId] = { ...merged.account };
      }

      const templateIds = new Set(merged.challengeTemplates.map((t: ChallengeTemplate) => t.id));
      for (const t of defaults.challengeTemplates) {
        if (!templateIds.has(t.id)) {
          merged.challengeTemplates.push(t);
          templateIds.add(t.id);
        }
      }

      return merged;
    } catch {
      return defaults;
    }
  }
}
