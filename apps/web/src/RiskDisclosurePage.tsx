import MarketingArticleShell from "./MarketingArticleShell";
import type { MarketingSubView } from "./marketingTypes";

interface RiskDisclosurePageProps {
  onNavigate: (page: MarketingSubView) => void;
  onOpenPortal: () => void;
}

export default function RiskDisclosurePage({ onNavigate, onOpenPortal }: RiskDisclosurePageProps) {
  return (
    <MarketingArticleShell
      active="risk"
      onNavigate={onNavigate}
      onOpenPortal={onOpenPortal}
      annTag="Legal"
      annText="Risks of educational trading simulation, and limits of the simulation itself."
      title="Risk disclosure"
      updated="May 2026"
    >
      <section>
        <h2>Simulation only</h2>
        <p>
          PropPrime is an <strong>educational simulation</strong>. Nothing on this site is investment advice, an offer
          to trade, or a brokerage service. Simulated balances do not equal real money, and the prices feed in the
          demo build is synthetic.
        </p>
      </section>
      <section>
        <h2>Simulated drawdown</h2>
        <p>
          Even in simulation, traders can experience drawdown that triggers a phase failure. Read your program's rule
          pack carefully before starting an evaluation.
        </p>
      </section>
      <section>
        <h2>Reading real markets</h2>
        <p>
          If you take what you've practised here into a real broker account, real markets carry meaningful risk: you
          can lose more than you invest with leverage, slippage, and gap risk. Trade responsibly and only with capital
          you can afford to lose.
        </p>
      </section>
      <section>
        <h2>Jurisdictions</h2>
        <p>
          You are responsible for ensuring that running an educational trading simulation is legal where you live.
          PropPrime makes no representation regarding suitability in any specific country.
        </p>
      </section>
    </MarketingArticleShell>
  );
}
