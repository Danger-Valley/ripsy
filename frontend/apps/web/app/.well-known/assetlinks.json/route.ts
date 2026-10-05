export const dynamic = 'force-dynamic';

export function GET() {
  // Direct APK distribution uses this verified RIPSY release certificate. Keep it
  // even when Google Play's separate app-signing certificate is also configured.
  const apkCertificate = 'E2:BE:8E:A4:9A:54:47:3B:57:E5:96:88:1B:29:8E:00:44:3B:16:D8:7B:E8:D0:7F:0D:ED:63:1B:66:9A:D5:E5';
  const fingerprints = [...new Set([apkCertificate, ...(process.env.ANDROID_APP_SHA256_CERT_FINGERPRINTS ?? '')
    .split(',')
    .map(value => value.trim().toUpperCase())
    .filter(value => /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(value))])];

  return Response.json([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'com.dangervalley.ripsy',
      sha256_cert_fingerprints: fingerprints,
    },
  }], {
    headers: { 'cache-control': 'public, max-age=3600' },
  });
}
