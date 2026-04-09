const { getTokenPayload } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const payload = getTokenPayload(req);
  if (!payload) return res.status(401).json({ error: 'Giriş yapılmamış' });

  return res.status(200).json({
    id: payload.id,
    email: payload.email,
    name: payload.name,
    role: payload.role,
    picture: payload.picture || null,
  });
};
