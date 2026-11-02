import type { ImageSourcePropType } from 'react-native';

/** Bootstrap resources only; never an allowlist for server-issued identities. */
export const bundledHashes: Record<number, string> = {
  1: 'b44ee60dcabf2893b0409abd2193a5e68a32af0211c400417508524a7f3ff0ba',
  2: '7ebfc2d64675e7882f4dfb7b2e6d8d23a03e1442756876cc0605ec0d33584668',
  3: '26a1faafefac4102b17c41d2738ac5509602313eb5f94168fe36d722a8f1d75f',
  4: 'fe42caa994fa8b88066d37a35e60917208e8bd394113e278e1e4212e930255ad',
  5: '68dfc42ecf16277df605a0acfc574f608014acdaae3260565f989cc9010f3520',
};
export const bundledPortraits: Record<string, ImageSourcePropType> = {
  fig1: require('../assets/shop/fig1.png'), fig2: require('../assets/shop/fig2.png'),
  bonk: require('../assets/shop/bonk.png'), jup: require('../assets/shop/jup.png'), ore: require('../assets/shop/ore.png'),
};
export const bundledPortraitHashes: Record<string, string> = {
  fig1: 'bcec7a04ce0ffc83d0596a2f5913d966d61f3160266a77a62864c6acfe343f10',
  fig2: '7fd529815beb7d02eb8ba15ec04714320bc060e42da88a3013845427a30744e4',
  bonk: '11eed2a4f6f85c92b107a66d71d6bf3edad17639658d48e781ad032f118bb6b1',
  jup: '5a71dabbf474c10fdedb48d2183b35481a307a44cac9f17c4f6a3c851503f8bd',
  ore: 'b710cf7bfe16692dd7b63c8303a04e5a470fae3f57a1d8aab2785bdbffcf5c1c',
};
