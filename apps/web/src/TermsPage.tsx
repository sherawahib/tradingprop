import MarketingArticleShell from "./MarketingArticleShell";
import type { MarketingSubView } from "./marketingTypes";

interface TermsPageProps {
  onNavigate: (page: MarketingSubView) => void;
  onOpenPortal: () => void;
}

export default function TermsPage({ onNavigate, onOpenPortal }: TermsPageProps) {
  return (
    <MarketingArticleShell
      active="terms"
      onNavigate={onNavigate}
      onOpenPortal={onOpenPortal}
      annTag="Legal"
      annText="Terms of service for the PropPrime educational simulation platform."
      title="Terms of service"
      updated="May 2026"
    >
      <section>
        <h2>1. Educational simulation</h2>
        <p>
          PropPrime is an educational, simulated trading platform. No real money is held, transferred, or paid. All
          balances, profits, losses, and payouts are simulated for prototyping and study. Nothing on this site is an
          offer of brokerage, investment advisory, or financial services.
        </p>
      </section>
      <section>
        <h2>2. Eligibility</h2>
        <p>
          You must be old enough to enter a binding contract in your jurisdiction to use this site. By using PropPrime
          you confirm you are not in a sanctioned region and that your local laws permit educational trading
          simulations.
        </p>
      </section>
      <section>
        <h2>3. Account use</h2>
        <ul>
          <li>You must keep your portal email/password and per-package terminal credentials confidential.</li>
          <li>One person per account. No automated abuse of the simulation, demo billing flow, or referral system.</li>
          <li>We may lock or reset accounts that breach rules or attempt to game the simulation.</li>
        </ul>
      </section>
      <section>
        <h2>4. Demo billing</h2>
        <p>
          Checkout in this build is simulated. No card is charged. Sticker prices shown next to packages are illustrative
          only and do not reflect a real commercial offer.
        </p>
      </section>
      <section>
        <h2>5. Liability</h2>
        <p>
          The platform is provided "as is" without warranty of any kind. To the maximum extent permitted by law,
          PropPrime is not liable for any direct or consequential losses you incur from using the simulation.
        </p>
      </section>
      <section>
        <h2>6. Changes</h2>
        <p>We may update these terms at any time. Continued use of the platform after changes constitutes acceptance.</p>
      </section>
    </MarketingArticleShell>
  );
}
