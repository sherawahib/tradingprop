import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { PlatformManagerRecord } from "../domain";
import type { StateStore } from "../db/stateStore";
import { signManagerToken } from "../auth/tokens";
import { findManagerIdByReferralCode, normalizeReferralCodeInput } from "./managerCommissionHelpers";

const DEMO_MANAGER_EMAIL = "partner@propprime.demo";
const DEMO_MANAGER_PASSWORD = "PartnerDemo2026!";

function generateReferralCode(state: { platformManagers: PlatformManagerRecord[] }): string {
  for (let i = 0; i < 20; i++) {
    const code = `PP-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    if (!state.platformManagers.some((m) => normalizeReferralCodeInput(m.referralCode) === code)) return code;
  }
  return `PP-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

export type PublicManager = {
  id: string;
  email: string;
  fullName: string;
  referralCode: string;
  parentManagerId: string | null;
  accruedEarningsUsd: number;
};

export class ManagerAuthService {
  constructor(private readonly store: StateStore) {}

  toPublic(m: PlatformManagerRecord): PublicManager {
    return {
      id: m.id,
      email: m.email,
      fullName: m.fullName,
      referralCode: m.referralCode,
      parentManagerId: m.parentManagerId ?? null,
      accruedEarningsUsd: m.accruedEarningsUsd
    };
  }

  async ensureDemoManager(): Promise<void> {
    const existing = this.store.get().platformManagers.find((m) => m.email === DEMO_MANAGER_EMAIL);
    if (!existing) {
      const id = crypto.randomUUID();
      const hash = await bcrypt.hash(DEMO_MANAGER_PASSWORD, 10);
      const code = generateReferralCode(this.store.get());
      const now = Date.now();
      this.store.update((s) => {
        s.platformManagers.push({
          id,
          email: DEMO_MANAGER_EMAIL,
          passwordHash: hash,
          fullName: "Demo Partner",
          referralCode: code,
          parentManagerId: null,
          createdAt: now,
          accruedEarningsUsd: 0
        });
      });
      return;
    }

    /**
     * Realign the demo partner's password to the documented credential on
     * every boot — same rationale as the admin operator. Without this, a
     * later password change would silently lock the user out of the partner
     * hub even though the login page still advertises the demo password.
     */
    const stillMatches = await bcrypt.compare(DEMO_MANAGER_PASSWORD, existing.passwordHash);
    if (!stillMatches) {
      const hash = await bcrypt.hash(DEMO_MANAGER_PASSWORD, 10);
      this.store.update((s) => {
        const live = s.platformManagers.find((m) => m.email === DEMO_MANAGER_EMAIL);
        if (live) live.passwordHash = hash;
      });
    }
  }

  async register(input: {
    email: string;
    password: string;
    fullName: string;
    uplineReferralCode?: string;
  }): Promise<{ ok: true; token: string; manager: PublicManager } | { ok: false; error: string }> {
    const email = input.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Invalid email format." };
    if (input.password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
    const name = input.fullName.trim();
    if (!name) return { ok: false, error: "Full name is required." };
    const s0 = this.store.get();
    if (s0.platformManagers.some((m) => m.email === email)) return { ok: false, error: "That email is already registered as a partner." };

    let parentId: string | null = null;
    const upCode = normalizeReferralCodeInput(input.uplineReferralCode);
    if (upCode) {
      const up = findManagerIdByReferralCode(s0, upCode);
      if (!up) return { ok: false, error: "Upline referral code was not found." };
      parentId = up;
    }

    const id = crypto.randomUUID();
    const referralCode = generateReferralCode(s0);
    const hash = await bcrypt.hash(input.password, 10);
    const now = Date.now();

    this.store.update((s) => {
      s.platformManagers.push({
        id,
        email,
        passwordHash: hash,
        fullName: name,
        referralCode,
        parentManagerId: parentId,
        createdAt: now,
        accruedEarningsUsd: 0
      });
    });

    const m = this.store.get().platformManagers.find((x) => x.id === id)!;
    return { ok: true, token: signManagerToken(m.id, m.email), manager: this.toPublic(m) };
  }

  async login(
    emailInput: string,
    password: string
  ): Promise<{ ok: true; token: string; manager: PublicManager } | { ok: false; error: string }> {
    const email = emailInput.trim().toLowerCase();
    const m = this.store.get().platformManagers.find((x) => x.email === email);
    if (!m) return { ok: false, error: "Invalid email or password." };
    const ok = await bcrypt.compare(password, m.passwordHash);
    if (!ok) return { ok: false, error: "Invalid email or password." };
    return { ok: true, token: signManagerToken(m.id, m.email), manager: this.toPublic(m) };
  }

  getDashboard(managerId: string): {
    manager: PublicManager;
    referrals: Array<{
      userId: string;
      email: string;
      fullName: string;
      accountId: string;
      joinedAt: number;
      kycStatus: string;
      accountStatus: string;
    }>;
    upline?: { fullName: string; referralCode: string } | null;
    downlineManagers: Array<{ fullName: string; referralCode: string; joinedAt: number }>;
    ledger: Array<{ id: string; type: string; amountUsd: number; note?: string; createdAt: number; clientAccountId?: string }>;
    referralSignupUrl: string;
  } | null {
    const s = this.store.get();
    const mgr = s.platformManagers.find((m) => m.id === managerId);
    if (!mgr) return null;

    const referrals = s.clientUsers
      .filter((u) => u.referredByManagerId === managerId)
      .map((u) => {
        const tr = s.traders.find((t) => t.accountId === u.accountId);
        return {
          userId: u.id,
          email: u.email,
          fullName: u.fullName,
          accountId: u.accountId,
          joinedAt: u.createdAt,
          kycStatus: tr?.kycStatus ?? "—",
          accountStatus: tr?.accountStatus ?? "—"
        };
      })
      .sort((a, b) => b.joinedAt - a.joinedAt);

    const upline =
      mgr.parentManagerId ? s.platformManagers.find((x) => x.id === mgr.parentManagerId) ?? null : null;

    const downlineManagers = s.platformManagers
      .filter((x) => x.parentManagerId === managerId)
      .map((x) => ({ fullName: x.fullName, referralCode: x.referralCode, joinedAt: x.createdAt }))
      .sort((a, b) => b.joinedAt - a.joinedAt);

    const ledger = s.managerCommissionLedger
      .filter((e) => e.managerId === managerId)
      .slice(0, 100)
      .map((e) => ({
        id: e.id,
        type: e.type,
        amountUsd: e.amountUsd,
        note: e.note,
        createdAt: e.createdAt,
        clientAccountId: e.clientAccountId
      }));

    const web = (process.env.PUBLIC_WEB_ORIGIN ?? "http://localhost:5173").replace(/\/$/, "");

    return {
      manager: this.toPublic(mgr),
      referrals,
      upline: upline ? { fullName: upline.fullName, referralCode: upline.referralCode } : null,
      downlineManagers,
      ledger,
      referralSignupUrl: `${web}/?ref=${encodeURIComponent(mgr.referralCode)}`
    };
  }
}
