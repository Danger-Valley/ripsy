import React from 'react';
import { StyleSheet, Text } from 'react-native';
import Renderer from 'react-test-renderer';
import { createInviteQr } from '@rps/core/invite-qr';
import { createGameInviteUrl, normalizeRoomCode } from '../src/invitations';
import { InviteQr } from '../src/components/invite-qr';
import { WaitingPanel } from '../src/components/battle-panels';

let tree: Renderer.ReactTestRenderer;
afterEach(async () => { if (tree) await Renderer.act(() => tree.unmount()); });
test('QR encodes the canonical invitation, has a four-module quiet zone and rejects invalid rooms', () => {
  const qr = createInviteQr('c50fe81a');
  expect(qr.quietZone).toBe(4);
  expect(qr.runs.length).toBeGreaterThan(100);
  for (const run of qr.runs) {
    expect(run.x).toBeGreaterThanOrEqual(4);
    expect(run.y).toBeGreaterThanOrEqual(4);
    expect(run.x + run.width).toBeLessThanOrEqual(qr.size - 4);
    expect(run.y).toBeLessThan(qr.size - 4);
  }
  expect(createInviteQr('C50FE81A')).toEqual(qr);
  expect(normalizeRoomCode(createGameInviteUrl('c50fe81a'))).toBe('c50fe81a');
  expect(() => createInviteQr('bad-room')).toThrow();
});
test.each([320, 375, 768, 1280])('native invitation remains compact at a %s point viewport', async width => {
  await Renderer.act(() => { tree = Renderer.create(<InviteQr gameId="c50fe81a" />); });
  const image = tree.root.findByProps({ testID: 'invite-qr' });
  expect(image.props.accessibilityRole).toBe('image');
  expect(image.props.accessibilityLabel).toContain('c50fe81a');
  const style = StyleSheet.flatten(image.props.style);
  expect(style.width).toBeLessThanOrEqual(160);
  expect(style.width).toBeLessThan(width - 64);
  expect(style.height).toBe(style.width);
  expect(tree.root.findAllByType(Text).some(node => node.props.selectable && node.props.children === 'c50fe81a')).toBe(true);
});
test('changing rooms regenerates the displayed QR and does not share or join automatically', async () => {
  const share = jest.fn();
  await Renderer.act(() => { tree = Renderer.create(<WaitingPanel gameId="c50fe81a" onInvite={share} />); });
  expect(share).not.toHaveBeenCalled();
  await Renderer.act(() => { tree.update(<WaitingPanel gameId="abcd1234" onInvite={share} />); });
  expect(tree.root.findByProps({ testID: 'invite-qr' }).props.accessibilityLabel).toContain('abcd1234');
  const button = tree.root.findAll(node => node.props.accessibilityLabel === 'Invite opponent' && typeof node.props.onPress === 'function')[0];
  await Renderer.act(() => button.props.onPress());
  expect(share).toHaveBeenCalledTimes(1);
});
