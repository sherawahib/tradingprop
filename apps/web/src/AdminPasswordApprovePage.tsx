import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { API_BASE } from "./clientAuth";

interface AdminPasswordApprovePageProps {
  approvalToken: string | null;
  onDone: () => void;
}

function AdminPasswordApprovePage({ approvalToken, onDone }: AdminPasswordApprovePageProps) {
  const [status, setStatus] = useState<"idle" | "busy" | "ok" | "err">("idle");
  const [error, setError] = useState("");
  const [devLink, setDevLink] = useState("");
  const [sim, setSim] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot when email link lands with token
  useEffect(() => {
    void run();
  }, [approvalToken]);

  async function run(): Promise<void> {
    if (!approvalToken?.trim()) {
      setStatus("err");
      setError("Missing token in URL. Use the exact link from the approval email.");
      return;
    }
    setStatus("busy");
    setError("");
    try {
      const r = await fetch(`${API_BASE}/admin-auth/password-reset/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalToken })
      });
      const data = (await r.json()) as { error?: string; devLinks?: { setPasswordUrl: string }; mailSimulated?: boolean };
      if (!r.ok) throw new Error(data.error ?? "Approval failed.");
      setStatus("ok");
      setSim(Boolean(data.mailSimulated));
      if (data.devLinks?.setPasswordUrl) setDevLink(data.devLinks.setPasswordUrl);
    } catch (e) {
      setStatus("err");
      setError(e instanceof Error ? e.message : "Approval failed.");
    }
  }

  return (
    <div className="fxRoot">
      <main className="fxSite">
        <section className="fxAuthSection fxOpsAuthSection">
          <div className="fxAuthCardWrap fxAuthWide">
            <div className="fxAuthCard fxAdminLoginCard">
              <h1 className="fxAuthBrandTitle" style={{ fontSize: "clamp(22px, 3.5vw, 34px)", marginTop: "4px" }}>
                Approve password change
              </h1>
              <p className="fxAuthLead">
                Step 2 of 3: confirming this request notifies the operator mailbox with a separate link where the new password is
                entered.
              </p>
              {status === "busy" && <p className="fxPortalMuted">Confirming approval…</p>}
              {status === "err" && (
                <p className="fxAuthError" role="alert">
                  {error}
                </p>
              )}
              {status === "ok" && (
                <>
                  <p className="fxOpsOkBanner">
                    <CheckCircle2 size={18} aria-hidden="true" />
                    Approved. {sim ? "Email transport simulated — open the secure link below." : "Check email for the set-password link."}
                  </p>
                  {devLink && (
                    <p className="fxOpsDevLink">
                      <span className="fxOpsDevLinkLabel">Password reset URL</span>
                      <code className="fxPortalCode fxOpsDevLinkCode">{devLink}</code>
                    </p>
                  )}
                  <button type="button" className="fxCtaOutline fxAuthSubmit" onClick={() => onDone()}>
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default AdminPasswordApprovePage;
