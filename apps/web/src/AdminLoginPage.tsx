import { useState } from "react";
import { ArrowLeft, Lock, Shield } from "lucide-react";
import { OPS_CONSOLE_HASH, apiAdminLogin, persistAdminToken } from "./adminAuth";
import {
  DEMO_ADMIN_PASSWORD,
  DEMO_ADMIN_USERNAME,
  DEMO_PARTNER_EMAIL,
  DEMO_PARTNER_PASSWORD,
  DEMO_TRADER_LOGIN,
  DEMO_TRADER_PASSWORD,
  DEMO_URL_PARTNER_HUB
} from "./demoCredentials";

interface AdminLoginPageProps {
  onBack: () => void;
  /** After successful JWT issue */
  onSignedIn: () => void;
}

function AdminLoginPage({ onBack, onSignedIn }: AdminLoginPageProps) {
  /**
   * Prefill with the demo creds documented in the cheatsheet below so
   * operators can land on this page and sign in with one click. The API
   * accepts the case-insensitive username and re-aligns the password on
   * every boot, so these values are guaranteed to work in dev.
   */
  const [username, setUsername] = useState(DEMO_ADMIN_USERNAME);
  const [password, setPassword] = useState(DEMO_ADMIN_PASSWORD);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(ev: React.FormEvent): Promise<void> {
    ev.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { token } = await apiAdminLogin(username, password);
      persistAdminToken(token);
      window.location.hash = OPS_CONSOLE_HASH;
      onSignedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fxRoot">
      <div className="fxAnnBar">
        <div className="fxAnnInner">
          <span className="fxAnnTag">Secure</span>
          <span className="fxAnnText">Operator workspace — trader sessions cannot access this area.</span>
        </div>
      </div>
      <header className="fxShellNav">
        <div className="fxShellNavInner">
          <button type="button" className="fxLogoBtn" onClick={onBack}>
            <div className="fxLogoRow">
              <span className="fxLogoMark" aria-hidden="true" />
              <strong className="fxLogoWord">PropPrime</strong>
            </div>
          </button>
          <nav className="fxNavCenter" aria-label="Operator">
            <span className="fxNavLink fxOpsNavMuted">Operator sign-in</span>
          </nav>
        </div>
      </header>

      <main className="fxSite">
        <section className="fxAuthSection fxOpsAuthSection">
          <div className="fxAuthCardWrap fxAuthWide">
            <div className="fxAuthCard fxAdminLoginCard">
              <div className="fxOpsLoginHead">
                <Shield size={22} aria-hidden="true" className="fxOpsLoginIcon" />
                <div>
                  <p className="fxEyebrow fxEyebrowLight">Restricted</p>
                  <h1 className="fxAuthBrandTitle" style={{ fontSize: "clamp(22px, 3.5vw, 32px)" }}>
                    Risk &amp; operations
                  </h1>
                  <p className="fxAuthLead">
                    Administrator credentials — not linked to trader sign-in. Default operator user can be overridden with{" "}
                    <code className="fxPortalCode" style={{ fontSize: "12px" }}>ADMIN_BOOTSTRAP_*</code> on the API.
                  </p>
                </div>
              </div>

              <div className="fxAuthDemoCreds" role="note">
                <p className="fxAuthDemoCredsTitle">Demo sign-in cheatsheet</p>
                <ul className="fxAuthDemoCredsList">
                  <li>
                    <strong>Operator (this page)</strong> — <kbd className="fxKbd">{DEMO_ADMIN_USERNAME}</kbd> /{" "}
                    <kbd className="fxKbd">{DEMO_ADMIN_PASSWORD}</kbd>
                  </li>
                  <li>
                    <strong>Trader portal</strong> — <kbd className="fxKbd">{DEMO_TRADER_LOGIN}</kbd> /{" "}
                    <kbd className="fxKbd">{DEMO_TRADER_PASSWORD}</kbd>
                  </li>
                  <li>
                    <strong>Partner hub</strong> — <kbd className="fxKbd">{DEMO_PARTNER_EMAIL}</kbd> /{" "}
                    <kbd className="fxKbd">{DEMO_PARTNER_PASSWORD}</kbd> ({DEMO_URL_PARTNER_HUB})
                  </li>
                </ul>
              </div>

              <form className="fxClientForm fxOpsAdminForm" onSubmit={submit}>
                <label className="fxField">
                  <span className="fxFieldLabel">Username</span>
                  <span className="fxInputShell">
                    <input className="fxAuthInput" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
                  </span>
                </label>
                <label className="fxField">
                  <span className="fxFieldLabel">
                    Password <Lock size={13} aria-hidden="true" className="fxAuthInlineIcon" />
                  </span>
                  <span className="fxInputShell">
                    <input type="password" className="fxAuthInput" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  </span>
                </label>
                {error && (
                  <p className="fxAuthError" role="alert">
                    {error}
                  </p>
                )}
                <button type="submit" className="fxCtaFilled fxAuthSubmit" disabled={busy}>
                  {busy ? "Signing in…" : "Sign in"}
                </button>
              </form>

              <p className="fxOpsLoginFootMuted">
                Need to rotate the operator password? Use the confidential{" "}
                <a href="#/ops/pw/request" className="fxLinkBtn fxOpsInlineLink">
                  email approval flow
                </a>
                .
              </p>

              <button type="button" className="fxCtaOutline fxAuthBackGhost" onClick={onBack}>
                <ArrowLeft size={14} aria-hidden="true" />
                Back to site / terminal context
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default AdminLoginPage;
