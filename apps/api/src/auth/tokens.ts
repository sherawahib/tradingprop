import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-insecure-propprime-change-me";
const TTL = "7d";

export type VerifiedToken = { userId: string; accountId: string; email: string };

export function signClientToken(payload: VerifiedToken): string {
  return jwt.sign({ sub: payload.userId, aid: payload.accountId, email: payload.email }, JWT_SECRET, { expiresIn: TTL });
}

export function verifyClientToken(token: string): VerifiedToken | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload & { aid?: string; email?: string; role?: string };
    if (decoded.role && decoded.role !== "client") return null;
    if (typeof decoded.sub !== "string" || !decoded.sub) return null;
    if (typeof decoded.aid !== "string" || !decoded.aid) return null;
    if (typeof decoded.email !== "string" || !decoded.email) return null;
    return { userId: decoded.sub, accountId: decoded.aid, email: decoded.email };
  } catch {
    return null;
  }
}

const TERMINAL_TTL = "30d";

export type VerifiedTerminalToken = {
  /** TerminalAccountRecord.id */
  terminalAccountId: string;
  /** Trading account id (PlatformState.ledgerByAccountId / progressByAccountId key). */
  accountId: string;
  /** ClientAuthUser.id who owns the package. */
  ownerUserId: string;
  /** Numeric login string used to sign in (e.g. "100001"). */
  login: string;
};

export function signTerminalToken(payload: VerifiedTerminalToken): string {
  return jwt.sign(
    {
      sub: payload.terminalAccountId,
      aid: payload.accountId,
      uid: payload.ownerUserId,
      login: payload.login,
      role: "terminal"
    },
    JWT_SECRET,
    { expiresIn: TERMINAL_TTL }
  );
}

export function verifyTerminalToken(token: string): VerifiedTerminalToken | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload & {
      role?: string;
      aid?: string;
      uid?: string;
      login?: string;
    };
    if (decoded.role !== "terminal") return null;
    if (typeof decoded.sub !== "string" || !decoded.sub) return null;
    if (typeof decoded.aid !== "string" || !decoded.aid) return null;
    if (typeof decoded.uid !== "string" || !decoded.uid) return null;
    if (typeof decoded.login !== "string" || !decoded.login) return null;
    return {
      terminalAccountId: decoded.sub,
      accountId: decoded.aid,
      ownerUserId: decoded.uid,
      login: decoded.login
    };
  } catch {
    return null;
  }
}

const ADMIN_TTL = "8h";

export type VerifiedAdmin = { username: string };

export function signAdminToken(username: string): string {
  return jwt.sign({ sub: username, role: "admin" }, JWT_SECRET, { expiresIn: ADMIN_TTL });
}

export function verifyAdminToken(token: string): VerifiedAdmin | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload & { role?: string };
    if (decoded.role !== "admin" || typeof decoded.sub !== "string" || !decoded.sub) return null;
    return { username: decoded.sub };
  } catch {
    return null;
  }
}

const MANAGER_TTL = "21d";

export type VerifiedManager = { managerId: string; email: string };

export function signManagerToken(managerId: string, email: string): string {
  return jwt.sign({ sub: managerId, email, role: "manager" }, JWT_SECRET, { expiresIn: MANAGER_TTL });
}

export function verifyManagerToken(token: string): VerifiedManager | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload & { role?: string; email?: string };
    if (decoded.role !== "manager" || typeof decoded.sub !== "string" || !decoded.sub) return null;
    if (typeof decoded.email !== "string" || !decoded.email) return null;
    return { managerId: decoded.sub, email: decoded.email };
  } catch {
    return null;
  }
}
