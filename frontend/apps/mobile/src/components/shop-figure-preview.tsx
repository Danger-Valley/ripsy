import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { Fit, RiveView, useRive, useRiveFile, type RiveFile } from '@rive-app/react-native';
import type { ShopFigure } from '@rps/core/shop';
import { figurePortrait, type DisplayFigure } from '../figures/catalog';
import { bundledHashes, RemoteAnimation } from '../figures/remote-animation';

const bundled: Record<string, { variant: number; source: number }> = {
  fig1: { variant: 1, source: require('../assets/figures/fig1.riv') },
  fig2: { variant: 2, source: require('../assets/figures/fig2.riv') },
  bonk: { variant: 3, source: require('../assets/figures/bonk.riv') },
  jup: { variant: 4, source: require('../assets/figures/jup.riv') },
  ore: { variant: 5, source: require('../assets/figures/ore.riv') },
};

/** Decorative only: never shares a controller, inputs or actions with a battle. */
export const ShopFigurePreview = memo(function ShopFigurePreviewView({ figure, definition, active }: {
  figure: ShopFigure; definition?: DisplayFigure; active: boolean;
}) {
  const matchingDefinition = definition?.id === figure.id && definition.variant === figure.variant ? definition : undefined;
  const portrait = figurePortrait(figure.id, matchingDefinition ? [matchingDefinition] : [], figure.imageUrl);
  return <View testID={`shop-preview-${figure.id}`} pointerEvents="none" accessible accessibilityRole="image"
    accessibilityLabel={`${figure.name} preview`} style={styles.frame}>
    {active ? <AnimatedPreview key={`${figure.id}:${matchingDefinition?.animation?.sha256 ?? 'bundled'}`}
      figure={figure} definition={matchingDefinition} portrait={portrait} /> : <Portrait source={portrait} />}
  </View>;
});

function Portrait({ source, hidden = false }: { source: ImageSourcePropType; hidden?: boolean }) {
  return <Image source={source} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    testID="shop-preview-portrait" style={[styles.fill, styles.portrait, hidden && styles.hidden]} />;
}

function AnimatedPreview({ figure, definition, portrait }: { figure: ShopFigure; definition?: DisplayFigure; portrait: ImageSourcePropType }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [remoteFile, setRemoteFile] = useState<RiveFile | null>(null);
  const onReady = useCallback(() => setReady(true), []);
  const onFailure = useCallback(() => { setReady(false); setFailed(true); }, []);
  const onRemoteReady = useCallback((_variant: number, _hash: string, file: RiveFile) => setRemoteFile(file), []);
  const local = bundled[figure.id];
  const animation = definition?.animation;
  // The manifest may replace a bundled model. Never silently animate stale art
  // when its advertised hash differs; use the existing verified private cache.
  const source = local?.variant === figure.variant && (!animation || animation.sha256 === bundledHashes[figure.variant])
    ? local.source : undefined;

  return <>
    <Portrait source={portrait} hidden={ready && !failed} />
    {!failed && (source !== undefined ? <BundledPreview source={source} ready={ready} onReady={onReady} onFailure={onFailure} />
      : animation ? <>
        <RemoteAnimation animation={animation} variant={figure.variant} onReady={onRemoteReady} onFailure={onFailure} />
        {remoteFile && <IdlePreview file={remoteFile} ready={ready} onReady={onReady} onFailure={onFailure} />}
      </> : null)}
  </>;
}

function BundledPreview({ source, ready, onReady, onFailure }: {
  source: number; ready: boolean; onReady(): void; onFailure(): void;
}) {
  const { riveFile, error } = useRiveFile(source);
  useEffect(() => { if (error) onFailure(); }, [error, onFailure]);
  return riveFile && !error ? <IdlePreview file={riveFile} ready={ready} onReady={onReady} onFailure={onFailure} /> : null;
}

function IdlePreview({ file, ready, onReady, onFailure }: { file: RiveFile; ready: boolean; onReady(): void; onFailure(): void }) {
  const { riveViewRef: reportedView, setHybridRef } = useRive();
  const stableView = useRef(reportedView);
  if (stableView.current !== reportedView) {
    // Nitro can report two wrappers for one native view. Keep idle/blink running
    // through quantity, price or catalog rerenders, just as the board does.
    let sameNativeView = false;
    try { sameNativeView = Boolean(reportedView && stableView.current && reportedView.equals?.(stableView.current)); }
    catch { /* A disposed native view is not reusable. */ }
    if (!sameNativeView) stableView.current = reportedView;
  }
  const view = stableView.current;
  const hybridRef = useMemo(() => ({ f: setHybridRef.f }), [setHybridRef.f]);
  useEffect(() => {
    if (!view) return;
    let current = true;
    const configure = async () => {
      try {
        view.setNumberInputValue('Weapon', 0);
        await view.play();
        if (!current) return;
        // Cold Android playback may create the requested Front machine anew.
        // Reassert No Weapon before replacing the portrait with the live view.
        view.setNumberInputValue('Weapon', 0);
        onReady();
      } catch { if (current) onFailure(); }
    };
    configure();
    return () => { current = false; };
  }, [view, file, onReady, onFailure]);

  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.fill, !ready && styles.hidden]}>
    <RiveView file={file} stateMachineName="State Machine Front" autoPlay={false} fit={Fit.Contain}
      hybridRef={hybridRef} onError={onFailure} style={styles.fill} />
  </View>;
}

const styles = StyleSheet.create({
  frame: { position: 'absolute', width: 300, height: 300, bottom: 24 },
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  portrait: { width: 300, height: 300, resizeMode: 'contain' },
  hidden: { opacity: 0 },
});
