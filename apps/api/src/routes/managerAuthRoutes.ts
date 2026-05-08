import type { Express } from "express";
import type { AppContext } from "../appContext";
import { findManagerIdByReferralCode, normalizeReferralCodeInput } from "../services/managerCommissionHelpers";
import { requireManagerAuth, type ManagerAuthedRequest } from "../middleware/managerAuthMiddleware";

export function registerManagerAuthRoutes(app: Express, ctx: AppContext): void {
  app.get("/partner/referral/check", (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const id = findManagerIdByReferralCode(ctx.store.get(), code);
    if (!id) return res.json({ valid: false });
    const m = ctx.store.get().platformManagers.find((x) => x.id === id);
    return res.json({ valid: true, referralCode: m?.referralCode ?? normalizeReferralCodeInput(code) });
  });

  app.post("/partner-auth/register", async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const fullName = typeof req.body?.fullName === "string" ? req.body.fullName : "";
    const uplineReferralCode =
      typeof req.body?.uplineReferralCode === "string" ? req.body.uplineReferralCode : undefined;
    const result = await ctx.managerAuthService.register({ email, password, fullName, uplineReferralCode });
    if (!result.ok) return res.status(400).json({ error: result.error });
    ctx.auditService.log("partner.registered", { managerId: result.manager.id }, result.manager.email);
    return res.status(201).json({ token: result.token, manager: result.manager });
  });

  app.post("/partner-auth/login", async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const result = await ctx.managerAuthService.login(email, password);
    if (!result.ok) return res.status(401).json({ error: result.error });
    ctx.auditService.log("partner.login", { managerId: result.manager.id }, result.manager.email);
    return res.json({ token: result.token, manager: result.manager });
  });

  app.get("/partner-auth/me", requireManagerAuth, (req, res) => {
    const a = req as ManagerAuthedRequest;
    const mgr = ctx.store.get().platformManagers.find((m) => m.id === a.managerId);
    if (!mgr) return res.status(404).json({ error: "Partner not found." });
    return res.json({ manager: ctx.managerAuthService.toPublic(mgr) });
  });

  app.get("/partner/dashboard", requireManagerAuth, (req, res) => {
    const a = req as ManagerAuthedRequest;
    const dash = ctx.managerAuthService.getDashboard(a.managerId!);
    if (!dash) return res.status(404).json({ error: "Partner not found." });
    return res.json(dash);
  });
}
