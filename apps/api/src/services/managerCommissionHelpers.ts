import crypto from "node:crypto";
import type { ClientAuthUser, ManagerCommissionLedgerEntry, PlatformState } from "../domain";
import { PLATFORM_HOUSE_COMMISSION_MANAGER_ID } from "../domain";

const SIGNUP_BONUS_DEFAULT = 25;
/** Share of paid payout amount credited to referring partner (simulated prop-fee pass-through). */
export const PAYOUT_PARTNER_SHARE_RATE = 0.05;

export function normalizeReferralCodeInput(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw.trim().replace(/\s+/g, "").toUpperCase();
}

export function findManagerIdByReferralCode(state: PlatformState, code: string): string | undefined {
  const c = normalizeReferralCodeInput(code);
  if (!c) return undefined;
  const m = state.platformManagers.find((x) => normalizeReferralCodeInput(x.referralCode) === c);
  return m?.id;
}

export function appendManagerCommission(
  draft: PlatformState,
  row: Omit<ManagerCommissionLedgerEntry, "id" | "createdAt"> & { createdAt?: number }
): void {
  const entry: ManagerCommissionLedgerEntry = {
    id: crypto.randomUUID(),
    createdAt: row.createdAt ?? Date.now(),
    ...row
  };
  draft.managerCommissionLedger.unshift(entry);
  draft.managerCommissionLedger = draft.managerCommissionLedger.slice(0, 2000);
}

export function creditHouseForClientSignup(draft: PlatformState, clientUserId: string, clientAccountId: string): void {
  const bonus = SIGNUP_BONUS_DEFAULT;
  draft.platformHouseCommissionAccruedUsd = Number((draft.platformHouseCommissionAccruedUsd + bonus).toFixed(2));
  appendManagerCommission(draft, {
    managerId: PLATFORM_HOUSE_COMMISSION_MANAGER_ID,
    clientUserId,
    clientAccountId,
    type: "PLATFORM_REFERRAL_SIGNUP",
    amountUsd: bonus,
    note: "Platform pool — no valid partner referral on signup."
  });
}

export function creditManagerForClientSignup(draft: PlatformState, managerId: string, clientUserId: string, clientAccountId: string): void {
  const mgr = draft.platformManagers.find((m) => m.id === managerId);
  if (!mgr) return;
  const bonus = SIGNUP_BONUS_DEFAULT;
  mgr.accruedEarningsUsd = Number((mgr.accruedEarningsUsd + bonus).toFixed(2));
  appendManagerCommission(draft, {
    managerId,
    clientUserId,
    clientAccountId,
    type: "REFERRAL_SIGNUP",
    amountUsd: bonus,
    note: "Partner bonus on qualified referral signup (simulated)."
  });
}

function creditHouseForPaidPayout(draft: PlatformState, client: ClientAuthUser, payoutAmountUsd: number): void {
  const share = Number((payoutAmountUsd * PAYOUT_PARTNER_SHARE_RATE).toFixed(2));
  if (share <= 0) return;
  draft.platformHouseCommissionAccruedUsd = Number((draft.platformHouseCommissionAccruedUsd + share).toFixed(2));
  appendManagerCommission(draft, {
    managerId: PLATFORM_HOUSE_COMMISSION_MANAGER_ID,
    clientAccountId: client.accountId,
    clientUserId: client.id,
    type: "PLATFORM_PROP_FEE_SHARE",
    amountUsd: share,
    note: `Platform pool — simulated revenue share (${(PAYOUT_PARTNER_SHARE_RATE * 100).toFixed(1)}%) on trader payout (no valid partner referral).`
  });
}

export function creditManagerForPaidPayout(
  draft: PlatformState,
  clientAccountId: string,
  payoutAmountUsd: number
): void {
  const client = draft.clientUsers.find((u) => u.accountId === clientAccountId);
  if (!client || payoutAmountUsd <= 0) return;

  if (client.referredByHouseCommission) {
    creditHouseForPaidPayout(draft, client, payoutAmountUsd);
    return;
  }

  const mgrId = client.referredByManagerId;
  if (!mgrId) return;
  const mgr = draft.platformManagers.find((m) => m.id === mgrId);
  if (!mgr) return;
  const share = Number((payoutAmountUsd * PAYOUT_PARTNER_SHARE_RATE).toFixed(2));
  if (share <= 0) return;
  mgr.accruedEarningsUsd = Number((mgr.accruedEarningsUsd + share).toFixed(2));
  appendManagerCommission(draft, {
    managerId: mgrId,
    clientAccountId,
    clientUserId: client.id,
    type: "SIMULATED_PROP_FEE_SHARE",
    amountUsd: share,
    note: `Simulated revenue share (${(PAYOUT_PARTNER_SHARE_RATE * 100).toFixed(1)}%) on trader payout.`
  });
}
