export const API_BASE = "http://localhost:4000";

const TOKEN_SESSION = "propprime-session-token";
const TOKEN_LOCAL = "propprime-token";

/**
 * Terminal-side credentials are kept in their OWN storage keys so that a portal
 * email/password session never leaks into the trading terminal (and vice versa).
 * The terminal expects a numeric login + per-package password and produces a
 * separate JWT (role: "terminal") that is the only thing accepted by the
 * trading-terminal endpoints. Per product requirement: the terminal cannot be
 * entered with a portal token.
 */
const TERMINAL_TOKEN_SESSION = "propprime-terminal-session-token";
const TERMINAL_TOKEN_LOCAL = "propprime-terminal-token";

export type AuthUser = { id: string; email: string; fullName: string; accountId: string };

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

export interface InitialTerminalCredentials {
  login: string;
  initialPassword: string;
  terminalAccountId: string;
  packageLabel: string;
}

/** Banner-handoff: register flow stashes here, ClientPortal pops + displays once. */
export const FRESH_TERMINAL_CREDS_KEY = "propprime-fresh-terminal-creds";

export function stashFreshTerminalCreds(creds: InitialTerminalCredentials): void {
  try {
    sessionStorage.setItem(FRESH_TERMINAL_CREDS_KEY, JSON.stringify(creds));
  } catch {
    /* ignore */
  }
}

export function takeFreshTerminalCreds(): InitialTerminalCredentials | null {
  try {
    const raw = sessionStorage.getItem(FRESH_TERMINAL_CREDS_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(FRESH_TERMINAL_CREDS_KEY);
    return JSON.parse(raw) as InitialTerminalCredentials;
  } catch {
    return null;
  }
}

export function persistToken(token: string, rememberDevice: boolean): void {
  try {
    sessionStorage.removeItem(TOKEN_SESSION);
    localStorage.removeItem(TOKEN_LOCAL);
    if (rememberDevice) localStorage.setItem(TOKEN_LOCAL, token);
    else sessionStorage.setItem(TOKEN_SESSION, token);
  } catch {
    /* ignore quota */
  }
}

export function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_SESSION) ?? localStorage.getItem(TOKEN_LOCAL);
  } catch {
    return null;
  }
}

export function clearAuth(): void {
  try {
    sessionStorage.removeItem(TOKEN_SESSION);
    localStorage.removeItem(TOKEN_LOCAL);
    localStorage.removeItem("client-auth");
    sessionStorage.removeItem("client-auth-session");
  } catch {
    /* ignore */
  }
}

/** Authorization only (GET requests). */
export function bearerHeaders(): Record<string, string> {
  const t = readToken();
  const h: Record<string, string> = {};
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

export function jsonAuthHeaders(): Record<string, string> {
  return { ...bearerHeaders(), "Content-Type": "application/json" };
}

export async function apiLogin(login: string, password: string): Promise<{ token: string; user: AuthUser }> {
  const r = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, password })
  });
  const data = (await r.json()) as { token?: string; user?: AuthUser; error?: string };
  if (!r.ok) throw new Error(data.error ?? "Sign in failed.");
  if (!data.token || !data.user) throw new Error("Unexpected server response.");
  return { token: data.token, user: data.user };
}

export async function apiRegister(
  email: string,
  password: string,
  fullName: string,
  referralCode?: string
): Promise<{ token: string; user: AuthUser }> {
  const r = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      fullName,
      referralCode: referralCode?.trim() || undefined
    })
  });
  const data = (await r.json()) as { token?: string; user?: AuthUser; error?: string };
  if (!r.ok) throw new Error(data.error ?? "Registration failed.");
  if (!data.token || !data.user) throw new Error("Unexpected server response.");
  return { token: data.token, user: data.user };
}

export async function apiMe(): Promise<AuthUser> {
  const t = readToken();
  if (!t) throw new Error("No session.");
  const r = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${t}` } });
  const data = (await r.json()) as { user?: AuthUser; error?: string };
  if (!r.ok) throw new Error(data.error ?? "Session invalid.");
  if (!data.user) throw new Error("Unexpected server response.");
  return data.user;
}

export async function apiListTerminalAccounts(): Promise<TerminalAccountSummary[]> {
  const r = await fetch(`${API_BASE}/client/terminal-accounts`, { headers: bearerHeaders() });
  if (!r.ok) {
    const data = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Failed to list trading accounts (${r.status}).`);
  }
  return (await r.json()) as TerminalAccountSummary[];
}

export async function apiRegenerateTerminalPassword(
  terminalAccountId: string
): Promise<{ password: string; terminal: TerminalAccountSummary }> {
  const r = await fetch(
    `${API_BASE}/client/terminal-accounts/${encodeURIComponent(terminalAccountId)}/regenerate-password`,
    { method: "POST", headers: jsonAuthHeaders() }
  );
  const data = (await r.json().catch(() => ({}))) as {
    password?: string;
    terminal?: TerminalAccountSummary;
    error?: string;
  };
  if (!r.ok || !data.password || !data.terminal) {
    throw new Error(data.error ?? "Failed to reset password.");
  }
  return { password: data.password, terminal: data.terminal };
}

export type PackageProgramFamily =
  | "ONE_PHASE"
  | "TWO_PHASE"
  | "THREE_PHASE"
  | "INSTANT_FUNDING"
  | "LIGHTNING"
  | "HEURISTIC";

export interface PackageCatalogEntry {
  slug: string;
  templateId: string;
  simulatedBalanceUsd: number;
  packageTypeLabel: string;
  /** Sticker price (USD) shown on the checkout — simulated billing only. */
  priceUsd: number;
  /** Short marketing tagline rendered on the catalog card. */
  tagline?: string | null;
  instantFundedPassthrough: boolean;
  /** Visual grouping in the portal catalog. May be absent on legacy SKUs. */
  family?: PackageProgramFamily | null;
}

export async function apiListPackageCatalog(): Promise<PackageCatalogEntry[]> {
  const r = await fetch(`${API_BASE}/client/packages/catalog`, { headers: bearerHeaders() });
  if (!r.ok) {
    const data = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Failed to load package catalog (${r.status}).`);
  }
  return (await r.json()) as PackageCatalogEntry[];
}

/** One purchased package on the portal dashboard — ledger + challenge row for that terminal login. */
export interface PackageDashboardSummary {
  terminalAccountId: string;
  login: string;
  packageLabel: string;
  programSlug: string;
  accountId: string;
  balance: number;
  equity: number;
  freeMargin: number;
  leverage: number;
  openPositions: number;
  pendingOrders: number;
  phase: string;
  challengeStatus: string;
  tradingDays: number;
  qualifyingTradingDays?: number;
  evaluationCalendarDaysElapsed?: number;
  programName?: string;
  payoutSplitPct?: number;
  payoutMinProfitUsd?: number;
  ledgerProfitUsd?: number;
  payoutEligibleApprox?: boolean;
}

export async function apiListPackageDashboardSummaries(): Promise<PackageDashboardSummary[]> {
  const r = await fetch(`${API_BASE}/client/packages/dashboard-summaries`, { headers: bearerHeaders() });
  if (!r.ok) {
    const data = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Failed to load package dashboards (${r.status}).`);
  }
  return (await r.json()) as PackageDashboardSummary[];
}

export async function apiPurchasePackage(programSlug: string): Promise<{
  accountId: string;
  terminal: TerminalAccountSummary;
  initialTerminal: InitialTerminalCredentials;
}> {
  const r = await fetch(`${API_BASE}/client/packages/purchase`, {
    method: "POST",
    headers: jsonAuthHeaders(),
    body: JSON.stringify({ programSlug })
  });
  const data = (await r.json().catch(() => ({}))) as {
    accountId?: string;
    terminal?: TerminalAccountSummary;
    initialTerminal?: InitialTerminalCredentials;
    error?: string;
  };
  if (!r.ok || !data.accountId || !data.terminal || !data.initialTerminal) {
    throw new Error(data.error ?? "Could not purchase package.");
  }
  return {
    accountId: data.accountId,
    terminal: data.terminal,
    initialTerminal: data.initialTerminal
  };
}

export async function apiSetTerminalPassword(
  terminalAccountId: string,
  newPassword: string
): Promise<{ terminal: TerminalAccountSummary }> {
  const r = await fetch(
    `${API_BASE}/client/terminal-accounts/${encodeURIComponent(terminalAccountId)}/set-password`,
    {
      method: "POST",
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ newPassword })
    }
  );
  const data = (await r.json().catch(() => ({}))) as { terminal?: TerminalAccountSummary; error?: string };
  if (!r.ok || !data.terminal) {
    throw new Error(data.error ?? "Failed to set password.");
  }
  return { terminal: data.terminal };
}

// -----------------------------------------------------------------------------
// Trading-terminal authentication (numeric login + per-package password).
// These helpers manage a *separate* token in a *separate* storage key so that
// the portal token can never be used to access the trading terminal.
// -----------------------------------------------------------------------------

export function persistTerminalToken(token: string, rememberDevice: boolean): void {
  try {
    sessionStorage.removeItem(TERMINAL_TOKEN_SESSION);
    localStorage.removeItem(TERMINAL_TOKEN_LOCAL);
    if (rememberDevice) localStorage.setItem(TERMINAL_TOKEN_LOCAL, token);
    else sessionStorage.setItem(TERMINAL_TOKEN_SESSION, token);
  } catch {
    /* ignore quota */
  }
}

export function readTerminalToken(): string | null {
  try {
    return (
      sessionStorage.getItem(TERMINAL_TOKEN_SESSION) ?? localStorage.getItem(TERMINAL_TOKEN_LOCAL)
    );
  } catch {
    return null;
  }
}

export function clearTerminalAuth(): void {
  try {
    sessionStorage.removeItem(TERMINAL_TOKEN_SESSION);
    localStorage.removeItem(TERMINAL_TOKEN_LOCAL);
  } catch {
    /* ignore */
  }
}

export function terminalBearerHeaders(): Record<string, string> {
  const t = readTerminalToken();
  const h: Record<string, string> = {};
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

export function terminalJsonAuthHeaders(): Record<string, string> {
  return { ...terminalBearerHeaders(), "Content-Type": "application/json" };
}

export async function apiTerminalLogin(
  login: string,
  password: string
): Promise<{ token: string; terminal: TerminalAccountSummary }> {
  const r = await fetch(`${API_BASE}/terminal/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, password })
  });
  const data = (await r.json().catch(() => ({}))) as {
    token?: string;
    terminal?: TerminalAccountSummary;
    error?: string;
  };
  if (!r.ok || !data.token || !data.terminal) {
    throw new Error(data.error ?? "Sign in failed.");
  }
  return { token: data.token, terminal: data.terminal };
}

export async function apiTerminalMe(): Promise<TerminalAccountSummary> {
  const r = await fetch(`${API_BASE}/terminal/auth/me`, { headers: terminalBearerHeaders() });
  const data = (await r.json().catch(() => ({}))) as { terminal?: TerminalAccountSummary; error?: string };
  if (!r.ok || !data.terminal) {
    throw new Error(data.error ?? "Terminal session expired.");
  }
  return data.terminal;
}

export async function apiTerminalChangeOwnPassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const r = await fetch(`${API_BASE}/terminal/auth/change-password`, {
    method: "POST",
    headers: terminalJsonAuthHeaders(),
    body: JSON.stringify({ currentPassword, newPassword })
  });
  if (!r.ok) {
    const data = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Failed to change password.");
  }
}
