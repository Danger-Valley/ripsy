import React from 'react';
import { Animated, Linking, Modal, ScrollView, StyleSheet, Text } from 'react-native';
import Renderer from 'react-test-renderer';
import { Choice } from '@rps/core';
import { BattleResultPanel, JoinGate, LineupPanel, WaitingPanel, WeaponChoiceModal } from '../src/components/battle-panels';
import { BattleGuideDialog, SettingsDialog } from '../src/components/settings-dialogs';
import { ToyDialog } from '../src/components/toy-dialog';
import { ToyHomeButton } from '../src/components/toy-home-controls';
import type { PushPermissionState } from '../src/push-notifications';

let tree: Renderer.ReactTestRenderer;
const choose = jest.fn();
const close = jest.fn();
const enable = jest.fn();
const army = jest.fn();
const shop = jest.fn();
beforeEach(() => jest.clearAllMocks());
afterEach(async () => { if (tree) await Renderer.act(() => tree.unmount()); });
async function mount(element: React.ReactElement) { await Renderer.act(async () => { tree = Renderer.create(element); }); }
function button(label: string) { return tree.root.findAll(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === label)[0]; }
function hasText(value: string) { return tree.root.findAllByType(Text).some(node => node.props.children === value); }
async function press(label: string) { await Renderer.act(async () => button(label).props.onPress()); }

test('shared dialogs respect safe areas, scroll, keyboard and native dismiss', async () => {
  await mount(<ToyDialog visible title="Test" keyboard onClose={close} closeLabel="Close test"><Text>Body</Text></ToyDialog>);
  const modal = tree.root.findByType(Modal);
  expect(modal.props.animationType).toBe('none');
  const scroll = tree.root.findByType(ScrollView);
  expect(tree.root.find(node => node.props.accessibilityViewIsModal === true)).toBeDefined();
  expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
  expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingTop).toBeGreaterThanOrEqual(16);
  await Renderer.act(() => modal.props.onRequestClose()); expect(close).toHaveBeenCalledTimes(1);
  await press('Close test'); expect(close).toHaveBeenCalledTimes(2);
});
test.each([['Choose rock', Choice.Rock], ['Choose paper', Choice.Paper], ['Choose scissors', Choice.Scissors]])('whole weapon card submits only %s on explicit tap', async (label, choice) => {
  await mount(<WeaponChoiceModal isOpen busy={false} onChoose={choose} />);
  expect(choose).not.toHaveBeenCalled();
  expect(hasText('Break the tie!')).toBe(true);
  await press(label as string); expect(choose).toHaveBeenCalledWith(choice);
});
test('required tie choice cannot be dismissed and locks all choices during submission', async () => {
  await mount(<WeaponChoiceModal isOpen busy onChoose={choose} />);
  for (const label of ['Choose rock', 'Choose paper', 'Choose scissors']) expect(button(label).props.disabled).toBe(true);
  expect(hasText('Saving your choice…')).toBe(true);
  await Renderer.act(() => tree.root.findByType(Modal).props.onRequestClose());
  expect(choose).not.toHaveBeenCalled(); expect(tree.root.findByType(Modal).props.visible).toBe(true);
  expect(button('Close dialog')).toBeUndefined();
});
test.each([
  ['victory', 'timeout', 'Your opponent ran out of time. This round is yours.'],
  ['victory', undefined, 'You captured the flag. Your army takes the win!'],
  ['defeat', 'timeout', 'Your clock hit zero. Try a faster plan next round.'],
  ['defeat', undefined, 'Your opponent captured the flag. A new lineup, a new chance.'],
  ['cancelled', 'lineup_timeout', 'A lineup was not saved in time. No winner this round.'],
] as const)('%s result is honest about %s and returns home', async (outcome, reason, copy) => {
  await mount(<BattleResultPanel outcome={outcome} reason={reason} onBack={close} />);
  expect(hasText(copy)).toBe(true);
  await press('Back to playground'); expect(close).toHaveBeenCalledTimes(1);
});
test.each(['loading', 'joining', 'failed', 'unavailable'] as const)('join %s has recovery or progress, never a redundant join button', async mode => {
  await mount(<JoinGate mode={mode} gameId="abcd1234" onBack={close} onRetry={mode === 'failed' ? enable : undefined} />);
  expect(hasText('abcd1234')).toBe(true); expect(button('Join this game')).toBeUndefined();
  if (mode === 'failed') { await press('Try again'); expect(enable).toHaveBeenCalledTimes(1); }
  if (mode === 'failed' || mode === 'unavailable') { await press('Back to home'); expect(close).toHaveBeenCalledTimes(1); }
  else expect(tree.root.findAllByProps({ accessibilityRole: 'progressbar' }).length).toBeGreaterThan(0);
});
test('waiting invite keeps the board-preview hint and system share action', async () => {
  await mount(<WaitingPanel gameId="abcd1234" onInvite={choose} />); await press('Invite opponent');
  expect(choose).toHaveBeenCalledTimes(1);
  expect(hasText('The board is a preview. Use Shuffle and Save below.')).toBe(true);
});
test('lineup actions, deadline, glow and dirty/saved states stay distinct', async () => {
  const props = { hasSubmitted: true, busy: false, deadlineAt: Date.now() + 120000, attention: new Animated.Value(0), onShuffle: choose, onSave: enable };
  await mount(<LineupPanel {...props} saved={false} />);
  expect(hasText('UNSAVED CHANGES')).toBe(true);
  expect(tree.root.findAllByProps({ testID: 'lineup-countdown' }).length).toBeGreaterThan(0);
  await press('Save changes'); expect(enable).toHaveBeenCalledTimes(1);
  await Renderer.act(() => tree.update(<LineupPanel {...props} saved />));
  expect(button('Lineup saved').props.disabled).toBe(true);
  expect(tree.root.findAllByProps({ testID: 'lineup-attention-glow' })).toHaveLength(0);
  expect(tree.root.findAllByProps({ testID: 'lineup-countdown' })).toHaveLength(0);
  await press('Shuffle'); expect(choose).toHaveBeenCalledTimes(1);
});
test('busy lineup cannot reshuffle while a save is in progress', async () => {
  await mount(<LineupPanel saved={false} hasSubmitted={false} busy attention={new Animated.Value(0)} onShuffle={choose} onSave={enable} />);
  expect(button('Shuffle').props.disabled).toBe(true); expect(button('Save lineup').props.disabled).toBe(true);
  expect(hasText('Save lineup')).toBe(true);
});
test.each(['checking', 'enabled', 'prompt', 'denied', 'unavailable', 'error'] as PushPermissionState[])('settings presents real %s notification state without automatic permission request', async status => {
  await mount(<SettingsDialog visible status={status} ready onClose={close} onEnable={enable} onArmy={army} onShop={shop} />);
  expect(enable).not.toHaveBeenCalled();
  if (status === 'prompt' || status === 'error') { await press(status === 'prompt' ? 'Enable notifications' : 'Retry notifications'); expect(enable).toHaveBeenCalledTimes(1); }
  else expect(button('Enable notifications')).toBeUndefined();
  if (status === 'denied') {
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await press('Open device settings'); expect(open).toHaveBeenCalledTimes(1); open.mockRestore();
  }
  await press('Your army'); expect(army).toHaveBeenCalledTimes(1);
  await press('Figure shop'); expect(shop).toHaveBeenCalledTimes(1);
});
test('guide explains flag restriction, traps, clocks and lineup deadline', async () => {
  await mount(<BattleGuideDialog visible onClose={close} />);
  expect(hasText('Capture the opponent’s flag to win. Flags move only onto empty cells; traps stay put and defeat attackers.')).toBe(true);
  expect(hasText('Use the controls below the board to set your hidden lineup. Save within three minutes.')).toBe(true);
  await press('Back to battle'); expect(close).toHaveBeenCalledTimes(1);
});
test('shared glossy buttons retain their label while busy and show keyboard focus', async () => {
  await mount(<ToyHomeButton busy onPress={choose}>Working</ToyHomeButton>);
  expect(hasText('Working')).toBe(true); expect(button('Working').props.disabled).toBe(true);
  await Renderer.act(() => tree.update(<ToyHomeButton onPress={choose}>Working</ToyHomeButton>));
  await Renderer.act(() => button('Working').props.onFocus());
  expect(tree.root.findAllByProps({ testID: 'toy-button-focus' }).length).toBeGreaterThan(0);
  await Renderer.act(() => button('Working').props.onBlur());
  expect(tree.root.findAllByProps({ testID: 'toy-button-focus' })).toHaveLength(0);
});
