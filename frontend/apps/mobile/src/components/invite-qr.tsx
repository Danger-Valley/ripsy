import { useMemo } from 'react';
import { PixelRatio, StyleSheet, Text, View } from 'react-native';
import { createInviteQr } from '@rps/core/invite-qr';
import { normalizeRoomCode } from '../invitations';
import { colors, spacing } from '../theme';
export function InviteQr({ gameId }: { gameId: string }) {
  const qr = useMemo(() => createInviteQr(gameId), [gameId]);
  // Integer physical pixels keep edges sharp at every display density.
  const scale = Math.floor(160 * PixelRatio.get() / qr.size) / PixelRatio.get();
  return <View style={styles.invite}>
    <View testID="invite-qr" accessible accessibilityRole="image" accessibilityLabel={`Scan to join battle ${normalizeRoomCode(gameId)}`} style={[styles.qr, { width: qr.size * scale, height: qr.size * scale }]}>
      {qr.runs.map(run => <View key={`${run.y}-${run.x}`} style={[styles.module, { left: run.x * scale, top: run.y * scale, width: run.width * scale, height: scale }]} />)}
    </View>
    <Text style={styles.title}>Scan to join!</Text>
    <Text selectable style={styles.code}>{normalizeRoomCode(gameId)}</Text>
    <Text style={styles.hint}>Opens this battle, or helps your friend install RIPSY.</Text>
  </View>;
}
const styles = StyleSheet.create({
  invite: { alignItems: 'center', gap: spacing.sm },
  // Scanner standard: white quiet zone and dark modules, no decorative overlays.
  qr: { backgroundColor: '#FFFFFF', position: 'relative' },
  module: { position: 'absolute', backgroundColor: colors.ink },
  title: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  code: { color: colors.ink, fontSize: 18, fontWeight: '800', letterSpacing: 2 },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
