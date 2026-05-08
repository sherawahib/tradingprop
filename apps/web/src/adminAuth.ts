import { API_BASE } from "./clientAuth";

export const OPS_SIGN_IN_HASH = "#/ops/sign-in";
export const OPS_CONSOLE_HASH = "#/ops/console";

const ADMIN_TOKEN_KEY = "propprime-admin-session";

export function persistAdminToken(token: string): void {
  try {
    sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function readAdminToken(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearAdminAuth(): void {
  try {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** Admin API calls (separate from client JWT). */
export function adminBearerHeaders(): Record<string, string> {
  const t = readAdminToken();
  const h: Record<string, string> = {};
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

export function adminJsonHeaders(): Record<string, string> {
  return { ...adminBearerHeaders(), "Content-Type": "application/json" };
}

export async function apiAdminLogin(username: string, password: string): Promise<{ token: string; username: string }> {
  const r = await fetch(`${API_BASE}/admin-auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const data = (await r.json()) as { token?: string; username?: string; error?: string };
  if (!r.ok) throw new Error(data.error ?? "Sign in failed.");
  if (!data.token || !data.username) throw new Error("Unexpected response.");
  return { token: data.token, username: data.username };
}

export function setOpsReturnView(view: "terminal" | "website"): void {
  try {
    sessionStorage.setItem("propprime-ops-return-view", view);
  } catch {
    /* ignore */
  }
}

export function takeOpsReturnView(): "terminal" | "website" {
  try {
    const v = sessionStorage.getItem("propprime-ops-return-view");
    sessionStorage.removeItem("propprime-ops-return-view");
    if (v === "terminal" || v === "website") return v;
  } catch {
    /* ignore */
  }
  return "website";
}

export type OpsParsed =
  | { surface: "sign-in" }
  | { surface: "pw-request" }
  | { surface: "pw-approve"; approvalToken: string | null }
  | { surface: "pw-set"; resetToken: string | null }
  | { surface: "console" };

export function parseOpsHash(): OpsParsed | null {
  try {
    const raw = window.location.hash.replace(/^#\/?/, "").trim();
    if (!raw.toLowerCase().startsWith("ops")) return null;
    const [pathPart, queryString] = raw.split("?");
    const segments = pathPart.split("/").map((s) => s.trim()).filter(Boolean);
    const q = new URLSearchParams(queryString ?? "");

    if (segments[0] !== "ops") return null;
    const key = `${segments[1] ?? ""}/${segments[2] ?? ""}`;
    if (segments[1] === "sign-in") return { surface: "sign-in" };
    if (key === "pw/request" || (segments[1] === "pw" && segments[2] === "request")) return { surface: "pw-request" };
    if (key === "pw/approve" || (segments[1] === "pw" && segments[2] === "approve"))
      return { surface: "pw-approve", approvalToken: q.get("token") };
    if (key === "pw/set" || (segments[1] === "pw" && segments[2] === "set"))
      return { surface: "pw-set", resetToken: q.get("token") };
    if (segments[1] === "console") return { surface: "console" };
  } catch {
    /* ignore */
  }
  return null;
}
