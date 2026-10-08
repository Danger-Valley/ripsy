import { Image, StyleSheet } from 'react-native';
import { homeArt } from './toy-home-controls';

// Head crops in the user's 1536 x 1024 replacement hero. Express the render in
// percentages so Home and the battle HUD share a crop at any portrait size.
const cropSize = 440;
const scale = 100 / cropSize;

export function HomePortraitImage({ opponent = false }: { opponent?: boolean }) {
  return (
    <Image
      source={homeArt.rivals}
      resizeMode="contain"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.image, { left: `${-(opponent ? 880 : 240) * scale}%` }]}
    />
  );
}

const styles = StyleSheet.create({
  image: { position: 'absolute', width: `${1536 * scale}%`, height: `${1024 * scale}%`, top: `${-220 * scale}%` },
});
