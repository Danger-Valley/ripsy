export const UPDATE_CHANNELS = ['ios', 'android', 'seeker'] as const;
export type UpdateChannel = typeof UPDATE_CHANNELS[number];
export type UpdateRule = {
  minimumBuild: number;
  latestVersion: string | null;
  storeUrl: string | null;
  fallbackUrl: string | null;
  title: string;
  message: string;
};
export type UpdatePolicy = { schema: 1 } & Record<UpdateChannel, UpdateRule>;

const defaultRule: UpdateRule = {
  minimumBuild: 0,
  latestVersion: null,
  storeUrl: null,
  fallbackUrl: null,
  title: 'A new adventure awaits!',
  message: 'Update RIPSY to keep playing with the latest improvements.',
};

export function disabledUpdatePolicy(): UpdatePolicy {
  return { schema: 1, ios: { ...defaultRule }, android: { ...defaultRule }, seeker: { ...defaultRule } };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid mobile update policy');
  return value as Record<string, unknown>;
}

function label(value: unknown, fallback: string, max: number): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error('Invalid mobile update text');
  }
  return value.trim();
}

export function validUpdateUrl(value: unknown, channel: UpdateChannel, fallback = false): value is string {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\\u0000-\u001f\u007f]/.test(value)) return false;
  // Only this app's dApp Store destination is accepted. No arbitrary intent/file schemes.
  if (channel === 'seeker' && !fallback && value === 'solanadappstore://details?id=com.dangervalley.ripsy') return true;
  // React Native's URL shim does not implement every credential/host getter.
  // Use the same deliberately narrow ASCII host grammar on server and device.
  const match = /^https:\/\/([a-z\d](?:[a-z\d-]*[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]*[a-z\d])?)*)(?::(\d{1,5}))?(?:[/?#].*)?$/i.exec(value);
  return Boolean(match && match[1]!.length <= 253 && match[1]!.split('.').every(part => part.length <= 63)
    && (!match[2] || (Number(match[2]) > 0 && Number(match[2]) <= 65535)));
}

/** Strict at both ends: a malformed response must not lift an already known gate. */
export function parseUpdatePolicy(value: unknown): UpdatePolicy {
  const input = object(value);
  if (input.schema !== 1) throw new Error('Unsupported mobile update policy');
  const result = disabledUpdatePolicy();
  for (const channel of UPDATE_CHANNELS) {
    const rule = object(input[channel]);
    if (typeof rule.minimumBuild !== 'number' || !Number.isSafeInteger(rule.minimumBuild) || rule.minimumBuild < 0) {
      throw new Error(`Invalid minimum build for ${channel}`);
    }
    const storeUrl = rule.storeUrl ?? null;
    const fallbackUrl = rule.fallbackUrl ?? null;
    if ((storeUrl !== null && !validUpdateUrl(storeUrl, channel))
      || (fallbackUrl !== null && !validUpdateUrl(fallbackUrl, channel, true))
      || (rule.minimumBuild > 0 && !storeUrl)) throw new Error(`Invalid update URL for ${channel}`);
    result[channel] = {
      minimumBuild: rule.minimumBuild,
      latestVersion: rule.latestVersion == null ? null : label(rule.latestVersion, '', 40),
      storeUrl,
      fallbackUrl,
      title: label(rule.title, defaultRule.title, 100),
      message: label(rule.message, defaultRule.message, 400),
    };
  }
  return result;
}

export function requiredUpdate(policy: UpdatePolicy, channel: UpdateChannel, build: number): UpdateRule | null {
  return policy[channel].minimumBuild > build ? policy[channel] : null;
}
