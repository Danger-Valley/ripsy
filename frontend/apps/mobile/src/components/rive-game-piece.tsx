import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { Fit, RiveView, useRive, type RiveFile } from '@rive-app/react-native';
import { Piece } from '@rps/core';

interface Props {
  file: RiveFile;
  isMine: boolean;
  piece: Piece;
  size: number;
  staggerStart?: boolean;
}

export function RiveGamePiece({ file, isMine, piece, size, staggerStart = false }: Props) {
  const { riveViewRef, setHybridRef } = useRive();
  const initialDelayMs = useRef(60 + Math.floor(Math.random() * 340)).current;
  const [shouldMountRive, setShouldMountRive] = useState(!staggerStart);
  const stateMachineName = isMine ? 'State Machine Back' : 'State Machine Front';

  useEffect(() => {
    if (!staggerStart) {
      setShouldMountRive(true);
      return;
    }
    if (shouldMountRive) return;

    let cancelled = false;
    let mountTimer: ReturnType<typeof setTimeout> | undefined;

    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then(reduceMotion => {
        if (cancelled) return;
        if (reduceMotion) setShouldMountRive(true);
        else mountTimer = setTimeout(() => setShouldMountRive(true), initialDelayMs);
      });

    return () => {
      cancelled = true;
      if (mountTimer) clearTimeout(mountTimer);
    };
  }, [initialDelayMs, shouldMountRive, staggerStart]);

  useEffect(() => {
    if (!shouldMountRive || !riveViewRef) return;
    let cancelled = false;

    const configurePiece = () => {
      if (cancelled) return;
      try {
        riveViewRef.setNumberInputValue('Weapon', piece);
        riveViewRef.setBooleanInputValue('WeaponVisible', piece !== Piece.Empty && piece !== Piece.Trap);
        if (piece === Piece.Trap && isMine) riveViewRef.triggerInput('Trap Idle');
        riveViewRef.playIfNeeded();
      } catch {
        // Keep the board usable if this asset's state machine changes.
      }
    };

    riveViewRef.awaitViewReady()
      .then(() => isMine ? riveViewRef.reset() : undefined)
      .then(configurePiece, configurePiece);

    return () => {
      cancelled = true;
    };
  }, [isMine, piece, riveViewRef, shouldMountRive]);

  return (
    <View pointerEvents="none" style={[styles.container, { width: size, height: size }]}>
      {shouldMountRive ? (
        <RiveView
          autoPlay
          file={file}
          fit={Fit.Contain}
          hybridRef={setHybridRef}
          key={stateMachineName}
          stateMachineName={stateMachineName}
          style={styles.rive}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  rive: { position: 'absolute', inset: 0 },
});
