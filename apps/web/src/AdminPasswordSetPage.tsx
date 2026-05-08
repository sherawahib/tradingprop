import { useState } from "react";
import { API_BASE } from "./clientAuth";
import { OPS_SIGN_IN_HASH } from "./adminAuth";

interface AdminPasswordSetPageProps {
  resetToken: string | null;
  onCompleted: () => void;
}

function AdminPasswordSetPage({ resetToken, onCompleted }: AdminPasswordSetPageProps) {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);

  async function submit(ev: React.FormEvent): Promise<void> {
    ev.preventDefault();
    setErr("");
    if (!resetToken?.trim()) {
      setErr("Missing token. Open the secure link from your email.");
      return;
    }
    if (p1.length < 10) {
      setErr("Use at least 10 characters.");
      return;
    }
    if (p1 !== p2) {
      setErr("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/admin-auth/password-reset/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToken, newPassword: p1 })
      });
      const data = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(data.error ?? "Could not save password.");
      setOk(true);
      window.location.hash = OPS_SIGN_IN_HASH;
      onCompleted();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed.");
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
              <h1 className="fxAuthBrandTitle" style={{ fontSize: "clamp(22px, 3.5vw, 34px)", marginTop: "4px" }}>
                Set new operator password
              </h1>
              <p className="fxAuthLead">Step 3 of 3 — use a strong passphrase; this replaces the credential used at operator sign-in.</p>
              {ok ? (
                <p className="fxOpsOkBanner">Password updated. Redirecting you to operator sign-in…</p>
              ) : (
                <form className="fxClientForm fxOpsAdminForm" onSubmit={submit}>
                  <label className="fxField">
                    <span className="fxFieldLabel">New password</span>
                    <span className="fxInputShell">
                      <input type="password" className="fxAuthInput" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} />
                    </span>
                  </label>
                  <label className="fxField">
                    <span className="fxFieldLabel">Confirm</span>
                    <span className="fxInputShell">
                      <input type="password" className="fxAuthInput" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} />
                    </span>
                  </label>
                  {err && (
                    <p className="fxAuthError" role="alert">
                      {err}
                    </p>
                  )}
                  <button type="submit" className="fxCtaFilled fxAuthSubmit" disabled={busy}>
                    {busy ? "Saving…" : "Save password"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default AdminPasswordSetPage;
