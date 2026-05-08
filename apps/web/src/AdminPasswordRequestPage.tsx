import { useState } from "react";
import { ArrowLeft, Mail } from "lucide-react";
import { API_BASE } from "./clientAuth";

interface AdminPasswordRequestPageProps {
  onBack: () => void;
}

function AdminPasswordRequestPage({ onBack }: AdminPasswordRequestPageProps) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [devLink, setDevLink] = useState("");

  async function submit(ev: React.FormEvent): Promise<void> {
    ev.preventDefault();
    setBusy(true);
    setErr("");
    setMsg("");
    setDevLink("");
    try {
      const r = await fetch(`${API_BASE}/admin-auth/password-reset/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() || undefined })
      });
      const data = (await r.json()) as { error?: string; devLinks?: { approveUrl: string }; mailSimulated?: boolean };
      if (!r.ok) throw new Error(data.error ?? "Request failed.");
      setMsg(
        data.mailSimulated
          ? "Request recorded. Email transport is not configured — use the development link below (also in API logs / audit trail)."
          : "Request sent. Check the operator inbox for an approval message."
      );
      if (data.devLinks?.approveUrl) setDevLink(data.devLinks.approveUrl);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fxRoot">
      <main className="fxSite">
        <section className="fxAuthSection fxOpsAuthSection">
          <div className="fxAuthCardWrap fxAuthWide">
            <div className="fxAuthCard fxAdminLoginCard">
              <p className="fxEyebrow fxEyebrowLight">Confidential</p>
              <h1 className="fxAuthBrandTitle" style={{ fontSize: "clamp(22px, 3.5vw, 34px)", marginTop: "4px" }}>
                Operator password change
              </h1>
              <p className="fxAuthLead">
                Step 1 of 3: this queues a password rotation. The operator email on file receives an approval link first; only after
                approval is a second link sent to choose a new password.
              </p>

              <form className="fxClientForm fxOpsAdminForm" onSubmit={submit}>
                <label className="fxField">
                  <span className="fxFieldLabel">
                    Context for approver <Mail size={13} aria-hidden="true" />
                  </span>
                  <textarea
                    className="fxClientTextarea"
                    rows={4}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Optional — e.g. quarterly rotation, device change, …"
                  />
                </label>
                {err && (
                  <p className="fxAuthError" role="alert">
                    {err}
                  </p>
                )}
                {msg && <p className="fxClientFormOk">{msg}</p>}
                {devLink && (
                  <p className="fxOpsDevLink">
                    <span className="fxOpsDevLinkLabel">Development / no-SMTP approval URL</span>
                    <code className="fxPortalCode fxOpsDevLinkCode">{devLink}</code>
                  </p>
                )}
                <button type="submit" className="fxCtaFilled fxAuthSubmit" disabled={busy}>
                  {busy ? "Submitting…" : "Send approval request"}
                </button>
              </form>

              <button type="button" className="fxCtaOutline fxAuthBackGhost" onClick={onBack}>
                <ArrowLeft size={14} aria-hidden="true" />
                Back to operator sign-in
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default AdminPasswordRequestPage;
