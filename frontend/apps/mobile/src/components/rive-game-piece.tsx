import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { Fit, RiveView, useRive, type RiveFile } from '@rive-app/react-native';
import { Piece } from '@rps/core';

interface Props {
  actionTrigger?: RiveActionTrigger;
  file: RiveFile;
  isMine: boolean;
  piece: Piece;
  size: number;
  staggerStart?: boolean;
}

export type RiveActionTrigger =
  | 'Jump Forward'
  | 'Jump Right'
  | 'Jump Left'
  | 'Attack Prepare'
  | 'Attack'
  | 'Trap Activate'
  | 'Fall In Trap'
  | 'Death';

export function RiveGamePiece({ actionTrigger, file, isMine, piece, size, staggerStart = false }: Props) {
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

    const setPieceInputs = () => {
      try {
        riveViewRef.setNumberInputValue('Weapon', piece);
        if (isMine) riveViewRef.setNumberInputValue('WeaponVisible', piece !== Piece.Empty && piece !== Piece.Trap ? 1 : 0);
      } catch {
        // Keep the board usable if this asset's state machine changes.
      }
    };

    const configurePiece = async () => {
      if (isMine) {
        try {
          await riveViewRef.pause();
          await riveViewRef.reset();
        } catch {
          // The view is already known to be ready; continue with its current state.
        }
      }
      if (cancelled) return;
      setPieceInputs();
      try {
        await riveViewRef.play();
      } catch {
        riveViewRef.playIfNeeded();
      }
      if (cancelled) return;
      if (actionTrigger) {
        try {
          riveViewRef.triggerInput(actionTrigger);
          riveViewRef.playIfNeeded();
        } catch {
          // Keep the positional move running if an asset trigger is unavailable.
        }
      }
      if (cancelled || piece !== Piece.Trap || !isMine) return;
      try {
        riveViewRef.triggerInput('Trap Idle');
        riveViewRef.playIfNeeded();
      } catch {
        // Leave the figure unarmed if the trap trigger is unavailable.
      }
    };

    configurePiece().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [actionTrigger, isMine, piece, riveViewRef, shouldMountRive]);

  return (
    <View pointerEvents="none" style={[styles.container, { width: size, height: size }]}>
      {shouldMountRive ? (
        <RiveView
          autoPlay={false}
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
