const jwt = require('jsonwebtoken');

function verifyAdmin(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return payload.role === 'admin';
  } catch {
    return false;
  }
}

module.exports = { verifyAdmin };
