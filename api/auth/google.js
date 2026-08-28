const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: 'Google OAuth yapılandırılmamış' });
  }

  // Google'da kayıtlı adresi kullan; sunucunun dahili host değeri bunu değiştirmemeli.
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!redirectUri) {
    return res.status(500).json({ error: 'GOOGLE_REDIRECT_URI tanımlanmamış' });
  }

  let callbackUrl;
  try {
    callbackUrl = new URL(redirectUri);
    if (!['https:', 'http:'].includes(callbackUrl.protocol)) throw new Error('Geçersiz protokol');
  } catch {
    return res.status(500).json({ error: 'GOOGLE_REDIRECT_URI geçerli bir HTTP adresi olmalı' });
  }

  // State çerezi ve dönüş isteği aynı alanda olmalı; alternatif alanı önce taşı.
  const requestHost = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0].trim().toLowerCase();
  if (requestHost !== callbackUrl.host.toLowerCase()) {
    return res.redirect(302, new URL('/api/auth/google', callbackUrl).toString());
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
