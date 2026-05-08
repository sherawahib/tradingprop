import MarketingArticleShell from "./MarketingArticleShell";
import type { MarketingSubView } from "./marketingTypes";

interface PrivacyPageProps {
  onNavigate: (page: MarketingSubView) => void;
  onOpenPortal: () => void;
}

export default function PrivacyPage({ onNavigate, onOpenPortal }: PrivacyPageProps) {
  return (
    <MarketingArticleShell
      active="privacy"
      onNavigate={onNavigate}
      onOpenPortal={onOpenPortal}
      annTag="Legal"
      annText="How PropPrime collects, stores, and protects your data."
      title="Privacy policy"
      updated="May 2026"
    >
      <section>
        <h2>1. What we collect</h2>
        <ul>
          <li>Account data: email, full name, hashed password.</li>
          <li>Profile: phone, address, occupation, KYC document type and labels (no real document images in this build).</li>
          <li>Trading state: simulated balances, orders, positions, audit log entries.</li>
          <li>Operational data: IP and session metadata to keep your session secure.</li>
        </ul>
      </section>
      <section>
        <h2>2. How we use it</h2>
        <p>
          To run the simulation, enforce the trading rules, drive your dashboards, and provide support. We do not sell
          your data. Operator and partner roles only see data they need for their assigned function.
        </p>
      </section>
      <section>
        <h2>3. Storage</h2>
        <p>
          The demo build stores data on the local filesystem (<code>apps/api/data/state.json</code>) for prototype
          purposes. A production deployment must use an encrypted database, hashed credentials, and proper backup
          policies.
        </p>
      </section>
      <section>
        <h2>4. Your rights</h2>
        <p>
          You can request export or deletion of your simulated account by raising a ticket from the client portal. In
          the demo build we honour delete requests by removing the trader records and revoking JWTs.
        </p>
      </section>
      <section>
        <h2>5. Cookies</h2>
        <p>
          We use session storage and local storage for authentication tokens. See the cookies policy for the full list.
        </p>
      </section>
    </MarketingArticleShell>
  );
}
