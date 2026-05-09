import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { StateStore } from "../db/stateStore";
import type { TerminalAccountRecord } from "../domain";
import { signTerminalToken } from "../auth/tokens";

/** Public summary returned to portal/desktop — never includes the password hash. */
export interface TerminalAccountSummary {
  id: string;
  login: string;
  ownerUserId: string;
  accountId: string;
  programSlug: string;
  packageLabel: string;
  mustChangePassword: boolean;
  createdAt: number;
  lastLoginAt?: number;
  status: "ACTIVE" | "DISABLED";
}

function toSummary(rec: TerminalAccountRecord): TerminalAccountSummary {
  return {
    id: rec.id,
    login: rec.login,
    ownerUserId: rec.ownerUserId,
    accountId: rec.accountId,
    programSlug: rec.programSlug,
    packageLabel: rec.packageLabel,
    mustChangePassword: rec.mustChangePassword,
    createdAt: rec.createdAt,
    lastLoginAt: rec.lastLoginAt,
    status: rec.status
  };
}

function generatePlaintextPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const groups: string[] = [];
  for (let g = 0; g < 4; g += 1) {
    let chunk = "";
    for (let i = 0; i < 3; i += 1) {
      const idx = crypto.randomInt(0, alphabet.length);
      chunk += alphabet[idx]!;
    }
    groups.push(chunk);
  }
  return groups.join("-");
}

/**
 * Cryptographically random 8-digit numeric login (10_000_000 - 99_999_999).
 *
 * Sequential logins (100001, 100002 ...) leak how many users you have, and
 * make per-user accounts trivially enumerable / guessable, which is a real
 * privacy + scraping risk. Random 8-digit logins live in a 90,000,000-wide
 * keyspace so even with 100k accounts you're at ~0.1% density and the next
 * login can't be derived from the previous one.
 */
function generateRandomNumericLogin(): string {
  return crypto.randomInt(10_000_000, 100_000_000).toString();
}

export class TerminalAccountService {
  constructor(private readonly store: StateStore) {}

  listForUser(ownerUserId: string): TerminalAccountSummary[] {
    return this.store
      .get()
      .terminalAccounts.filter((t) => t.ownerUserId === ownerUserId)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(toSummary);
  }

  getById(id: string): TerminalAccountRecord | null {
    return this.store.get().terminalAccounts.find((t) => t.id === id) ?? null;
  }

  findByLogin(login: string): TerminalAccountRecord | null {
    const norm = login.trim();
    if (!norm) return null;
    return this.store.get().terminalAccounts.find((t) => t.login === norm) ?? null;
  }

  async createForClient(input: {
    ownerUserId: string;
    accountId: string;
    programSlug: string;
    packageLabel: string;
    overrideLogin?: string;
    overridePassword?: string;
  }): Promise<{ summary: TerminalAccountSummary; initialPassword: string }> {
    const initialPassword = input.overridePassword ?? generatePlaintextPassword();
    const passwordHash = await bcrypt.hash(initialPassword, 10);
    const id = crypto.randomUUID();
    const now = Date.now();

    let createdRecord: TerminalAccountRecord | null = null;
    this.store.update((s) => {
      let login = input.overrideLogin?.trim() ?? "";
      if (!login || s.terminalAccounts.some((t) => t.login === login)) {
        let candidate = generateRandomNumericLogin();
        let attempts = 0;
        while (s.terminalAccounts.some((t) => t.login === candidate)) {
          candidate = generateRandomNumericLogin();
          attempts += 1;
          if (attempts > 64) {
            candidate = `${crypto.randomInt(100_000_000, 1_000_000_000)}`;
            if (!s.terminalAccounts.some((t) => t.login === candidate)) break;
            attempts = 0;
          }
        }
        login = candidate;
        s.nextTerminalLoginSeq = Math.max(s.nextTerminalLoginSeq, 100001) + 1;
      }
      const rec: TerminalAccountRecord = {
        id,
        login,
        passwordHash,
        ownerUserId: input.ownerUserId,
        accountId: input.accountId,
        programSlug: input.programSlug,
        packageLabel: input.packageLabel,
        mustChangePassword: input.overridePassword ? false : true,
        createdAt: now,
        status: "ACTIVE"
      };
      s.terminalAccounts.push(rec);
      createdRecord = rec;
    });

    if (!createdRecord) throw new Error("terminal account creation failed");
    return { summary: toSummary(createdRecord), initialPassword };
  }

  async login(loginInput: string, password: string): Promise<
    | { ok: true; token: string; terminal: TerminalAccountSummary }
    | { ok: false; error: string }
  > {
    const rec = this.findByLogin(loginInput);
    if (!rec) return { ok: false, error: "Invalid login or password." };
    if (rec.status === "DISABLED") return { ok: false, error: "This trading account is disabled." };
    const match = await bcrypt.compare(password, rec.passwordHash);
    if (!match) return { ok: false, error: "Invalid login or password." };

    this.store.update((s) => {
      const live = s.terminalAccounts.find((t) => t.id === rec.id);
      if (live) live.lastLoginAt = Date.now();
    });

    const token = signTerminalToken({
      terminalAccountId: rec.id,
      accountId: rec.accountId,
      ownerUserId: rec.ownerUserId,
      login: rec.login
    });
    const fresh = this.getById(rec.id);
    return { ok: true, token, terminal: toSummary(fresh ?? rec) };
  }

  async regeneratePassword(actorUserId: string, terminalAccountId: string): Promise<
    | { ok: true; password: string; terminal: TerminalAccountSummary }
    | { ok: false; status: number; error: string }
  > {
    const rec = this.getById(terminalAccountId);
    if (!rec) return { ok: false, status: 404, error: "Trading account not found." };
    if (rec.ownerUserId !== actorUserId)
      return { ok: false, status: 403, error: "You do not own this trading account." };

    const newPlain = generatePlaintextPassword();
    const hash = await bcrypt.hash(newPlain, 10);
    this.store.update((s) => {
      const live = s.terminalAccounts.find((t) => t.id === terminalAccountId);
      if (!live) return;
      live.passwordHash = hash;
      live.mustChangePassword = false;
    });
    const fresh = this.getById(terminalAccountId);
    return { ok: true, password: newPlain, terminal: toSummary(fresh ?? rec) };
  }

  async setPassword(actorUserId: string, terminalAccountId: string, newPassword: string): Promise<
    | { ok: true; terminal: TerminalAccountSummary }
    | { ok: false; status: number; error: string }
  > {
    if (newPassword.length < 8) return { ok: false, status: 400, error: "Password must be at least 8 characters." };
    const rec = this.getById(terminalAccountId);
    if (!rec) return { ok: false, status: 404, error: "Trading account not found." };
    if (rec.ownerUserId !== actorUserId)
      return { ok: false, status: 403, error: "You do not own this trading account." };
    const hash = await bcrypt.hash(newPassword, 10);
    this.store.update((s) => {
      const live = s.terminalAccounts.find((t) => t.id === terminalAccountId);
      if (!live) return;
      live.passwordHash = hash;
      live.mustChangePassword = false;
    });
    const fresh = this.getById(terminalAccountId);
    return { ok: true, terminal: toSummary(fresh ?? rec) };
  }

  async changeOwnPassword(
    terminalAccountId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<{ ok: true; terminal: TerminalAccountSummary } | { ok: false; status: number; error: string }> {
    if (newPassword.length < 8) return { ok: false, status: 400, error: "New password must be at least 8 characters." };
    if (currentPassword === newPassword)
      return { ok: false, status: 400, error: "New password must differ from the current one." };
    const rec = this.getById(terminalAccountId);
    if (!rec) return { ok: false, status: 404, error: "Trading account not found." };
    const match = await bcrypt.compare(currentPassword, rec.passwordHash);
    if (!match) return { ok: false, status: 401, error: "Current password is incorrect." };
    const hash = await bcrypt.hash(newPassword, 10);
    this.store.update((s) => {
      const live = s.terminalAccounts.find((t) => t.id === terminalAccountId);
      if (!live) return;
      live.passwordHash = hash;
      live.mustChangePassword = false;
    });
    const fresh = this.getById(terminalAccountId);
    return { ok: true, terminal: toSummary(fresh ?? rec) };
  }

  toSummary(rec: TerminalAccountRecord): TerminalAccountSummary {
    return toSummary(rec);
  }
}
