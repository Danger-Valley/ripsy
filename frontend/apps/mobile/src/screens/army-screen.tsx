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
import { colors, spacing } from '../theme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

const figureImages = {
  fig1: require('../assets/shop/fig1.png'),
  fig2: require('../assets/shop/fig2.png'),
};

type Props = NativeStackScreenProps<RootStackParamList, 'Army'>;

export function ArmyScreen({ navigation }: Props) {
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
  const address = walletKind === 'external' ? external.address : privy.address;

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
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>YOUR ARMY</Text>
        <Text accessibilityRole="header" style={styles.title}>Choose your fighters.</Text>
        <Text style={styles.copy}>Figure 01 is free and fills every empty slot. Each collectible NFT can fill one slot only.</Text>
      </View>

      {!inventory && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Verify your collection wallet</Text>
          <Text style={styles.copy}>Sign one message so RIPSY can read the official figures held by this wallet. This does not send a transaction.</Text>
          {external.address && <PrimaryButton variant={walletKind === 'external' ? 'primary' : 'secondary'} onPress={() => setWalletKind('external')}>Use {short(external.address)}</PrimaryButton>}
          {privy.address && <PrimaryButton variant={walletKind === 'privy' ? 'primary' : 'secondary'} onPress={() => setWalletKind('privy')}>Use embedded wallet {short(privy.address)}</PrimaryButton>}
          {!external.address && external.isSupported && <PrimaryButton variant="secondary" busy={external.status === 'connecting'} onPress={() => external.connect()}>Connect wallet app</PrimaryButton>}
          {!privy.address && <PrimaryButton variant="secondary" onPress={() => navigation.navigate('Shop')}>Open Figure shop to sign in with Privy</PrimaryButton>}
          <PrimaryButton busy={busy} disabled={!address || !sessionToken} onPress={() => { refresh(true).catch(() => undefined); }}>Verify & load figures</PrimaryButton>
        </View>
      )}

      {error && <StatusBanner message={error} tone="error" />}
      {saved && <StatusBanner message="Army saved. New lineups will use these figures." tone="success" />}

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
  heading: { gap: spacing.sm },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 34, fontWeight: '900' },
  copy: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: spacing.lg, gap: spacing.md },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  label: { color: colors.primaryMuted, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  address: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slot: { position: 'relative', width: '12%', minWidth: 40, aspectRatio: 0.78, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, overflow: 'hidden' },
  slotCollectible: { borderColor: colors.primary, backgroundColor: colors.surfaceStrong },
  slotImage: { width: '92%', height: '92%', resizeMode: 'contain' },
  slotNumber: { position: 'absolute', left: 4, top: 3, color: colors.textMuted, fontSize: 9, fontWeight: '800' },
  empty: { borderRadius: 14, borderColor: colors.border, borderWidth: 1, borderStyle: 'dashed', padding: spacing.lg, gap: spacing.sm },
  asset: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, backgroundColor: colors.background },
  assetSelected: { borderColor: colors.primary, backgroundColor: colors.surfaceStrong },
  assetImage: { width: 56, height: 56, resizeMode: 'contain' },
  assetCopy: { flex: 1, gap: 3 },
  assetName: { color: colors.text, fontSize: 15, fontWeight: '800' },
  assetId: { color: colors.textMuted, fontSize: 11 },
  badge: { color: colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  badgeSelected: { color: colors.primary },
  pressed: { opacity: 0.72 },
  note: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
