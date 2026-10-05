import { NativeModules } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { soundData } from '../assets/sounds/sound-data';
import { SoundEngine, type SoundName, type SoundPreferences } from './sound-engine';

interface NativeAudio {
  prepare(pack: Record<SoundName, string>): Promise<boolean>;
  play(name: SoundName, volume: number): void;
  stopAll(): void;
  releaseSounds(): void;
}
const native = () => NativeModules.RipsyAudio as NativeAudio | undefined;
const service = 'com.dangervalley.ripsy.sound-preferences';
export const sounds = new SoundEngine({
  prepare: async () => native()?.prepare(soundData) ?? false,
  play: (name, volume) => native()?.play(name, volume),
  stopAll: () => native()?.stopAll(),
  release: () => native()?.releaseSounds(),
}, {
  load: async () => {
    const saved = await Keychain.getGenericPassword({ service });
    if (!saved) return null;
    const value: unknown = JSON.parse(saved.password);
    if (!value || typeof value !== 'object' || !('enabled' in value) || typeof value.enabled !== 'boolean'
      || !('volume' in value) || typeof value.volume !== 'number' || !Number.isFinite(value.volume)) throw new Error('Invalid sound preference');
    return { enabled: value.enabled, volume: Math.max(0.1, Math.min(1, value.volume)) };
  },
  save: async (value: SoundPreferences) => {
    const result = await Keychain.setGenericPassword('ripsy-sounds', JSON.stringify(value), {
      service, accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
    if (!result) throw new Error('Sound preference not saved');
  },
});
