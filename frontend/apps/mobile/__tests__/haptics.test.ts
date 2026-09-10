import { trigger } from 'react-native-haptic-feedback';
import { haptics } from '../src/haptics';

const mockedTrigger = trigger as jest.MockedFunction<typeof trigger>;

afterEach(() => mockedTrigger.mockReset());

test('uses haptic patterns that respect the device system setting', () => {
  haptics.select();
  haptics.move();
  haptics.success();
  haptics.warning();

  expect(mockedTrigger.mock.calls.map(call => call[0])).toEqual([
    'selection',
    'impactLight',
    'notificationSuccess',
    'notificationWarning',
  ]);
  expect(mockedTrigger).toHaveBeenCalledWith('selection', {
    enableVibrateFallback: false,
    ignoreAndroidSystemSettings: false,
  });
});

test('never lets a native haptic failure block the action', () => {
  mockedTrigger.mockImplementation(() => { throw new Error('native haptics unavailable'); });
  expect(() => haptics.select()).not.toThrow();
});
