const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getUsers, saveUsers } = require('../_lib/store');
const { sendError } = require('../_lib/errors');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return sendError(res, 'ERR_METHOD_NOT_ALLOWED');

  const { name, email, password, _hp } = req.body || {};

  if (_hp) return sendError(res, 'ERR_VAL_BOT_DETECTED');
  if (!name)     return sendError(res, 'ERR_VAL_NAME_REQUIRED');
  if (!email)    return sendError(res, 'ERR_VAL_EMAIL_REQUIRED');
  if (!password) return sendError(res, 'ERR_VAL_PASSWORD_REQUIRED');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendError(res, 'ERR_VAL_EMAIL_INVALID');
  if (password.length < 6) return sendError(res, 'ERR_VAL_PASSWORD_TOO_SHORT');

  const users = await getUsers();
  if (users.find(u => u.email === email.toLowerCase())) return sendError(res, 'ERR_USR_EMAIL_TAKEN');

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
