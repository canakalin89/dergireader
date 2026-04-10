const { verifyRole, getTokenPayload } = require('../_lib/auth');
const { getUsers, saveUsers } = require('../_lib/store');
const { sendError } = require('../_lib/errors');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!verifyRole(req, 'owner')) return sendError(res, 'ERR_AUTH_OWNER_ONLY');

  const { id } = req.query;
  const users = await getUsers();
  const userIdx = users.findIndex(u => u.id === decodeURIComponent(id));

  if (userIdx === -1) return sendError(res, 'ERR_USR_NOT_FOUND');

  const ownerEmail = process.env.OWNER_EMAIL || 'canakalin59@gmail.com';
  if (users[userIdx].email === ownerEmail) return sendError(res, 'ERR_USR_OWNER_PROTECTED');

  if (req.method === 'PATCH') {
    const { role } = req.body || {};
    if (!['owner', 'admin', 'editor', 'pending'].includes(role)) return sendError(res, 'ERR_VAL_INVALID_ROLE');
    users[userIdx].role = role;
    await saveUsers(users);
    return res.status(200).json(users[userIdx]);
  }

  if (req.method === 'DELETE') {
    users.splice(userIdx, 1);
    await saveUsers(users);
    return res.status(200).json({ success: true });
  }

  return sendError(res, 'ERR_METHOD_NOT_ALLOWED');
};
