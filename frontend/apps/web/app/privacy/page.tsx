export const metadata = {
  title: 'Privacy Policy | RIPSY',
  description: 'How RIPSY handles game and device data.',
};

const sectionStyle = { marginTop: 28 } as const;

export default function PrivacyPage() {
  return (
    <main style={{ minHeight: '100dvh', background: '#0e1419', color: '#c5c6c7', padding: '48px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <article style={{ maxWidth: 720, margin: '0 auto', lineHeight: 1.65 }}>
        <a href="/" style={{ color: '#66fcf1' }}>← RIPSY</a>
        <h1 style={{ color: '#66fcf1', marginTop: 24 }}>Privacy Policy</h1>
        <p>Effective September 10, 2026</p>

        <section style={sectionStyle}>
          <h2>Data we process</h2>
          <p>RIPSY creates an anonymous player identifier and session credential so the backend can authenticate your game actions. We process room membership, lineups, moves, battle choices, results, and connection diagnostics required to run and protect multiplayer games.</p>
          <p>If you enable notifications, we process a Firebase installation identifier and push token so we can deliver game updates to your device.</p>
        </section>

        <section style={sectionStyle}>
          <h2>How we use data</h2>
          <p>We use this data only for app functionality, including authentication, multiplayer synchronization, reconnect recovery, notifications, abuse prevention, reliability, and troubleshooting. RIPSY does not use this data for advertising or cross-app tracking.</p>
        </section>

        <section style={sectionStyle}>
          <h2>Storage and retention</h2>
          <p>Active game data and push registrations are stored by our backend in Redis and expire automatically according to server retention settings. Credentials remain in the device Keychain or Keystore until the app data is removed. Infrastructure providers may process limited network metadata needed to operate the service.</p>
        </section>

        <section style={sectionStyle}>
          <h2>Your choices</h2>
          <p>You can decline or disable notifications in system settings. To ask about locally stored credentials, request deletion of backend data, or raise another privacy question, open an issue in the RIPSY support tracker.</p>
          <p><a href="https://github.com/Danger-Valley/ripsy/issues" style={{ color: '#66fcf1' }}>RIPSY support tracker</a></p>
        </section>
      </article>
    </main>
  );
}
