/* global jest */
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: { AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AfterFirstUnlockThisDeviceOnly' },
  STORAGE_TYPE: { AES_GCM_NO_AUTH: 'KeystoreAESGCM_NoAuth' },
  getGenericPassword: jest.fn(() => Promise.resolve(false)),
  setGenericPassword: jest.fn(() => Promise.resolve({ service: 'test', storage: 'test' })),
  resetGenericPassword: jest.fn(() => Promise.resolve(true)),
}));

jest.mock('@react-native-firebase/app', () => ({
  getApp: jest.fn(() => ({})),
  getApps: jest.fn(() => []),
}));

jest.mock('@react-native-firebase/installations', () => ({
  getId: jest.fn(() => Promise.resolve('test-installation-id')),
  getInstallations: jest.fn(() => ({})),
}));

jest.mock('@react-native-firebase/messaging', () => ({
  getInitialNotification: jest.fn(() => Promise.resolve(null)),
  getMessaging: jest.fn(() => ({})),
  getToken: jest.fn(() => Promise.resolve('test-token')),
  onNotificationOpenedApp: jest.fn(() => () => undefined),
  onMessage: jest.fn(() => () => undefined),
  registerDeviceForRemoteMessages: jest.fn(() => Promise.resolve()),
  setBackgroundMessageHandler: jest.fn(),
}));

jest.mock('react-native-permissions', () => ({
  RESULTS: { BLOCKED: 'blocked', DENIED: 'denied', GRANTED: 'granted', LIMITED: 'limited', UNAVAILABLE: 'unavailable' },
  checkNotifications: jest.fn(() => Promise.resolve({ status: 'unavailable', settings: {} })),
  requestNotifications: jest.fn(() => Promise.resolve({ status: 'granted', settings: {} })),
}));

jest.mock('react-native-haptic-feedback', () => ({
  HapticFeedbackTypes: {
    selection: 'selection',
    impactLight: 'impactLight',
    notificationSuccess: 'notificationSuccess',
    notificationWarning: 'notificationWarning',
  },
  trigger: jest.fn(),
}));

jest.mock('@rive-app/react-native', () => {
  const React = require('react');
  return {
    Fit: { Contain: 'contain' },
    RiveView: props => React.createElement('RiveView', { ...props, testID: 'rive-view' }),
    useRive: () => ({ riveRef: { current: null }, riveViewRef: null, setHybridRef: { f: () => undefined } }),
    useRiveFile: () => {
      // The real hook retains the loaded file for the lifetime of this source.
      const [riveFile] = React.useState(() => ({ test: true }));
      return { riveFile, isLoading: false, error: null };
    },
  };
});
