const jwt = require('jsonwebtoken');

// owner > admin > editor
const ROLE_LEVELS = { owner: 3, admin: 2, editor: 1 };

function verifyToken(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

// Legacy: admin veya üstü
function verifyAdmin(req) {
  const payload = verifyToken(req);
  return !!(payload && (ROLE_LEVELS[payload.role] || 0) >= ROLE_LEVELS.admin);
}

// En az minRole gerektiren işlemler için
function verifyRole(req, minRole) {
  const payload = verifyToken(req);
  return !!(payload && (ROLE_LEVELS[payload.role] || 0) >= (ROLE_LEVELS[minRole] || 0));
}

function getTokenPayload(req) {
  return verifyToken(req);
}

module.exports = { verifyAdmin, verifyRole, getTokenPayload };
