import { ActivityIndicator, AppState, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShop } from '@rps/game-client/use-shop';
import { usePackShop } from '@rps/game-client/use-pack-shop';
import { packPurchaseStorage } from '../storage/pack-purchase';
import { packPurchaseTitle, ShopPack, ShopPackPurchase } from '../components/shop-pack';
import { DEFAULT_SOLANA_MOBILE_STORE_URL, FIGURE_SLOTS, figureOrderQuantity, figureQuantityLimit, figureQuantityPrice, figurePaymentPrice, figureStoreMessage, isTerminalMint, type PurchaseTransaction, type ShopFigure } from '@rps/core/shop';
import { isTerminalPack } from '@rps/core/packs';
import { getGameWebSocketUrl } from '../config';
import { refreshPlayerIdentity, usePlayerIdentity } from '../hooks/use-player-identity';
import { useSolanaWallet } from '../hooks/use-solana-wallet';
import { usePrivyWallet } from '../hooks/use-privy-wallet';
import { proveSeekerWallet, signShopTransaction } from '../solana-wallet-adapter';
import { shopPurchaseStorage } from '../storage/shop-purchase';
import { saveFigureSlots } from '../storage/figure-loadout';
import { homeArt, homeFont, ToyHomeButton, ToyHomePanel } from '../components/toy-home-controls';
import { ToyBadge, ToyDialog } from '../components/toy-dialog';
import { StatusBanner } from '../components/status-banner';
import { FigureQuantity } from '../components/figure-quantity';
import { ShopFigurePreview } from '../components/shop-figure-preview';
import { useShopPreviewMotion, useShopPreviewViewport } from '../hooks/use-shop-previews';
import { figurePortrait, useFigureCatalog } from '../figures/catalog';
import { colors, spacing } from '../theme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

const scenery = require('../assets/ui/battle-playground.png');
const showcase = require('../assets/ui/toy-box-home-arena.png');
const showcaseHeight = 248;
type Props = NativeStackScreenProps<RootStackParamList, 'Shop'>;
type HandoffStage = 'preparing' | 'opening-wallet' | 'sending';
const handoffTitles: Record<HandoffStage, string> = {
  preparing: 'Preparing purchase',
  'opening-wallet': 'Opening your wallet',
  sending: 'Sending purchase',
};

export function ShopScreen({ navigation, route }: Props) {
  const definitions = useFigureCatalog();
  const insets = useSafeAreaInsets();
  const { sessionToken, error: sessionError } = usePlayerIdentity();
  const wallet = useSolanaWallet();
  const privy = usePrivyWallet(!wallet.isSupported);
  const shop = useShop(getGameWebSocketUrl().replace(/^ws/, 'http'), sessionToken, shopPurchaseStorage);
  const pack = usePackShop(getGameWebSocketUrl().replace(/^ws/, 'http'), sessionToken, packPurchaseStorage);
  const activeFigurePurchase = shop.hasPurchase && (!shop.order || !isTerminalMint(shop.order));
  const activePackPurchase = pack.hasPurchase && (!pack.order || !isTerminalPack(pack.order));
  const purchaseBlocked = activeFigurePurchase || activePackPurchase;
  const [directSigning, setDirectSigning] = useState(false);
  const [handoffStage, setHandoffStage] = useState<HandoffStage>('preparing');
  const [payingWithSol, setPayingWithSol] = useState(false);
  const directSigningRef = useRef(false);
  const dismissedHandoff = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const purchaseBusy = shop.busy || pack.busy || directSigning;
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
  const walletKind = wallet.isSupported ? 'external' : 'privy';
  const [walletOpen, setWalletOpen] = useState(Boolean(route.params?.signIn));
  const [purchasePopup, setPurchasePopup] = useState<'figure' | 'pack' | null>(null);
  const previewMotion = useShopPreviewMotion(navigation);
  const previewViewport = useShopPreviewViewport();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const seenPurchases = useRef({ figure: false, pack: false });
  // Opening the shop or recovering a saved payment never opens checkout.
  // Buy and Continue purchase are the only entry points to purchase dialogs.
  useEffect(() => {
    const previous = seenPurchases.current;
    seenPurchases.current = { figure: shop.hasPurchase, pack: pack.hasPurchase };
    setPurchasePopup(current => {
      if (current === 'figure' && previous.figure && !shop.hasPurchase) return null;
      if (current === 'pack' && previous.pack && !pack.hasPurchase) return null;
      return current;
    });
  }, [shop.hasPurchase, pack.hasPurchase]);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [connectingWallet, setConnectingWallet] = useState(false);
  const [restoringAccess, setRestoringAccess] = useState(false);
  const connectionInFlight = useRef(false);
  const accountRequestGeneration = useRef(0);
  const walletBusy = connectingWallet || wallet.status === 'loading' || wallet.status === 'connecting' || wallet.status === 'disconnecting';
  useEffect(() => {
    if (route.params?.signIn) setWalletOpen(true);
  }, [route.params?.signIn]);
  const address = wallet.isSupported ? wallet.address : privy.address;
  const selectedSigner = useRef({ address, sign: wallet.isSupported ? signShopTransaction : privy.signShopTransaction });
  selectedSigner.current = { address, sign: wallet.isSupported ? signShopTransaction : privy.signShopTransaction };
  const signPurchase = async (purchase: PurchaseTransaction) => {
    if (!mounted.current || navigation.isFocused?.() === false || (AppState.currentState && AppState.currentState !== 'active')) throw new Error('Return to the shop to continue this saved purchase.');
    if (dismissedHandoff.current) throw new Error('Purchase paused. Use Continue purchase to approve it.');
    if (selectedSigner.current.address !== purchase.buyer) throw new Error('Reconnect the account selected for this saved purchase.');
    if (directSigningRef.current) setHandoffStage('opening-wallet');
    const signed = await selectedSigner.current.sign(purchase);
    if (mounted.current && directSigningRef.current) setHandoffStage('sending');
    return signed;
  };
  const orderSigner = order?.buyer === address ? selectedSigner.current.sign : null;
  const canClose = !shop.signingStarted || Boolean(order && isTerminalMint(order));
  const error = actionError || shop.error || (wallet.isSupported ? wallet.error : privy.error) || sessionError;
  const needsSessionRecovery = Boolean(shop.authenticationRequired || pack.authenticationRequired || sessionError || restoringAccess);
  const recoveryLabel = wallet.isSupported ? 'Connect Seeker' : 'Restore shop access';
  const recoveryCopy = wallet.isSupported ? 'Reconnect your Seeker wallet to restore shop access. Your purchase stays saved.'
    : 'Restore your shop session to continue. Your purchase stays saved.';
  const figures = shop.catalog?.figures.filter(figure => figure.id !== 'fig1') ?? [];
  const retryable = order?.status === 'failed' || order?.status === 'expired';
  const retryDefinition = figures.find(figure => figure.id === order?.figureId);
  const retryAvailable = Boolean(retryDefinition?.available && retryDefinition.priceLamports && (!retryDefinition.seekerExclusive || wallet.isSupported));
  const accountRestoring = wallet.isSupported ? wallet.status === 'loading' : privy.activity === 'loading';
  const initializationError = needsSessionRecovery || (!shop.ready && shop.error) || (!pack.ready && pack.error)
    || (accountRestoring && (wallet.isSupported ? wallet.error : privy.error));
  const preparingShop = !initializationError && (!sessionToken || !shop.ready || !pack.ready || accountRestoring);
  const preparationCopy = !sessionToken ? 'Getting your shop ready...' : !shop.ready || !pack.ready ? 'Checking saved purchases...' : 'Restoring your account...';
  const run = (task: () => Promise<unknown>) => {
    setActionError(null);
    task().catch(cause => { if (mounted.current) setActionError(cause instanceof Error ? cause.message : 'Please try again.'); });
  };
  const buyAndSign = (task: () => Promise<unknown>, withSol = false) => {
    if (directSigningRef.current) return;
    directSigningRef.current = true;
    dismissedHandoff.current = false;
    setHandoffStage('preparing');
    setPayingWithSol(withSol);
    setDirectSigning(true);
    run(async () => {
      try { await task(); }
      finally { directSigningRef.current = false; if (mounted.current) setDirectSigning(false); }
    });
  };
  const requestAccount = () => {
    if (needsSessionRecovery) {
      if (connectionInFlight.current || purchaseBusy || walletBusy) return;
      connectionInFlight.current = true;
      const generation = ++accountRequestGeneration.current;
      setConnectingWallet(true);
      setRestoringAccess(true);
      run(async () => {
        try {
          // HTTP session renewal and MWA authorization are separate. Connecting
          // alone cannot repair a revoked Bearer token, and neither action may
          // prepare, sign, submit, clear or replace the saved purchase.
          await refreshPlayerIdentity();
          if (!mounted.current || generation !== accountRequestGeneration.current || navigation.isFocused?.() === false || (AppState.currentState && AppState.currentState !== 'active')) return;
          if (wallet.isSupported) await wallet.connect();
        } finally { connectionInFlight.current = false; if (mounted.current) { setConnectingWallet(false); setRestoringAccess(false); } }
      });
      return;
    }
    // Disconnected Seeker shoppers go directly to MWA, not an account chooser.
    // Connecting never prepares or approves a purchase automatically.
    if (!wallet.isSupported || address) { setWalletOpen(true); return; }
    if (connectionInFlight.current || walletBusy) return;
    connectionInFlight.current = true;
    setConnectingWallet(true);
    run(async () => {
      try { await wallet.connect(); }
      finally { connectionInFlight.current = false; setConnectingWallet(false); }
    });
  };
  const disconnectWallet = async (kind: 'external' | 'privy') => {
    if (purchaseBlocked || purchaseBusy || !pack.ready) return;
    await shop.clearWallet();
    await saveFigureSlots(Array<string | null>(FIGURE_SLOTS).fill(null));
    if (kind === 'external') await wallet.disconnect(); else await privy.disconnect();
  };
  const sendCode = () => {
    if (wallet.isSupported) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setEmailError('Enter a valid email address.'); return; }
    setEmailError(null); run(() => privy.sendCode(email.trim()));
  };
  const needsSolanaMobile = (figure: ShopFigure) => figure.seekerExclusive && (!wallet.isSupported || walletKind !== 'external');
  const maximumFor = (figure: ShopFigure) => figureQuantityLimit(figure, shop.catalog?.maxFigureQuantity ?? 1);
  const quantityFor = (figure: ShopFigure) => Math.min(quantities[figure.id] ?? 1, maximumFor(figure));
  const reviewFigure = (figure: ShopFigure) => {
    if (needsSolanaMobile(figure)) {
      run(async () => {
        try { await Linking.openURL(shop.catalog?.solanaMobileStoreUrl ?? DEFAULT_SOLANA_MOBILE_STORE_URL); }
        catch { throw new Error('Could not open the Solana Mobile store. Please try again.'); }
      });
      return;
    }
    if (needsSessionRecovery) { requestAccount(); return; }
    if (!figure.available || !figure.priceLamports || !shop.ready || !pack.ready || preparingShop || directSigningRef.current || purchaseBusy || purchaseBlocked || (wallet.isSupported && walletBusy)) return;
    if (!address) { requestAccount(); return; }
    setPurchasePopup('figure');
    const quantity = quantityFor(figure);
    buyAndSign(() => quantity === 1 ? shop.prepare(figure.id, address, figure.seekerExclusive ? proveSeekerWallet : undefined, signPurchase)
      : shop.prepare(figure.id, address, figure.seekerExclusive ? proveSeekerWallet : undefined, signPurchase, quantity));
  };
  const openArmy = (expectedAssetId?: string) => { setWalletOpen(false); setPurchasePopup(null); navigation.navigate('Army', expectedAssetId ? { expectedAssetId } : undefined); };
  const retryFigure = () => {
    if (!retryable || !retryAvailable || !orderSigner || !shop.ready || !pack.ready || preparingShop || purchaseBusy || activePackPurchase || (wallet.isSupported && walletBusy)) return;
    buyAndSign(() => shop.retry(retryDefinition?.seekerExclusive ? proveSeekerWallet : undefined, signPurchase), Boolean(order?.solFunding));
  };
  const figurePurchaseTitle = needsSessionRecovery ? recoveryLabel : order?.status === 'confirmed' ? 'Welcome to your army!' : order?.status === 'failed' || order?.status === 'expired' ? 'Purchase not completed' : order?.status === 'submitted' ? 'Processing purchase' : order ? 'Continue your purchase' : error && !shop.busy ? 'Purchase needs attention' : !shop.busy ? shop.hasPurchase ? 'Continue your purchase' : 'Choose your figure' : 'Preparing purchase';
  const purchaseTitle = needsSessionRecovery ? recoveryLabel : purchasePopup === 'pack' ? packPurchaseTitle(pack) : figurePurchaseTitle;
  const accountLabel = preparingShop ? 'Preparing shop' : needsSessionRecovery ? recoveryLabel : wallet.isSupported ? address ? 'Choose purchase wallet' : 'Connect your wallet' : address ? 'Manage account' : 'Register';
  const accountTitle = preparingShop ? 'Preparing shop...' : needsSessionRecovery ? recoveryLabel : address ? walletKind === 'privy' ? 'Your account' : 'Seeker wallet connected' : wallet.isSupported ? 'Connect your wallet' : 'Register';
  const accountCaption = preparingShop ? preparationCopy : needsSessionRecovery ? 'Restore access before continuing your purchase' : address ? (walletKind === 'privy' ? 'Signed in with email · tap to manage' : 'Ready to buy figures · tap to manage') : wallet.isSupported ? 'Use your Seeker wallet to buy figures' : 'Sign in with email';
  const accountBusy = preparingShop || connectingWallet || (wallet.isSupported && walletBusy);
  const handoffTitle = handoffStage === 'opening-wallet' && !wallet.isSupported ? 'Approving purchase' : handoffTitles[handoffStage];
  const handoffCopy = handoffStage === 'preparing'
    ? `${payingWithSol ? 'Preparing your SOL payment.' : 'Checking your purchase.'} ${wallet.isSupported ? 'Your wallet will open for approval.' : 'Please wait while we prepare your purchase.'}`
    : handoffStage === 'opening-wallet'
    ? wallet.isSupported ? 'Review and approve the purchase in your wallet.' : 'Approving your purchase - please wait.'
    : 'Approval received. Sending your purchase - please wait.';

  return (
    <View style={styles.screen}>
      <Image pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" source={scenery} style={styles.scenery} />
      <View testID="shop-header" style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <ToyHomeButton small tone="white" accessibilityLabel="Back from figure shop" onPress={() => navigation.goBack()}>‹</ToyHomeButton>
        <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={styles.title}>Figure shop</Text>
        <ToyHomeButton small icon={homeArt.army} accessibilityLabel="Open your army" onPress={() => openArmy()} />
      </View>
      <ScrollView testID="shop-scroll" keyboardShouldPersistTaps="handled" onLayout={previewViewport.onViewportLayout}
        onScroll={previewViewport.onScroll} scrollEventThrottle={32}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
        <Text style={styles.subtitle}>Pick your next fighter!</Text>
        {shop.catalog?.cluster === 'devnet' && <View style={[styles.networkBadge, styles.testNetwork]}><Text style={styles.network}>TEST MODE · NO REAL PURCHASES</Text></View>}
        <Pressable testID="shop-account-shortcut" accessibilityRole="button" accessibilityLabel={accountLabel} accessibilityState={{ disabled: accountBusy, busy: accountBusy }} disabled={accountBusy} onPress={() => { if (!accountBusy) requestAccount(); }} style={({ pressed }) => [styles.walletShortcut, pressed && styles.pressed]}>
          <View style={styles.walletIcon}><Text style={styles.walletSymbol}>◎</Text></View>
          <View style={styles.grow}><Text accessibilityLiveRegion="polite" style={styles.walletTitle}>{accountTitle}</Text><Text accessibilityLiveRegion="polite" style={styles.walletCaption}>{accountCaption}</Text></View>
          {accountBusy ? <ActivityIndicator accessibilityRole="progressbar" accessibilityLabel={preparingShop ? 'Preparing shop' : restoringAccess ? 'Restoring shop access' : 'Connecting wallet'} color={colors.accentShadow} /> : <Text style={styles.chevron}>›</Text>}
        </Pressable>
        {needsSessionRecovery && purchasePopup === null && !walletOpen && <StatusBanner message={actionError || sessionError || recoveryCopy} tone={actionError || sessionError ? 'error' : 'warning'} />}
        {error && !needsSessionRecovery && !shop.hasPurchase && purchasePopup !== 'figure' && <ToyHomePanel style={styles.errorPanel}><StatusBanner message={figureStoreMessage(error)} tone="error" /><ToyHomeButton compact tone="white" disabled={shop.busy} onPress={() => run(() => shop.loadCatalog())}>Try again</ToyHomeButton></ToyHomePanel>}

        <ShopPack pack={pack} address={address} walletSupported={wallet.isSupported} accountBusy={preparingShop || (wallet.isSupported && walletBusy)} blocked={activeFigurePurchase || purchaseBusy} onBuy={() => {
          if (needsSessionRecovery) { requestAccount(); return; }
          if (!pack.catalog?.available || !shop.ready || !pack.ready || preparingShop || directSigningRef.current || purchaseBlocked || purchaseBusy || (wallet.isSupported && walletBusy)) return;
          if (!address) { requestAccount(); return; }
          setPurchasePopup('pack');
          buyAndSign(() => pack.prepare(address, signPurchase));
        }} purchaseVisible={purchasePopup === 'pack' && !walletOpen} />

        {purchaseBlocked && <ToyHomePanel><Text style={styles.copy}>Finish your current purchase before buying another fighter.</Text><ToyHomeButton tone="white" busy={preparingShop} disabled={preparingShop || purchaseBusy} onPress={() => { if (preparingShop || purchaseBusy) return; setWalletOpen(false); setPurchasePopup(activeFigurePurchase ? 'figure' : 'pack'); }}>Continue purchase</ToyHomeButton></ToyHomePanel>}

        {!shop.catalog && !error && <ToyHomePanel style={styles.skeleton}><View accessibilityLabel="Loading figures" accessibilityRole="progressbar" style={styles.skeletonArt} /><View style={styles.skeletonLine} /><View style={styles.skeletonPrice} /><View style={styles.skeletonButton} /><Text style={styles.note}>Unpacking the figure shop…</Text></ToyHomePanel>}
        {shop.catalog && figures.length === 0 && <ToyHomePanel style={styles.empty}><Image source={homeArt.shop} style={styles.emptyChest} /><Text style={styles.sectionTitle}>New fighters on the way</Text><Text style={styles.copy}>The shelves are empty for now. Your free army is always ready.</Text><ToyHomeButton compact onPress={() => openArmy()}>Open your army</ToyHomeButton></ToyHomePanel>}
        {figures.map(figure => <View key={figure.id} testID={`shop-card-${figure.id}`}
          onLayout={event => previewViewport.onCardLayout(figure.id, event, showcaseHeight)}><ToyHomePanel style={styles.figureCard}>
          <View style={styles.showcase}>
            <Image pointerEvents="none" accessibilityElementsHidden source={showcase} style={styles.showcaseScenery} />
            <View pointerEvents="none" style={styles.plinthBase} /><View pointerEvents="none" style={styles.plinthTop} />
            <ShopFigurePreview figure={figure} definition={definitions.find(definition => definition.id === figure.id)}
              active={previewMotion && !walletOpen && purchasePopup === null && previewViewport.visibleIds.includes(figure.id)} />
            {figure.seekerExclusive && <View style={styles.exclusive}><Text style={styles.exclusiveText}>SEEKER EXCLUSIVE</Text></View>}
          </View>
          <View style={styles.cardCopy}>
            <View style={styles.figureHeading}><Text accessibilityRole="header" style={styles.figureName}>{figure.name}</Text>{!needsSolanaMobile(figure) && <View style={styles.priceTag}><Text style={styles.price} accessibilityLiveRegion="polite">{figure.priceLamports ? figurePaymentPrice(figureQuantityPrice(figure, quantityFor(figure)), shop.catalog!.cluster) : 'Not available'}</Text></View>}</View>
            <Text style={styles.copy}>{figure.description}</Text>
            {figure.seekerExclusive && <Text style={styles.restriction}>Only available on Seeker.</Text>}
            {!needsSolanaMobile(figure) && figure.available && maximumFor(figure) > 1 && <FigureQuantity name={figure.name} value={quantityFor(figure)} maximum={maximumFor(figure)} disabled={!shop.ready || !pack.ready || preparingShop || purchaseBlocked || purchaseBusy || (wallet.isSupported && walletBusy)} onChange={value => setQuantities(current => ({ ...current, [figure.id]: value }))} />}
            <ToyHomeButton tone="yellow" busy={!needsSolanaMobile(figure) && (preparingShop || (shop.busy && !shop.hasPurchase) || (wallet.isSupported && walletBusy))} disabled={!needsSolanaMobile(figure) && (!figure.available || !figure.priceLamports || !shop.ready || !pack.ready || preparingShop || purchaseBlocked || purchaseBusy || (wallet.isSupported && walletBusy))} accessibilityLabel={needsSolanaMobile(figure) ? 'Solana Mobile Exclusive' : quantityFor(figure) > 1 ? `Buy ${quantityFor(figure)} ${figure.name} figures` : 'Buy ' + figure.name} accessibilityHint={needsSolanaMobile(figure) ? 'Opens the Solana Mobile store in your browser' : undefined} onPress={() => reviewFigure(figure)}>
              {needsSolanaMobile(figure) ? 'Solana Mobile Exclusive' : !figure.available || !figure.priceLamports ? 'Purchase unavailable' : address ? quantityFor(figure) > 1 ? `Buy ${quantityFor(figure)} figures` : 'Buy figure' : wallet.isSupported ? 'Connect your wallet' : 'Register'}
            </ToyHomeButton>
            <Text style={styles.note}>{needsSolanaMobile(figure) ? 'Explore Solana Mobile in your browser' : quantityFor(figure) > 1 ? `Total for ${quantityFor(figure)} figures + additional fees` : wallet.isSupported ? 'Approve your purchase in your wallet' : 'Approve your purchase to continue'}</Text>
          </View>
        </ToyHomePanel></View>)}
        <Text style={styles.footerNote}>Each figure can fill one army slot. Your fighters’ look changes, not their weapons.</Text>
      </ScrollView>
      <ToyDialog visible={walletOpen || purchasePopup !== null}
        title={walletOpen ? wallet.isSupported ? 'Your purchase account' : privy.address ? 'Your account' : 'Sign in with email' : directSigning ? handoffTitle : purchaseTitle}
        icon={homeArt.shop} keyboard={walletOpen}
        contentKey={walletOpen ? 'account' : directSigning ? 'purchase-handoff' : purchasePopup === 'pack' ? `pack:${pack.order?.status ?? 'preparing'}` : `figure:${order?.status ?? 'preparing'}`}
        onClose={() => { accountRequestGeneration.current += 1; if (walletOpen) setWalletOpen(false); else { if (directSigningRef.current) dismissedHandoff.current = true; setPurchasePopup(null); } }}
        closeLabel={walletOpen ? 'Close shop account' : purchasePopup === 'pack' ? 'Close pack purchase popup' : 'Close figure purchase popup'}
        testID={walletOpen || purchasePopup === null ? 'shop-wallet-dialog' : purchasePopup === 'pack' ? 'pack-purchase-dialog' : 'figure-purchase-dialog'}>
      {directSigning && !walletOpen && <View testID="purchase-handoff" style={styles.handoff}>
        <ActivityIndicator accessibilityRole="progressbar" accessibilityLabel={handoffTitle} color={colors.accentShadow} size="large" />
        <Text accessibilityLiveRegion="polite" style={styles.copy}>{handoffCopy}</Text>
        <Text style={styles.handoffNote}>Please wait. You don't need to tap Buy again.</Text>
      </View>}
      {purchasePopup === 'figure' && !walletOpen && !directSigning && <>
        {needsSessionRecovery ? <>
          <StatusBanner message={recoveryCopy} tone="warning" />
          {actionError && <StatusBanner message={figureStoreMessage(actionError)} tone="error" />}
          <ToyHomeButton tone="yellow" busy={connectingWallet || walletBusy} disabled={purchaseBusy || walletBusy} onPress={requestAccount}>{recoveryLabel}</ToyHomeButton>
          <Text style={styles.copy}>Connecting never approves a payment. Continue this saved purchase after reconnecting.</Text>
        </> : <>
        {error && <StatusBanner message={figureStoreMessage(error)} tone={shop.fundingRequired ? 'warning' : 'error'} />}
        {((shop.busy && !order) || order?.status === 'submitted') && !error && <ActivityIndicator accessibilityRole="progressbar" accessibilityLabel={order ? 'Processing purchase' : 'Preparing purchase'} color={colors.accentShadow} size="large" />}
        {order ? <>
          {order.status !== 'confirmed' && <>
            <ToyBadge tone={order.status === 'failed' || order.status === 'expired' ? 'coral' : 'yellow'}>{order.status === 'submitted' ? 'PROCESSING PURCHASE' : order.status === 'failed' ? 'PURCHASE FAILED' : order.status === 'expired' ? 'PURCHASE EXPIRED' : 'AWAITING YOUR APPROVAL'}</ToyBadge>
            <Text accessibilityLiveRegion="polite" style={styles.copy}>{order.status === 'submitted' ? 'Processing your purchase… You can leave and check back.' : order.status === 'failed' ? figureStoreMessage(order.error, 'The purchase failed. Check its status before trying again.') : order.status === 'expired' ? 'This purchase expired. Tap Retry to try again.' : order.error ? figureStoreMessage(order.error) : 'Continue in your wallet to approve this saved purchase.'}</Text>
          </>}
          <View style={styles.receiptFigure}><View style={styles.receiptPortrait}><Image source={figurePortrait(order.figureId, definitions)} style={styles.receiptImage} /></View><Text style={styles.sectionTitle}>{`${definitions.find(figure => figure.id === order.figureId)?.name ?? order.figureId}${figureOrderQuantity(order) > 1 ? ` x${figureOrderQuantity(order)}` : ''}`}</Text></View>
          {order.cluster === 'devnet' && <Text style={styles.copy}>Test purchase only. No real payment.</Text>}
          {(order.status === 'prepared' || retryable) && !orderSigner && <><Text style={styles.copy}>Sign in to the receiving account to approve the saved purchase.</Text><ToyHomeButton tone="white" busy={wallet.isSupported && walletBusy} onPress={requestAccount}>{wallet.isSupported ? 'Reconnect wallet' : 'Sign in with email'}</ToyHomeButton></>}
          {order.status === 'prepared' && <ToyHomeButton tone="yellow" busy={shop.busy || preparingShop} disabled={!orderSigner || preparingShop || purchaseBusy} onPress={() => { if (orderSigner && !preparingShop && !purchaseBusy) buyAndSign(() => shop.confirm(signPurchase)); }}>Continue in wallet</ToyHomeButton>}
          {retryable && <ToyHomeButton tone="yellow" busy={shop.busy} disabled={!retryAvailable || !orderSigner || !shop.ready || !pack.ready || preparingShop || purchaseBusy || activePackPurchase || (wallet.isSupported && walletBusy)} onPress={retryFigure}>Retry</ToyHomeButton>}
          {order.status === 'confirmed' && <ToyHomeButton tone="yellow" onPress={() => openArmy(order.asset)}>Add to your army</ToyHomeButton>}
        </> : <Text accessibilityLiveRegion="polite" style={styles.copy}>{shop.fundingRequired ? `You can use SOL to cover the missing ${shop.fundingRequired.symbol}. Approve the purchase in your wallet.` : error ? 'No payment has been approved. Check purchase status or cancel and try again.' : !shop.busy ? shop.hasPurchase ? 'Your purchase is saved. Check purchase status to continue.' : 'Choose your figure to try again. No payment has been approved.' : 'Preparing your purchase... Retry to recover this same request if the connection was interrupted.'}</Text>}
        {shop.fundingRequired && <ToyHomeButton tone="yellow" busy={shop.busy} disabled={purchaseBusy || address !== shop.purchaseBuyer} onPress={() => buyAndSign(() => shop.buyWithSol(signPurchase), true)}>Buy with SOL</ToyHomeButton>}
        {shop.hasPurchase && (!canClose || !order || Boolean(error)) && <ToyHomeButton compact tone="white" disabled={shop.busy} onPress={() => run(() => shop.checkStatus())}>Check purchase status</ToyHomeButton>}
        {!shop.hasPurchase && !shop.busy && <ToyHomeButton tone="white" onPress={() => setPurchasePopup(null)}>Back to figures</ToyHomeButton>}
        </>}
        {shop.hasPurchase && canClose && <ToyHomeButton compact tone="white" disabled={shop.busy || connectingWallet} onPress={() => run(() => shop.dismiss())}>{order && isTerminalMint(order) ? 'Done' : 'Cancel purchase'}</ToyHomeButton>}
        {shop.hasPurchase && (!order || !isTerminalMint(order)) && <Text style={styles.note}>Closing this popup keeps your purchase saved.</Text>}
      </>}
      {purchasePopup === 'pack' && !walletOpen && !directSigning && <ShopPackPurchase pack={pack} address={address} blocked={activeFigurePurchase || purchaseBusy}
        onConfirm={() => {
          const signer = pack.order?.buyer === address ? selectedSigner.current.sign : null;
          if (signer) buyAndSign(() => pack.confirm(signPurchase)); else requestAccount();
        }} onBuyWithSol={() => buyAndSign(() => pack.buyWithSol(signPurchase), true)} onArmy={openArmy} onAccount={requestAccount}
        accountConnectionLabel={recoveryLabel} accountBusy={connectingWallet || walletBusy}
        authenticationRequired={needsSessionRecovery} accountError={actionError} />}
      {walletOpen && <>
              <Text style={styles.copy}>{wallet.isSupported ? 'Use your Seeker wallet. You approve every purchase.' : 'Sign in with email to keep your collection in RIPSY.'}</Text>
              {wallet.isSupported && figures.some(figure => figure.seekerExclusive) && <View style={styles.seekerNotice}><Text style={styles.restriction}>Seeker fighter is Seeker exclusive.</Text><Text style={styles.smallCopy}>Connect your Seeker wallet to check availability.</Text></View>}
              {wallet.isSupported && wallet.address && <View style={[styles.walletOption, walletKind === 'external' && styles.walletSelected]}>
                <Text style={styles.optionTitle}>Seeker wallet{walletKind === 'external' ? ' · selected' : ''}</Text><Text selectable style={styles.address}>{short(wallet.address)}</Text>
                <ToyHomeButton compact tone="white" disabled={!shop.ready || !pack.ready || purchaseBusy || purchaseBlocked} onPress={() => run(() => disconnectWallet('external'))}>Disconnect wallet</ToyHomeButton>
              </View>}
              {/* Restoring a saved purchase must allow reconnecting its signer. */}
              {!wallet.address && wallet.isSupported && <ToyHomeButton busy={walletBusy} disabled={shop.busy || walletBusy} onPress={requestAccount}>Connect your wallet</ToyHomeButton>}
              {!wallet.isSupported && (privy.address ? <View style={[styles.walletOption, styles.walletSelected]}>
                <Text style={styles.optionTitle}>Signed in with email{walletKind === 'privy' ? ' · selected' : ''}</Text>
                {walletKind === 'privy' && <ToyHomeButton compact tone="white" busy={privy.activity === 'disconnecting'} disabled={!shop.ready || !pack.ready || purchaseBlocked || purchaseBusy} onPress={() => run(() => disconnectWallet('privy'))}>Sign out</ToyHomeButton>}
              </View> : privy.status === 'authenticated' ? <ToyHomeButton busy={privy.activity === 'creating-wallet'} disabled={shop.busy || wallet.status === 'connecting'} onPress={() => run(privy.createWallet)}>Finish registration</ToyHomeButton> : privy.configured ? <View style={styles.loginForm}>
                <Text style={styles.smallCopy}>Keep your figure collection in your RIPSY account.</Text>
                <Text style={styles.label}>EMAIL ADDRESS</Text>
                <TextInput accessibilityLabel="Email address" textContentType="emailAddress" autoCapitalize="none" autoCorrect={false} autoComplete="email" editable={!privy.busy && !privy.codeSent && !shop.busy} keyboardType="email-address" onChangeText={value => { setEmail(value); setEmailError(null); }} onSubmitEditing={() => { if (!privy.busy && !shop.busy && !privy.codeSent && email.trim()) sendCode(); }} returnKeyType="done" placeholder="you@example.com" placeholderTextColor={colors.kitPanelMuted} style={[styles.input, emailError && styles.invalidInput]} value={email} />
                {emailError && <Text accessibilityRole="alert" style={styles.formError}>{emailError}</Text>}
                {privy.codeSent && <><ToyBadge tone="green">CODE SENT</ToyBadge><Text style={styles.smallCopy}>Check your email for the sign-in code.</Text><Text style={styles.label}>SIGN-IN CODE</Text><TextInput accessibilityLabel="Email verification code" textContentType="oneTimeCode" autoComplete="one-time-code" keyboardType="number-pad" editable={!privy.busy && !shop.busy} maxLength={8} onChangeText={setCode} placeholder="Verification code" placeholderTextColor={colors.kitPanelMuted} style={styles.input} value={code} /></>}
                {!privy.codeSent ? <ToyHomeButton busy={privy.activity === 'sending-code'} disabled={!email.trim() || shop.busy || privy.busy || wallet.status === 'connecting'} onPress={sendCode}>Send sign-in code</ToyHomeButton> : <ToyHomeButton busy={privy.activity === 'verifying-code' || privy.activity === 'creating-wallet'} disabled={!code.trim() || shop.busy || privy.busy || wallet.status === 'connecting'} onPress={() => run(() => privy.verifyCode(email.trim(), code.trim()))}>Sign in</ToyHomeButton>}
              </View> : <Text style={styles.note}>Sign in with email is unavailable in this build.</Text>)}
              {!wallet.isSupported && privy.status === 'authenticated-unverified' && <><Text style={styles.smallCopy}>Your saved email session could not be verified. Check your connection and retry.</Text><ToyHomeButton compact tone="white" disabled={privy.busy || shop.busy} onPress={() => run(privy.refresh)}>Retry email session</ToyHomeButton></>}
              {error && <StatusBanner message={figureStoreMessage(error)} tone="error" />}
              {address && <ToyHomeButton tone="yellow" onPress={() => setWalletOpen(false)}>Back to figures</ToyHomeButton>}
      </>}
      </ToyDialog>
    </View>
  );
}

function short(value: string) { return value.slice(0, 4) + '…' + value.slice(-4); }

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
  showcase: { height: showcaseHeight, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', alignItems: 'center', backgroundColor: colors.surfaceHighlight },
  showcaseScenery: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', resizeMode: 'cover' },
  // Native molded plinths reuse the shared Toy Box material/role colors.
  plinthBase: { position: 'absolute', bottom: 13, width: 180, height: 32, borderRadius: 90, backgroundColor: colors.accentShadow },
  plinthTop: { position: 'absolute', bottom: 23, width: 180, height: 25, borderRadius: 90, backgroundColor: colors.accent },
  exclusive: { position: 'absolute', top: spacing.md, right: spacing.md, borderRadius: 10, backgroundColor: colors.reward, padding: spacing.sm },
  exclusiveText: { color: colors.ink, fontSize: 10, fontWeight: '900' },
  cardCopy: { padding: spacing.lg, gap: spacing.md },
  figureHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  figureName: { color: colors.ink, fontFamily: homeFont, fontSize: 24 },
  priceTag: { borderRadius: 12, backgroundColor: colors.rewardHighlight, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  price: { color: colors.ink, fontFamily: homeFont, fontSize: 21, fontVariant: ['tabular-nums'] },
  copy: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  handoff: { gap: spacing.lg },
  handoffNote: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  restriction: { color: colors.ink, fontSize: 12, lineHeight: 18, fontWeight: '800' },
  note: { color: colors.textMuted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  footerNote: { color: colors.ink, backgroundColor: colors.kitPanel, borderRadius: 16, padding: spacing.md, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  sectionTitle: { color: colors.ink, fontFamily: homeFont, fontSize: 23 },
  receiptFigure: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, overflow: 'hidden', height: 84 },
  receiptPortrait: { width: 84, height: 84, alignItems: 'center' },
  receiptImage: { position: 'absolute', bottom: 0, width: 140, height: 140, resizeMode: 'contain' },
  label: { color: colors.textMuted, fontWeight: '800', fontSize: 11 },
  address: { color: colors.ink, fontSize: 12, lineHeight: 19, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
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
