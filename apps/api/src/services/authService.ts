import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { ClientAuthUser } from "../domain";
import { defaultAccountId, emptyClientProfile } from "../domain";
import {
  creditHouseForClientSignup,
  creditManagerForClientSignup,
  findManagerIdByReferralCode
} from "./managerCommissionHelpers";
import type { StateStore } from "../db/stateStore";
import { signClientToken, verifyClientToken } from "../auth/tokens";
import type { TerminalAccountService } from "./terminalAccountService";

const DEMO_EMAIL = "client1@propprime.demo";
const DEMO_TERMINAL_LOGIN = "100000";
const DEMO_TERMINAL_PASSWORD = "terminal1234";

export type PublicClient = { id: string; email: string; fullName: string; accountId: string };

function toPublic(u: ClientAuthUser): PublicClient {
  return { id: u.id, email: u.email, fullName: u.fullName, accountId: u.accountId };
}

export class AuthService {
  constructor(
    private readonly store: StateStore,
    private readonly terminalAccountService: TerminalAccountService
  ) {}

  verifyToken(token: string): PublicClient | null {
    const v = verifyClientToken(token);
    if (!v) return null;
    const u = this.store.get().clientUsers.find((x) => x.id === v.userId);
    if (!u || u.accountId !== v.accountId) return null;
    return toPublic(u);
  }

  normalizeLoginEmail(raw: string): string {
    const t = raw.trim().toLowerCase();
    if (t.includes("@")) return t;
    return `${t}@propprime.demo`;
  }

  issueToken(u: ClientAuthUser): string {
    return signClientToken({ userId: u.id, accountId: u.accountId, email: u.email });
  }

  async ensureSeededDemoUser(): Promise<void> {
    const existing = this.store.get().clientUsers.find((u) => u.email === DEMO_EMAIL);
    let demoId = existing?.id;
    if (!existing) {
      const hash = await bcrypt.hash("pass1234", 10);
      demoId = crypto.randomUUID();
      this.store.update((s) => {
        s.clientUsers.push({
          id: demoId!,
          email: DEMO_EMAIL,
          passwordHash: hash,
          fullName: "Demo Client",
          accountId: defaultAccountId,
          createdAt: Date.now()
        });
        if (!s.clientProfilesByAccountId[defaultAccountId]) {
          s.clientProfilesByAccountId[defaultAccountId] = emptyClientProfile();
        }
      });
    }

    const existingDemoTerminal = this.store
      .get()
      .terminalAccounts.find((t) => t.login === DEMO_TERMINAL_LOGIN);
    if (!existingDemoTerminal && demoId) {
      await this.terminalAccountService.createForClient({
        ownerUserId: demoId,
        accountId: defaultAccountId,
        programSlug: "TWO_PHASE",
        packageLabel: "Demo Two-Phase · simulated $10k desk",
        overrideLogin: DEMO_TERMINAL_LOGIN,
        overridePassword: DEMO_TERMINAL_PASSWORD
      });
    } else if (existingDemoTerminal) {
      const stillMatches = await bcrypt.compare(DEMO_TERMINAL_PASSWORD, existingDemoTerminal.passwordHash);
      if (!stillMatches || existingDemoTerminal.status === "DISABLED") {
        const hash = await bcrypt.hash(DEMO_TERMINAL_PASSWORD, 10);
        this.store.update((s) => {
          const live = s.terminalAccounts.find((t) => t.login === DEMO_TERMINAL_LOGIN);
          if (!live) return;
          live.passwordHash = hash;
          live.status = "ACTIVE";
          live.mustChangePassword = false;
        });
      }
    }
  }

  /**
   * Register a new portal user. This ONLY creates the email/password identity
   * — no trading account, no ledger, no evaluation progress, no terminal
   * credentials. The trader must explicitly purchase one or more packages
   * from the portal (see POST /client/packages/purchase) and each purchase
   * provisions its own independent trading account with its own numeric
   * login + password for the desktop / web terminal.
   */
  async register(input: {
    email: string;
    password: string;
    fullName: string;
    referralCode?: string;
  }): Promise<
    | { ok: true; token: string; user: PublicClient }
    | { ok: false; error: string }
  > {
    const email = input.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Invalid email format." };
    if (input.password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };
    const name = input.fullName.trim();
    if (!name) return { ok: false, error: "Full name is required." };
    const s0 = this.store.get();
    if (s0.clientUsers.some((u) => u.email === email)) return { ok: false, error: "That email is already registered." };

    const referredByManagerId = findManagerIdByReferralCode(s0, input.referralCode ?? "");
    const referredByHouseCommission = !referredByManagerId;

    const id = crypto.randomUUID();
    const placeholderAccountId = `acct-${id.replace(/-/g, "").slice(0, 10)}`;
    const hash = await bcrypt.hash(input.password, 10);
    const now = Date.now();

    this.store.update((s) => {
      s.clientUsers.push({
        id,
        email,
        passwordHash: hash,
        fullName: name,
        accountId: placeholderAccountId,
        createdAt: now,
        ...(referredByManagerId ? { referredByManagerId } : {}),
        ...(referredByHouseCommission ? { referredByHouseCommission: true } : {})
      });
      s.clientProfilesByAccountId[placeholderAccountId] = emptyClientProfile();
      if (referredByManagerId) {
        creditManagerForClientSignup(s, referredByManagerId, id, placeholderAccountId);
      } else {
        creditHouseForClientSignup(s, id, placeholderAccountId);
      }
    });

    const u = this.store.get().clientUsers.find((x) => x.id === id)!;
    const token = this.issueToken(u);
    return { ok: true, token, user: toPublic(u) };
  }

  async login(emailInput: string, password: string): Promise<
    { ok: true; token: string; user: PublicClient } | { ok: false; error: string }
  > {
    const email = this.normalizeLoginEmail(emailInput);
    const u = this.store.get().clientUsers.find((x) => x.email === email);
    if (!u) return { ok: false, error: "Invalid email or password." };
    const match = await bcrypt.compare(password, u.passwordHash);
    if (!match) return { ok: false, error: "Invalid email or password." };
    const token = this.issueToken(u);
    return { ok: true, token, user: toPublic(u) };
  }
}
