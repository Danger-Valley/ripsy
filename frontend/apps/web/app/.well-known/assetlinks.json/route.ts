export const dynamic = 'force-dynamic';

export function GET() {
  const fingerprints = (process.env.ANDROID_APP_SHA256_CERT_FINGERPRINTS ?? '')
    .split(',')
    .map(value => value.trim().toUpperCase())
    .filter(Boolean);

  return Response.json(fingerprints.length === 0 ? [] : [{
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
