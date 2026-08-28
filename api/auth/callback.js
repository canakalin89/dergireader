const jwt = require('jsonwebtoken');
const { upsertUser } = require('../_lib/store');
const { requireJwtSecret } = require('../_lib/auth');

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (!key) continue;
    cookies[key] = decodeURIComponent(rest.join('='));
  }
  return cookies;
}

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
  const { code, error, state } = req.query;
  const cookies = parseCookies(req.headers.cookie || '');

  if (error || !code) {
    return res.redirect(302, '/admin/?auth_error=1');
  }

  if (!state || cookies.google_oauth_state !== state) {
    console.error('Google OAuth state mismatch');
    return res.redirect(302, '/admin/?auth_error=1');
  }

  const redirectUri = resolveRedirectUri(req);
  let secret;

  try {
    secret = requireJwtSecret();
  } catch {
    return res.redirect(302, '/admin/?auth_error=1');
  }

  if (!redirectUri) {
    return res.redirect(302, '/admin/?auth_error=1');
  }

  try {
    // Google'dan access token al
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description || 'Access token alınamadı');
    }

    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const googleUser = await userRes.json();

    if (!userRes.ok || !googleUser.email) throw new Error('E-posta bilgisi alınamadı');

    // Kullanıcıyı kaydet / güncelle
    const user = await upsertUser({
      id: `google:${googleUser.id}`,
      email: googleUser.email,
      name: googleUser.name || googleUser.email,
      picture: googleUser.picture || null,
      provider: 'google',
    });

    // JWT imzala
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role, picture: user.picture },
      secret,
      { expiresIn: '8h' }
    );

    return res.redirect(302, `/admin/?token=${encodeURIComponent(token)}`);
  } catch (err) {
    console.error('OAuth callback hatası:', err.message);
    return res.redirect(302, '/admin/?auth_error=1');
  }
};
