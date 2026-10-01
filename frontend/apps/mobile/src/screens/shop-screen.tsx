import { Image, Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useEffect, useState } from 'react';
import { useShop } from '@rps/game-client/use-shop';
import { FIGURE_SLOTS, formatSol, isTerminalMint, solanaExplorer } from '@rps/core/shop';
import { getGameWebSocketUrl } from '../config';
import { usePlayerIdentity } from '../hooks/use-player-identity';
import { useSolanaWallet } from '../hooks/use-solana-wallet';
import { usePrivyWallet } from '../hooks/use-privy-wallet';
import { proveSeekerWallet, signShopTransaction } from '../solana-wallet-adapter';
import { shopPurchaseStorage } from '../storage/shop-purchase';
import { saveFigureSlots } from '../storage/figure-loadout';
import { PrimaryButton } from '../components/primary-button';
import { colors, spacing } from '../theme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

const images = {
  fig1: require('../assets/shop/fig1.png'),
  fig2: require('../assets/shop/fig2.png'),
};

type Props = NativeStackScreenProps<RootStackParamList, 'Shop'>;

export function ShopScreen({ navigation }: Props) {
  const { sessionToken, error: sessionError } = usePlayerIdentity();
  const wallet = useSolanaWallet();
  const privy = usePrivyWallet();
  const shop = useShop(getGameWebSocketUrl().replace(/^ws/, 'http'), sessionToken, shopPurchaseStorage);
  const order = shop.order;
  const [walletKind, setWalletKind] = useState<'external' | 'privy'>('external');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  useEffect(() => {
    if (!wallet.isSupported && privy.address) setWalletKind('privy');
  }, [privy.address, wallet.isSupported]);
  const address = walletKind === 'privy' ? privy.address : wallet.address;
  const orderSigner = order?.buyer === privy.address
    ? privy.signShopTransaction
    : order?.buyer === wallet.address
      ? signShopTransaction
      : null;
  const canClose = !shop.signingStarted || (order && isTerminalMint(order));
  const error = actionError || shop.error || wallet.error || privy.error || sessionError;
  const run = (task: () => Promise<unknown>) => {
    setActionError(null);
    void task().catch(cause => setActionError(cause instanceof Error ? cause.message : 'Please try again.'));
  };
  const disconnectWallet = async (kind: 'external' | 'privy') => {
    await shop.clearWallet();
    await saveFigureSlots(Array<string | null>(FIGURE_SLOTS).fill(null));
    if (kind === 'external') await wallet.disconnect();
    else await privy.disconnect();
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>THE FIGURE COLLECTION</Text>
        <Text accessibilityRole="header" style={styles.title}>Make it yours.</Text>
        <Text style={styles.headingCopy}>Collect a RIPSY figure in your Solana wallet. Each mint is a Metaplex Core collectible.</Text>
        {shop.catalog && <Text style={styles.network}>{shop.catalog.cluster === 'devnet' ? 'DEVNET · TEST SOL ONLY' : 'SOLANA MAINNET'}</Text>}
      </View>

      <View style={styles.wallet}>
        <Text style={styles.label}>{address ? 'RECEIVING WALLET' : 'CHOOSE YOUR WALLET'}</Text>
        {wallet.address && <View style={[styles.walletOption, walletKind === 'external' && styles.walletOptionSelected]}>
          <Text style={styles.optionTitle}>{wallet.label ?? 'Connected Solana wallet'}</Text>
          <Text selectable style={styles.address}>{wallet.address}</Text>
          {walletKind !== 'external' && <PrimaryButton variant="secondary" disabled={shop.hasPurchase || shop.busy} onPress={() => setWalletKind('external')}>Use this wallet</PrimaryButton>}
          {walletKind === 'external' && <PrimaryButton variant="secondary" disabled={!shop.ready || shop.busy || shop.hasPurchase} onPress={() => run(() => disconnectWallet('external'))}>Disconnect wallet</PrimaryButton>}
        </View>}
        {!wallet.address && wallet.isSupported && <PrimaryButton busy={wallet.status === 'connecting'} disabled={shop.hasPurchase || shop.busy} onPress={() => {
          setWalletKind('external');
          run(wallet.connect);
        }}>Connect wallet app</PrimaryButton>}

        {privy.address ? <View style={[styles.walletOption, walletKind === 'privy' && styles.walletOptionSelected]}>
          <Text style={styles.optionTitle}>Privy embedded wallet</Text>
          <Text selectable style={styles.address}>{privy.address}</Text>
          {walletKind !== 'privy' && <PrimaryButton variant="secondary" disabled={shop.hasPurchase || shop.busy} onPress={() => setWalletKind('privy')}>Use embedded wallet</PrimaryButton>}
          {walletKind === 'privy' && <PrimaryButton variant="secondary" busy={privy.activity === 'disconnecting'} disabled={!shop.ready || shop.hasPurchase || shop.busy} onPress={() => run(() => disconnectWallet('privy'))}>Disconnect embedded wallet</PrimaryButton>}
        </View> : privy.status === 'authenticated' ? <PrimaryButton busy={privy.activity === 'creating-wallet'} disabled={shop.hasPurchase || shop.busy} onPress={() => run(privy.createWallet)}>Create embedded wallet</PrimaryButton> : privy.configured ? <View style={styles.embeddedLogin}>
          <Text style={styles.optionTitle}>No wallet? Sign in with email</Text>
          <Text style={styles.copy}>Privy creates a self-custodial Solana wallet inside RIPSY. You approve the mint here—no browser checkout.</Text>
          <TextInput
            accessibilityLabel="Email address"
            autoCapitalize="none"
            autoComplete="email"
            editable={!privy.busy && !privy.codeSent}
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.kitPanelMuted}
            style={styles.input}
            value={email}
          />
          {privy.codeSent && <TextInput
            accessibilityLabel="Email verification code"
            autoComplete="one-time-code"
            keyboardType="number-pad"
            maxLength={8}
            onChangeText={setCode}
            placeholder="Verification code"
            placeholderTextColor={colors.kitPanelMuted}
            style={styles.input}
            value={code}
          />}
          {!privy.codeSent
            ? <PrimaryButton busy={privy.activity === 'sending-code'} disabled={!email.trim() || shop.hasPurchase || shop.busy} onPress={() => { setWalletKind('privy'); run(() => privy.sendCode(email)); }}>Send sign-in code</PrimaryButton>
            : <PrimaryButton busy={privy.activity === 'verifying-code' || privy.activity === 'creating-wallet'} disabled={!code.trim() || shop.hasPurchase || shop.busy} onPress={() => { setWalletKind('privy'); run(() => privy.verifyCode(email, code)); }}>Verify and create wallet</PrimaryButton>}
        </View> : <Text style={styles.panelNote}>Embedded wallet sign-in is not configured in this build.</Text>}
        {privy.status === 'authenticated-unverified' && <Text style={styles.panelNote}>Your saved Privy session could not be verified. Check your connection and try again.</Text>}
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
          {order.status === 'prepared' && !orderSigner && <Text style={styles.copy}>Reconnect the receiving wallet shown below to approve this saved purchase.</Text>}
          {order.status === 'prepared' && <PrimaryButton busy={shop.busy} disabled={!orderSigner} onPress={() => { if (orderSigner) void shop.confirm(orderSigner); }}>{shop.signingStarted ? 'Retry wallet approval' : 'Approve mint in app'}</PrimaryButton>}
          {order.status === 'confirmed' && <PrimaryButton onPress={() => navigation.navigate('Army', { expectedAssetId: order.asset })}>Add to your army</PrimaryButton>}
          {order.signature && <PrimaryButton variant="secondary" onPress={() => { void Linking.openURL(solanaExplorer('tx', order.signature!, order.cluster)); }}>View transaction</PrimaryButton>}
          {order.status === 'confirmed' && <PrimaryButton variant="secondary" onPress={() => { void Linking.openURL(solanaExplorer('address', order.asset, order.cluster)); }}>View collectible</PrimaryButton>}
        </> : <Text style={styles.copy}>Preparing your purchase. Retry to recover this request if the connection was interrupted.</Text>}
        {!canClose && <PrimaryButton variant="secondary" busy={shop.busy} onPress={() => { void shop.checkStatus(); }}>Check purchase status</PrimaryButton>}
        {canClose && <PrimaryButton variant="secondary" disabled={shop.busy} onPress={() => { void shop.dismiss(); }}>{order && isTerminalMint(order) ? 'Done' : 'Cancel purchase'}</PrimaryButton>}
      </View>}

      {!shop.catalog && !error && <View accessibilityLabel="Loading figures" style={styles.skeleton} />}
      {shop.catalog?.figures.length === 0 && <Text style={styles.headingCopy}>New figures are on the way. Check back soon.</Text>}
      {shop.catalog?.figures.map(figure => <View key={figure.id} style={styles.card}>
        <View style={styles.art}><Image accessibilityLabel={figure.name} resizeMode="contain" source={images[figure.id]} style={styles.figure} /></View>
        <View style={styles.cardCopy}>
          <Text style={styles.eyebrow}>RIPSY ORIGINALS · {String(figure.variant).padStart(2, '0')}</Text>
          <Text accessibilityRole="header" style={styles.cardTitle}>{figure.name}</Text>
          <Text style={styles.copy}>{figure.description}</Text>
          {figure.seekerExclusive && <Text style={styles.exclusive}>SOLANA SEEKER EXCLUSIVE</Text>}
          <Text style={styles.price}>{figure.priceLamports ? formatSol(figure.priceLamports) : 'Coming soon'}</Text>
          <PrimaryButton disabled={!figure.available || !address || !shop.ready || shop.hasPurchase || shop.busy || (figure.seekerExclusive && walletKind !== 'external')} onPress={() => { if (address) void shop.prepare(figure.id, address, figure.seekerExclusive ? proveSeekerWallet : undefined); }}>
            {!figure.available ? 'Minting opens soon' : figure.seekerExclusive && walletKind !== 'external' ? 'Connect Seeker wallet to mint' : address ? 'Verify & review mint' : 'Connect wallet to mint'}
          </PrimaryButton>
        </View>
      </View>)}
      <Text style={styles.footerNote}>The figure price and mint are one transaction. Network fees are extra. After confirmation, open Your Army to choose the one slot this NFT will occupy.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.lg, maxWidth: 640, width: '100%', alignSelf: 'center', paddingBottom: spacing.xxl },
  heading: { gap: spacing.sm, marginBottom: spacing.sm },
  eyebrow: { color: colors.primaryShadow, fontWeight: '900', fontSize: 11, letterSpacing: 1.8 },
  title: { color: colors.text, fontWeight: '900', fontSize: 36 },
  headingCopy: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  copy: { color: colors.kitPanelMuted, fontSize: 15, lineHeight: 22 },
  network: { color: colors.warning, fontSize: 12, fontWeight: '800', marginTop: spacing.sm },
  wallet: { backgroundColor: colors.kitPanel, borderRadius: 24, padding: spacing.lg, gap: spacing.md, borderTopWidth: 2, borderTopColor: colors.kitPanelBorder, borderBottomWidth: 6, borderBottomColor: colors.kitPanelShadow },
  label: { color: colors.primaryShadow, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  address: { color: colors.kitPanelInk, fontSize: 13, lineHeight: 20 },
  walletOption: { borderRadius: 16, borderWidth: 1, borderColor: colors.kitPanelBorder, padding: spacing.md, gap: spacing.sm, backgroundColor: colors.kitPanelSoft },
  walletOptionSelected: { borderColor: colors.kitPinkShadow, backgroundColor: colors.primaryMuted },
  optionTitle: { color: colors.kitPanelInk, fontSize: 16, fontWeight: '900' },
  embeddedLogin: { gap: spacing.md },
  input: { color: colors.kitPanelInk, backgroundColor: colors.kitPanelSoft, borderColor: colors.kitPanelBorder, borderWidth: 1, borderRadius: 16, paddingHorizontal: spacing.md, minHeight: 52, fontSize: 16 },
  card: { borderRadius: 24, overflow: 'hidden', backgroundColor: colors.kitPanel, borderTopColor: colors.kitPanelBorder, borderTopWidth: 2, borderBottomColor: colors.kitPanelShadow, borderBottomWidth: 7 },
  art: { height: 220, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.kitPanelSoft },
  figure: { width: 300, height: 300, transform: [{ translateY: -48 }] },
  cardCopy: { padding: spacing.xl, gap: spacing.md },
  cardTitle: { color: colors.kitPanelInk, fontSize: 23, fontWeight: '900' },
  price: { color: colors.primaryShadow, fontSize: 24, fontWeight: '900', fontVariant: ['tabular-nums'] },
  exclusive: { color: colors.rewardShadow, fontSize: 12, fontWeight: '900', letterSpacing: 1.2 },
  review: { padding: spacing.lg, gap: spacing.md, borderRadius: 24, borderTopColor: colors.kitPinkHighlight, borderTopWidth: 2, borderBottomColor: colors.kitPinkShadow, borderBottomWidth: 6, backgroundColor: colors.kitPanel },
  error: { borderColor: colors.danger, borderWidth: 2, borderRadius: 18, padding: spacing.lg, gap: spacing.md, backgroundColor: colors.kitPanel },
  panelNote: { color: colors.kitPanelMuted, fontSize: 12, lineHeight: 19, textAlign: 'center' },
  footerNote: { color: colors.textMuted, fontSize: 12, lineHeight: 19, textAlign: 'center' },
  skeleton: { height: 380, backgroundColor: colors.kitPanel, borderRadius: 24 },
});
