import crypto from "node:crypto";
import type { PayoutRequest } from "@paper-trader/shared";
import { defaultAccountId } from "../domain";
import { StateStore } from "../db/stateStore";
import { creditManagerForPaidPayout } from "./managerCommissionHelpers";
import { ChallengeService } from "./challengeService";
import { ViolationService } from "./violationService";

const PAYOUT_CONSISTENCY_VIOLATION_COOLDOWN_MS = 5 * 60 * 1000;

export type RequestPayoutResult =
  | { payout: PayoutRequest; reject?: undefined }
  | { payout: null; reject?: { code: "PAYOUT_CONSISTENCY_BLOCKED"; message: string } };

export class PayoutService {
  constructor(
    private readonly store: StateStore,
    private readonly challenge: ChallengeService,
    private readonly violations: ViolationService
  ) {}

  list(): PayoutRequest[] {
    return this.store.get().payouts;
  }

  request(accountId = defaultAccountId): RequestPayoutResult {
    const state = this.store.get();
    const progress = state.progressByAccountId[accountId];
    if (!progress || progress.phase !== "FUNDED" || (progress.status !== "ACTIVE" && progress.status !== "PASSED"))
      return { payout: null };
    const trader = state.traders.find((t) => t.accountId === accountId);
    if (!trader || trader.kycStatus !== "APPROVED") return { payout: null };
    const currentOpen = state.payouts.find((p) => p.accountId === accountId && (p.status === "REQUESTED" || p.status === "UNDER_REVIEW"));
    if (currentOpen) return { payout: currentOpen };
    const ledger = state.ledgerByAccountId[accountId] ?? state.account;
    const template = state.challengeTemplates.find((t) => t.id === progress.templateId);
    const minProfitUsd = template?.payoutMinProfitUsd ?? 50;
    const profit = Math.max(0, ledger.balance - progress.phaseStartBalance);
    if (profit < minProfitUsd) return { payout: null };
    const cons = template ? this.challenge.getPayoutSingleDayConsistency(template, progress, profit) : { active: false as const };
    if (cons.active && !cons.passes) {
      const now = Date.now();
      const recent = state.violations.find(
        (v) =>
          v.accountId === accountId &&
          v.code === "PAYOUT_CONSISTENCY_BLOCKED" &&
          now - v.createdAt < PAYOUT_CONSISTENCY_VIOLATION_COOLDOWN_MS
      );
      if (!recent) {
        this.violations.add(
          accountId,
          "PAYOUT_CONSISTENCY_BLOCKED",
          "WARNING",
          "Payout request blocked: single-day realized profit share exceeds the program consistency cap vs cumulative gross (simulation).",
          {
            grossProfitUsd: cons.grossProfitUsd,
            maxSingleDayUsd: cons.maxSingleDayUsd,
            capUsd: cons.capUsd,
            consistencyPct: cons.pct,
            fundedPhaseStartMs: cons.fundedPhaseStartMs
          }
        );
      }
      return {
        payout: null,
        reject: {
          code: "PAYOUT_CONSISTENCY_BLOCKED",
          message: `Payout not available yet: your largest single UTC-day realized profit ($${cons.maxSingleDayUsd.toFixed(2)}) exceeds ${cons.pct}% of cumulative gross profit ($${cons.grossProfitUsd.toFixed(2)}); cap ≈ $${cons.capUsd.toFixed(2)}. Trade additional days to smooth distribution.`
        }
      };
    }
    const split = (template?.payoutSplitPct ?? 80) / 100;
    const payout: PayoutRequest = {
      id: crypto.randomUUID(),
      accountId,
      amount: Number((profit * split).toFixed(2)),
      status: "REQUESTED",
      requestedAt: Date.now()
    };
    this.store.update((s) => {
      s.payouts.unshift(payout);
    });
    return { payout };
  }

  review(payoutId: string, action: "approve" | "reject", note?: string): PayoutRequest | null {
    let result: PayoutRequest | null = null;
    this.store.update((s) => {
      const p = s.payouts.find((x) => x.id === payoutId);
      if (!p) return;
      p.status = action === "approve" ? "APPROVED" : "REJECTED";
      p.reviewedAt = Date.now();
      p.note = note;
      result = p;
    });
    return result;
  }

  markPaid(payoutId: string): PayoutRequest | null {
    let result: PayoutRequest | null = null;
    this.store.update((s) => {
      const p = s.payouts.find((x) => x.id === payoutId);
      if (!p) return;
      p.status = "PAID";
      p.paidAt = Date.now();
      creditManagerForPaidPayout(s, p.accountId, p.amount);
      result = p;
    });
    return result;
  }
}
