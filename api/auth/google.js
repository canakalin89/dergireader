module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: 'Google OAuth yapılandırılmamış' });
  }

  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!redirectUri) {
    return res.status(500).json({ error: 'GOOGLE_REDIRECT_URI tanımlanmamış' });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
  });

  return res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
};
