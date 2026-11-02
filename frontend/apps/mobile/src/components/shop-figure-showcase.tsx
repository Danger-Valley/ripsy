import { Image, StyleSheet, Text, View } from 'react-native';
import type { ShopFigure } from '@rps/core/shop';
import type { DisplayFigure } from '../figures/catalog';
import { colors, spacing } from '../theme';
import { ShopFigurePreview } from './shop-figure-preview';

// The 300-point preview sits 24 points above the floor and its native Rive
// canvas extends another 75 points upward. Reserve all 399 points inside the
// rounded showcase: enlarging only the child canvas still clips at this parent.
export const shopFigureShowcaseHeight = 400;
const scenery = require('../assets/ui/toy-box-home-arena.png');

/** Shared by the real Shop cards and the isolated native visual test scene. */
export function ShopFigureShowcase({ figure, definition, active }: {
  figure: ShopFigure; definition?: DisplayFigure; active: boolean;
}) {
  return <View testID={`shop-showcase-${figure.id}`} style={styles.showcase}>
    <Image pointerEvents="none" accessibilityElementsHidden source={scenery} style={styles.scenery} />
    <View pointerEvents="none" style={styles.plinthBase} /><View pointerEvents="none" style={styles.plinthTop} />
    <ShopFigurePreview figure={figure} definition={definition} active={active} />
    {figure.seekerExclusive && <View style={styles.exclusive}><Text style={styles.exclusiveText}>SEEKER EXCLUSIVE</Text></View>}
  </View>;
}

const styles = StyleSheet.create({
  showcase: { height: shopFigureShowcaseHeight, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', alignItems: 'center', backgroundColor: colors.surfaceHighlight },
  scenery: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', resizeMode: 'cover' },
  // Native molded plinths retain their original size and bottom offsets.
  plinthBase: { position: 'absolute', bottom: 13, width: 180, height: 32, borderRadius: 90, backgroundColor: colors.accentShadow },
  plinthTop: { position: 'absolute', bottom: 23, width: 180, height: 25, borderRadius: 90, backgroundColor: colors.accent },
  exclusive: { position: 'absolute', top: spacing.md, right: spacing.md, borderRadius: 10, backgroundColor: colors.reward, padding: spacing.sm },
  exclusiveText: { color: colors.ink, fontSize: 10, fontWeight: '900' },
});
