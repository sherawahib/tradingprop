/** Optional outbound email via [Resend](https://resend.com). Falls back to audit-only simulation. */

import type { AuditService } from "./auditService";

export class MailService {
  constructor(private readonly audit: AuditService) {}

  /**
   * Set `RESEND_API_KEY`, `MAIL_FROM`, and optionally `PUBLIC_WEB_ORIGIN` for operational emails.
   * Without RESEND_API_KEY, content is appended to audit as `email.simulated`.
   */
  async send(params: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<{ simulated: boolean }> {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.MAIL_FROM;
    if (key && from) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [params.to],
          subject: params.subject,
          text: params.text,
          ...(params.html ? { html: params.html } : {})
        })
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Mail send failed: ${res.status} ${err}`);
      }
      return { simulated: false };
    }

    this.audit.log(
      "email.simulated",
      { to: params.to, subject: params.subject, text: params.text },
      "mail_service"
    );
    console.info(`[mail] simulated → ${params.to}: ${params.subject}\n${params.text}`);
    return { simulated: true };
  }
}
