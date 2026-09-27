import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ShopClient } from '@rps/game-client/shop';
import { FIGURE_SLOTS, type FigureInventory, type OwnedFigureAsset } from '@rps/core/shop';
import { getGameWebSocketUrl } from '../config';
import { PrimaryButton } from '../components/primary-button';
import { StatusBanner } from '../components/status-banner';
import { usePlayerIdentity } from '../hooks/use-player-identity';
import { usePrivyWallet } from '../hooks/use-privy-wallet';
import { useSolanaWallet } from '../hooks/use-solana-wallet';
import { proveWallet as proveExternalWallet } from '../solana-wallet-adapter';
import { saveFigureSlots } from '../storage/figure-loadout';
import { colors, radii, spacing } from '../theme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

const figureImages = {
  fig1: require('../assets/shop/fig1.png'),
  fig2: require('../assets/shop/fig2.png'),
};

type Props = NativeStackScreenProps<RootStackParamList, 'Army'>;

export function ArmyScreen({ navigation, route }: Props) {
  const { sessionToken, isReady } = usePlayerIdentity();
  const external = useSolanaWallet();
  const privy = usePrivyWallet();
  const client = useMemo(() => new ShopClient(getGameWebSocketUrl().replace(/^ws/, 'http'), sessionToken), [sessionToken]);
  const [walletKind, setWalletKind] = useState<'external' | 'privy'>(external.isSupported ? 'external' : 'privy');
  const [inventory, setInventory] = useState<FigureInventory | null>(null);
  const [slots, setSlots] = useState<Array<string | null>>(Array(FIGURE_SLOTS).fill(null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [indexingChecks, setIndexingChecks] = useState(0);
  const address = walletKind === 'external' ? external.address : privy.address;
  const expectedAssetId = route.params?.expectedAssetId;
  const isWaitingForMint = Boolean(expectedAssetId && inventory && !inventory.assets.some(asset => asset.assetId === expectedAssetId));

  const refresh = async (verify = false) => {
    if (!sessionToken) return;
    setBusy(true); setError(null); setSaved(false);
    try {
      if (verify) {
        if (!address) throw new Error('Connect a wallet before loading your figures.');
        const challenge = await client.walletChallenge();
        const proof = walletKind === 'external' ? await proveExternalWallet(challenge) : await privy.proveWallet(challenge);
        if (proof.address !== address) throw new Error('The verified wallet does not match the selected wallet.');
        await client.verifyWallet(proof);
      }
      const next = await client.inventory();
      setInventory(next); setSlots(next.slots);
      await saveFigureSlots(next.slots);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your figures.');
    } finally { setBusy(false); }
  };

  useEffect(() => { if (isReady) refresh(false).catch(() => undefined); }, [isReady, sessionToken]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isWaitingForMint || busy || indexingChecks >= 10) return;
    const timer = setTimeout(() => {
      refresh(false)
        .catch(() => undefined)
        .finally(() => setIndexingChecks(current => current + 1));
    }, 3000);
    return () => clearTimeout(timer);
  }, [busy, indexingChecks, isWaitingForMint]); // eslint-disable-line react-hooks/exhaustive-deps

  const equipped = new Set(slots.filter((value): value is string => Boolean(value)));
  const toggleAsset = (asset: OwnedFigureAsset) => {
    setSaved(false);
    setSlots(current => {
      const existing = current.indexOf(asset.assetId);
      if (existing >= 0) return current.map((value, index) => index === existing ? null : value);
      const empty = current.indexOf(null);
      if (empty < 0) return current;
      return current.map((value, index) => index === empty ? asset.assetId : value);
    });
  };

  const save = async () => {
    setBusy(true); setError(null); setSaved(false);
    try {
      const next = await client.saveLoadout(slots);
      setInventory(next); setSlots(next.slots);
      await saveFigureSlots(next.slots);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your army.');
    } finally { setBusy(false); }
  };

  const disconnectCollectionWallet = async () => {
    setBusy(true); setError(null); setSaved(false);
    try {
      const connectedAddress = inventory?.wallet;
      await client.clearWallet();
      const emptySlots = Array<string | null>(FIGURE_SLOTS).fill(null);
      await saveFigureSlots(emptySlots);
      setSlots(emptySlots); setInventory(null);
      if (connectedAddress && connectedAddress === external.address) await external.disconnect();
      if (connectedAddress && connectedAddress === privy.address) await privy.disconnect();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not disconnect your collection wallet.');
    } finally { setBusy(false); }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View pointerEvents="none" style={styles.heroBubble} />
        <Text style={styles.heroEyebrow}>YOUR ARMY</Text>
        <Text accessibilityRole="header" style={styles.title}>Pick your dream team!</Text>
        <Text style={styles.heroCopy}>Mix your collectible fighters into the lineup. Every empty slot gets a free Figure 01.</Text>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.heroFighters}>
          <View style={[styles.figureBubble, styles.figureBubblePink]}>
            <Image source={figureImages.fig1} style={styles.heroFigure} />
          </View>
          <View style={[styles.figureBubble, styles.figureBubbleYellow]}>
            <Image source={figureImages.fig2} style={styles.heroFigure} />
          </View>
          <View style={[styles.figureBubble, styles.figureBubbleBlue]}>
            <Image source={figureImages.fig1} style={styles.heroFigure} />
          </View>
        </View>
      </View>

      {!inventory && (
        <View style={styles.card}>
          <View style={styles.stepHeader}>
            <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>1</Text></View>
            <View style={styles.stepCopy}>
              <Text style={styles.label}>UNLOCK YOUR COLLECTION</Text>
              <Text style={styles.sectionTitle}>Connect your fighter wallet</Text>
            </View>
          </View>
          <Text style={styles.copy}>Connect once so RIPSY can find your official figures. We only ask you to sign a message—no transaction is sent.</Text>
          <View style={styles.safetyPill}>
            <Text style={styles.safetyPillText}>✓ SAFE SIGN-IN · NO SOL SPENT</Text>
          </View>
          {external.address && <PrimaryButton variant={walletKind === 'external' ? 'primary' : 'secondary'} onPress={() => setWalletKind('external')}>Use {short(external.address)}</PrimaryButton>}
          {privy.address && <PrimaryButton variant={walletKind === 'privy' ? 'primary' : 'secondary'} onPress={() => setWalletKind('privy')}>Use embedded wallet {short(privy.address)}</PrimaryButton>}
          {!external.address && external.isSupported && <PrimaryButton variant="secondary" busy={external.status === 'connecting'} onPress={() => external.connect()}>Connect wallet app</PrimaryButton>}
          {!privy.address && <PrimaryButton variant="reward" onPress={() => navigation.navigate('Shop')}>Sign in with Privy in the shop</PrimaryButton>}
          <PrimaryButton busy={busy} disabled={!address || !sessionToken} onPress={() => { refresh(true).catch(() => undefined); }}>Verify & load figures</PrimaryButton>
        </View>
      )}

      {!inventory && (
        <View style={styles.starterCard}>
          <View style={styles.starterBadge}><Text style={styles.starterBadgeText}>14</Text></View>
          <View style={styles.starterCopy}>
            <Text style={styles.starterTitle}>Free fighters are always ready</Text>
            <Text style={styles.starterText}>Figure 01 automatically fills every unused army slot.</Text>
          </View>
        </View>
      )}

      {error && <StatusBanner message={error} tone="error" />}
      {saved && <StatusBanner message="Army saved. New lineups will use these figures." tone="success" />}
      {isWaitingForMint && indexingChecks < 10 && <StatusBanner message="Mint confirmed. Waiting for Solana to index your new figure…" />}
      {isWaitingForMint && indexingChecks >= 10 && <StatusBanner message="Your mint is confirmed, but the Solana index is still catching up. Use Refresh wallet in a moment." />}

      {inventory && <>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.label}>ACTIVE SLOTS</Text>
              <Text style={styles.sectionTitle}>{equipped.size} collectible{equipped.size === 1 ? '' : 's'} · {FIGURE_SLOTS - equipped.size} free</Text>
            </View>
            <Text selectable style={styles.address}>{short(inventory.wallet)}</Text>
          </View>
          <View accessibilityLabel="Fourteen army slots" style={styles.slotGrid}>
            {slots.map((assetId, index) => (
              <Pressable
                accessibilityHint={assetId ? 'Removes this collectible from the slot' : 'Free Figure 01 slot'}
                accessibilityLabel={`Army slot ${index + 1}, ${assetId ? 'Figure 02 collectible' : 'free Figure 01'}`}
                disabled={!assetId}
                key={`${index}-${assetId ?? 'starter'}`}
                onPress={() => assetId && toggleAsset(inventory.assets.find(asset => asset.assetId === assetId)!)}
                style={({ pressed }) => [styles.slot, assetId && styles.slotCollectible, pressed && styles.pressed]}>
                <Image source={assetId ? figureImages.fig2 : figureImages.fig1} style={styles.slotImage} />
                <Text style={styles.slotNumber}>{index + 1}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>YOUR COLLECTIBLES</Text>
          {inventory.assets.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.sectionTitle}>No collectible figures yet</Text>
              <Text style={styles.copy}>Your army still has all 14 free Figure 01 fighters. Mint Figure 02 in the shop to add it here.</Text>
            </View>
          ) : inventory.assets.map(asset => {
            const isEquipped = equipped.has(asset.assetId);
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isEquipped }}
                key={asset.assetId}
                onPress={() => toggleAsset(asset)}
                style={({ pressed }) => [styles.asset, isEquipped && styles.assetSelected, pressed && styles.pressed]}>
                <Image source={{ uri: asset.imageUrl }} style={styles.assetImage} />
                <View style={styles.assetCopy}>
                  <Text style={styles.assetName}>{asset.name}</Text>
                  <Text selectable style={styles.assetId}>{short(asset.assetId)}</Text>
                </View>
                <Text style={[styles.badge, isEquipped && styles.badgeSelected]}>{isEquipped ? 'IN ARMY' : 'ADD'}</Text>
              </Pressable>
            );
          })}
          <PrimaryButton busy={busy} onPress={() => { save().catch(() => undefined); }}>Save army</PrimaryButton>
          <PrimaryButton variant="secondary" busy={busy} onPress={() => { refresh(false).catch(() => undefined); }}>Refresh wallet</PrimaryButton>
          <PrimaryButton variant="secondary" disabled={busy} onPress={() => { disconnectCollectionWallet().catch(() => undefined); }}>Disconnect collection wallet</PrimaryButton>
          <Text style={styles.note}>A newly minted figure can take a few seconds to appear in the Solana index. Use Refresh wallet after confirmation.</Text>
        </View>
      </>}
    </ScrollView>
  );
}

function short(value: string) { return `${value.slice(0, 4)}…${value.slice(-4)}`; }

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: spacing.xl, gap: spacing.lg, paddingBottom: 48 },
  hero: { position: 'relative', overflow: 'hidden', alignItems: 'center', backgroundColor: colors.surfaceHighlight, borderTopColor: colors.primaryMuted, borderTopWidth: 3, borderBottomColor: colors.shadow, borderBottomWidth: 8, borderRadius: radii.panel, padding: spacing.lg, gap: spacing.sm, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 14, elevation: 7 },
  heroBubble: { position: 'absolute', top: -42, right: -30, width: 132, height: 132, borderRadius: 66, backgroundColor: colors.primary, opacity: 0.34 },
  heroEyebrow: { color: colors.rewardHighlight, fontSize: 11, fontWeight: '900', letterSpacing: 2.2 },
  title: { color: colors.text, fontSize: 32, lineHeight: 38, fontWeight: '900', textAlign: 'center', textShadowColor: colors.primaryShadow, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  heroCopy: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '700', textAlign: 'center', maxWidth: 430 },
  heroFighters: { height: 96, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginTop: spacing.xs },
  figureBubble: { width: 82, height: 82, borderRadius: 41, alignItems: 'center', justifyContent: 'flex-end', borderTopWidth: 3, borderBottomWidth: 6, marginHorizontal: -5, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.28, shadowRadius: 7, elevation: 5 },
  figureBubblePink: { backgroundColor: colors.primary, borderTopColor: colors.primaryHighlight, borderBottomColor: colors.primaryShadow, transform: [{ rotate: '-7deg' }] },
  figureBubbleYellow: { zIndex: 2, width: 96, height: 96, borderRadius: 48, backgroundColor: colors.reward, borderTopColor: colors.rewardHighlight, borderBottomColor: colors.rewardShadow },
  figureBubbleBlue: { backgroundColor: colors.accent, borderTopColor: colors.accentHighlight, borderBottomColor: colors.accentShadow, transform: [{ rotate: '7deg' }] },
  heroFigure: { width: '94%', height: '100%', resizeMode: 'contain' },
  copy: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  card: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 3, borderBottomColor: colors.shadow, borderBottomWidth: 7, borderRadius: radii.card, padding: spacing.lg, gap: spacing.md, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.22, shadowRadius: 12, elevation: 5 },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  label: { color: colors.rewardHighlight, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBadge: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderTopColor: colors.primaryHighlight, borderTopWidth: 3, borderBottomColor: colors.primaryShadow, borderBottomWidth: 5 },
  stepBadgeText: { color: colors.text, fontSize: 21, fontWeight: '900' },
  stepCopy: { flex: 1, gap: 2 },
  safetyPill: { alignSelf: 'flex-start', backgroundColor: colors.backgroundRaised, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  safetyPillText: { color: colors.success, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  starterCard: { minHeight: 96, flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.reward, borderTopColor: colors.rewardHighlight, borderTopWidth: 3, borderBottomColor: colors.rewardShadow, borderBottomWidth: 7, borderRadius: radii.card, padding: spacing.lg, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 9, elevation: 4 },
  starterBadge: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderTopColor: colors.primaryHighlight, borderTopWidth: 3, borderBottomColor: colors.primaryShadow, borderBottomWidth: 5, transform: [{ rotate: '-6deg' }] },
  starterBadgeText: { color: colors.text, fontSize: 21, fontWeight: '900' },
  starterCopy: { flex: 1, gap: 3 },
  starterTitle: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  starterText: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '700', opacity: 0.8 },
  address: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slot: { position: 'relative', width: '12%', minWidth: 40, aspectRatio: 0.78, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderTopWidth: 2, borderTopColor: colors.border, borderBottomWidth: 4, borderBottomColor: colors.shadow, backgroundColor: colors.backgroundRaised, overflow: 'hidden' },
  slotCollectible: { borderTopColor: colors.accentHighlight, borderBottomColor: colors.accentShadow, backgroundColor: colors.accent },
  slotImage: { width: '92%', height: '92%', resizeMode: 'contain' },
  slotNumber: { position: 'absolute', left: 4, top: 3, color: colors.textMuted, fontSize: 9, fontWeight: '800' },
  empty: { borderRadius: radii.control, backgroundColor: colors.backgroundRaised, padding: spacing.lg, gap: spacing.sm },
  asset: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radii.control, borderTopWidth: 2, borderTopColor: colors.border, borderBottomWidth: 5, borderBottomColor: colors.shadow, padding: spacing.sm, backgroundColor: colors.backgroundRaised },
  assetSelected: { borderTopColor: colors.primaryHighlight, borderBottomColor: colors.primaryShadow, backgroundColor: colors.primary },
  assetImage: { width: 56, height: 56, resizeMode: 'contain' },
  assetCopy: { flex: 1, gap: 3 },
  assetName: { color: colors.text, fontSize: 15, fontWeight: '800' },
  assetId: { color: colors.textMuted, fontSize: 11 },
  badge: { color: colors.rewardHighlight, backgroundColor: colors.surface, borderRadius: radii.pill, overflow: 'hidden', paddingHorizontal: spacing.sm, paddingVertical: 6, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  badgeSelected: { color: colors.ink, backgroundColor: colors.reward },
  pressed: { opacity: 0.72 },
  note: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
