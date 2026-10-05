import { createContext, useContext, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GamePushNotification } from '../push-notifications';
import { colors, radii, spacing } from '../theme';
import { homeArt, homeFont } from './toy-home-controls';

type BannerProps = {
  notification: GamePushNotification | null;
  onOpen: (gameId: string) => void;
  onDismiss: () => void;
};

export const GamePushBannerContext = createContext<BannerProps | null>(null);

/** Native Modals have their own window, so mount the same alert there too. */
export function GamePushOverlay({ onBeforeOpen }: { onBeforeOpen?: () => void }) {
  const props = useContext(GamePushBannerContext);
  if (!props) return null;
  return <GamePushBanner {...props} onOpen={gameId => { onBeforeOpen?.(); props.onOpen(gameId); }} />;
}

export function GamePushBanner({ notification, onOpen, onDismiss }: BannerProps) {
  const insets = useSafeAreaInsets();
  const [focused, setFocused] = useState<'open' | 'dismiss' | null>(null);
  if (!notification) return null;
  return (
    <View pointerEvents="box-none" style={[styles.position, { top: insets.top + spacing.sm }]} testID="game-push-banner">
      <View style={styles.banner} accessibilityLiveRegion="polite">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${notification.title}. ${notification.body}. Battle ${notification.gameId.toUpperCase()}`}
          accessibilityHint="Open this battle"
          onFocus={() => setFocused('open')}
          onBlur={() => setFocused(null)}
          onPress={() => onOpen(notification.gameId)}
          style={({ pressed }) => [styles.open, focused === 'open' && styles.focus, pressed && styles.pressed]}>
          <Image source={homeArt.swords} style={styles.icon} accessible={false} />
          <View style={styles.copy}>
            <Text style={styles.title}>{notification.title}</Text>
            <Text style={styles.body}>{notification.body}</Text>
            <Text style={styles.hint}>Battle {notification.gameId.toUpperCase()} · Tap to play</Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss battle notification"
          onFocus={() => setFocused('dismiss')}
          onBlur={() => setFocused(null)}
          onPress={onDismiss}
          style={({ pressed }) => [styles.dismiss, focused === 'dismiss' && styles.focus, pressed && styles.pressed]}>
          <Text style={styles.close}>×</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  position: { position: 'absolute', left: spacing.md, right: spacing.md, alignItems: 'center', zIndex: 100, elevation: 20 },
  banner: { width: '100%', maxWidth: 560, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, backgroundColor: colors.kitPanel, borderColor: colors.accentShadow, borderWidth: 2, borderBottomWidth: 5, borderRadius: radii.control, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.24, shadowRadius: 8 },
  open: { flex: 1, minHeight: 64, borderRadius: radii.control - spacing.xs, borderWidth: 2, borderColor: 'transparent', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.xs },
  icon: { width: 44, height: 44, resizeMode: 'contain' },
  copy: { flex: 1, gap: spacing.xs },
  title: { color: colors.ink, fontFamily: homeFont, fontSize: 18, fontWeight: '800' },
  body: { color: colors.text, fontSize: 14 },
  hint: { color: colors.textMuted, fontSize: 12 },
  dismiss: { width: 44, minHeight: 44, borderRadius: radii.control - spacing.xs, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  close: { color: colors.ink, fontSize: 26, fontWeight: '700' },
  focus: { borderColor: colors.ink },
  pressed: { backgroundColor: colors.surfaceHighlight },
});
