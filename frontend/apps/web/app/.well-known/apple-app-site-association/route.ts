const association = {
  applinks: {
    details: [{
      appIDs: ['L28H25M8LS.com.dangervalley.ripsy'],
      components: [{ '/': '/game/*', comment: 'Open RIPSY game invitations in the native app' }],
    }],
  },
};

export function GET() {
  return Response.json(association, {
    headers: { 'cache-control': 'public, max-age=3600' },
  });
}
