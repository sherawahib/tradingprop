import type { Express } from "express";
import type { AppContext } from "../appContext";
import { verifyAdminToken } from "../auth/tokens";
import { requireAdminAuth, type AdminAuthedRequest } from "../middleware/adminAuthMiddleware";

export function registerAdminAuthRoutes(app: Express, ctx: AppContext): void {
  app.post("/admin-auth/login", async (req, res) => {
    await ctx.adminAuthService.ensureBootstrap();
    const username = typeof req.body?.username === "string" ? req.body.username : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const result = await ctx.adminAuthService.login({ username, password });
    if (!result.ok) return res.status(401).json({ error: result.error });
    return res.json({ token: result.token, username: result.username });
  });

  app.get("/admin-auth/me", requireAdminAuth, (req, res) => {
    const a = req as AdminAuthedRequest;
    return res.json({ username: a.adminUsername });
  });

  app.post("/admin-auth/logout", requireAdminAuth, (_req, res) => res.json({ ok: true }));

  app.post("/admin-auth/password-reset/request", async (req, res) => {
    const note = typeof req.body?.note === "string" ? req.body.note : undefined;
    const result = await ctx.adminAuthService.requestPasswordChange({ note });
    if (!result.ok) return res.status(400).json({ error: result.error });
    return res.status(202).json({
      requestId: result.requestId,
      devLinks: result.devLinks,
      mailSimulated: result.mailSimulated
    });
  });

  app.post("/admin-auth/password-reset/approve", async (req, res) => {
    const token = typeof req.body?.approvalToken === "string" ? req.body.approvalToken : "";
    const result = await ctx.adminAuthService.approvePasswordReset(token);
    if (!result.ok) return res.status(400).json({ error: result.error });
    return res.json({ ok: true, devLinks: result.devLinks, mailSimulated: result.mailSimulated });
  });

  app.post("/admin-auth/password-reset/complete", async (req, res) => {
    const resetToken =
      typeof req.body?.resetToken === "string"
        ? req.body.resetToken
        : "";
    const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    const result = await ctx.adminAuthService.completePasswordReset(resetToken, newPassword);
    if (!result.ok) return res.status(400).json({ error: result.error });
    return res.json({ ok: true });
  });

  app.get("/admin-auth/token-check", (req, res) => {
    const raw = req.headers.authorization;
    if (!raw?.startsWith("Bearer ")) return res.status(401).json({ ok: false });
    const v = verifyAdminToken(raw.slice(7));
    if (!v) return res.status(401).json({ ok: false });
    return res.json({ ok: true, username: v.username });
  });
}
