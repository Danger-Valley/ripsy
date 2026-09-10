import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Fit, RiveView, useRive, type RiveFile } from '@rive-app/react-native';
import { Piece } from '@rps/core';
import { colors } from '../theme';

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
    try {
      riveViewRef.setNumberInputValue('Weapon', piece);
      if (piece === Piece.Trap && isMine) riveViewRef.triggerInput('Trap Idle');
      else riveViewRef.setBooleanInputValue('WeaponVisible', true);
      riveViewRef.playIfNeeded();
    } catch {
      // The text fallback stays visible if this asset's state machine changes.
    }
  }, [isMine, piece, riveViewRef]);

  return (
    <View pointerEvents="none" style={[styles.container, { width: size, height: size }]}>
      {!riveViewRef && <Text allowFontScaling={false} style={[styles.fallback, { fontSize: Math.max(12, size * 0.3) }]}>{pieceLabel(piece, isMine)}</Text>}
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

export function pieceLabel(piece: Piece, isMine = true) {
  if (!isMine) return '?';
  if (piece === Piece.Rock) return 'R';
  if (piece === Piece.Paper) return 'P';
  if (piece === Piece.Scissors) return 'S';
  if (piece === Piece.Flag) return 'F';
  if (piece === Piece.Trap) return 'T';
  return '•';
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  rive: { position: 'absolute', inset: 0 },
  mirrored: { transform: [{ scaleX: -1 }] },
  fallback: { color: colors.text, fontWeight: '900' },
});
