import React from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput } from 'react-native';
import Renderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ModalViewport } from '../src/components/modal-viewport';
import { ToyDialog } from '../src/components/toy-dialog';

jest.unmock('../src/components/modal-viewport');

let tree: Renderer.ReactTestRenderer;
afterEach(async () => { if (tree) await Renderer.act(() => tree.unmount()); jest.restoreAllMocks(); });
async function mount(element: React.ReactElement) { await Renderer.act(() => { tree = Renderer.create(element); }); }
function probe() { return tree.root.findAll(node => node.props.testID === 'modal-region-probe' && typeof node.props.onRegionChange === 'function')[0]!; }
async function region(x: number, y: number, width: number, height: number) {
  await Renderer.act(() => probe().props.onRegionChange({ nativeEvent: { x, y, width, height } }));
}

test('does not expose interactive controls before the first valid local region', async () => {
  await mount(<ModalViewport><TextInput value="not-yet-visible" /></ModalViewport>);
  expect(probe().props.pointerEvents).toBe('none');
  expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  for (const invalid of [[NaN, 0, 300, 500], [0, Infinity, 300, 500], [-1, 0, 300, 500], [0, 0, -1, 500]]) {
    await region(invalid[0]!, invalid[1]!, invalid[2]!, invalid[3]!);
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  }
  await region(0, 0, 466, 678);
  expect(tree.root.findByType(TextInput).props.value).toBe('not-yet-visible');
});

test('open, side fold, bottom fold, keyboard fallback and closed retain one form and its input', async () => {
  let mounts = 0;
  function Form() {
    const [email, setEmail] = React.useState('');
    React.useEffect(() => { mounts++; }, []);
    return <TextInput value={email} onChangeText={setEmail} />;
  }
  await mount(<ModalViewport><Form /></ModalViewport>);
  await region(0, 0, 951, 669);
  await Renderer.act(() => tree.root.findByType(TextInput).props.onChangeText('fold-test@example.invalid'));
  const form = tree.root.findByType(Form);
  for (const bounds of [[495.67, 0, 455.33, 669], [0, 495.67, 669, 455.33], [0, 0, 669, 455], [0, 0, 466, 678], [0, 0, 951, 669]]) {
    const [x, y, width, height] = bounds as [number, number, number, number];
    await region(x, y, width, height);
    expect(StyleSheet.flatten(tree.root.findByProps({ testID: 'modal-continuous-region' }).props.style)).toMatchObject({ left: x, top: y, width, height });
    expect(tree.root.findByType(Form)).toBe(form);
    expect(tree.root.findByType(TextInput).props.value).toBe('fold-test@example.invalid');
    expect(mounts).toBe(1);
  }
});

test('keyboard avoidance remains full-modal while the provider and form live inside the native region', async () => {
  const close = jest.fn();
  await mount(<ToyDialog visible title="Account" keyboard onClose={close}><TextInput value="kept" /></ToyDialog>);
  const avoidance = tree.root.findByType(KeyboardAvoidingView);
  expect(avoidance.props.behavior).toBe('padding');
  expect(avoidance.findByType(ModalViewport)).toBeDefined();
  await region(495.67, 0, 455.33, 669);
  const bounded = tree.root.findByProps({ testID: 'modal-continuous-region' });
  expect(bounded.findByType(SafeAreaProvider)).toBeDefined();
  expect(bounded.findAllByType(KeyboardAvoidingView)).toHaveLength(0);
  expect(tree.root.findByType(TextInput).props.value).toBe('kept');
  expect(close).not.toHaveBeenCalled();
});

test('Android renders its existing full-area dialog without an iOS bridge measurement', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  await mount(<ModalViewport><TextInput value="android" /></ModalViewport>);
  expect(tree.root.findByType(TextInput).props.value).toBe('android');
  expect(tree.root.findAllByProps({ testID: 'modal-region-probe' })).toHaveLength(0);
});
