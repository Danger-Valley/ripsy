import { useEffect, useRef } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { Fit, RiveView, useRive, type RiveFile } from '@rive-app/react-native';
import { Piece } from '@rps/core';

interface Props {
  file: RiveFile;
  isMine: boolean;
  mirrored: boolean;
  piece: Piece;
  size: number;
  staggerStart?: boolean;
}

export function RiveGamePiece({ file, isMine, mirrored, piece, size, staggerStart = false }: Props) {
  const { riveViewRef, setHybridRef } = useRive();
  const initialDelayMs = useRef(60 + Math.floor(Math.random() * 340)).current;
  const hasStarted = useRef(false);

  useEffect(() => {
    if (!riveViewRef) return;
    let cancelled = false;
    let startTimer: ReturnType<typeof setTimeout> | undefined;

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

    const startPlayback = () => {
      if (cancelled) return;
      hasStarted.current = true;
      riveViewRef.reset().then(configurePiece, configurePiece);
    };

    if (staggerStart && !hasStarted.current) {
      AccessibilityInfo.isReduceMotionEnabled()
        .catch(() => false)
        .then(reduceMotion => {
          if (cancelled) return;
          if (reduceMotion) startPlayback();
          else startTimer = setTimeout(startPlayback, initialDelayMs);
        });
    } else {
      startPlayback();
    }

    return () => {
      cancelled = true;
      if (startTimer) clearTimeout(startTimer);
    };
  }, [initialDelayMs, isMine, piece, riveViewRef, staggerStart]);

  return (
    <View pointerEvents="none" style={[styles.container, { width: size, height: size }]}>
      <RiveView
        autoPlay={!staggerStart}
        file={file}
        fit={Fit.Contain}
        hybridRef={setHybridRef}
        stateMachineName={isMine ? 'State Machine Back' : 'State Machine Front'}
        style={[styles.rive, mirrored && styles.mirrored]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  rive: { position: 'absolute', inset: 0 },
  mirrored: { transform: [{ scaleX: -1 }] },
});
