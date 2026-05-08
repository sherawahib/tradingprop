import type { NextFunction, Request, Response } from "express";
import { verifyManagerToken } from "../auth/tokens";

export interface ManagerAuthedRequest extends Request {
  managerId?: string;
  managerEmail?: string;
}

export function requireManagerAuth(req: ManagerAuthedRequest, res: Response, next: NextFunction): void {
  const raw = req.headers.authorization;
  if (!raw?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Partner session required." });
    return;
  }
  const v = verifyManagerToken(raw.slice(7));
  if (!v) {
    res.status(401).json({ error: "Invalid or expired partner session." });
    return;
  }
  req.managerId = v.managerId;
  req.managerEmail = v.email;
  next();
}
