import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { NavigationContext } from '@react-navigation/native';
import { Animated, AppState, Easing, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

const BURSTS = [
  { x: 0.23, y: 0.28, delay: 0, color: colors.reward },
  { x: 0.77, y: 0.38, delay: 400, color: colors.primary },
  { x: 0.5, y: 0.2, delay: 800, color: colors.accent },
];
const SPARKS_PER_BURST = 12;
// A decorative 1.9 s celebration, not a transition: controls never wait for it.
const BURST_DURATION_MS = 1100;

/** One-shot native fireworks; no touch interception, sound, or gameplay state. */
export function VictoryFireworks({ victoryId, reduceMotionEnabled }: {
  victoryId: string | null;
  reduceMotionEnabled: boolean | null;
}) {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);
  const [appState, setAppState] = useState(AppState.currentState);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [running, setRunning] = useState(false);
  const played = useRef(new Set<string>());
  const progress = useMemo(() => BURSTS.map(() => new Animated.Value(0)), []);

  useEffect(() => {
    if (!navigation) return;
    setFocused(navigation.isFocused());
    const onFocus = navigation.addListener('focus', () => setFocused(true));
    const onBlur = navigation.addListener('blur', () => setFocused(false));
    return () => { onFocus(); onBlur(); };
  }, [navigation]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!victoryId || reduceMotionEnabled === null) return;
    if (reduceMotionEnabled || !focused || appState !== 'active') {
      played.current.add(victoryId);
      setRunning(false);
      return;
    }
    if (!bounds.width || !bounds.height || played.current.has(victoryId)) return;
    played.current.add(victoryId);
    setRunning(true);
    progress.forEach(value => value.setValue(0));
    let current = true;
    const animation = Animated.parallel(progress.map((value, index) => Animated.sequence([
      Animated.delay(BURSTS[index]!.delay),
      Animated.timing(value, {
        toValue: 1,
        duration: BURST_DURATION_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ])));
    animation.start(() => { if (current) setRunning(false); });
    return () => {
      current = false;
      animation.stop();
      setRunning(false);
    };
  }, [appState, bounds.height, bounds.width, focused, progress, reduceMotionEnabled, victoryId]);

  if (!victoryId || reduceMotionEnabled !== false || !focused || appState !== 'active'
    || (!running && played.current.has(victoryId))) return null;

  const radius = Math.min(bounds.width * 0.25, bounds.height * 0.2, 120);
  return <View testID="victory-fireworks-layer" pointerEvents="none" accessible={false}
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={styles.layer}
    onLayout={({ nativeEvent: { layout } }) => setBounds(current => current.width === layout.width && current.height === layout.height
      ? current : { width: layout.width, height: layout.height })}>
    {running && BURSTS.map((burst, index) => {
      const value = progress[index]!;
      return <View key={index} pointerEvents="none" style={[styles.origin, { left: bounds.width * burst.x, top: bounds.height * burst.y }]}>
        <Animated.View testID="victory-firework-rocket" style={[styles.rocket, { backgroundColor: burst.color,
          opacity: value.interpolate({ inputRange: [0, 0.08, 0.24, 0.25, 1], outputRange: [0, 1, 1, 0, 0] }),
          transform: [{ translateY: value.interpolate({ inputRange: [0, 0.25, 1], outputRange: [bounds.height * 0.55, 0, 0] }) }],
        }]} />
        {Array.from({ length: SPARKS_PER_BURST }, (_, spark) => {
          const angle = spark * Math.PI * 2 / SPARKS_PER_BURST;
          const reach = radius * (spark % 2 === 0 ? 1 : 0.72);
          return <Animated.View key={spark} testID="victory-firework-spark" style={[styles.spark, {
            backgroundColor: spark % 3 === 0 ? colors.kitPanel : burst.color,
            opacity: value.interpolate({ inputRange: [0, 0.24, 0.25, 0.7, 1], outputRange: [0, 0, 1, 1, 0] }),
            transform: [
              { translateX: value.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0, Math.cos(angle) * reach] }) },
              { translateY: value.interpolate({ inputRange: [0, 0.25, 0.7, 1], outputRange: [0, 0, Math.sin(angle) * reach, Math.sin(angle) * reach + radius * 0.4] }) },
              { rotate: `${spark * 360 / SPARKS_PER_BURST + 90}deg` },
              { scale: value.interpolate({ inputRange: [0, 0.24, 0.25, 0.7, 1], outputRange: [0, 0, 1, 0.8, 0.2] }) },
            ],
          }]} />;
        })}
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden', zIndex: 10 },
  origin: { position: 'absolute', width: 0, height: 0 },
  rocket: { position: 'absolute', left: -2, top: -12, width: 4, height: 24, borderRadius: 2 },
  spark: { position: 'absolute', left: -3, top: -7, width: 6, height: 14, borderRadius: 3 },
});
