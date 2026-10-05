import { useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { NavigationContext } from '@react-navigation/native';
import { Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';
import { homeFont, ToyHomeButton, ToyHomePanel } from './toy-home-controls';
import { GamePushOverlay } from './game-push-banner';

/** Shared native dialogs: scroll on short screens, never animate required choices. */
export function ToyDialog({ visible, title, icon, onClose, closeLabel = 'Close dialog', keyboard = false, testID, children }: PropsWithChildren<{
  visible: boolean;
  title: string;
  icon?: ImageSourcePropType;
  onClose?: () => void;
  closeLabel?: string;
  keyboard?: boolean;
  testID?: string;
}>) {
  const insets = useSafeAreaInsets();
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);
  useEffect(() => {
    if (!navigation) return;
    setFocused(navigation.isFocused());
    const onFocus = navigation.addListener('focus', () => setFocused(true));
    const onBlur = navigation.addListener('blur', () => setFocused(false));
    return () => { onFocus(); onBlur(); };
  }, [navigation]);
  return (
    <Modal visible={visible && focused} transparent animationType="none" onRequestClose={() => onClose?.()}>
      <KeyboardAvoidingView accessibilityViewIsModal onAccessibilityEscape={() => onClose?.()} style={styles.fill} behavior={keyboard && Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView onAccessibilityEscape={() => onClose?.()} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" bounces={false} contentContainerStyle={[styles.backdrop, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}>
          <ToyHomePanel style={styles.card}>
            <View testID={testID} style={styles.body}>
              <View style={styles.header}>
                {icon && <Image source={icon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.icon} />}
                <Text accessibilityRole="header" maxFontSizeMultiplier={1.5} style={styles.title}>{title}</Text>
                {onClose && <ToyHomeButton small tone="white" onPress={onClose} accessibilityLabel={closeLabel}>×</ToyHomeButton>}
              </View>
              {children}
            </View>
          </ToyHomePanel>
        </ScrollView>
        <GamePushOverlay onBeforeOpen={onClose} />
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ToyBadge({ children, tone = 'blue', accessibilityLabel }: { children: string; tone?: 'blue' | 'yellow' | 'coral' | 'green'; accessibilityLabel?: string }) {
  return <View accessibilityLabel={accessibilityLabel} accessible={Boolean(accessibilityLabel)} style={[styles.badge, tone === 'yellow' && styles.yellow, tone === 'coral' && styles.coral, tone === 'green' && styles.green]}><Text maxFontSizeMultiplier={1.5} style={styles.badgeText}>{children}</Text></View>;
}

export function ToySectionHeading({ title, copy, icon }: { title: string; copy?: string; icon?: ImageSourcePropType }) {
  return <View style={styles.header}>
    {icon && <View style={styles.iconTile}><Image source={icon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.icon} /></View>}
    <View style={styles.headingCopy}><Text accessibilityRole="header" maxFontSizeMultiplier={1.6} style={styles.sectionTitle}>{title}</Text>{copy && <Text style={styles.copy}>{copy}</Text>}</View>
  </View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, backgroundColor: colors.scrim },
  card: { width: '100%', maxWidth: 460, alignSelf: 'center', padding: spacing.lg },
  body: { gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: { width: 44, height: 44, resizeMode: 'contain' },
  title: { flex: 1, color: colors.ink, fontFamily: homeFont, fontSize: 25 },
  headingCopy: { flex: 1, gap: spacing.xs },
  sectionTitle: { color: colors.ink, fontFamily: homeFont, fontSize: 22 },
  copy: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  iconTile: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.surfaceHighlight, alignItems: 'center', justifyContent: 'center' },
  badge: { alignSelf: 'flex-start', backgroundColor: colors.surfaceHighlight, borderRadius: 10, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  yellow: { backgroundColor: colors.rewardHighlight },
  coral: { backgroundColor: colors.primaryMuted },
  green: { backgroundColor: colors.kitSuccessSoft },
  badgeText: { color: colors.ink, fontSize: 12, fontWeight: '800' },
});
