import type { NextFunction, Request, Response } from "express";
import { verifyClientToken, verifyTerminalToken } from "../auth/tokens";

export interface AuthedRequest extends Request {
  actorUserId?: string;
  actorAccountId?: string;
  actorEmail?: string;
  /** When the bearer is a terminal token (per-package desktop login), the TerminalAccountRecord.id. */
  actorTerminalAccountId?: string;
  /** Bearer kind so handlers can distinguish portal vs terminal callers. */
  actorTokenKind?: "client" | "terminal";
}

function readBearer(req: AuthedRequest): string | null {
  const raw = req.headers.authorization;
  if (!raw?.startsWith("Bearer ")) return null;
  return raw.slice(7);
}

/**
 * Accepts EITHER a portal client token OR a per-package terminal token.
 * Trading endpoints (orders / positions / account) only need
 * `actorAccountId`, which is populated from whichever token was presented.
 */
export function optionalBearerAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const tok = readBearer(req);
  if (!tok) {
    next();
    return;
  }
  const client = verifyClientToken(tok);
  if (client) {
    req.actorUserId = client.userId;
    req.actorAccountId = client.accountId;
    req.actorEmail = client.email;
    req.actorTokenKind = "client";
    next();
    return;
  }
  const terminal = verifyTerminalToken(tok);
  if (terminal) {
    req.actorUserId = terminal.ownerUserId;
    req.actorAccountId = terminal.accountId;
    req.actorTerminalAccountId = terminal.terminalAccountId;
    req.actorTokenKind = "terminal";
  }
  next();
}

/** Portal-only — rejects terminal tokens (used for KYC / profile endpoints). */
export function requireBearerAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const tok = readBearer(req);
  if (!tok) {
    res.status(401).json({ error: "Missing Authorization bearer token." });
    return;
  }
  const decoded = verifyClientToken(tok);
  if (!decoded) {
    res.status(401).json({ error: "Invalid or expired token." });
    return;
  }
  req.actorUserId = decoded.userId;
  req.actorAccountId = decoded.accountId;
  req.actorEmail = decoded.email;
  req.actorTokenKind = "client";
  next();
}

/** Per-package terminal-only — used by /terminal/auth/me and change-password. */
export function requireTerminalAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const tok = readBearer(req);
  if (!tok) {
    res.status(401).json({ error: "Missing Authorization bearer token." });
    return;
  }
  const decoded = verifyTerminalToken(tok);
  if (!decoded) {
    res.status(401).json({ error: "Invalid or expired terminal token." });
    return;
  }
  req.actorUserId = decoded.ownerUserId;
  req.actorAccountId = decoded.accountId;
  req.actorTerminalAccountId = decoded.terminalAccountId;
  req.actorTokenKind = "terminal";
  next();
}
