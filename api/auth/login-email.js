const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getUsers, saveUsers } = require('../_lib/store');
const { sendError } = require('../_lib/errors');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return sendError(res, 'ERR_METHOD_NOT_ALLOWED');

  const { email, password } = req.body || {};
  if (!email)    return sendError(res, 'ERR_VAL_EMAIL_REQUIRED');
  if (!password) return sendError(res, 'ERR_VAL_PASSWORD_REQUIRED');

  const users = await getUsers();
  const user = users.find(u => u.email === email.toLowerCase() && u.provider === 'local');

  if (!user || !user.passwordHash) return sendError(res, 'ERR_USR_WRONG_PASSWORD');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return sendError(res, 'ERR_USR_WRONG_PASSWORD');

  user.lastLogin = new Date().toISOString();
  if (user.email === (process.env.OWNER_EMAIL || '').toLowerCase()) user.role = 'owner';
  await saveUsers(users);

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role, picture: user.picture || null },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  return res.status(200).json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
};
