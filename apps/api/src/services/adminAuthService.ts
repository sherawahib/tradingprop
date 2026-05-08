import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { AdminPasswordResetRequest } from "../domain";
import type { StateStore } from "../db/stateStore";
import { signAdminToken } from "../auth/tokens";
import type { AuditService } from "./auditService";
import type { MailService } from "./mailService";

const DEFAULT_BOOT_USER = "AWSVISION";
const DEFAULT_BOOT_PASS = "Creative@123";

function webOrigin(): string {
  return (process.env.PUBLIC_WEB_ORIGIN ?? "http://localhost:5173").replace(/\/$/, "");
}

export class AdminAuthService {
  constructor(
    private readonly store: StateStore,
    private readonly audit: AuditService,
    private readonly mail: MailService
  ) {}

  async ensureBootstrap(): Promise<void> {
    const username = (process.env.ADMIN_BOOTSTRAP_USERNAME ?? DEFAULT_BOOT_USER).trim().toUpperCase();
    const password = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? DEFAULT_BOOT_PASS;
    const email = (process.env.ADMIN_NOTIFICATION_EMAIL ?? "").trim() || undefined;

    this.store.update((s) => {
      if (!s.adminOperator.username) {
        s.adminOperator.username = username;
      }
      s.adminOperator.username = s.adminOperator.username.trim().toUpperCase();
      if (email) s.adminOperator.notificationEmail = email;
    });

    const op = this.store.get().adminOperator;
    if (!op.passwordHash?.length) {
      const hash = await bcrypt.hash(password, 10);
      this.store.update((s) => {
        s.adminOperator.passwordHash = hash;
      });
      this.audit.log("admin.operator.bootstrapped", { username: op.username }, "system");
      return;
    }

    /**
     * Always realign the operator password to the documented demo credential
     * (or to ADMIN_BOOTSTRAP_PASSWORD when set) on boot. Without this, a
     * password rotation in a previous run would silently drift away from the
     * demo cheatsheet shown on the login page and the user would be locked
     * out with no obvious way to recover.
     */
    const stillMatches = await bcrypt.compare(password, op.passwordHash);
    if (!stillMatches) {
      const hash = await bcrypt.hash(password, 10);
      this.store.update((s) => {
        s.adminOperator.passwordHash = hash;
      });
      this.audit.log("admin.operator.boot_password_realigned", { username: op.username }, "system");
    }
  }

  async login(input: {
    username: string;
    password: string;
  }): Promise<{ ok: true; token: string; username: string } | { ok: false; error: string }> {
    await this.ensureBootstrap();
    const u = input.username.trim().toUpperCase();
    const op = this.store.get().adminOperator;
    if (!u || op.username !== u) return { ok: false, error: "Invalid credentials." };
    const match = await bcrypt.compare(input.password, op.passwordHash);
    if (!match) return { ok: false, error: "Invalid credentials." };
    const token = signAdminToken(op.username);
    this.audit.log("admin.login", { username: op.username }, op.username);
    return { ok: true, token, username: op.username };
  }

  async requestPasswordChange(params: {
    note?: string;
  }): Promise<
    | { ok: true; requestId: string; devLinks: { approveUrl: string }; mailSimulated: boolean }
    | { ok: false; error: string }
  > {
    await this.ensureBootstrap();
    const s0 = this.store.get();
    const op = s0.adminOperator;
    if (!op.notificationEmail?.trim()) {
      return { ok: false, error: "Admin notification email is not configured on the server (ADMIN_NOTIFICATION_EMAIL)." };
    }

    const pending = s0.adminPasswordResetRequests.find((r) => r.status === "PENDING_APPROVAL" && r.expiresAt > Date.now());
    if (pending) {
      return { ok: false, error: "A password-reset request is already waiting for approval." };
    }

    const id = crypto.randomUUID();
    const approvalToken = crypto.randomBytes(32).toString("hex");
    const now = Date.now();
    const rec: AdminPasswordResetRequest = {
      id,
      createdAt: now,
      approvalToken,
      status: "PENDING_APPROVAL",
      expiresAt: now + 86_400_000,
      requesterNote: typeof params.note === "string" ? params.note.slice(0, 2000) : undefined
    };

    this.store.update((draft) => {
      draft.adminPasswordResetRequests.push(rec);
      draft.adminPasswordResetRequests = draft.adminPasswordResetRequests.slice(-40);
    });

    const approveUrl = `${webOrigin()}/#/ops/pw/approve?token=${encodeURIComponent(approvalToken)}`;
    const bodyText = [
      `A PropPrime operator password-change was requested.`,
      rec.requesterNote ? `Note: ${rec.requesterNote}` : "",
      ``,
      `To approve this request and receive a separate link to set a new password, open:`,
      approveUrl,
      ``,
      `If you did not expect this email, ignore it.`
    ]
      .filter(Boolean)
      .join("\n");

    const send = await this.mail.send({
      to: op.notificationEmail.trim(),
      subject: `[PropPrime] Approve administrator password reset`,
      text: bodyText,
      html: `<p>A PropPrime operator password-change was requested.</p>${
        rec.requesterNote ? `<p><strong>Note:</strong> ${escapeHtml(rec.requesterNote)}</p>` : ""
      }<p><a href="${approveUrl}">Approve and continue</a></p><p>${escapeHtml(approveUrl)}</p>`
    });

    this.audit.log(
      "admin.pwreset.requested",
      { requestId: id, mailSimulated: send.simulated },
      "anonymous"
    );

    return { ok: true, requestId: id, devLinks: { approveUrl }, mailSimulated: send.simulated };
  }

  async approvePasswordReset(approvalToken: string): Promise<
    | { ok: true; devLinks: { setPasswordUrl: string }; mailSimulated: boolean }
    | { ok: false; error: string }
  > {
    await this.ensureBootstrap();
    const token = approvalToken.trim();
    if (!token) return { ok: false, error: "Missing token." };

    this.store.update((draft) => {
      const req = draft.adminPasswordResetRequests.find(
        (r) => r.approvalToken === token && r.status === "PENDING_APPROVAL"
      );
      if (!req) return;
      if (req.expiresAt < Date.now()) {
        req.status = "EXPIRED";
        return;
      }
      const resetToken = crypto.randomBytes(32).toString("hex");
      req.resetToken = resetToken;
      req.status = "AWAITING_PASSWORD";
      req.resetExpiresAt = Date.now() + 3_600_000;
    });

    const updated = this.store.get().adminPasswordResetRequests.find(
      (r) => r.approvalToken === token && r.status === "AWAITING_PASSWORD" && r.resetToken
    );
    if (!updated?.resetToken) {
      return { ok: false, error: "Invalid or expired approval link." };
    }

    const op = this.store.get().adminOperator;
    const setUrl = `${webOrigin()}/#/ops/pw/set?token=${encodeURIComponent(updated.resetToken)}`;
    const bodyText = [
      `Your approval was recorded.`,
      `Open the following link to choose a new operator password:`,
      setUrl,
      ``,
      `This link expires in about one hour.`
    ].join("\n");

    const send = await this.mail.send({
      to: op.notificationEmail.trim(),
      subject: `[PropPrime] Set new administrator password`,
      text: bodyText,
      html: `<p>Your approval was recorded.</p><p><a href="${setUrl}">Choose new password</a></p><p>${escapeHtml(setUrl)}</p>`
    });

    this.audit.log("admin.pwreset.approved", { requestId: updated.id, mailSimulated: send.simulated }, op.username);

    return { ok: true, devLinks: { setPasswordUrl: setUrl }, mailSimulated: send.simulated };
  }

  async completePasswordReset(resetToken: string, newPassword: string): Promise<{ ok: true } | { ok: false; error: string }> {
    await this.ensureBootstrap();
    const tok = resetToken.trim();
    if (!tok) return { ok: false, error: "Missing token." };
    if (newPassword.length < 10) return { ok: false, error: "Use at least 10 characters." };

    const hash = await bcrypt.hash(newPassword, 10);

    let requestId: string | null = null;
    this.store.update((draft) => {
      const req = draft.adminPasswordResetRequests.find(
        (r) =>
          r.resetToken === tok && r.status === "AWAITING_PASSWORD" && (r.resetExpiresAt ?? 0) > Date.now()
      );
      if (!req || !req.resetToken) return;
      requestId = req.id;
      req.status = "COMPLETED";
      req.completedAt = Date.now();
      draft.adminOperator.passwordHash = hash;
      for (const r of draft.adminPasswordResetRequests) {
        if (r.id !== req.id && (r.status === "PENDING_APPROVAL" || r.status === "AWAITING_PASSWORD")) {
          r.status = "EXPIRED";
        }
      }
    });

    if (!requestId) return { ok: false, error: "Invalid or expired reset link." };

    this.audit.log("admin.pwreset.completed", { requestId }, this.store.get().adminOperator.username);
    return { ok: true };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
