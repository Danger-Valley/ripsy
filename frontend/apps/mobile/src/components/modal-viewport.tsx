import { useCallback, useState, type PropsWithChildren } from 'react';
import { Platform, requireNativeComponent, StyleSheet, View, type NativeSyntheticEvent, type ViewProps } from 'react-native';

type Region = { x: number; y: number; width: number; height: number };
type ProbeProps = ViewProps & { onRegionChange: (event: NativeSyntheticEvent<Region>) => void };
const NativeProbe = Platform.OS === 'ios' ? requireNativeComponent<ProbeProps>('RipsyModalRegionProbe') : null;

/** Keep one modal and one form, but never place its controls over an active fold. */
export function ModalViewport({ children }: PropsWithChildren) {
  const [region, setRegion] = useState<Region | null>(null);
  const update = useCallback(({ nativeEvent }: NativeSyntheticEvent<Region>) => {
    const { x, y, width, height } = nativeEvent;
    if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width < 0 || height < 0) return;
    setRegion(previous => previous?.x === x && previous.y === y && previous.width === width && previous.height === height
      ? previous : { x, y, width, height });
  }, []);
  if (Platform.OS !== 'ios' || !NativeProbe) return <View style={styles.fill}>{children}</View>;
  return <View style={styles.fill}>
    <NativeProbe testID="modal-region-probe" pointerEvents="none" style={StyleSheet.absoluteFill} onRegionChange={update} />
    {region && <View testID="modal-continuous-region" style={[styles.region, { left: region.x, top: region.y, width: region.width, height: region.height }]}>
      {children}
    </View>}
  </View>;
}

const styles = StyleSheet.create({ fill: { flex: 1 }, region: { position: 'absolute' } });
