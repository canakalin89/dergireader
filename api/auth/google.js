const crypto = require('crypto');

function resolveRedirectUri(req) {
  const env = process.env.GOOGLE_REDIRECT_URI;
  const host = (req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000').toString();
  const proto = (req.headers['x-forwarded-proto'] || (req.connection && req.connection.encrypted ? 'https' : 'http')).toString();
  const dynamicUri = `${proto}://${host}/api/auth/callback`;

  if (env && env.includes(host)) return env;
  if (host.includes('localhost')) return dynamicUri;
  if (env && env.includes('vercel.app')) return dynamicUri;
  return env || dynamicUri;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: 'Google OAuth yapılandırılmamış' });
  }

  const redirectUri = resolveRedirectUri(req);
  if (!redirectUri) {
    return res.status(500).json({ error: 'GOOGLE_REDIRECT_URI tanımlanmamış' });
  }

  const state = crypto.randomBytes(16).toString('hex');
  const isSecure = req.headers['x-forwarded-proto'] === 'https' || !String(req.headers.host || '').includes('localhost');
  const cookie = [
    `google_oauth_state=${state}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=600',
    ...(isSecure ? ['Secure'] : []),
  ];
  res.setHeader('Set-Cookie', cookie.join('; '));

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state,
  });

  return res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
};
