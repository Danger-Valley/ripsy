import React from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import Renderer from 'react-test-renderer';
import { SeekerConnectButton } from '@solana-mobile/seeker-connect-react-native';
import { SeekerConnectAction } from '../src/components/seeker-connect-action';

afterEach(() => jest.restoreAllMocks());
test('unsupported platforms do not mount the Android native button', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  let tree!: Renderer.ReactTestRenderer;
  await Renderer.act(() => { tree = Renderer.create(<SeekerConnectAction onPress={jest.fn()} />); });
  expect(tree.toJSON()).toBeNull(); await Renderer.act(() => tree.unmount());
});

test.each([['idle', false, false], ['busy', true, false], ['disabled', false, true]] as const)('official branded button is accessible and safe when %s', async (_state, busy, disabled) => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const onPress = jest.fn(); let tree!: Renderer.ReactTestRenderer;
  await Renderer.act(() => { tree = Renderer.create(<SeekerConnectAction onPress={onPress} busy={busy} disabled={disabled} />); });
  const button = tree.root.findByType(SeekerConnectButton);
  expect(button.props.theme).toBe('light'); expect(button.props.style.height).toBe(56);
  expect(button.props.enabled).toBe(!busy && !disabled);
  expect(button.props.accessibilityLabel).toBe('Connect with Seeker');
  expect(button.props.accessibilityState).toEqual({ busy, disabled: busy || disabled });
  await Renderer.act(() => button.props.onPress()); expect(onPress).toHaveBeenCalledTimes(busy || disabled ? 0 : 1);
  expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(busy ? 1 : 0);
  expect(tree.root.findAllByType(View).length).toBeGreaterThan(0); await Renderer.act(() => tree.unmount());
});
