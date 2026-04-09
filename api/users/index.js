const { verifyRole } = require('../_lib/auth');
const { getUsers } = require('../_lib/store');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!verifyRole(req, 'owner')) {
    return res.status(403).json({ error: 'Sadece owner bu sayfaya erişebilir' });
  }

  const users = await getUsers();
  return res.status(200).json(users);
};
