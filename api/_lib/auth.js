const jwt = require('jsonwebtoken');

// owner > admin > editor
const ROLE_LEVELS = { owner: 3, admin: 2, editor: 1 };

function requireJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || !String(secret).trim()) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
}

function verifyToken(req) {
  const secret = process.env.JWT_SECRET;
  if (!secret || !String(secret).trim()) return null;

  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  try {
    return jwt.verify(token, secret);
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

module.exports = { verifyAdmin, verifyRole, getTokenPayload, requireJwtSecret };
