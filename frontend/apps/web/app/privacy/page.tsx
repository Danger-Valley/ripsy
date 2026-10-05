import type { Metadata } from 'next';
import { LegalDocument, type LegalSection } from '../components/LegalDocument';

export const metadata: Metadata = {
  title: 'Privacy Policy | RIPSY',
  description: 'How RIPSY collects, uses, retains, and protects game and device data.',
};

const sections: LegalSection[] = [
  {
    id: 'scope',
    title: 'Scope',
    content: <p>This Privacy Policy explains how RIPSY handles information when you use our website, mobile apps, multiplayer game servers, and related support services (together, the “Service”).</p>,
  },
  {
    id: 'information-we-collect',
    title: 'Information we collect',
    content: (
      <>
        <p>RIPSY is designed to work without a named account. We process only the information needed to operate and protect the game:</p>
        <ul>
          <li><strong>Player and session data:</strong> an anonymous player identifier, session credential, and credential expiration time.</li>
          <li><strong>Gameplay data:</strong> room membership, lineups, moves, battle choices, results, and game timing.</li>
          <li><strong>Device and notification data:</strong> a Firebase installation identifier and push registration token when you enable notifications.</li>
          <li><strong>Optional figure shop data:</strong> if you use the shop, your public Solana wallet address, purchase and mint transaction records, and an email address when you choose to sign in with email. RIPSY does not receive your wallet private key.</li>
          <li><strong>Technical data:</strong> limited connection, request, protocol, and error diagnostics, plus network metadata routinely processed by our infrastructure providers.</li>
        </ul>
        <p>We do not ask for your name, email address, wallet, payment details, contacts, precise location, or advertising identifier to play RIPSY. Email and wallet data are needed only if you voluntarily use the optional figure shop and its embedded-wallet sign-in.</p>
      </>
    ),
  },
  {
    id: 'how-we-use-information',
    title: 'How we use information',
    content: (
      <>
        <p>We use information to authenticate game actions, synchronize multiplayer sessions, restore games after a reconnect, send opted-in game notifications, create and reconcile optional figure-shop purchases and mints, prevent abuse, maintain security, and troubleshoot reliability issues.</p>
        <p>We do not use your information for targeted advertising, sell it, or use it to track you across apps or websites.</p>
      </>
    ),
  },
  {
    id: 'sharing',
    title: 'When we share information',
    content: (
      <>
        <p>We disclose information only to service providers that help us host, store, secure, and deliver the Service, including Firebase for optional push notifications and our email sign-in provider for optional embedded-wallet authentication and signing. Public wallet addresses and transaction data submitted to Solana are publicly visible by design. Providers may process information only to provide their services to us.</p>
        <p>We may also disclose information when required by law, to protect the rights and safety of users or the Service, or as part of a business transfer. We do not share information with advertising networks or data brokers.</p>
      </>
    ),
  },
  {
    id: 'retention',
    title: 'Storage and retention',
    content: (
      <>
        <p>Online game records expire from our active backend storage after seven days by default. Push registrations and figure-shop order recovery records expire after 90 days by default. Session credentials are valid for 30 days by default and may remain in your browser storage or device Keychain or Keystore until they expire or you remove the app data. Our email sign-in provider may retain the optional embedded-wallet account and email according to its service terms; confirmed Solana transactions remain on the public blockchain.</p>
        <p>These periods may be shortened or extended when reasonably necessary for security, legal compliance, backups, or resolving a support request.</p>
      </>
    ),
  },
  {
    id: 'choices',
    title: 'Your choices and rights',
    content: (
      <>
        <p>You can decline notifications or disable them at any time in your device settings. You can disconnect an optional wallet in RIPSY and clear locally stored identifiers by clearing site data or removing the app. Disconnecting does not erase public blockchain transactions or assets already minted to an address.</p>
        <p>Depending on where you live, you may have rights to access, correct, delete, restrict, or object to certain processing of your information. Because RIPSY does not require a named account, we may need information such as your anonymous player identifier to locate a record, and in some cases we may not be able to link a record back to you.</p>
      </>
    ),
  },
  {
    id: 'children',
    title: 'Children’s privacy',
    content: <p>RIPSY is not directed to children under 13, and we do not knowingly collect personal information from children under 13. If you believe a child has provided personal information through the Service, please contact us so we can review and delete it where appropriate.</p>,
  },
  {
    id: 'security',
    title: 'Security and transfers',
    content: <p>We use reasonable technical and organizational safeguards designed to protect information. No online service can guarantee absolute security. Our providers may process information in countries other than your own, subject to the protections required by applicable law.</p>,
  },
  {
    id: 'changes-and-contact',
    title: 'Changes and contact',
    content: (
      <>
        <p>We may update this policy as the Service changes. We will post the revised policy here and change the effective date above. Material changes will receive additional notice when required by law.</p>
        <p>For a privacy question or request, contact us through the <a href="https://github.com/Danger-Valley/ripsy/issues">RIPSY support tracker</a>. Please do not include a session credential or other secret in a public issue.</p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocument
      eyebrow="Your data, clearly explained"
      title="Privacy Policy"
      description="RIPSY uses a small amount of pseudonymous data to run multiplayer battles. We don’t sell it, and we don’t use it for advertising."
      effectiveDate="September 19, 2026"
      sections={sections}
    />
  );
}
