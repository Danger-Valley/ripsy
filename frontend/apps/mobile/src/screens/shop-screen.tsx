import { ActivityIndicator, AppState, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShop } from '@rps/game-client/use-shop';
import { usePackShop } from '@rps/game-client/use-pack-shop';
import { packPurchaseStorage } from '../storage/pack-purchase';
import { packPurchaseTitle, ShopPack, ShopPackPurchase } from '../components/shop-pack';
import { DEFAULT_SOLANA_MOBILE_STORE_URL, FIGURE_SLOTS, figurePaymentPrice, figurePurchaseTotal, figurePrice, figureStoreMessage, isTerminalMint, solanaExplorer, type ShopFigure } from '@rps/core/shop';
import { isTerminalPack } from '@rps/core/packs';
import { getGameWebSocketUrl } from '../config';
import { usePlayerIdentity } from '../hooks/use-player-identity';
import { useSolanaWallet } from '../hooks/use-solana-wallet';
import { usePrivyWallet } from '../hooks/use-privy-wallet';
import { proveSeekerWallet, signShopTransaction } from '../solana-wallet-adapter';
import { shopPurchaseStorage } from '../storage/shop-purchase';
import { saveFigureSlots } from '../storage/figure-loadout';
import { homeArt, homeFont, ToyHomeButton, ToyHomePanel } from '../components/toy-home-controls';
import { ToyBadge, ToyDialog } from '../components/toy-dialog';
import { StatusBanner } from '../components/status-banner';
import { figurePortrait, useFigureCatalog } from '../figures/catalog';
import { colors, spacing } from '../theme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

const scenery = require('../assets/ui/battle-playground.png');
const showcase = require('../assets/ui/toy-box-home-arena.png');
type Props = NativeStackScreenProps<RootStackParamList, 'Shop'>;

export function ShopScreen({ navigation, route }: Props) {
  const definitions = useFigureCatalog();
  const insets = useSafeAreaInsets();
  const { sessionToken, error: sessionError } = usePlayerIdentity();
  const wallet = useSolanaWallet();
  const privy = usePrivyWallet();
  const shop = useShop(getGameWebSocketUrl().replace(/^ws/, 'http'), sessionToken, shopPurchaseStorage);
  const pack = usePackShop(getGameWebSocketUrl().replace(/^ws/, 'http'), sessionToken, packPurchaseStorage);
  const purchaseBlocked = shop.hasPurchase || pack.hasPurchase;
  const purchaseBusy = shop.busy || pack.busy;
  const loadFigures = shop.loadCatalog, loadPack = pack.loadCatalog;
  useEffect(() => {
    const refresh = () => {
      if (purchaseBlocked || purchaseBusy || navigation.isFocused?.() === false) return;
      loadFigures(); loadPack();
    };
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    const unsubscribe = navigation.addListener?.('focus', refresh);
    return () => { subscription.remove(); unsubscribe?.(); };
  }, [navigation, loadFigures, loadPack, purchaseBlocked, purchaseBusy]);
  const order = shop.order;
  const [walletKind, setWalletKind] = useState<'external' | 'privy'>(wallet.isSupported && !route.params?.signIn ? 'external' : 'privy');
  const [walletOpen, setWalletOpen] = useState(Boolean(route.params?.signIn));
  const [purchasePopup, setPurchasePopup] = useState<'figure' | 'pack' | null>(null);
  const seenPurchases = useRef({ figure: false, pack: false });
  // Recover unfinished intents once. A saved terminal receipt is history, not
  // a new purchase: keep it available through View purchase without opening it.
  // Status updates never reopen a manually hidden popup or discard recovery data.
  useEffect(() => {
    const previous = seenPurchases.current;
    const openFigure = shop.hasPurchase && !previous.figure && (!order || !isTerminalMint(order));
    const openPack = pack.hasPurchase && !previous.pack && (!pack.order || !isTerminalPack(pack.order));
    seenPurchases.current = { figure: shop.hasPurchase, pack: pack.hasPurchase };
    setPurchasePopup(current => {
      if (openFigure) return 'figure';
      if (openPack) return 'pack';
      if (current === 'figure' && previous.figure && !shop.hasPurchase) return null;
      if (current === 'pack' && previous.pack && !pack.hasPurchase) return null;
      return current;
    });
  }, [shop.hasPurchase, pack.hasPurchase, order, pack.order]);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [paymentDetailsOpen, setPaymentDetailsOpen] = useState(false);
  useEffect(() => { setPaymentDetailsOpen(false); }, [order?.id]);
  useEffect(() => {
    if (route.params?.signIn) { setWalletKind('privy'); setWalletOpen(true); }
  }, [route.params?.signIn]);
  useEffect(() => { if (!wallet.isSupported) setWalletKind('privy'); }, [wallet.isSupported]);
  const address = walletKind === 'privy' || !wallet.isSupported ? privy.address : wallet.address;
  const orderSigner = order?.buyer === privy.address ? privy.signShopTransaction : wallet.isSupported && order?.buyer === wallet.address ? signShopTransaction : null;
  const canClose = !shop.signingStarted || Boolean(order && isTerminalMint(order));
  const error = actionError || shop.error || (wallet.isSupported ? wallet.error : null) || privy.error || sessionError;
  const figures = shop.catalog?.figures.filter(figure => figure.id !== 'fig1') ?? [];
  const run = (task: () => Promise<unknown>) => {
    setActionError(null);
    task().catch(cause => setActionError(cause instanceof Error ? cause.message : 'Please try again.'));
  };
  const disconnectWallet = async (kind: 'external' | 'privy') => {
    if (purchaseBlocked || purchaseBusy || !pack.ready) return;
    await shop.clearWallet();
    await saveFigureSlots(Array<string | null>(FIGURE_SLOTS).fill(null));
    if (kind === 'external') await wallet.disconnect(); else await privy.disconnect();
  };
  const sendCode = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setEmailError('Enter a valid email address.'); return; }
    setEmailError(null); setWalletKind('privy'); run(() => privy.sendCode(email.trim()));
  };
  const needsSolanaMobile = (figure: ShopFigure) => figure.seekerExclusive && (!wallet.isSupported || walletKind !== 'external');
  const reviewFigure = (figure: ShopFigure) => {
    if (needsSolanaMobile(figure)) {
      run(async () => {
        try { await Linking.openURL(shop.catalog?.solanaMobileStoreUrl ?? DEFAULT_SOLANA_MOBILE_STORE_URL); }
        catch { throw new Error('Could not open the Solana Mobile store. Please try again.'); }
      });
      return;
    }
    if (!figure.available || !figure.priceLamports || !shop.ready || !pack.ready || purchaseBusy || purchaseBlocked) return;
    if (!address) { setWalletOpen(true); return; }
    setPurchasePopup('figure');
    run(() => shop.prepare(figure.id, address, figure.seekerExclusive ? proveSeekerWallet : undefined));
  };
  const openArmy = (expectedAssetId?: string) => { setWalletOpen(false); setPurchasePopup(null); navigation.navigate('Army', expectedAssetId ? { expectedAssetId } : undefined); };
  const figurePurchaseTitle = order?.status === 'confirmed' ? 'Welcome to your army!' : order?.status === 'failed' || order?.status === 'expired' ? 'Purchase not completed' : order?.status === 'submitted' ? 'Processing purchase' : order ? 'Review your purchase' : error && !shop.busy ? 'Purchase needs attention' : 'Preparing purchase';

  return (
    <View style={styles.screen}>
      <Image pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" source={scenery} style={styles.scenery} />
      <View testID="shop-header" style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <ToyHomeButton small tone="white" accessibilityLabel="Back from figure shop" onPress={() => navigation.goBack()}>‹</ToyHomeButton>
        <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={styles.title}>Figure shop</Text>
        <ToyHomeButton small icon={homeArt.army} accessibilityLabel="Open your army" onPress={() => openArmy()} />
      </View>
      <ScrollView testID="shop-scroll" keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
        <Text style={styles.subtitle}>Pick your next fighter!</Text>
        {shop.catalog?.cluster === 'devnet' && <View style={[styles.networkBadge, styles.testNetwork]}><Text style={styles.network}>TEST MODE · NO REAL PURCHASES</Text></View>}
        <Pressable accessibilityRole="button" accessibilityLabel={wallet.isSupported ? 'Choose purchase wallet' : address ? 'Manage account' : 'Register'} onPress={() => setWalletOpen(true)} style={({ pressed }) => [styles.walletShortcut, pressed && styles.pressed]}>
          <View style={styles.walletIcon}><Text style={styles.walletSymbol}>◎</Text></View>
          <View style={styles.grow}><Text style={styles.walletTitle}>{address ? walletKind === 'privy' ? 'Your account' : 'Seeker wallet connected' : wallet.isSupported ? 'Connect your wallet' : 'Register'}</Text><Text style={styles.walletCaption}>{address ? (walletKind === 'privy' ? 'Signed in with email · tap to manage' : 'Ready to buy figures · tap to manage') : wallet.isSupported ? 'Use your Seeker wallet to buy figures' : 'Sign in with email'}</Text></View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        {error && !shop.hasPurchase && purchasePopup !== 'figure' && <ToyHomePanel style={styles.errorPanel}><StatusBanner message={figureStoreMessage(error)} tone="error" /><ToyHomeButton compact tone="white" disabled={shop.busy} onPress={() => run(() => shop.loadCatalog())}>Try again</ToyHomeButton></ToyHomePanel>}

        <ShopPack pack={pack} address={address} blocked={shop.hasPurchase || purchaseBusy} onBuy={() => {
          if (!shop.ready || !pack.ready || purchaseBlocked || purchaseBusy) return;
          if (!address) { setWalletOpen(true); return; }
          setPurchasePopup('pack');
          run(() => pack.prepare(address));
        }} purchaseVisible={purchasePopup === 'pack' && !walletOpen}
          onOpenPurchase={() => { setWalletOpen(false); setPurchasePopup('pack'); }} />

        {shop.hasPurchase && <ToyHomeButton tone="white" accessibilityLabel="View figure purchase" onPress={() => { setWalletOpen(false); setPurchasePopup('figure'); }}>View purchase</ToyHomeButton>}

        {!shop.catalog && !error && <ToyHomePanel style={styles.skeleton}><View accessibilityLabel="Loading figures" accessibilityRole="progressbar" style={styles.skeletonArt} /><View style={styles.skeletonLine} /><View style={styles.skeletonPrice} /><View style={styles.skeletonButton} /><Text style={styles.note}>Unpacking the figure shop…</Text></ToyHomePanel>}
        {shop.catalog && figures.length === 0 && <ToyHomePanel style={styles.empty}><Image source={homeArt.shop} style={styles.emptyChest} /><Text style={styles.sectionTitle}>New fighters on the way</Text><Text style={styles.copy}>The shelves are empty for now. Your free army is always ready.</Text><ToyHomeButton compact onPress={() => openArmy()}>Open your army</ToyHomeButton></ToyHomePanel>}
        {figures.map(figure => <ToyHomePanel key={figure.id} style={styles.figureCard}>
          <View style={styles.showcase}>
            <Image pointerEvents="none" accessibilityElementsHidden source={showcase} style={styles.showcaseScenery} />
            <View pointerEvents="none" style={styles.plinthBase} /><View pointerEvents="none" style={styles.plinthTop} />
            <Image accessibilityLabel={figure.name + ' preview'} source={figurePortrait(figure.id, definitions, figure.imageUrl)} style={styles.figureImage} />
            <View style={styles.edition}><Text style={styles.editionText}>FIG {String(figure.variant).padStart(2, '0')}</Text></View>
            {figure.seekerExclusive && <View style={styles.exclusive}><Text style={styles.exclusiveText}>SEEKER EXCLUSIVE</Text></View>}
          </View>
          <View style={styles.cardCopy}>
            <View style={styles.figureHeading}><Text accessibilityRole="header" style={styles.figureName}>{figure.name}</Text>{!needsSolanaMobile(figure) && <View style={styles.priceTag}><Text style={styles.price}>{figure.priceLamports ? figurePaymentPrice(figure, shop.catalog!.cluster) : 'Not available'}</Text></View>}</View>
            <Text style={styles.copy}>{figure.description}</Text>
            {figure.seekerExclusive && <Text style={styles.restriction}>Only available on Seeker.</Text>}
            <ToyHomeButton tone="yellow" busy={!needsSolanaMobile(figure) && shop.busy && !shop.hasPurchase} disabled={!needsSolanaMobile(figure) && (!figure.available || !figure.priceLamports || !shop.ready || !pack.ready || purchaseBlocked || purchaseBusy)} accessibilityLabel={needsSolanaMobile(figure) ? 'Solana Mobile Exclusive' : 'Buy ' + figure.name} accessibilityHint={needsSolanaMobile(figure) ? 'Opens the Solana Mobile store in your browser' : undefined} onPress={() => reviewFigure(figure)}>
              {needsSolanaMobile(figure) ? 'Solana Mobile Exclusive' : !figure.available || !figure.priceLamports ? 'Purchase unavailable' : address ? 'Buy figure' : wallet.isSupported ? 'Connect your wallet' : 'Register'}
            </ToyHomeButton>
            <Text style={styles.note}>{needsSolanaMobile(figure) ? 'Explore Solana Mobile in your browser' : 'Review the total before you buy'}</Text>
          </View>
        </ToyHomePanel>)}
        <Text style={styles.footerNote}>Each figure can fill one army slot. Your fighters’ look changes, not their weapons.</Text>
      </ScrollView>
      <ToyDialog visible={walletOpen || purchasePopup !== null}
        title={walletOpen ? wallet.isSupported ? 'Your purchase account' : privy.address ? 'Your account' : 'Sign in with email' : purchasePopup === 'pack' ? packPurchaseTitle(pack) : figurePurchaseTitle}
        icon={homeArt.shop} keyboard={walletOpen}
        contentKey={walletOpen ? 'account' : purchasePopup === 'pack' ? `pack:${pack.order?.status ?? 'preparing'}` : `figure:${order?.status ?? 'preparing'}`}
        onClose={() => { if (walletOpen) setWalletOpen(false); else setPurchasePopup(null); }}
        closeLabel={walletOpen ? 'Close shop account' : purchasePopup === 'pack' ? 'Close pack purchase popup' : 'Close figure purchase popup'}
        testID={walletOpen || purchasePopup === null ? 'shop-wallet-dialog' : purchasePopup === 'pack' ? 'pack-purchase-dialog' : 'figure-purchase-dialog'}>
      {purchasePopup === 'figure' && !walletOpen && <>
        {error && <StatusBanner message={figureStoreMessage(error)} tone="error" />}
        {((shop.busy && !order) || order?.status === 'submitted') && !error && <ActivityIndicator accessibilityRole="progressbar" accessibilityLabel={order ? 'Processing purchase' : 'Preparing purchase'} color={colors.accentShadow} size="large" />}
        {order ? <>
          <ToyBadge tone={order.status === 'confirmed' ? 'green' : order.status === 'failed' || order.status === 'expired' ? 'coral' : 'yellow'}>{order.status === 'confirmed' ? 'PURCHASE COMPLETE' : order.status === 'submitted' ? 'PROCESSING PURCHASE' : order.status === 'failed' ? 'PURCHASE FAILED' : order.status === 'expired' ? 'PURCHASE EXPIRED' : 'AWAITING YOUR APPROVAL'}</ToyBadge>
          <PurchaseProgress status={order.status} />
          <Text accessibilityLiveRegion="polite" style={styles.copy}>{order.status === 'confirmed' ? 'Purchase complete. Your figure is in your collection.' : order.status === 'submitted' ? 'Processing your purchase… You can leave and check back.' : order.status === 'failed' ? figureStoreMessage(order.error, 'The purchase failed. Check its status before trying again.') : order.status === 'expired' ? 'This purchase expired. Close it to start again.' : order.error ? figureStoreMessage(order.error) : 'Review the total below. Nothing is purchased until you approve.'}</Text>
          <View style={styles.receiptFigure}><View style={styles.receiptPortrait}><Image source={figurePortrait(order.figureId, definitions)} style={styles.receiptImage} /></View><Text style={styles.sectionTitle}>{definitions.find(figure => figure.id === order.figureId)?.name ?? order.figureId}</Text></View>
          <View style={styles.breakdown}>
            <ReceiptRow label="Figure price" value={figurePaymentPrice(order, order.cluster)} />
            <ReceiptRow label="Estimated additional fees" value={figurePrice(order.networkFeeLamports, order.cluster)} />
            <View style={styles.divider} />
            <ReceiptRow label="Estimated total" value={figurePurchaseTotal(order)} total />
          </View>
          {order.cluster === 'devnet' && <Text style={styles.copy}>Test purchase only. No real payment.</Text>}
          <Text style={styles.copy}>Sold by RIPSY · One figure for your collection</Text>
          <ToyHomeButton compact tone="white" onPress={() => setPaymentDetailsOpen(value => !value)}>{paymentDetailsOpen ? 'Hide payment details' : 'Payment details'}</ToyHomeButton>
          {paymentDetailsOpen && <><Text style={styles.label}>PURCHASE ACCOUNT</Text><Text selectable style={styles.address}>{order.buyer}</Text><Text style={styles.label}>SELLER ACCOUNT</Text><Text selectable style={styles.address}>{order.treasury}</Text></>}
          {order.status === 'prepared' && !orderSigner && <><Text style={styles.copy}>Sign in to the receiving account to approve the saved purchase.</Text><ToyHomeButton tone="white" onPress={() => setWalletOpen(true)}>{wallet.isSupported ? 'Reconnect wallet' : 'Sign in with email'}</ToyHomeButton></>}
          {order.status === 'prepared' && <ToyHomeButton tone="yellow" busy={shop.busy} disabled={!orderSigner} onPress={() => { if (orderSigner) run(() => shop.confirm(orderSigner)); }}>{shop.signingStarted ? 'Retry purchase approval' : 'Confirm purchase'}</ToyHomeButton>}
          {order.status === 'confirmed' && <ToyHomeButton tone="yellow" onPress={() => openArmy(order.asset)}>Add to your army</ToyHomeButton>}
          {paymentDetailsOpen && order.signature && <ToyHomeButton compact tone="white" onPress={() => run(() => Linking.openURL(solanaExplorer('tx', order.signature!, order.cluster)))}>View payment record ↗</ToyHomeButton>}
        </> : <Text accessibilityLiveRegion="polite" style={styles.copy}>{error && !shop.hasPurchase ? 'No payment has been approved. Close this popup and try again.' : 'Preparing your purchase… Retry to recover this same request if the connection was interrupted.'}</Text>}
        {shop.hasPurchase && (!canClose || !order || Boolean(error)) && <ToyHomeButton compact tone="white" disabled={shop.busy} onPress={() => run(() => shop.checkStatus())}>Check purchase status</ToyHomeButton>}
        {shop.hasPurchase && canClose && <ToyHomeButton compact tone="white" disabled={shop.busy} onPress={() => run(() => shop.dismiss())}>{order && isTerminalMint(order) ? 'Done' : 'Cancel purchase'}</ToyHomeButton>}
        {shop.hasPurchase && <Text style={styles.note}>Closing this popup keeps your purchase saved.</Text>}
      </>}
      {purchasePopup === 'pack' && !walletOpen && <ShopPackPurchase pack={pack} address={address} blocked={shop.hasPurchase || purchaseBusy}
        onConfirm={() => {
          const signer = pack.order?.buyer === privy.address ? privy.signShopTransaction : wallet.isSupported && pack.order?.buyer === wallet.address ? signShopTransaction : null;
          if (signer) run(() => pack.confirm(signer)); else setWalletOpen(true);
        }} onArmy={openArmy} onAccount={() => setWalletOpen(true)} />}
      {walletOpen && <>
              <Text style={styles.copy}>{wallet.isSupported ? 'Choose your purchase account. You approve every purchase.' : 'Sign in with email to keep your collection in RIPSY.'}</Text>
              {wallet.isSupported && figures.some(figure => figure.seekerExclusive) && <View style={styles.seekerNotice}><Text style={styles.restriction}>Seeker fighter is Seeker exclusive.</Text><Text style={styles.smallCopy}>Connect your Seeker wallet to check availability.</Text></View>}
              {wallet.isSupported && wallet.address && <View style={[styles.walletOption, walletKind === 'external' && styles.walletSelected]}>
                <Text style={styles.optionTitle}>Seeker wallet{walletKind === 'external' ? ' · selected' : ''}</Text><Text selectable style={styles.address}>{short(wallet.address)}</Text>
                {walletKind !== 'external' && <ToyHomeButton compact disabled={purchaseBusy} onPress={() => setWalletKind('external')}>Use this wallet</ToyHomeButton>}
                {walletKind === 'external' && <ToyHomeButton compact tone="white" disabled={!shop.ready || !pack.ready || purchaseBusy || purchaseBlocked} onPress={() => run(() => disconnectWallet('external'))}>Disconnect wallet</ToyHomeButton>}
              </View>}
              {/* Restoring a saved purchase must allow reconnecting its signer. */}
              {!wallet.address && wallet.isSupported && <ToyHomeButton busy={wallet.status === 'connecting'} disabled={shop.busy || privy.busy} onPress={() => { setWalletKind('external'); run(wallet.connect); }}>Connect your wallet</ToyHomeButton>}
              {privy.address ? <View style={[styles.walletOption, walletKind === 'privy' && styles.walletSelected]}>
                <Text style={styles.optionTitle}>Signed in with email{walletKind === 'privy' ? ' · selected' : ''}</Text>
                {walletKind !== 'privy' && <ToyHomeButton compact disabled={purchaseBusy} onPress={() => setWalletKind('privy')}>Use email account</ToyHomeButton>}
                {walletKind === 'privy' && <ToyHomeButton compact tone="white" busy={privy.activity === 'disconnecting'} disabled={!shop.ready || !pack.ready || purchaseBlocked || purchaseBusy} onPress={() => run(() => disconnectWallet('privy'))}>Sign out</ToyHomeButton>}
              </View> : privy.status === 'authenticated' ? <ToyHomeButton busy={privy.activity === 'creating-wallet'} disabled={shop.busy || wallet.status === 'connecting'} onPress={() => { setWalletKind('privy'); run(privy.createWallet); }}>Finish registration</ToyHomeButton> : privy.configured ? <View style={styles.loginForm}>
                {wallet.isSupported && <Text style={styles.optionTitle}>Sign in with email</Text>}<Text style={styles.smallCopy}>Keep your figure collection in your RIPSY account.</Text>
                <Text style={styles.label}>EMAIL ADDRESS</Text>
                <TextInput accessibilityLabel="Email address" textContentType="emailAddress" autoCapitalize="none" autoCorrect={false} autoComplete="email" editable={!privy.busy && !privy.codeSent && !shop.busy} keyboardType="email-address" onChangeText={value => { setEmail(value); setEmailError(null); }} onSubmitEditing={() => { if (!privy.busy && !shop.busy && !privy.codeSent && email.trim()) sendCode(); }} returnKeyType="done" placeholder="you@example.com" placeholderTextColor={colors.kitPanelMuted} style={[styles.input, emailError && styles.invalidInput]} value={email} />
                {emailError && <Text accessibilityRole="alert" style={styles.formError}>{emailError}</Text>}
                {privy.codeSent && <><ToyBadge tone="green">CODE SENT</ToyBadge><Text style={styles.smallCopy}>Check your email for the sign-in code.</Text><Text style={styles.label}>SIGN-IN CODE</Text><TextInput accessibilityLabel="Email verification code" textContentType="oneTimeCode" autoComplete="one-time-code" keyboardType="number-pad" editable={!privy.busy && !shop.busy} maxLength={8} onChangeText={setCode} placeholder="Verification code" placeholderTextColor={colors.kitPanelMuted} style={styles.input} value={code} /></>}
                {!privy.codeSent ? <ToyHomeButton busy={privy.activity === 'sending-code'} disabled={!email.trim() || shop.busy || privy.busy || wallet.status === 'connecting'} onPress={sendCode}>Send sign-in code</ToyHomeButton> : <ToyHomeButton busy={privy.activity === 'verifying-code' || privy.activity === 'creating-wallet'} disabled={!code.trim() || shop.busy || privy.busy || wallet.status === 'connecting'} onPress={() => { setWalletKind('privy'); run(() => privy.verifyCode(email.trim(), code.trim())); }}>Sign in</ToyHomeButton>}
              </View> : <Text style={styles.note}>Sign in with email is unavailable in this build.</Text>}
              {privy.status === 'authenticated-unverified' && <><Text style={styles.smallCopy}>Your saved email session could not be verified. Check your connection and retry.</Text><ToyHomeButton compact tone="white" disabled={privy.busy || shop.busy} onPress={() => run(privy.refresh)}>Retry email session</ToyHomeButton></>}
              {error && <StatusBanner message={figureStoreMessage(error)} tone="error" />}
              {address && <ToyHomeButton tone="yellow" onPress={() => setWalletOpen(false)}>Back to figures</ToyHomeButton>}
      </>}
      </ToyDialog>
    </View>
  );
}

function short(value: string) { return value.slice(0, 4) + '…' + value.slice(-4); }
function ReceiptRow({ label, value, total }: { label: string; value: string; total?: boolean }) {
  return <View style={styles.receiptRow}><Text style={[styles.receiptLabel, total && styles.total]}>{label}</Text><Text style={[styles.receiptValue, total && styles.total]}>{value}</Text></View>;
}
function PurchaseProgress({ status }: { status: string }) {
  const completed = status === 'confirmed' ? 3 : status === 'submitted' ? 2 : 0;
  return <View accessibilityLabel={'Purchase status ' + status} style={styles.progressRow}>
    {['REVIEW', 'APPROVE', 'COMPLETE'].map((label, index) => <View key={label} style={styles.progressItem}><View style={[styles.progressDot, index < completed && styles.progressComplete, status === 'prepared' && index === 0 && styles.progressCurrent]}><Text style={styles.progressNumber}>{index < completed ? '✓' : index + 1}</Text></View><Text style={styles.progressLabel}>{label}</Text></View>)}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scenery: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', resizeMode: 'cover' },
  header: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 14, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, color: colors.ink, fontFamily: homeFont, fontSize: 30, textAlign: 'center' },
  content: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 14, gap: 14 },
  subtitle: { color: colors.ink, fontFamily: homeFont, fontSize: 18, textAlign: 'center' },
  networkBadge: { alignSelf: 'center', backgroundColor: colors.kitPanel, borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  testNetwork: { backgroundColor: colors.rewardHighlight },
  network: { color: colors.ink, fontSize: 10, fontWeight: '800' },
  grow: { flex: 1, gap: spacing.xs },
  walletShortcut: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: 20, backgroundColor: colors.kitPanel },
  walletIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHighlight },
  walletSymbol: { color: colors.ink, fontSize: 27 },
  walletTitle: { color: colors.ink, fontFamily: homeFont, fontSize: 16 },
  walletCaption: { color: colors.textMuted, fontSize: 11 },
  chevron: { color: colors.accentShadow, fontSize: 30 },
  pressed: { opacity: 0.75 },
  errorPanel: { gap: spacing.md },
  figureCard: { padding: 0 },
  showcase: { height: 248, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', alignItems: 'center', backgroundColor: colors.surfaceHighlight },
  showcaseScenery: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', resizeMode: 'cover' },
  figureImage: { position: 'absolute', width: 300, height: 300, bottom: 24, resizeMode: 'contain' },
  // Native molded plinths reuse the shared Toy Box material/role colors.
  plinthBase: { position: 'absolute', bottom: 13, width: 180, height: 32, borderRadius: 90, backgroundColor: colors.accentShadow },
  plinthTop: { position: 'absolute', bottom: 23, width: 180, height: 25, borderRadius: 90, backgroundColor: colors.accent },
  edition: { position: 'absolute', top: spacing.md, left: spacing.md, borderRadius: 10, backgroundColor: colors.kitPanel, padding: spacing.sm },
  editionText: { color: colors.ink, fontSize: 11, fontWeight: '900' },
  exclusive: { position: 'absolute', top: spacing.md, right: spacing.md, borderRadius: 10, backgroundColor: colors.reward, padding: spacing.sm },
  exclusiveText: { color: colors.ink, fontSize: 10, fontWeight: '900' },
  cardCopy: { padding: spacing.lg, gap: spacing.md },
  figureHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  figureName: { color: colors.ink, fontFamily: homeFont, fontSize: 24 },
  priceTag: { borderRadius: 12, backgroundColor: colors.rewardHighlight, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  price: { color: colors.ink, fontFamily: homeFont, fontSize: 21, fontVariant: ['tabular-nums'] },
  copy: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  restriction: { color: colors.ink, fontSize: 12, lineHeight: 18, fontWeight: '800' },
  note: { color: colors.textMuted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  footerNote: { color: colors.ink, backgroundColor: colors.kitPanel, borderRadius: 16, padding: spacing.md, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  sectionTitle: { color: colors.ink, fontFamily: homeFont, fontSize: 23 },
  receiptFigure: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, overflow: 'hidden', height: 84 },
  receiptPortrait: { width: 84, height: 84, alignItems: 'center' },
  receiptImage: { position: 'absolute', bottom: 0, width: 140, height: 140, resizeMode: 'contain' },
  breakdown: { padding: spacing.md, gap: spacing.sm, borderRadius: 15, backgroundColor: colors.kitPanelSoft },
  receiptRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  receiptLabel: { color: colors.textMuted, fontSize: 12, flexShrink: 1 },
  receiptValue: { color: colors.ink, fontWeight: '700', fontSize: 14, fontVariant: ['tabular-nums'] },
  total: { color: colors.ink, fontFamily: homeFont, fontSize: 17 },
  divider: { height: 1, backgroundColor: colors.kitPanelBorder },
  label: { color: colors.textMuted, fontWeight: '800', fontSize: 11 },
  address: { color: colors.ink, fontSize: 12, lineHeight: 19, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  progressRow: { flexDirection: 'row', backgroundColor: colors.kitPanelSoft, padding: spacing.md, borderRadius: 14, gap: spacing.sm },
  progressItem: { flex: 1, alignItems: 'center', gap: spacing.xs },
  progressDot: { width: 30, height: 30, borderRadius: 10, borderWidth: 1, borderColor: colors.kitPanelBorder, backgroundColor: colors.kitPanel, alignItems: 'center', justifyContent: 'center' },
  progressComplete: { backgroundColor: colors.kitSuccessSoft, borderColor: colors.kitSuccessInk },
  progressCurrent: { backgroundColor: colors.reward, borderColor: colors.rewardShadow },
  progressNumber: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  progressLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  skeleton: { gap: spacing.md },
  skeletonArt: { height: 220, borderRadius: 16, backgroundColor: colors.surfaceHighlight },
  skeletonLine: { width: '60%', height: 24, borderRadius: 10, backgroundColor: colors.surfaceStrong },
  skeletonPrice: { width: '40%', height: 18, borderRadius: 8, backgroundColor: colors.surfaceStrong },
  skeletonButton: { height: 64, borderRadius: 20, backgroundColor: colors.rewardHighlight },
  empty: { gap: spacing.md, alignItems: 'center' },
  emptyChest: { width: 120, height: 120, resizeMode: 'contain' },
  seekerNotice: { padding: spacing.md, gap: spacing.xs, borderRadius: 14, backgroundColor: colors.rewardHighlight },
  smallCopy: { color: colors.textMuted, fontSize: 12, lineHeight: 19 },
  walletOption: { padding: spacing.md, gap: spacing.sm, borderRadius: 16, backgroundColor: colors.kitPanelSoft, borderWidth: 1, borderColor: colors.kitPanelBorder },
  walletSelected: { backgroundColor: colors.surfaceHighlight, borderColor: colors.accentShadow },
  optionTitle: { color: colors.ink, fontFamily: homeFont, fontSize: 16 },
  loginForm: { gap: spacing.sm },
  input: { minHeight: 54, paddingHorizontal: spacing.md, borderRadius: 16, borderWidth: 1.5, borderColor: colors.kitPanelShadow, backgroundColor: colors.kitPanel, color: colors.ink, fontSize: 16 },
  invalidInput: { borderColor: colors.dangerShadow },
  formError: { color: colors.dangerShadow, fontSize: 12, lineHeight: 18 },
});
