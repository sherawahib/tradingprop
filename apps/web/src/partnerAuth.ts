import { API_BASE } from "./clientAuth";

export const PARTNER_SIGN_IN_HASH = "#/partner/sign-in";
export const PARTNER_REGISTER_HASH = "#/partner/register";
export const PARTNER_DASHBOARD_HASH = "#/partner/dashboard";

const MANAGER_TOKEN_KEY = "propprime-partner-session";
export const PENDING_REFERRAL_STORAGE_KEY = "propprime-pending-referral";

export function persistManagerToken(token: string): void {
  try {
    sessionStorage.setItem(MANAGER_TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function readManagerToken(): string | null {
  try {
    return sessionStorage.getItem(MANAGER_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearPartnerAuth(): void {
  try {
    sessionStorage.removeItem(MANAGER_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function partnerBearerHeaders(): Record<string, string> {
  const t = readManagerToken();
  const h: Record<string, string> = {};
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

export function partnerJsonHeaders(): Record<string, string> {
  return { ...partnerBearerHeaders(), "Content-Type": "application/json" };
}

export type PartnerParsed =
  | { surface: "sign-in" }
  | { surface: "register" }
  | { surface: "dashboard" };

export function parsePartnerHash(): PartnerParsed | null {
  try {
    const raw = window.location.hash.replace(/^#\/?/, "").trim().toLowerCase();
    if (!raw.startsWith("partner/")) return null;
    const segs = raw.split("/").map((s) => s.trim()).filter(Boolean);
    if (segs[0] !== "partner") return null;
    const page = segs[1] ?? "";
    if (page === "sign-in") return { surface: "sign-in" };
    if (page === "register") return { surface: "register" };
    if (page === "dashboard") return { surface: "dashboard" };
  } catch {
    /* ignore */
  }
  return null;
}

export type PartnerDashboardPayload = {
  manager: {
    id: string;
    email: string;
    fullName: string;
    referralCode: string;
    parentManagerId: string | null;
    accruedEarningsUsd: number;
  };
  referrals: Array<{
    userId: string;
    email: string;
    fullName: string;
    accountId: string;
    joinedAt: number;
    kycStatus: string;
    accountStatus: string;
  }>;
  upline: { fullName: string; referralCode: string } | null;
  downlineManagers: Array<{ fullName: string; referralCode: string; joinedAt: number }>;
  ledger: Array<{ id: string; type: string; amountUsd: number; note?: string; createdAt: number; clientAccountId?: string }>;
  referralSignupUrl: string;
};

export async function fetchPartnerDashboard(): Promise<PartnerDashboardPayload> {
  const r = await fetch(`${API_BASE}/partner/dashboard`, { headers: partnerBearerHeaders() });
  const data = (await r.json()) as PartnerDashboardPayload & { error?: string };
  if (!r.ok) throw new Error(data.error ?? "Could not load partner dashboard.");
  return data;
}
