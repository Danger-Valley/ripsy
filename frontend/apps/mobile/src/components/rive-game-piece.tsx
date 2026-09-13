import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
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
  const readyRef = useRef<Promise<void>>(Promise.resolve());
  const initialDelayMs = useRef(60 + Math.floor(Math.random() * 340)).current;
  const [shouldMountRive, setShouldMountRive] = useState(!staggerStart);
  const [isConfigured, setIsConfigured] = useState(Platform.OS !== 'android');
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
    const isTrap = piece === Piece.Trap;

    const setPieceInputs = () => {
      try {
        // Trap is a separate Rive state, not a weapon value. Passing Piece.Trap
        // into Weapon can leave a stale weapon layer visible inside the trap art.
        riveViewRef.setNumberInputValue('Weapon', isTrap ? Piece.Empty : piece);
        if (isMine) riveViewRef.setNumberInputValue('WeaponVisible', piece !== Piece.Empty && !isTrap ? 1 : 0);
      } catch {
        // Keep the board usable if this asset's state machine changes.
      }
    };

    const configurePiece = async () => {
      const needsAndroidBootstrap = Platform.OS === 'android';
      if (needsAndroidBootstrap) {
        setIsConfigured(false);
        try {
          // Android does not reliably accept legacy state-machine inputs until
          // playback has initialized the machine. Keep the view hidden while
          // bootstrapping so its default Scissors state never reaches screen.
          await riveViewRef.play();
        } catch {
          riveViewRef.playIfNeeded();
        }
      }
      if (cancelled) return;
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
      if (isTrap && isMine) {
        try {
          // Reassert the hidden state after playback starts, before entering the
          // trap idle state, so a previously reused weapon layer cannot flash.
          setPieceInputs();
          riveViewRef.triggerInput('Trap Idle');
          riveViewRef.playIfNeeded();
        } catch {
          // Leave the figure unarmed if the trap trigger is unavailable.
        }
      }
      if (!cancelled && needsAndroidBootstrap) setIsConfigured(true);
    };

    readyRef.current = configurePiece().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [isMine, piece, riveViewRef, shouldMountRive]);

  useEffect(() => {
    if (!shouldMountRive || !riveViewRef || !actionTrigger) return;
    let cancelled = false;
    readyRef.current.then(() => {
      if (cancelled) return;
      try {
        riveViewRef.triggerInput(actionTrigger);
        riveViewRef.playIfNeeded();
      } catch {
        // Keep the scene running if an optional asset trigger is unavailable.
      }
    });
    return () => {
      cancelled = true;
    };
  }, [actionTrigger, riveViewRef, shouldMountRive]);

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
          style={[styles.rive, !isConfigured && styles.riveHidden]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  rive: { position: 'absolute', inset: 0 },
  riveHidden: { opacity: 0 },
});
