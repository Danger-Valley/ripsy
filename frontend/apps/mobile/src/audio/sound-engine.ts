export type SoundName = 'click' | 'select' | 'shuffle' | 'ready' | 'jump' | 'land' | 'rock' | 'paper' | 'scissors' | 'trap' | 'tie' | 'victory' | 'defeat';
export interface SoundPreferences { enabled: boolean; volume: number }
export interface SoundState extends SoundPreferences { loading: boolean; available: boolean; saveError: boolean }
export interface SoundBackend {
  prepare(): Promise<boolean>;
  play(name: SoundName, volume: number): void;
  stopAll(): void;
  release(): void;
}
export interface SoundStorage {
  load(): Promise<SoundPreferences | null>;
  save(value: SoundPreferences): Promise<void>;
}
const level: Partial<Record<SoundName, number>> = { click: 0.45, select: 0.5, shuffle: 0.7, land: 0.8 };

/** One app-wide pool, not one player per Rive figure. Never queues muted or
 * unavailable sounds, and never lets audio errors affect the game engine. */
export class SoundEngine {
  private state: SoundState = { enabled: true, volume: 0.7, loading: true, available: false, saveError: false };
  private listeners = new Set<() => void>();
  private active = true;
  private generation = 0;
  private writes: Promise<void> = Promise.resolve();
  private revision = 0;
  private lastPlay = new Map<SoundName, number>();
  constructor(private backend: SoundBackend, private storage: SoundStorage) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<SoundState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }
  async start() {
    const generation = ++this.generation;
    this.update({ loading: true, available: false });
    // Load preferences before enabling playback: a previously muted launch
    // must never emit a click while its setting is still being restored.
    let preferences: SoundPreferences | null = null;
    let saveError = false;
    try { preferences = await this.storage.load(); }
    catch { preferences = { enabled: false, volume: 0.7 }; saveError = true; }
    if (generation !== this.generation) return;
    this.update({ ...(preferences ?? { enabled: true, volume: 0.7 }), saveError });
    let available = false;
    try { available = await this.backend.prepare(); } catch { /* Silent fallback. */ }
    if (generation === this.generation) this.update({ loading: false, available });
  }
  stopAll = () => { try { this.backend.stopAll(); } catch { /* Optional native audio. */ } };
  shutdown = () => {
    this.generation++;
    this.stopAll();
    try { this.backend.release(); } catch { /* Safe on an older native build. */ }
    this.lastPlay.clear();
    this.update({ available: false, loading: true });
  };
  setActive = (active: boolean) => { this.active = active; if (!active) this.stopAll(); };
  isActive = () => this.active;
  play = (name: SoundName) => {
    if (!this.active || this.state.loading || !this.state.available || !this.state.enabled) return;
    const now = Date.now();
    if (now - (this.lastPlay.get(name) ?? -Infinity) < 70) return;
    this.lastPlay.set(name, now);
    try { this.backend.play(name, this.state.volume * (level[name] ?? 1)); } catch { /* No gameplay dependency. */ }
  };
  private persist = () => {
    const revision = ++this.revision;
    const value = { enabled: this.state.enabled, volume: this.state.volume };
    // Serialize rapid toggles so the oldest async write cannot win at launch.
    this.writes = this.writes.catch(() => undefined).then(() => this.storage.save(value)).then(
      () => { if (revision === this.revision) this.update({ saveError: false }); },
      () => { if (revision === this.revision) this.update({ saveError: true }); },
    );
    return this.writes;
  };
  setEnabled = (enabled: boolean) => {
    if (this.state.loading) return Promise.resolve();
    this.update({ enabled });
    if (!enabled) this.stopAll();
    return this.persist();
  };
  setVolume = (value: number) => {
    if (this.state.loading || !Number.isFinite(value)) return Promise.resolve();
    this.update({ volume: Math.max(0.1, Math.min(1, Math.round(value * 10) / 10)) });
    return this.persist();
  };
  retrySave = () => this.persist();
}
