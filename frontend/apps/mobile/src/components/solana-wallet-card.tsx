import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSolanaWallet } from '../hooks/use-solana-wallet';
import { usePrivyWallet } from '../hooks/use-privy-wallet';
import { colors, spacing } from '../theme';
import { homeArt, homeFont, ToyHomeButton, ToyHomePanel } from './toy-home-controls';
import { ToyBadge, ToySectionHeading } from './toy-dialog';
import { figureStoreMessage } from '@rps/core/shop';

export function SolanaWalletCard({ onRegister, focused = true }: { onRegister: () => void; focused?: boolean }) {
  const wallet = useSolanaWallet();
  const account = usePrivyWallet(!wallet.isSupported);
  const refreshAccount = account.refresh;
  useEffect(() => { if (focused && !wallet.isSupported) refreshAccount().catch(() => undefined); }, [focused, refreshAccount, wallet.isSupported]);
  const [showAddress, setShowAddress] = useState(false);
  if (!wallet.isSupported) return (
    <ToyHomePanel style={styles.card}>
      <View style={styles.content}>
        <ToySectionHeading icon={homeArt.shop} title={account.address ? 'Your account' : 'Keep your collection'} copy={account.address ? 'Signed in with email.' : 'Sign in with email. Your free army needs no account.'} />
        <ToyHomeButton compact tone="yellow" onPress={onRegister}>{account.address ? 'Manage account' : 'Register'}</ToyHomeButton>
      </View>
    </ToyHomePanel>
  );
  const connected = Boolean(wallet.address);
  const working = wallet.status === 'loading' || wallet.status === 'connecting' || wallet.status === 'disconnecting';
  return (
    <ToyHomePanel style={styles.card}>
      <View accessibilityLabel="Seeker purchase account" style={styles.content}>
        <ToySectionHeading icon={homeArt.shop} title={connected ? 'Ready to buy figures!' : 'Connect your Seeker wallet'} copy={connected ? 'Pick a fighter in the shop.' : 'Optional. Your free army is ready without it.'} />
        <ToyBadge tone={connected ? 'green' : 'blue'}>{wallet.status === 'connecting' ? 'CONNECTING' : wallet.status === 'disconnecting' ? 'DISCONNECTING' : wallet.status === 'loading' ? 'RESTORING WALLET' : connected ? 'CONNECTED' : 'NOT CONNECTED'}</ToyBadge>
        {wallet.address && <View style={styles.addressPanel}>
          {wallet.label && <Text style={styles.walletLabel}>{wallet.label}</Text>}
          <Text accessibilityLabel={`Wallet address ${wallet.address}`} selectable style={styles.address}>{showAddress ? wallet.address : shortenAddress(wallet.address)}</Text>
          <ToyHomeButton compact tone="white" accessibilityLabel={showAddress ? 'Hide full wallet address' : 'Show full wallet address'} onPress={() => setShowAddress(value => !value)}>{showAddress ? 'Hide address' : 'Show full address'}</ToyHomeButton>
          {showAddress && <Text style={styles.hint}>Touch and hold the address to copy.</Text>}
        </View>}
        {wallet.error && <Text accessibilityRole="alert" style={styles.error}>{figureStoreMessage(wallet.error, 'Could not connect your Seeker wallet. Please try again.')}</Text>}
        <ToyHomeButton compact tone={connected ? 'white' : 'yellow'} busy={working}
          accessibilityLabel={connected ? 'Disconnect wallet' : 'Connect your wallet'}
          accessibilityHint={connected ? 'Disconnects and forgets this wallet on this device' : 'Opens your Seeker wallet to connect it'}
          onPress={() => { (connected ? wallet.disconnect() : wallet.connect()).catch(() => undefined); }}>
          {wallet.status === 'loading' ? 'Restoring wallet…' : wallet.status === 'connecting' ? 'Connecting…' : wallet.status === 'disconnecting' ? 'Disconnecting…' : connected ? 'Disconnect wallet' : wallet.error ? 'Retry connection' : 'Connect your wallet'}
        </ToyHomeButton>
        <Text style={styles.hint}>Connecting never changes your lineup or buys a figure.</Text>
      </View>
    </ToyHomePanel>
  );
}

export function shortenAddress(address: string): string {
  return address.length <= 14 ? address : `${address.slice(0, 6)}…${address.slice(-6)}`;
}

const styles = StyleSheet.create({
  card: { padding: spacing.lg },
  content: { gap: spacing.md },
  addressPanel: { padding: spacing.md, borderRadius: 16, backgroundColor: colors.surfaceHighlight, gap: spacing.sm },
  walletLabel: { color: colors.ink, fontFamily: homeFont, fontSize: 15 },
  address: { color: colors.ink, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }), fontSize: 14, lineHeight: 21 },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  error: { color: colors.dangerShadow, fontSize: 13, lineHeight: 19 },
});
