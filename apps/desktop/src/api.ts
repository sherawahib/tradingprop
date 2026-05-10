import type {
  AccountState,
  ChallengeProgress,
  ForexSymbol,
  Order,
  OrderSide,
  OrderType,
  Position,
  PriceTick
} from "@paper-trader/shared";

export const API_BASE = "http://localhost:4000";
export const WS_BASE = "ws://localhost:4000";

const TOKEN_KEY = "propprime-desktop-terminal-token";

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

export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function persistToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore quota */
  }
}

export function clearAuth(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

function authHeaders(): Record<string, string> {
  const t = readToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function jsonHeaders(): Record<string, string> {
  return { ...authHeaders(), "Content-Type": "application/json" };
}

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`GET ${path} failed (${r.status})`);
  return (await r.json()) as T;
}

export async function apiTerminalLogin(
  login: string,
  password: string
): Promise<{ token: string; terminal: TerminalAccountSummary }> {
  const r = await fetch(`${API_BASE}/terminal/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: login.trim(), password })
  });
  const data = (await r.json().catch(() => ({}))) as {
    token?: string;
    terminal?: TerminalAccountSummary;
    error?: string;
  };
  if (!r.ok) throw new Error(data.error ?? "Sign in failed.");
  if (!data.token || !data.terminal) throw new Error("Unexpected server response.");
  return { token: data.token, terminal: data.terminal };
}

export async function apiTerminalMe(): Promise<TerminalAccountSummary> {
  const t = readToken();
  if (!t) throw new Error("No session.");
  const r = await fetch(`${API_BASE}/terminal/auth/me`, { headers: { Authorization: `Bearer ${t}` } });
  const data = (await r.json().catch(() => ({}))) as { terminal?: TerminalAccountSummary; error?: string };
  if (!r.ok) throw new Error(data.error ?? "Session invalid.");
  if (!data.terminal) throw new Error("Unexpected server response.");
  return data.terminal;
}

export async function apiTerminalChangePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ ok: boolean; error?: string; terminal?: TerminalAccountSummary }> {
  const r = await fetch(`${API_BASE}/terminal/auth/change-password`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ currentPassword, newPassword })
  });
  const data = (await r.json().catch(() => ({}))) as {
    ok?: boolean;
    terminal?: TerminalAccountSummary;
    error?: string;
  };
  if (!r.ok) return { ok: false, error: data.error ?? `Change password failed (${r.status})` };
  return { ok: true, terminal: data.terminal };
}

export const apiPrices = (): Promise<PriceTick[]> => getJson<PriceTick[]>("/prices");
export const apiPositions = (): Promise<Position[]> => getJson<Position[]>("/positions");
export const apiOrders = (): Promise<Order[]> => getJson<Order[]>("/orders");
export const apiAccount = (): Promise<AccountState> => getJson<AccountState>("/account");
export const apiChallengeProgress = (): Promise<ChallengeProgress | null> =>
  getJson<ChallengeProgress | null>("/challenge/progress").catch(() => null);

export interface HistoryCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export async function apiHistoryCandles(
  symbol: ForexSymbol,
  timeframe: string,
  limit = 1000
): Promise<HistoryCandle[]> {
  const r = await fetch(
    `${API_BASE}/history-candles?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(
      timeframe
    )}&limit=${limit}`
  );
  if (!r.ok) throw new Error(`history-candles failed (${r.status})`);
  return (await r.json()) as HistoryCandle[];
}

export interface PlaceOrderInput {
  symbol: ForexSymbol;
  side: OrderSide;
  type?: OrderType;
  lotSize?: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
}

export async function apiPlaceOrder(input: PlaceOrderInput): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(`${API_BASE}/orders`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(input)
  });
  const data = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) return { ok: false, error: data.error ?? `Order rejected (${r.status})` };
  return { ok: true };
}

export async function apiClosePosition(id: string, lotSize?: number): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(`${API_BASE}/positions/${encodeURIComponent(id)}/close`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ lotSize })
  });
  const data = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) return { ok: false, error: data.error ?? `Close failed (${r.status})` };
  return { ok: true };
}

export async function apiCancelOrder(id: string): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(`${API_BASE}/orders/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    headers: jsonHeaders()
  });
  const data = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) return { ok: false, error: data.error ?? `Cancel failed (${r.status})` };
  return { ok: true };
}

/** Only fields present in `patch` are updated; `null` clears SL/TP; omitted keys stay unchanged. */
export async function apiUpdatePosition(
  positionId: string,
  patch: Partial<{ stopLoss: number | null; takeProfit: number | null }>
): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(`${API_BASE}/positions/${encodeURIComponent(positionId)}`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(patch)
  });
  const data = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) return { ok: false, error: data.error ?? `Modify failed (${r.status})` };
  return { ok: true };
}
