const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Şifre gerekli' });

  const hash = process.env.ADMIN_PASSWORD_HASH;
  const secret = process.env.JWT_SECRET;

  if (!hash || !secret) {
    return res.status(500).json({ error: 'Sunucu yapılandırma hatası' });
  }

  const valid = await bcrypt.compare(password, hash);
  if (!valid) return res.status(401).json({ error: 'Hatalı şifre' });

  // Şifre ile giriş = owner yetkisi (sadece sen biliyorsun)
  const ownerEmail = process.env.OWNER_EMAIL || 'canakalin59@gmail.com';
  const token = jwt.sign(
    { id: 'password:owner', email: ownerEmail, name: 'Admin', role: 'owner' },
    secret,
    { expiresIn: '8h' }
  );
  return res.status(200).json({ token });
};
