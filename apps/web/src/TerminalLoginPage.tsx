import { useState } from "react";
import { ArrowLeft, KeyRound, ShieldCheck } from "lucide-react";

export interface TerminalLoginPageProps {
  /** Submitted by the form. Throws on auth failure. */
  onSignIn: (login: string, password: string, rememberDevice: boolean) => Promise<void>;
  /** Returns user to the previous view (portal or marketing site). */
  onBack: () => void;
  /** True when the trader still has an active portal session — shown as a hint. */
  hasPortalSession: boolean;
}

/**
 * Standalone sign-in page for the trading terminal. Accepts a numeric login
 * and per-package password ONLY — portal email/password is rejected by design.
 * Each purchased package has its own login number, surfaced in the client
 * portal's "Trading accounts" tab.
 */
function TerminalLoginPage({ onSignIn, onBack, hasPortalSession }: TerminalLoginPageProps): JSX.Element {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(): Promise<void> {
    setError("");
    const trimmed = login.trim();
    if (!/^\d+$/.test(trimmed)) {
      setError("Trading account login is numeric — see your portal.");
      return;
    }
    if (!password) {
      setError("Enter the password for this trading account.");
      return;
    }
    setBusy(true);
    try {
      await onSignIn(trimmed, password, remember);
      setError("");
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
          <span className="fxAnnTag">Terminal</span>
          <span className="fxAnnText">
            Each package has its own numeric login &amp; password — portal email/password is not accepted here.
          </span>
          <button type="button" className="fxAnnCta" onClick={onBack}>← Back</button>
        </div>
      </div>

      <main className="fxSite">
        <section className="fxAuthSection">
          <div className="fxAuthGrid">
            <div className="fxAuthBrand">
              <p className="fxEyebrow">Trading terminal</p>
              <h1 className="fxAuthBrandTitle">
                Sign into your <span className="fxHeroAccent">trading account</span>
              </h1>
              <p className="fxAuthBrandLead">
                The terminal authenticates per package: a numeric trading-account login and the password generated
                when you purchased the package. {hasPortalSession ? "You're signed in to the portal — open the Trading accounts tab to see your logins." : "Sign in to the client portal first to purchase a package and receive credentials."}
              </p>
              <ul className="fxAuthBrandList">
                <li>One numeric login per purchased package</li>
                <li>Reset / rotate the password from the client portal</li>
                <li>Portal email/password is never accepted for trading</li>
              </ul>
              <button type="button" className="fxCtaOutline fxAuthBackLink" onClick={onBack}>
                <ArrowLeft size={16} aria-hidden="true" />
                Back
              </button>
            </div>

            <div className="fxAuthCardWrap">
              <div className="fxAuthCard">
                <div className="fxAuthTabs" role="tablist" aria-label="Terminal authentication">
                  <span className="fxAuthTab fxAuthTabActive">Trading account login</span>
                </div>

                <p className="fxAuthLead">
                  Enter the numeric trading account login and password from your portal. Demo terminal: <kbd className="fxKbd">100000</kbd> / <kbd className="fxKbd">terminal1234</kbd>.
                </p>

                <label className="fxField">
                  <span className="fxFieldLabel">Trading account login</span>
                  <span className="fxInputShell">
                    <ShieldCheck className="fxInputIcon" size={18} aria-hidden="true" />
                    <input
                      className="fxAuthInput"
                      inputMode="numeric"
                      autoComplete="username"
                      value={login}
                      onChange={(e) => setLogin(e.target.value)}
                      placeholder="e.g. 100000"
                    />
                  </span>
                </label>

                <label className="fxField">
                  <span className="fxFieldLabel">Password</span>
                  <span className="fxInputShell">
                    <KeyRound className="fxInputIcon" size={18} aria-hidden="true" />
                    <input
                      className="fxAuthInput"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void submit();
                      }}
                    />
                  </span>
                </label>

                <div className="fxAuthRowBetween">
                  <label className="fxCheckboxRow">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                    <span>Remember this device</span>
                  </label>
                </div>

                <button type="button" className="fxCtaFilled fxAuthSubmit" onClick={() => void submit()} disabled={busy}>
                  {busy ? "Signing in…" : "Open trading terminal"}
                </button>

                {error && <p className="fxAuthError">{error}</p>}

                <p className="fxAuthFootMuted">
                  Don't have a trading account yet? Buy a package from your client portal — every package issues its own
                  trading account login &amp; password.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default TerminalLoginPage;
