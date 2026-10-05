import { isSeekerDevice } from '../src/seeker-device';

test.each(['Seeker', 'Solana Seeker', 'seeker'])('recognizes Seeker model %s', model => {
  expect(isSeekerDevice('android', model)).toBe(true);
});

test.each(['Pixel 9', 'SM-S928B', 'Saga', '', 'Unknown', 'NotSeeker'])('does not treat Android model %s as Seeker', model => {
  expect(isSeekerDevice('android', model)).toBe(false);
});

test('iOS and unknown platforms cannot enable wallet connection even with a Seeker-like model', () => {
  expect(isSeekerDevice('ios', 'Seeker')).toBe(false);
  expect(isSeekerDevice('web' as never, 'Seeker')).toBe(false);
});
