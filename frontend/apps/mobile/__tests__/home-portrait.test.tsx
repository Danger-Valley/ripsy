import React from 'react';
import { Image, StyleSheet } from 'react-native';
import Renderer from 'react-test-renderer';
import { HomePortraitImage } from '../src/components/home-portrait';
import { homeArt } from '../src/components/toy-home-controls';

test.each([false, true])('crops the new hero head proportionally for opponent=%s', async opponent => {
  let tree!: Renderer.ReactTestRenderer;
  await Renderer.act(() => { tree = Renderer.create(<HomePortraitImage opponent={opponent} />); });
  try {
    const image = tree.root.findByType(Image);
    const style = StyleSheet.flatten(image.props.style);
    expect(image.props.source).toBe(homeArt.rivals);
    expect(image.props.resizeMode).toBe('contain');
    expect(style.width).toBe(`${1536 * 100 / 440}%`);
    expect(style.height).toBe(`${1024 * 100 / 440}%`);
    expect(style.left).toBe(`${-(opponent ? 880 : 240) * (100 / 440)}%`);
    expect(style.top).toBe(`${-220 * (100 / 440)}%`);
    expect(image.props.importantForAccessibility).toBe('no-hide-descendants');
  } finally {
    await Renderer.act(() => tree.unmount());
  }
});
