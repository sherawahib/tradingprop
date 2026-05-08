import { useEffect, useState } from "react";
import type { ChallengeProgress, PayoutRequest, ViolationRecord } from "@paper-trader/shared";
import { API_BASE, bearerHeaders, jsonAuthHeaders } from "./clientAuth";

interface TraderDashboardProps {
  onBackToTerminal: () => void;
}

function TraderDashboard({ onBackToTerminal }: TraderDashboardProps) {
  const [progress, setProgress] = useState<ChallengeProgress | null>(null);
  const [violations, setViolations] = useState<ViolationRecord[]>([]);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [error, setError] = useState("");

  async function load(): Promise<void> {
    const opts = { headers: bearerHeaders() };
    const [p, v, pay] = await Promise.all([
      fetch(`${API_BASE}/challenge/progress`, opts).then((r) => r.json()),
      fetch(`${API_BASE}/violations`, opts).then((r) => r.json()),
      fetch(`${API_BASE}/payouts`, opts).then((r) => r.json())
    ]);
    setProgress(p);
    setViolations(v);
    setPayouts(pay);
  }

  useEffect(() => {
    void load();
  }, []);

  async function requestPayout(): Promise<void> {
    const response = await fetch(`${API_BASE}/payouts/request`, { method: "POST", headers: jsonAuthHeaders() });
    if (!response.ok) {
      const j = (await response.json()) as { error?: string; code?: string };
      setError(j.error ?? "Payout request failed");
      return;
    }
    setError("");
    await load();
  }

  return (
    <main className="mt5Layout">
      <header className="topMenuBar">
        <button className="menuBtn" onClick={onBackToTerminal}>Terminal</button>
        <button className="menuBtn active">Trader Dashboard</button>
      </header>
      <section className="workspaceRow" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <article className="panel">
          <h3>Challenge Progress</h3>
          {!progress ? <p>Loading...</p> : (
            <>
              <p>Phase: {progress.phase}</p>
              <p>Status: {progress.status}</p>
              <p>Qualifying trading days: {(progress.qualifiedTradingDayKeys?.length ?? progress.tradingDays) ?? 0}</p>
              <p>Phase Start Balance: {progress.phaseStartBalance.toFixed(2)}</p>
              <p>Daily Start Balance: {progress.currentDailyStartBalance.toFixed(2)}</p>
            </>
          )}
        </article>
        <article className="panel">
          <h3>Payouts</h3>
          <div className="inlineActions">
            <button className="miniBtn" onClick={() => void requestPayout()}>Request Payout</button>
            <button className="miniBtn" onClick={() => void load()}>Refresh</button>
          </div>
          {error && <p className="error">{error}</p>}
          {payouts.length === 0 && <p>No payout requests yet.</p>}
          {payouts.map((p) => (
            <div key={p.id} className="positionRow">
              <p>{p.status} - ${p.amount.toFixed(2)}</p>
              <p>Requested: {new Date(p.requestedAt).toLocaleString()}</p>
            </div>
          ))}
        </article>
        <article className="panel" style={{ gridColumn: "1 / span 2" }}>
          <h3>Violations Timeline</h3>
          {violations.length === 0 && <p>No violations recorded.</p>}
          {violations.map((v) => (
            <div key={v.id} className="positionRow">
              <p>{v.severity} - {v.code}</p>
              <p>{v.message}</p>
              <p>{new Date(v.createdAt).toLocaleString()}</p>
            </div>
          ))}
        </article>
      </section>
    </main>
  );
}

export default TraderDashboard;
