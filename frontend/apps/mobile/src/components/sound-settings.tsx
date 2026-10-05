import { Platform, StyleSheet, Switch, Text, View } from 'react-native';
import { sounds } from '../audio/sounds';
import { useSounds } from '../hooks/use-sounds';
import { colors, spacing } from '../theme';
import { homeFont, ToyHomeButton } from './toy-home-controls';

export function SoundSettings() {
  const state = useSounds();
  return <View style={styles.panel} testID="sound-settings">
    <View style={styles.row}>
      <View style={styles.grow}><Text style={styles.title}>Sound effects</Text><Text style={styles.copy}>{state.loading ? 'Loading sounds…' : !state.available ? 'Sounds unavailable in this build.' : state.enabled ? 'Playful sounds are on' : 'Quiet mode'}</Text></View>
      <Switch accessibilityLabel="Sound effects" disabled={state.loading || !state.available} value={state.enabled && state.available} onValueChange={value => { sounds.setEnabled(value).then(() => { if (value) sounds.play('select'); }); }} trackColor={{ false: '#ACC4CC', true: colors.primary }} />
    </View>
    {state.available && <>
      <View style={styles.row}>
        <Text style={[styles.copy, styles.grow]} accessibilityLabel={`Effects volume ${Math.round(state.volume * 100)} percent`}>Volume · {Math.round(state.volume * 100)}%</Text>
        <ToyHomeButton small tone="white" sound={false} disabled={!state.enabled || state.volume <= 0.1} accessibilityLabel="Quieter sound effects" onPress={() => { sounds.setVolume(state.volume - 0.1).then(() => sounds.play('select')); }}>−</ToyHomeButton>
        <ToyHomeButton small tone="white" sound={false} disabled={!state.enabled || state.volume >= 1} accessibilityLabel="Louder sound effects" onPress={() => { sounds.setVolume(state.volume + 0.1).then(() => sounds.play('select')); }}>+</ToyHomeButton>
      </View>
      <ToyHomeButton compact sound={false} disabled={!state.enabled || state.loading} onPress={() => sounds.play('ready')}>Try the sound</ToyHomeButton>
      <Text style={styles.copy}>{Platform.OS === 'ios' ? 'Respects silent mode and your device volume.' : 'Uses your device’s media volume.'} Battle alerts have their own device settings.</Text>
    </>}
    {state.saveError && <><Text accessibilityRole="alert" style={styles.error}>Couldn’t save your sound settings. Your current choice still works.</Text><ToyHomeButton compact tone="white" onPress={() => { sounds.retrySave(); }}>Retry saving sound settings</ToyHomeButton></>}
  </View>;
}
const styles = StyleSheet.create({
  panel: { padding: spacing.md, borderRadius: 18, backgroundColor: colors.surfaceHighlight, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  grow: { flex: 1 },
  title: { color: colors.ink, fontFamily: homeFont, fontSize: 20 },
  copy: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  error: { color: colors.dangerShadow, fontSize: 13, lineHeight: 19 },
});
