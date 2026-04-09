const { verifyRole, getTokenPayload } = require('../_lib/auth');
const { getUsers, saveUsers } = require('../_lib/store');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!verifyRole(req, 'owner')) {
    return res.status(403).json({ error: 'Sadece owner bu işlemi yapabilir' });
  }

  const { id } = req.query;
  const users = await getUsers();
  const userIdx = users.findIndex(u => u.id === decodeURIComponent(id));

  if (userIdx === -1) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

  const ownerEmail = process.env.OWNER_EMAIL || 'canakalin59@gmail.com';
  if (users[userIdx].email === ownerEmail) {
    return res.status(403).json({ error: 'Owner\'ın rolü değiştirilemez' });
  }

  if (req.method === 'PATCH') {
    const { role } = req.body || {};
    if (!['admin', 'editor'].includes(role)) {
      return res.status(400).json({ error: 'Geçersiz rol. admin veya editor olmalı' });
    }
    users[userIdx].role = role;
    await saveUsers(users);
    return res.status(200).json(users[userIdx]);
  }

  if (req.method === 'DELETE') {
    users.splice(userIdx, 1);
    await saveUsers(users);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
