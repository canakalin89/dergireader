const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getUsers, saveUsers } = require('../_lib/store');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: 'E-posta ve şifre zorunludur' });

  const users = await getUsers();
  const user = users.find(u => u.email === email.toLowerCase() && u.provider === 'local');

  if (!user)
    return res.status(401).json({ error: 'E-posta veya şifre hatalı' });
  if (!user.passwordHash)
    return res.status(401).json({ error: 'E-posta veya şifre hatalı' });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid)
    return res.status(401).json({ error: 'E-posta veya şifre hatalı' });

  // Son giriş güncelle
  user.lastLogin = new Date().toISOString();
  // owner e-posta kontrolü
  if (user.email === (process.env.OWNER_EMAIL || '').toLowerCase()) user.role = 'owner';
  await saveUsers(users);

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role, picture: user.picture || null },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  return res.status(200).json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
};
