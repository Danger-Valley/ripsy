import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import {
  figurePrice,
  figureStoreMessage,
  solanaExplorer,
} from '@rps/core/shop';
import { isTerminalPack, packPrice } from '@rps/core/packs';
import type { usePackShop } from '@rps/game-client/use-pack-shop';
import { Linking } from 'react-native';
import {
  homeArt,
  homeFont,
  ToyHomeButton,
  ToyHomePanel,
} from './toy-home-controls';
import { StatusBanner } from './status-banner';
import { colors, spacing } from '../theme';
import { figurePortrait, useFigureCatalog } from '../figures/catalog';

export function ShopPack({
  pack,
  address,
  walletSupported = false,
  accountBusy = false,
  blocked,
  onBuy,
  purchaseVisible,
  onOpenPurchase,
}: {
  pack: ReturnType<typeof usePackShop>;
  address: string | null;
  walletSupported?: boolean;
  accountBusy?: boolean;
  blocked: boolean;
  onBuy(): void;
  purchaseVisible: boolean;
  onOpenPurchase(): void;
}) {
  const catalog = pack.catalog;
  const definitions = useFigureCatalog();
  return (
    <ToyHomePanel style={styles.card}>
      <View style={styles.heading}>
        <Image source={homeArt.shop} style={styles.chest} />
        <Text accessibilityRole="header" style={styles.title}>
          Fighter pack
        </Text>
      </View>
      {pack.error && !pack.hasPurchase && !purchaseVisible && (
        <StatusBanner message={figureStoreMessage(pack.error)} tone="error" />
      )}
      {catalog && (
        <>
          <Text style={styles.copy}>
            One pack. One surprise fighter. Available on every device.
          </Text>
          <View style={styles.drops}>
            {catalog.drops.map(drop => (
              <View style={styles.drop} key={drop.figureId}>
                {(
                  <Image
                    source={figurePortrait(drop.figureId, definitions)}
                    style={styles.portrait}
                  />
                )}
                <Text style={styles.name}>
                  {definitions.find(f => f.id === drop.figureId)?.name ?? drop.figureId}
                </Text>
                <Text style={styles.copy}>{`${
                  drop.weight / 10_000
                }% chance`}</Text>
              </View>
            ))}
          </View>
          {!pack.hasPurchase && (
            <ToyHomeButton
              tone="yellow"
              busy={accountBusy}
              disabled={
                !catalog.available || !pack.ready || blocked || pack.busy || accountBusy
              }
              onPress={onBuy}
              accessibilityLabel="Buy fighter pack"
            >
              {!catalog.available
                ? 'Packs coming soon'
                : address
                ? `Buy pack - ${packPrice(catalog.payment)}`
                : walletSupported ? 'Connect your wallet' : 'Register to buy a pack'}
            </ToyHomeButton>
          )}
          <Text style={styles.note}>
            {packPrice(catalog.payment)} + additional fees. Review the total
            before approval.
          </Text>
        </>
      )}
      {pack.hasPurchase && (
        <ToyHomeButton
          tone="white"
          accessibilityLabel="View pack purchase"
          onPress={onOpenPurchase}
        >
          View pack purchase
        </ToyHomeButton>
      )}
      {!catalog && !pack.hasPurchase && (
        <ToyHomeButton compact tone="white" onPress={() => pack.loadCatalog()}>
          Check pack availability
        </ToyHomeButton>
      )}
    </ToyHomePanel>
  );
}

export function packPurchaseTitle(pack: ReturnType<typeof usePackShop>) {
  const order = pack.order;
  return order?.status === 'confirmed'
    ? 'Your new fighter!'
    : order?.status === 'ready-to-claim'
    ? 'Delivering your fighter'
    : order?.status === 'waiting-result'
    ? 'Opening your pack'
    : order?.status === 'submitted'
    ? 'Checking your payment'
    : order?.status === 'failed' || order?.status === 'expired'
    ? 'Purchase not completed'
    : order
    ? 'Review your pack'
    : pack.error && !pack.busy
    ? 'Pack needs attention'
    : 'Preparing pack';
}

/** Content for the single native dialog shared by purchases and account sign-in. */
export function ShopPackPurchase({
  pack,
  address,
  blocked,
  onConfirm,
  onArmy,
  onAccount,
}: {
  pack: ReturnType<typeof usePackShop>;
  address: string | null;
  blocked: boolean;
  onConfirm(): void;
  onArmy(asset: string): void;
  onAccount(): void;
}) {
  const order = pack.order;
  const [recordError, setRecordError] = useState<string | null>(null);
  const definitions = useFigureCatalog();
  useEffect(() => {
    setRecordError(null);
  }, [order?.id]);
  return (
    <>
      {pack.error && (
        <StatusBanner message={figureStoreMessage(pack.error)} tone="error" />
      )}
      {recordError && <StatusBanner message={recordError} tone="error" />}
      {((pack.busy && !order) ||
        (order &&
          ['submitted', 'waiting-result', 'ready-to-claim'].includes(
            order.status,
          ))) &&
        !pack.error && (
          <ActivityIndicator
            accessibilityRole="progressbar"
            accessibilityLabel={
              order ? 'Processing pack purchase' : 'Preparing pack purchase'
            }
            color={colors.accentShadow}
            size="large"
          />
        )}
      <Text accessibilityLiveRegion="polite" style={styles.copy}>
        {order?.status === 'confirmed'
          ? 'Purchase complete. Your fighter is ready for your army.'
          : order?.status === 'waiting-result'
          ? 'Your purchase is saved. Waiting for the pack result. No need to buy again.'
          : order?.status === 'ready-to-claim'
          ? 'Your result is saved. Adding this fighter to your collection.'
          : order?.status === 'submitted'
          ? 'Checking your payment. You can leave and return to this pack.'
          : order?.status === 'failed' || order?.status === 'expired'
          ? 'This purchase did not complete. No figure was purchased.'
          : order
          ? 'Review your pack. One fighter is selected with the chances below.'
          : pack.error && !pack.hasPurchase
          ? 'No payment has been approved. Close this popup and try again.'
          : 'Preparing your pack… Retry to recover this same request if the connection was interrupted.'}
      </Text>
      {order && (
        <>
          {order.status === 'confirmed' && order.result && (
            <View style={styles.resultReveal}>
              {(
                <Image
                  source={figurePortrait(order.result, definitions)}
                  style={styles.result}
                />
              )}
              <Text style={styles.title}>
                {definitions.find(f => f.id === order.result)?.name ?? order.result}
              </Text>
            </View>
          )}
          {order.status === 'prepared' && (
            <>
              <Text style={styles.name}>
                {packPrice(order.payment)} +{' '}
                {figurePrice(order.networkFeeLamports, 'mainnet-beta')}
              </Text>
              <Text style={styles.copy}>
                {order.drops
                  .map(
                    d =>
                      `${definitions.find(f => f.id === d.figureId)?.name ?? d.figureId} ${
                        d.weight / 10_000
                      }%`,
                  )
                  .join(' · ')}
              </Text>
              <Text style={styles.note}>
                Additional fees are estimated and separate from the price. The
                pack opens automatically after approval.
              </Text>
              <ToyHomeButton
                tone="yellow"
                busy={pack.busy}
                disabled={blocked || pack.busy || address !== order.buyer}
                onPress={onConfirm}
              >
                Approve pack purchase
              </ToyHomeButton>
              {address !== order.buyer && (
                <>
                  <Text style={styles.note}>
                    Sign in to the account selected for this saved purchase.
                  </Text>
                  <ToyHomeButton compact tone="white" onPress={onAccount}>
                    Sign in to purchase account
                  </ToyHomeButton>
                </>
              )}
            </>
          )}
          {order.status === 'confirmed' && (
            <ToyHomeButton tone="yellow" onPress={() => onArmy(order.asset)}>
              Add to your army
            </ToyHomeButton>
          )}
          {order.status === 'confirmed' && (
            <ToyHomeButton
              compact
              tone="white"
              onPress={() => {
                setRecordError(null);
                Linking.openURL(
                  solanaExplorer('address', order.receipt, 'mainnet-beta'),
                ).catch(() =>
                  setRecordError(
                    'Could not open the pack record. Please try again.',
                  ),
                );
              }}
            >
              View pack record
            </ToyHomeButton>
          )}
        </>
      )}
      {pack.hasPurchase && (
        <ToyHomeButton
          compact
          tone="white"
          disabled={pack.busy}
          onPress={() => pack.checkStatus()}
        >
          Check pack status
        </ToyHomeButton>
      )}
      {pack.hasPurchase &&
        (!pack.signingStarted || Boolean(order && isTerminalPack(order))) && (
          <ToyHomeButton
            compact
            tone="white"
            disabled={pack.busy}
            onPress={() => pack.dismiss()}
          >
            {order && isTerminalPack(order) ? 'Done' : 'Cancel pack purchase'}
          </ToyHomeButton>
        )}
      {pack.hasPurchase && (
        <Text style={styles.note}>
          Closing this popup keeps your pack purchase saved.
        </Text>
      )}
    </>
  );
}
const styles = StyleSheet.create({
  card: { padding: spacing.lg, gap: spacing.md },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  chest: { width: 62, height: 62, resizeMode: 'contain' },
  title: {
    fontFamily: homeFont,
    color: colors.ink,
    fontSize: 24,
    flexShrink: 1,
  },
  drops: { flexDirection: 'row', gap: spacing.md },
  drop: { flex: 1, alignItems: 'center', gap: spacing.xs },
  portrait: { width: '100%', maxWidth: 130, aspectRatio: 1, resizeMode: 'contain' },
  resultReveal: { alignItems: 'center', gap: spacing.xs },
  result: { width: '100%', maxWidth: 220, height: 220, resizeMode: 'contain' },
  name: { fontFamily: homeFont, color: colors.ink, fontSize: 19 },
  copy: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  note: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
  },
});
