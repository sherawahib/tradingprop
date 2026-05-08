import type { Express } from "express";
import type { AuthService } from "../services/authService";
import { requireBearerAuth } from "../middleware/authMiddleware";

export function registerAuthRoutes(app: Express, auth: AuthService): void {
  app.post("/auth/register", async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const fullName = typeof req.body?.fullName === "string" ? req.body.fullName : "";
    const referralCode = typeof req.body?.referralCode === "string" ? req.body.referralCode : undefined;
    const result = await auth.register({ email, password, fullName, referralCode });
    if (!result.ok) return res.status(400).json({ error: result.error });
    return res.status(201).json({ token: result.token, user: result.user });
  });

  app.post("/auth/login", async (req, res) => {
    const login = typeof req.body?.login === "string" ? req.body.login : typeof req.body?.email === "string" ? req.body.email : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!login.trim() || !password) return res.status(400).json({ error: "Login and password are required." });
    const result = await auth.login(login, password);
    if (!result.ok) return res.status(401).json({ error: result.error });
    return res.json({ token: result.token, user: result.user });
  });

  app.get("/auth/me", requireBearerAuth, (req, res) => {
    const raw = req.headers.authorization!.slice(7);
    const user = auth.verifyToken(raw);
    if (!user) return res.status(401).json({ error: "Invalid token." });
    return res.json({ user });
  });

  app.post("/auth/logout", requireBearerAuth, (_req, res) => {
    return res.json({ ok: true });
  });
}
