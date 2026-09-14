import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSolanaWallet } from '../hooks/use-solana-wallet';
import { colors, spacing } from '../theme';
import { PrimaryButton } from './primary-button';

export function SolanaWalletCard() {
  const wallet = useSolanaWallet();
  if (!wallet.isSupported) return null;

  const isConnected = Boolean(wallet.address);
  const isLoading = wallet.status === 'loading';
  const isConnecting = wallet.status === 'connecting';
  const isDisconnecting = wallet.status === 'disconnecting';

  return (
    <View accessibilityLabel="Solana wallet" style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text accessibilityRole="header" maxFontSizeMultiplier={2} style={styles.title}>Solana wallet</Text>
          <Text maxFontSizeMultiplier={2} style={styles.description}>
            {isConnected ? 'Connected for your RIPSY profile.' : 'Connect a wallet on your Solana Mobile device.'}
          </Text>
        </View>
        {isConnected && (
          <View accessibilityLabel="Wallet connected" style={styles.statusPill}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>CONNECTED</Text>
          </View>
        )}
      </View>

      {isConnected && wallet.address && (
        <View style={styles.addressPanel}>
          {wallet.label && <Text maxFontSizeMultiplier={2} style={styles.walletLabel}>{wallet.label}</Text>}
          <Text accessibilityLabel={`Wallet address ${wallet.address}`} maxFontSizeMultiplier={1.4} numberOfLines={1} selectable style={styles.address}>
            {shortenAddress(wallet.address)}
          </Text>
        </View>
      )}

      {wallet.error && <Text accessibilityRole="alert" maxFontSizeMultiplier={2} style={styles.error}>{wallet.error}</Text>}

      {isConnected ? (
        <PrimaryButton
          accessibilityHint="Disconnects and forgets this wallet on this device"
          busy={isDisconnecting}
          onPress={() => { wallet.disconnect().catch(() => undefined); }}
          variant="secondary">
          Disconnect wallet
        </PrimaryButton>
      ) : (
        <PrimaryButton
          accessibilityHint="Opens an installed Solana wallet to connect it"
          busy={isLoading || isConnecting}
          disabled={isLoading}
          onPress={() => { wallet.connect().catch(() => undefined); }}>
          Connect wallet
        </PrimaryButton>
      )}
    </View>
  );
}

export function shortenAddress(address: string): string {
  return address.length <= 14 ? address : `${address.slice(0, 6)}…${address.slice(-6)}`;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: spacing.lg, gap: spacing.md },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  headingCopy: { flex: 1, gap: spacing.xs },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  description: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  statusPill: { minHeight: 26, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, borderRadius: 999, backgroundColor: 'rgba(74, 222, 128, 0.10)' },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  statusText: { color: colors.success, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  addressPanel: { minHeight: 58, justifyContent: 'center', backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 2 },
  walletLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  address: { color: colors.primary, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }), fontSize: 16, fontWeight: '700', letterSpacing: 0.4 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18 },
});
