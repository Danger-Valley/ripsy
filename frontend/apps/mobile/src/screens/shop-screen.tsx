import { Image, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { useShop } from '@rps/game-client/use-shop';
import { formatSol, isTerminalMint, solanaExplorer } from '@rps/core/shop';
import { getGameWebSocketUrl } from '../config';
import { usePlayerIdentity } from '../hooks/use-player-identity';
import { useSolanaWallet } from '../hooks/use-solana-wallet';
import { signShopTransaction } from '../solana-wallet-adapter';
import { shopPurchaseStorage } from '../storage/shop-purchase';
import { PrimaryButton } from '../components/primary-button';
import { colors, spacing } from '../theme';

const images = {
  fig1: require('../assets/shop/fig1.png'),
  fig2: require('../assets/shop/fig2.png'),
};

export function ShopScreen() {
  const { sessionToken, error: sessionError } = usePlayerIdentity();
  const wallet = useSolanaWallet();
  const shop = useShop(getGameWebSocketUrl().replace(/^ws/, 'http'), sessionToken, shopPurchaseStorage);
  const order = shop.order;
  const [browserError, setBrowserError] = useState<string | null>(null);
  const canClose = !shop.signingStarted || (order && isTerminalMint(order));
  const error = browserError || shop.error || wallet.error || sessionError;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>THE FIGURE COLLECTION</Text>
        <Text accessibilityRole="header" style={styles.title}>Make it yours.</Text>
        <Text style={styles.copy}>Collect a RIPSY figure in your Solana wallet. Each mint is a Metaplex Core collectible.</Text>
        {shop.catalog && <Text style={styles.network}>{shop.catalog.cluster === 'devnet' ? 'DEVNET · TEST SOL ONLY' : 'SOLANA MAINNET'}</Text>}
      </View>

      <View style={styles.wallet}>
        <Text style={styles.label}>{wallet.address ? 'YOUR WALLET' : 'CHOOSE YOUR WALLET'}</Text>
        {wallet.address ? <>
          <Text selectable style={styles.address}>{wallet.address}</Text>
          <PrimaryButton variant="secondary" disabled={shop.busy || shop.hasPurchase} onPress={() => { void wallet.disconnect(); }}>Disconnect wallet</PrimaryButton>
        </> : <>
          <Text style={styles.copy}>Use your wallet to receive your figure.</Text>
          {wallet.isSupported && <PrimaryButton busy={wallet.status === 'connecting'} onPress={() => { void wallet.connect(); }}>Connect wallet</PrimaryButton>}
        </>}
        <PrimaryButton variant="secondary" disabled={shop.hasPurchase || shop.busy} onPress={() => {
          setBrowserError(null);
          void Linking.openURL('https://www.ripsy.fun/shop?source=mobile&wallet=privy').catch(() => setBrowserError('Could not open checkout. Visit www.ripsy.fun/shop in your browser.'));
        }}>Continue with Privy in browser</PrimaryButton>
        <Text style={styles.note}>No wallet? Sign in and mint with a Privy embedded wallet in your browser. Return here when you’re done.</Text>
      </View>

      {error && <View accessibilityRole="alert" style={styles.error}>
        <Text style={styles.copy}>{error}</Text>
        <PrimaryButton variant="secondary" onPress={() => { void (shop.hasPurchase ? shop.checkStatus() : shop.loadCatalog()); }}>Try again</PrimaryButton>
      </View>}

      {shop.hasPurchase && <View style={styles.review} accessibilityLiveRegion="polite">
        <Text accessibilityRole="header" style={styles.cardTitle}>{order?.status === 'confirmed' ? 'Your figure is ready!' : 'Your purchase'}</Text>
        {order ? <>
          <Text style={styles.copy}>{order.status === 'confirmed' ? 'Mint confirmed. Your collectible is in your wallet.' : order.status === 'submitted' ? 'Confirming on Solana… You can leave this screen and check back.' : order.error ?? 'Review your purchase before approving it in your wallet.'}</Text>
          <Text style={styles.cardTitle}>{order.figureId === 'fig1' ? 'Figure 01' : 'Figure 02'}</Text>
          <Text style={styles.price}>{formatSol(order.priceLamports)}</Text>
          <Text style={styles.copy}>Estimated network & mint fees: {formatSol(order.networkFeeLamports)}</Text>
          <Text style={styles.copy}>Network: {order.cluster}</Text>
          <Text style={styles.label}>RECEIVING WALLET</Text><Text selectable style={styles.address}>{order.buyer}</Text>
          <Text style={styles.label}>PAYMENT TO</Text><Text selectable style={styles.address}>{order.treasury}</Text>
          {order.status === 'prepared' && <PrimaryButton busy={shop.busy} disabled={wallet.address !== order.buyer} onPress={() => { void shop.confirm(signShopTransaction); }}>{shop.signingStarted ? 'Retry wallet approval' : 'Approve mint in wallet'}</PrimaryButton>}
          {order.signature && <PrimaryButton variant="secondary" onPress={() => { void Linking.openURL(solanaExplorer('tx', order.signature!, order.cluster)); }}>View transaction</PrimaryButton>}
          {order.status === 'confirmed' && <PrimaryButton variant="secondary" onPress={() => { void Linking.openURL(solanaExplorer('address', order.asset, order.cluster)); }}>View collectible</PrimaryButton>}
        </> : <Text style={styles.copy}>Preparing your purchase. Retry to recover this request if the connection was interrupted.</Text>}
        {!canClose && <PrimaryButton variant="secondary" busy={shop.busy} onPress={() => { void shop.checkStatus(); }}>Check purchase status</PrimaryButton>}
        {canClose && <PrimaryButton variant="secondary" disabled={shop.busy} onPress={() => { void shop.dismiss(); }}>{order && isTerminalMint(order) ? 'Done' : 'Cancel purchase'}</PrimaryButton>}
      </View>}

      {!shop.catalog && !error && <View accessibilityLabel="Loading figures" style={styles.skeleton} />}
      {shop.catalog?.figures.length === 0 && <Text style={styles.copy}>New figures are on the way. Check back soon.</Text>}
      {shop.catalog?.figures.map(figure => <View key={figure.id} style={styles.card}>
        <View style={styles.art}><Image accessibilityLabel={figure.name} resizeMode="contain" source={images[figure.id]} style={styles.figure} /></View>
        <View style={styles.cardCopy}>
          <Text style={styles.eyebrow}>RIPSY ORIGINALS · {String(figure.variant).padStart(2, '0')}</Text>
          <Text accessibilityRole="header" style={styles.cardTitle}>{figure.name}</Text>
          <Text style={styles.copy}>{figure.description}</Text>
          <Text style={styles.price}>{figure.priceLamports ? formatSol(figure.priceLamports) : 'Coming soon'}</Text>
          <PrimaryButton disabled={!figure.available || !wallet.address || !shop.ready || shop.hasPurchase || shop.busy} onPress={() => { if (wallet.address) void shop.prepare(figure.id, wallet.address); }}>
            {!figure.available ? 'Minting opens soon' : wallet.address ? 'Review mint' : 'Connect wallet to mint'}
          </PrimaryButton>
        </View>
      </View>)}
      <Text style={styles.note}>The figure price and mint are one transaction. Network fees are extra. Collecting a figure does not change your current game lineup.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.lg, maxWidth: 640, width: '100%', alignSelf: 'center', paddingBottom: spacing.xxl },
  heading: { gap: spacing.sm, marginBottom: spacing.sm },
  eyebrow: { color: colors.primary, fontWeight: '800', fontSize: 11, letterSpacing: 1.8 },
  title: { color: colors.text, fontWeight: '900', fontSize: 36 },
  copy: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  network: { color: colors.warning, fontSize: 12, fontWeight: '800', marginTop: spacing.sm },
  wallet: { backgroundColor: colors.surface, borderRadius: 18, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  address: { color: colors.text, fontSize: 13, lineHeight: 20 },
  card: { borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  art: { height: 220, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceStrong },
  figure: { width: 300, height: 300, transform: [{ translateY: -48 }] },
  cardCopy: { padding: spacing.xl, gap: spacing.md },
  cardTitle: { color: colors.text, fontSize: 23, fontWeight: '800' },
  price: { color: colors.primary, fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  review: { padding: spacing.lg, gap: spacing.md, borderRadius: 18, borderColor: colors.primary, borderWidth: 1, backgroundColor: colors.surface },
  error: { borderColor: colors.danger, borderWidth: 1, borderRadius: 12, padding: spacing.lg, gap: spacing.md },
  note: { color: colors.textMuted, fontSize: 12, lineHeight: 19, textAlign: 'center' },
  skeleton: { height: 380, backgroundColor: colors.surface, borderRadius: 20 },
});
