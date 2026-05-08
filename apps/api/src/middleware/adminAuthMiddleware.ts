import type { NextFunction, Request, Response } from "express";
import { verifyAdminToken } from "../auth/tokens";

export interface AdminAuthedRequest extends Request {
  adminUsername?: string;
}

export function requireAdminAuth(req: AdminAuthedRequest, res: Response, next: NextFunction): void {
  const raw = req.headers.authorization;
  if (!raw?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Admin session required." });
    return;
  }
  const v = verifyAdminToken(raw.slice(7));
  if (!v) {
    res.status(401).json({ error: "Invalid or expired operator session." });
    return;
  }
  req.adminUsername = v.username;
  next();
}
