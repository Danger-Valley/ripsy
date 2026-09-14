export const metadata = {
  title: 'Support | RIPSY',
  description: 'Help with RIPSY multiplayer games.',
};

export default function SupportPage() {
  return (
    <main style={{ minHeight: '100dvh', background: '#0e1419', color: '#c5c6c7', padding: '48px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <article style={{ maxWidth: 720, margin: '0 auto', lineHeight: 1.65 }}>
        <a href="/" style={{ color: '#66fcf1' }}>← RIPSY</a>
        <h1 style={{ color: '#66fcf1', marginTop: 24 }}>RIPSY Support</h1>
        <h2>Connection problems</h2>
        <p>Check your internet connection, reopen the game, and use the same invitation link or room code. The app restores the latest authoritative state after reconnecting.</p>
        <h2>Notifications</h2>
        <p>Notification permission can be changed in iOS or Android system settings. Game play continues normally if notifications are disabled.</p>
        <h2>Report a problem</h2>
        <p>Include your platform, app version, room code, and what happened. Never include a session token or other credential.</p>
        <p><a href="https://github.com/Danger-Valley/ripsy/issues" style={{ color: '#66fcf1' }}>Open the RIPSY support tracker</a></p>
        <p><a href="/terms" style={{ color: '#66fcf1' }}>Terms of Use</a></p>
        <p><a href="/privacy" style={{ color: '#66fcf1' }}>Privacy Policy</a></p>
      </article>
    </main>
  );
}
