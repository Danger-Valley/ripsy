import { SoundEngine, type SoundBackend, type SoundStorage, type SoundPreferences } from '../src/audio/sound-engine';

function setup() {
  const backend: jest.Mocked<SoundBackend> = { prepare: jest.fn(async () => true), play: jest.fn(), stopAll: jest.fn(), release: jest.fn() };
  const storage: jest.Mocked<SoundStorage> = { load: jest.fn(async () => null), save: jest.fn<Promise<void>, [SoundPreferences]>(async () => undefined) };
  return { backend, storage, engine: new SoundEngine(backend, storage) };
}
afterEach(() => jest.restoreAllMocks());

test('preloads once and never queues effects from before readiness', async () => {
  const { engine, backend } = setup();
  engine.play('jump');
  await engine.start();
  expect(backend.prepare).toHaveBeenCalledTimes(1);
  expect(backend.play).not.toHaveBeenCalled();
  engine.play('jump');
  expect(backend.play).toHaveBeenCalledWith('jump', 0.7);
});
test('restores mute before preloading and has no unmute/replay on launch', async () => {
  const { engine, backend, storage } = setup();
  storage.load.mockResolvedValue({ enabled: false, volume: 0.4 });
  await engine.start(); engine.play('victory');
  expect(engine.snapshot()).toMatchObject({ enabled: false, volume: 0.4, loading: false });
  expect(backend.play).not.toHaveBeenCalled();
});
test('muting immediately stops all voices; turning on does not replay skipped effects', async () => {
  const { engine, backend, storage } = setup(); await engine.start();
  engine.play('jump'); await engine.setEnabled(false); engine.play('trap');
  expect(backend.stopAll).toHaveBeenCalledTimes(1);
  await engine.setEnabled(true);
  expect(backend.play).toHaveBeenCalledTimes(1);
  expect(storage.save).toHaveBeenLastCalledWith({ enabled: true, volume: 0.7 });
});
test('backgrounding stops playback and returning does not resume stale sounds', async () => {
  const { engine, backend } = setup(); await engine.start();
  engine.play('rock'); engine.setActive(false); engine.play('victory'); engine.setActive(true);
  expect(backend.play).toHaveBeenCalledTimes(1);
  expect(backend.stopAll).toHaveBeenCalledTimes(1);
});
test('native availability/load failure is a silent and visible fallback', async () => {
  const { engine, backend } = setup(); backend.prepare.mockRejectedValue(new Error('Native unavailable'));
  await engine.start(); engine.play('click');
  expect(engine.snapshot()).toMatchObject({ available: false, loading: false });
  expect(backend.play).not.toHaveBeenCalled();
});
test('read failure defaults to quiet and exposes preference recovery', async () => {
  const { engine, storage, backend } = setup(); storage.load.mockRejectedValue(new Error('Locked'));
  await engine.start(); engine.play('ready');
  expect(engine.snapshot()).toMatchObject({ enabled: false, saveError: true });
  expect(backend.play).not.toHaveBeenCalled();
  await engine.setEnabled(true);
  expect(engine.snapshot().saveError).toBe(false);
});
test('failed writes retain the current choice and can be retried', async () => {
  const { engine, storage } = setup(); await engine.start(); storage.save.mockRejectedValueOnce(new Error('Disk'));
  await engine.setEnabled(false);
  expect(engine.snapshot()).toMatchObject({ enabled: false, saveError: true });
  await engine.retrySave();
  expect(engine.snapshot().saveError).toBe(false);
  expect(storage.save).toHaveBeenLastCalledWith({ enabled: false, volume: 0.7 });
});
test('rapid settings changes serialize writes and preserve the last selection', async () => {
  const { engine, storage } = setup(); await engine.start();
  let finish!: () => void;
  storage.save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const first = engine.setEnabled(false); const last = engine.setVolume(0.3);
  await Promise.resolve(); await Promise.resolve();
  expect(storage.save).toHaveBeenCalledTimes(1);
  finish(); await first; await last;
  expect(storage.save).toHaveBeenLastCalledWith({ enabled: false, volume: 0.3 });
});
test('volume is bounded, invalid values ignored and quieter UI cues are mixed separately', async () => {
  const { engine, backend } = setup(); await engine.start();
  await engine.setVolume(10); expect(engine.snapshot().volume).toBe(1);
  await engine.setVolume(-10); expect(engine.snapshot().volume).toBe(0.1);
  await engine.setVolume(NaN); expect(engine.snapshot().volume).toBe(0.1);
  engine.play('click'); expect(backend.play).toHaveBeenCalledWith('click', 0.045000000000000005);
});
test('accidental duplicate callbacks are throttled, subsequent real events still play', async () => {
  const { engine, backend } = setup(); await engine.start();
  const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
  engine.play('trap'); engine.play('trap');
  expect(backend.play).toHaveBeenCalledTimes(1);
  now.mockReturnValue(2000); engine.play('trap'); expect(backend.play).toHaveBeenCalledTimes(2);
});
test('native exceptions never propagate into gameplay or shutdown', async () => {
  const { engine, backend } = setup(); await engine.start();
  backend.play.mockImplementation(() => { throw new Error('Interrupted'); });
  backend.stopAll.mockImplementation(() => { throw new Error('Released'); });
  backend.release.mockImplementation(() => { throw new Error('No module'); });
  expect(() => engine.play('jump')).not.toThrow(); expect(() => engine.shutdown()).not.toThrow();
});
test('shutdown while preferences are loading cancels native preparation', async () => {
  const { engine, backend, storage } = setup();
  let resolve!: (value: null) => void;
  storage.load.mockReturnValue(new Promise(done => { resolve = done; }));
  const pending = engine.start(); engine.shutdown(); resolve(null); await pending;
  expect(backend.prepare).not.toHaveBeenCalled(); expect(backend.release).toHaveBeenCalledTimes(1);
});
