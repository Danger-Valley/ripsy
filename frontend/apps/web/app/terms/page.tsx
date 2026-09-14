import type { Metadata } from 'next';
import { LegalDocument, type LegalSection } from '../components/LegalDocument';

export const metadata: Metadata = {
  title: 'Terms of Use | RIPSY',
  description: 'The terms that apply when you use RIPSY.',
};

const sections: LegalSection[] = [
  {
    id: 'acceptance',
    title: 'Accepting these terms',
    content: <p>These Terms of Use (“Terms”) are an agreement between you and RIPSY. By accessing or using our website, mobile apps, multiplayer game servers, or related services (together, the “Service”), you agree to these Terms and our <a href="/privacy">Privacy Policy</a>. If you do not agree, do not use the Service.</p>,
  },
  {
    id: 'eligibility',
    title: 'Who may use RIPSY',
    content: <p>You must be at least 13 years old and legally able to agree to these Terms. If you are under the age of legal majority where you live, a parent or legal guardian must review and agree to these Terms for you.</p>,
  },
  {
    id: 'license',
    title: 'Permission to use the Service',
    content: <p>We give you a limited, personal, non-exclusive, non-transferable, revocable license to access and use the Service for lawful, non-commercial entertainment. This license does not give you ownership of the Service or any RIPSY content.</p>,
  },
  {
    id: 'fair-play',
    title: 'Fair play and acceptable use',
    content: (
      <>
        <p>You agree not to:</p>
        <ul>
          <li>cheat, exploit bugs, automate gameplay, or interfere with another player’s experience;</li>
          <li>probe, attack, overload, bypass, or disrupt the Service or its security controls;</li>
          <li>impersonate another person, misuse invitations, or access a game without permission;</li>
          <li>reverse engineer or copy the Service except where applicable law expressly permits it; or</li>
          <li>use the Service for illegal, abusive, fraudulent, or harmful activity.</li>
        </ul>
        <p>Room codes and invitations are intended for the people you choose to play with. You are responsible for sharing them carefully.</p>
      </>
    ),
  },
  {
    id: 'gameplay',
    title: 'Gameplay and virtual items',
    content: <p>Game outcomes depend on player choices, timing, and the game rules. Scores, results, room access, and other game elements have no cash value and cannot be redeemed or exchanged. RIPSY does not require a wallet, cryptocurrency, or blockchain transaction.</p>,
  },
  {
    id: 'service-changes',
    title: 'Availability and changes',
    content: <p>We may update, suspend, or discontinue any part of the Service, including game rules and features. Multiplayer access can be interrupted by maintenance, provider outages, device limitations, or network conditions. We do not promise that the Service will always be available or error-free.</p>,
  },
  {
    id: 'ownership',
    title: 'Ownership and feedback',
    content: <p>RIPSY and its software, artwork, designs, trademarks, and other content are owned by us or our licensors and are protected by applicable law. If you send suggestions or feedback, you allow us to use them without restriction or compensation to you.</p>,
  },
  {
    id: 'third-parties',
    title: 'Third-party services',
    content: <p>The Service relies on third-party platforms and may link to third-party sites, such as app stores, hosting providers, Firebase, and GitHub. Their own terms and privacy practices apply to your use of their services. We are not responsible for third-party services we do not control.</p>,
  },
  {
    id: 'disclaimers',
    title: 'Disclaimers and liability',
    content: (
      <>
        <p>To the fullest extent permitted by law, the Service is provided “as is” and “as available,” without warranties of any kind, whether express or implied.</p>
        <p>To the fullest extent permitted by law, RIPSY and its contributors will not be liable for indirect, incidental, special, consequential, or punitive damages, or for lost data, profits, or goodwill arising from your use of the Service. Nothing in these Terms excludes rights or liability that cannot lawfully be excluded.</p>
      </>
    ),
  },
  {
    id: 'termination',
    title: 'Suspension and termination',
    content: <p>You may stop using the Service at any time. We may limit, suspend, or end access when we reasonably believe you have violated these Terms, created risk for other players or the Service, or when necessary to comply with law. Provisions that by their nature should survive termination will remain in effect.</p>,
  },
  {
    id: 'changes-and-contact',
    title: 'Changes and contact',
    content: (
      <>
        <p>We may revise these Terms as the Service evolves. The updated version will be posted here with a new effective date. By continuing to use the Service after revised Terms take effect, you agree to the revised Terms.</p>
        <p>Questions about these Terms can be submitted through the <a href="https://github.com/Danger-Valley/ripsy/issues">RIPSY support tracker</a>.</p>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalDocument
      eyebrow="Rules of the arena"
      title="Terms of Use"
      description="These terms set the ground rules for playing RIPSY and using its website, apps, and multiplayer services."
      effectiveDate="September 14, 2026"
      sections={sections}
    />
  );
}
