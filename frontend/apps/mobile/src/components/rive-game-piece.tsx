import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Fit, RiveView, useRive, type RiveFile } from '@rive-app/react-native';
import { Piece } from '@rps/core';

interface Props {
  file: RiveFile;
  isMine: boolean;
  mirrored: boolean;
  piece: Piece;
  size: number;
}

export function RiveGamePiece({ file, isMine, mirrored, piece, size }: Props) {
  const { riveViewRef, setHybridRef } = useRive();

  useEffect(() => {
    if (!riveViewRef) return;
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

    riveViewRef.reset().then(configurePiece, configurePiece);

    return () => {
      cancelled = true;
    };
  }, [isMine, piece, riveViewRef]);

  return (
    <View pointerEvents="none" style={[styles.container, { width: size, height: size }]}>
      <RiveView
        autoPlay
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
