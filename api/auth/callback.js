const jwt = require('jsonwebtoken');
const { upsertUser } = require('../_lib/store');

module.exports = async function handler(req, res) {
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect(302, '/admin/?auth_error=1');
  }

  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const secret = process.env.JWT_SECRET;

  if (!redirectUri || !secret) {
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
    if (!tokenData.access_token) throw new Error('Access token alınamadı');

    // Kullanıcı bilgilerini çek
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const googleUser = await userRes.json();

    if (!googleUser.email) throw new Error('E-posta bilgisi alınamadı');

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
