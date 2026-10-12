import { useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type PressableProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShopClient } from '@rps/game-client/shop';
import { FIGURES, FIGURE_SLOTS, figureStoreMessage, type FigureInventory, type OwnedFigureAsset } from '@rps/core/shop';
import { getGameWebSocketUrl } from '../config';
import { sounds } from '../audio/sounds';
import { StatusBanner } from '../components/status-banner';
import { homeArt, homeFont, ToyHomeButton, ToyHomePanel } from '../components/toy-home-controls';
import { usePlayerIdentity } from '../hooks/use-player-identity';
import { usePrivyWallet } from '../hooks/use-privy-wallet';
import { useSolanaWallet } from '../hooks/use-solana-wallet';
import { proveWallet as proveExternalWallet } from '../solana-wallet-adapter';
import { saveFigureSlots } from '../storage/figure-loadout';
import { ToyDialog } from '../components/toy-dialog';
import { colors, spacing } from '../theme';
import { figurePortrait, useFigureCatalog } from '../figures/catalog';
import { bundledHashes } from '../figures/remote-animation';
import { cacheFigureAnimation } from '../figures/asset-cache';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

const scenery = require('../assets/ui/battle-playground.png');
const starterSlots = () => Array<string | null>(FIGURE_SLOTS).fill(null);
type Props = NativeStackScreenProps<RootStackParamList, 'Army'>;

export function ArmyScreen({ navigation, route }: Props) {
  const definitions = useFigureCatalog();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const contentWidth = Math.min(width, 720);
  // Match the collection panel's gutters/border; wider text gets fewer columns.
  const collectionWidth = contentWidth - 28 - 2 * (spacing.md + 1.5);
  const figureColumns = Math.max(1, Math.min(4, Math.floor((collectionWidth + spacing.md) / (140 * Math.max(1, fontScale) + spacing.md))));
  const figureCardWidth = (collectionWidth - (figureColumns - 1) * spacing.md) / figureColumns;
  // Keep touch targets usable on narrow phones instead of squeezing seven slots.
  // Include ToyHomePanel's 1.5-point border so the last slot isn't clipped.
  const slotGridWidth = Math.max(7 * 44 + 6 * spacing.xs, contentWidth - 28 - 2 * (spacing.md + 1.5));
  const { sessionToken, isReady } = usePlayerIdentity();
  const external = useSolanaWallet();
  const privy = usePrivyWallet(!external.isSupported);
  const refreshEmailAccount = privy.refresh;
  const client = useMemo(() => new ShopClient(getGameWebSocketUrl().replace(/^ws/, 'http'), sessionToken), [sessionToken]);
  const [inventory, setInventory] = useState<FigureInventory | null>(null);
  const [slots, setSlots] = useState<Array<string | null>>(starterSlots);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [tab, setTab] = useState<'owned' | 'all'>('owned');
  const [walletOpen, setWalletOpen] = useState(false);
  const [activity, setActivity] = useState<'loading' | 'saving' | 'disconnecting' | null>(null);
  const busy = activity !== null;
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [indexingChecks, setIndexingChecks] = useState(0);
  const address = external.isSupported ? external.address : privy.address;
  const expectedAssetId = route.params?.expectedAssetId;
  const isWaitingForMint = Boolean(expectedAssetId && inventory && !inventory.assets.some(asset => asset.assetId === expectedAssetId));

  const refresh = async (verify = false) => {
    if (!sessionToken) return;
    setActivity('loading'); setError(null); setSaved(false);
    try {
      if (verify) {
        if (!address) throw new Error(external.isSupported ? 'Connect your wallet before loading your figures.' : 'Sign in with email before loading your figures.');
        const challenge = await client.walletChallenge();
        const proof = external.isSupported ? await proveExternalWallet(challenge) : await privy.proveWallet(challenge);
        if (proof.address !== address) throw new Error('The verified wallet does not match the selected wallet.');
        await client.verifyWallet(proof);
      }
      const next = await client.inventory();
      setInventory(next); setSlots(next.slots); setSelectedSlot(null);
      await saveFigureSlots(next.slots, next.assets);
      if (verify) setWalletOpen(false);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load your figures.';
      // No verified collection is the normal free-starter state, not an error.
      if (verify || message !== 'Verify a Solana wallet to manage your army.') setError(message);
    } finally { setActivity(null); }
  };

  useEffect(() => { if (isReady) refresh(false).catch(() => undefined); }, [isReady, sessionToken]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isWaitingForMint || busy || indexingChecks >= 10) return;
    const timer = setTimeout(() => {
      refresh(false).catch(() => undefined).finally(() => setIndexingChecks(current => current + 1));
    }, 3000);
    return () => clearTimeout(timer);
  }, [busy, indexingChecks, isWaitingForMint]); // eslint-disable-line react-hooks/exhaustive-deps

  const equipped = new Set(slots.filter((value): value is string => Boolean(value)));
  const allSlotsUsed = equipped.size === FIGURE_SLOTS;
  const toggleAsset = (asset: OwnedFigureAsset) => {
    if (busy) return;
    setSaved(false);
    setSlots(current => {
      const existing = current.indexOf(asset.assetId);
      if (existing >= 0) return current.map((value, index) => index === existing ? null : value);
      const target = selectedSlot ?? current.indexOf(null);
      if (target < 0) return current;
      return current.map((value, index) => index === target ? asset.assetId : value);
    });
    setSelectedSlot(null);
  };
  const selectStarter = () => {
    setSaved(false);
    if (selectedSlot !== null) setSlots(current => current.map((value, index) => index === selectedSlot ? null : value));
    setSelectedSlot(null);
  };
  const save = async () => {
    setActivity('saving'); setError(null); setSaved(false);
    try {
      // Save a playable offline army, not just asset IDs whose models are missing.
      const selectedModels = new Set(slots.filter(Boolean).map(id => inventory?.assets.find(a => a.assetId === id)?.figureId));
      for (const id of selectedModels) {
        const model = definitions.find(f => f.id === id);
        if (!model?.animation && !FIGURES.some(f => f.id === id)) throw new Error('Could not load this fighter. Reopen your army and try again.');
        if (model?.animation && model.animation.sha256 !== bundledHashes[model.variant]) await cacheFigureAnimation(model.animation);
      }
      if (inventory) {
        const next = await client.saveLoadout(slots);
        setInventory(next); setSlots(next.slots);
        await saveFigureSlots(next.slots, next.assets);
      } else {
        // The mandatory free starter needs no wallet or network authorization.
        await saveFigureSlots(starterSlots());
      }
      setSelectedSlot(null); setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your army.');
    } finally { setActivity(null); }
  };
  const disconnectCollectionWallet = async () => {
    setActivity('disconnecting'); setError(null); setSaved(false);
    try {
      const connectedAddress = inventory?.wallet;
      await client.clearWallet();
      const emptySlots = starterSlots();
      await saveFigureSlots(emptySlots);
      setSlots(emptySlots); setInventory(null); setSelectedSlot(null);
      if (connectedAddress && connectedAddress === external.address) await external.disconnect();
      if (!external.isSupported && connectedAddress && connectedAddress === privy.address) await privy.disconnect();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not disconnect your collection wallet.');
    } finally { setActivity(null); }
  };
  const openShop = () => { setWalletOpen(false); navigation.navigate('Shop'); };
  const register = () => { if (external.isSupported) return; setWalletOpen(false); navigation.navigate('Shop', { signIn: true }); };
  // Army stays mounted while email sign-in is open in the shop.
  useEffect(() => navigation.addListener('focus', () => { if (!external.isSupported) refreshEmailAccount().catch(() => undefined); }), [navigation, refreshEmailAccount, external.isSupported]);

  return (
    <View style={styles.screen}>
      <Image pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" source={scenery} style={styles.scenery} />
      <View testID="army-header" style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <ToyHomeButton small tone="white" accessibilityLabel="Back to home" onPress={() => navigation.goBack()}>‹</ToyHomeButton>
        <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={styles.title}>Your army</Text>
        <ToyHomeButton small icon={homeArt.settings} accessibilityLabel="Manage collection" onPress={() => setWalletOpen(true)} />
      </View>
      <ScrollView testID="army-scroll" contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>Choose your fighters</Text>
        <ToyHomePanel style={styles.lineupPanel} testID="army-lineup-panel">
          <View testID="army-lineup-header" style={styles.lineupHeader}>
            <View style={styles.headerCopy}>
              <Text accessibilityRole="header" style={styles.lineupTitle}>Your lineup</Text>
              <Text testID="army-lineup-count" style={styles.lineupCaption}>{`${FIGURE_SLOTS - equipped.size} free · ${equipped.size} collectible${equipped.size === 1 ? '' : 's'}`}</Text>
            </View>
            <ArmyControl accessibilityRole="button" accessibilityLabel="Reset all slots to free RIPSY 001" disabled={busy || equipped.size === 0} onPress={() => { setSlots(starterSlots()); setSaved(false); setSelectedSlot(null); }} style={({ pressed }) => [styles.reset, pressed && styles.pressed, (busy || equipped.size === 0) && styles.disabled]}>
              <Text style={styles.resetText}>Reset</Text>
            </ArmyControl>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator testID="army-slots-scroll" accessibilityLabel="Fourteen army slots">
          <View style={[styles.slotGrid, { width: slotGridWidth }]}>
            {[0, 1].map(row => (
              <View key={row} style={styles.slotRow}>
                {slots.slice(row * 7, row * 7 + 7).map((assetId, column) => {
                  const index = row * 7 + column;
                  return <ArmyControl
                    focusRadius={10}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selectedSlot === index, disabled: busy }}
                    accessibilityHint="Select this slot, then choose a fighter below"
                    accessibilityLabel={`Army slot ${index + 1}, ${assetId ? inventory?.assets.find(asset => asset.assetId === assetId)?.name ?? 'Collectible fighter' : 'free RIPSY 001'}`}
                    disabled={busy}
                    key={index}
                    onPress={() => setSelectedSlot(current => current === index ? null : index)}
                    style={({ pressed }) => [styles.slot, assetId && styles.slotCollectible, selectedSlot === index && styles.slotSelected, pressed && styles.pressed]}>
                    <Image pointerEvents="none" source={figurePortrait(inventory?.assets.find(asset => asset.assetId === assetId)?.figureId ?? 'fig1', definitions)} style={styles.slotImage} />
                    <Text pointerEvents="none" maxFontSizeMultiplier={1.3} style={styles.slotNumber}>{index + 1}</Text>
                  </ArmyControl>;
                })}
              </View>
            ))}
          </View>
          </ScrollView>
          <Text testID="army-slot-hint" accessibilityLiveRegion="polite" style={[styles.lineupHint, selectedSlot !== null && styles.lineupHintSelected]}>{selectedSlot !== null ? `Choose a fighter for slot ${selectedSlot + 1}` : 'Tap a slot, then choose a fighter below'}</Text>
        </ToyHomePanel>

        <ToyHomePanel style={styles.collectionPanel}>
          <View accessibilityRole="tablist" style={styles.tabs}>
            <ArmyControl focusRadius={11} accessibilityRole="tab" accessibilityLabel="My collection" accessibilityState={{ selected: tab === 'owned' }} onPress={() => setTab('owned')} style={[styles.tab, tab === 'owned' && styles.tabSelected]}>
              <Text style={[styles.tabText, tab === 'owned' && styles.tabTextSelected]}>My collection</Text>
            </ArmyControl>
            <ArmyControl focusRadius={11} accessibilityRole="tab" accessibilityLabel="All figures" accessibilityState={{ selected: tab === 'all' }} onPress={() => setTab('all')} style={[styles.tab, tab === 'all' && styles.tabSelected]}>
              <Text style={[styles.tabText, tab === 'all' && styles.tabTextSelected]}>All figures</Text>
            </ArmyControl>
          </View>
          <View testID="army-collection-grid" style={styles.figureGrid} accessibilityLabel="Available fighters">
            <FigureCard width={figureCardWidth} name={definitions.find(f => f.id === 'fig1')?.name ?? 'RIPSY 001'} image={figurePortrait('fig1', definitions)} badge="FREE" caption="Your free starter" button={selectedSlot === null ? 'Pick a slot' : 'Use fighter'} accessibilityLabel="Use free RIPSY 001" disabled={busy || selectedSlot === null} onPress={selectStarter} />
            {tab === 'owned' && inventory?.assets.map(asset => (
              <FigureCard width={figureCardWidth} key={asset.assetId} name={asset.name} image={figurePortrait(asset.figureId, definitions, asset.imageUrl)} badge={equipped.has(asset.assetId) ? 'IN ARMY' : 'OWNED'} caption="In your collection" selected={equipped.has(asset.assetId)} button={equipped.has(asset.assetId) ? 'Remove' : 'Select'} disabled={busy || (!equipped.has(asset.assetId) && allSlotsUsed && selectedSlot === null)} accessibilityLabel={`${equipped.has(asset.assetId) ? 'Remove' : 'Equip'} ${asset.name} ${short(asset.assetId)}`} onPress={() => toggleAsset(asset)} />
            ))}
            {tab === 'all' && definitions.filter(figure => figure.purchasable).map(figure => <FigureCard width={figureCardWidth} key={figure.id} name={figure.name} image={figurePortrait(figure.id, definitions)} badge={figure.seekerExclusive ? 'SEEKER' : 'COLLECTIBLE'} caption={inventory ? `${inventory.assets.filter(asset => asset.figureId === figure.id).length} in your collection` : 'Collect it in the shop'} button="Visit shop" tone="coral" onPress={openShop} />)}
          </View>
          {tab === 'owned' && <Text style={styles.collectionHint}>Each collectible fills one slot. Free fighters fill the rest.</Text>}
        </ToyHomePanel>

        <ArmyControl focusRadius={18} accessibilityRole="button" accessibilityLabel={inventory ? 'Manage collection' : address ? 'Load your collection' : external.isSupported ? 'Connect your wallet' : 'Register'} onPress={() => { if (!external.isSupported && !address && !inventory) register(); else setWalletOpen(true); }} style={({ pressed }) => [styles.walletShortcut, pressed && styles.pressed]}>
          <View style={styles.walletIcon}><Text style={styles.walletIconText}>◎</Text></View>
          <View style={styles.headerCopy}><Text style={styles.walletTitle}>{inventory ? 'Your collection' : address ? 'Load your collection' : external.isSupported ? 'Connect your wallet' : 'Register'}</Text><Text style={styles.walletCopy}>{inventory ? 'Manage your figures' : external.isSupported ? 'Use your Seeker wallet to load your figures' : 'Sign in with email to load your figures'}</Text></View>
          <Text style={styles.chevron}>›</Text>
        </ArmyControl>
        {busy && <Text accessibilityLiveRegion="polite" style={styles.loadingCopy}>{activity === 'saving' ? 'Saving your army…' : activity === 'disconnecting' ? 'Signing out…' : 'Loading your collection…'}</Text>}
        {error && <StatusBanner message={figureStoreMessage(error, 'Could not load your collection. Please try again.')} tone="error" />}
        {saved && <StatusBanner message="Army saved. New lineups will use these figures." tone="success" />}
        {isWaitingForMint && <StatusBanner message={indexingChecks < 10 ? 'Purchase complete. Your new figure will appear shortly…' : 'Purchase complete. Your collection is updating — try Refresh collection shortly.'} />}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <ToyHomeButton tone="yellow" busy={activity === 'saving'} disabled={busy || saved || Boolean(inventory && !sessionToken)} accessibilityLabel={saved ? 'Army saved' : 'Save army'} accessibilityHint="Saves your fighter choices for new game lineups" onPress={() => { save().catch(() => undefined); }}>{activity === 'saving' ? 'Saving army…' : saved ? 'Saved ✓' : 'Save army'}</ToyHomeButton>
        <Text style={styles.footerCopy}>For new games only. Your weapons stay unchanged.</Text>
      </View>

      <ToyDialog visible={walletOpen} title="Your collection" icon={homeArt.army} onClose={() => setWalletOpen(false)} closeLabel="Close collection settings" testID="army-wallet-dialog">
            {inventory ? <>
              <Text style={styles.copy}>Your figures are ready to use in your army.</Text>
              <ToyHomeButton busy={busy} onPress={() => { refresh(false).catch(() => undefined); }}>Refresh collection</ToyHomeButton>
              <ToyHomeButton tone="white" disabled={busy} onPress={() => { disconnectCollectionWallet().catch(() => undefined); }}>{external.isSupported ? 'Disconnect wallet' : 'Sign out'}</ToyHomeButton>
            </> : <>
              <Text style={styles.copy}>{external.isSupported ? 'RIPSY 001 is free - no account needed. Connect your wallet to use your collectibles.' : 'RIPSY 001 is free - no account needed. Sign in only to use your collectibles.'}</Text>
              <Text style={styles.safeSign}>✓ Checking your collection is free</Text>
              {external.isSupported && external.address && <Text style={styles.safeSign}>Seeker wallet connected · {short(external.address)}</Text>}
              {!external.address && external.isSupported && <ToyHomeButton busy={external.status === 'connecting'} disabled={busy} onPress={() => { external.connect().catch(() => setError('Could not connect your wallet. Please try again.')); }}>Connect your wallet</ToyHomeButton>}
              {!external.isSupported && !privy.address && <ToyHomeButton tone="white" disabled={busy} onPress={register}>Register</ToyHomeButton>}
              <ToyHomeButton tone="yellow" busy={busy} disabled={!address || !sessionToken} onPress={() => { refresh(true).catch(() => undefined); }}>Load my figures</ToyHomeButton>
            </>}
            {(error || (external.isSupported ? external.error : privy.error)) && <StatusBanner message={figureStoreMessage(error || (external.isSupported ? external.error : privy.error), 'Could not load your collection. Please try again.')} tone="error" />}
            <Text style={styles.modalNote}>{external.isSupported ? 'Disconnecting never removes your purchased figures.' : 'Signing out never removes your purchased figures.'}</Text>
      </ToyDialog>
    </View>
  );
}

function FigureCard({ width, name, image, badge, caption, button, selected, disabled, tone = 'blue', accessibilityLabel, onPress }: {
  width: number; name: string; image: import('react-native').ImageSourcePropType; badge: string; caption: string; button: string;
  selected?: boolean; disabled?: boolean; tone?: 'blue' | 'coral'; accessibilityLabel?: string; onPress: () => void;
}) {
  return (
    <ToyHomePanel testID="army-figure-card" style={[styles.figureCard, { width }, selected && styles.figureCardSelected]}>
      <View style={styles.figureWindow}>
        <View style={styles.figurePlinth} />
        <Image source={image} style={styles.figureImage} accessibilityLabel={name} />
      </View>
      <View style={[styles.figureBadge, selected && styles.figureBadgeSelected]}><Text style={[styles.figureBadgeText, selected && styles.figureBadgeTextSelected]}>{badge}</Text></View>
      <Text style={styles.figureName}>{name}</Text>
      <Text style={styles.figureCaption}>{caption}</Text>
      <ToyHomeButton compact tone={tone} labelStyle={styles.figureButtonLabel} disabled={disabled} accessibilityLabel={accessibilityLabel ?? button} onPress={onPress}>{button}</ToyHomeButton>
    </ToyHomePanel>
  );
}
function ArmyControl({ children, focusRadius = 12, ...props }: PropsWithChildren<Omit<PressableProps, 'children'> & { focusRadius?: number }>) {
  const [focused, setFocused] = useState(false);
  return <Pressable {...props}
    onPress={event => { if (!props.disabled) { sounds.play('select'); props.onPress?.(event); } }}
    onFocus={event => { setFocused(true); props.onFocus?.(event); }}
    onBlur={event => { setFocused(false); props.onBlur?.(event); }}>
    {children}
    {focused && <View testID="army-control-focus" pointerEvents="none" style={[StyleSheet.absoluteFill, styles.focusRing, { borderRadius: focusRadius }]} />}
  </Pressable>;
}
function short(value: string) { return `${value.slice(0, 4)}…${value.slice(-4)}`; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scenery: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', resizeMode: 'cover' },
  header: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 14, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, color: colors.ink, fontFamily: homeFont, fontSize: 30, textAlign: 'center' },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 14, paddingBottom: 16, gap: 14 },
  subtitle: { color: colors.accentShadow, fontFamily: homeFont, fontSize: 18, textAlign: 'center', marginBottom: 4 },
  // Reuse the collection card, without a decorative frame or nested label panels.
  lineupPanel: { padding: spacing.md, gap: spacing.md },
  lineupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  lineupTitle: { color: colors.ink, fontFamily: homeFont, fontSize: 20, lineHeight: 26 },
  lineupCaption: { color: colors.textMuted, fontSize: 13, lineHeight: 19, fontWeight: '500' },
  reset: { minHeight: 44, minWidth: 64, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 12, backgroundColor: colors.collectionMuted },
  resetText: { color: colors.ink, fontFamily: homeFont, fontSize: 14 },
  slotGrid: { gap: spacing.sm },
  slotRow: { flexDirection: 'row', gap: spacing.xs },
  slot: { flex: 1, minWidth: 44, minHeight: 60, aspectRatio: 0.74, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 10, borderWidth: 2, borderColor: 'transparent', backgroundColor: colors.collectionMuted },
  slotCollectible: { backgroundColor: colors.surfaceHighlight },
  // Keep border width constant so selection never shifts the portrait or number.
  slotSelected: { borderColor: colors.ink, backgroundColor: colors.accentHighlight },
  // Existing Rive exports have generous transparent padding above each fighter.
  slotImage: { position: 'absolute', bottom: 18, width: '185%', height: '110%', resizeMode: 'contain' },
  slotNumber: { position: 'absolute', bottom: 4, color: colors.ink, fontSize: 12, lineHeight: 16, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
  lineupHint: { color: colors.textMuted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  lineupHintSelected: { color: colors.ink, fontWeight: '700' },
  collectionPanel: { padding: spacing.md, gap: spacing.md },
  tabs: { flexDirection: 'row', backgroundColor: colors.collectionMuted, borderRadius: 13, padding: 3, gap: 3 },
  tab: { flex: 1, minHeight: 44, borderRadius: 11, justifyContent: 'center', paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  tabSelected: { backgroundColor: '#05B8E3', borderColor: '#7DEBFF', borderWidth: 1 },
  tabText: { color: colors.ink, fontFamily: homeFont, fontSize: 16, textAlign: 'center' },
  tabTextSelected: { color: colors.ink },
  figureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, alignItems: 'stretch' },
  figureCard: { padding: spacing.sm, gap: spacing.xs },
  figureCardSelected: { borderColor: colors.reward, borderWidth: 2.5 },
  figureWindow: { height: 114, backgroundColor: '#C9F2FA', borderRadius: 15, justifyContent: 'flex-end', alignItems: 'center', overflow: 'hidden' },
  figureImage: { position: 'absolute', bottom: 4, width: 180, height: 180, resizeMode: 'contain' },
  figurePlinth: { position: 'absolute', bottom: 3, width: 90, height: 13, borderRadius: 16, backgroundColor: '#66BFD6' },
  figureBadge: { alignSelf: 'center', backgroundColor: colors.accentShadow, borderRadius: 8, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, marginTop: spacing.xs },
  figureBadgeSelected: { backgroundColor: colors.reward },
  figureBadgeText: { color: colors.kitPanel, fontSize: 12, lineHeight: 16, fontWeight: '800' },
  figureBadgeTextSelected: { color: colors.ink },
  figureName: { color: colors.ink, fontFamily: homeFont, fontSize: 17, lineHeight: 23, textAlign: 'center', marginTop: spacing.xs },
  figureCaption: { color: colors.textMuted, fontSize: 12, lineHeight: 17, minHeight: 24, flexGrow: 1, textAlign: 'center', marginBottom: spacing.xs },
  // Large bold navy labels meet contrast on both cyan and coral button faces.
  figureButtonLabel: { color: colors.ink, fontSize: 20, textShadowColor: 'transparent' },
  collectionHint: { color: colors.textMuted, fontSize: 12, lineHeight: 18, fontWeight: '500', textAlign: 'center', paddingHorizontal: spacing.xs },
  walletShortcut: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 65, padding: 10, backgroundColor: '#FFFDF4', borderColor: '#FFFFFF', borderWidth: 1.5, borderRadius: 18 },
  walletIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#BAECF7', justifyContent: 'center', alignItems: 'center' },
  walletIconText: { color: colors.ink, fontSize: 26 },
  walletTitle: { color: colors.ink, fontFamily: homeFont, fontSize: 14 },
  walletCopy: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  chevron: { color: colors.accentShadow, fontSize: 28 },
  loadingCopy: { color: colors.ink, textAlign: 'center', fontSize: 14, lineHeight: 20 },
  footer: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 14, paddingTop: 8, gap: 6, backgroundColor: 'rgba(245,249,232,0.96)' },
  footerCopy: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
  focusRing: { borderWidth: 2, borderColor: colors.ink },
  copy: { color: colors.text, fontSize: 15, lineHeight: 22 },
  safeSign: { color: colors.kitSuccessInk, fontSize: 12, fontWeight: '700' },
  address: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  modalNote: { color: colors.textMuted, fontSize: 11, textAlign: 'center' },
});
