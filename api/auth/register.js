const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getUsers, saveUsers } = require('../_lib/store');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, password, _hp } = req.body || {};

  // Honeypot dolu → bot isteği, sessizce reddet
  if (_hp) return res.status(400).json({ error: 'Geçersiz istek' });

  if (!name || !email || !password)
    return res.status(400).json({ error: 'Ad, e-posta ve şifre zorunludur' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'Geçerli bir e-posta adresi girin' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Şifre en az 6 karakter olmalıdır' });

  const users = await getUsers();
  if (users.find(u => u.email === email.toLowerCase()))
    return res.status(409).json({ error: 'Bu e-posta ile zaten hesap var' });

  const isOwner = email.toLowerCase() === (process.env.OWNER_EMAIL || '').toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);

  const user = {
    id: uuidv4(),
    email: email.toLowerCase(),
    name: name.trim(),
    picture: null,
    provider: 'local',
    passwordHash,
    role: isOwner ? 'owner' : 'pending',
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString(),
  };

  users.push(user);
  await saveUsers(users);

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role, picture: null },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  return res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
};
