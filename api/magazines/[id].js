const { verifyAdmin, verifyRole } = require('../_lib/auth');
const { getMagazines, saveMagazines, deleteFile } = require('../_lib/store');
const { sendError } = require('../_lib/errors');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;

  let body = null;
  if (req.method === 'POST' || req.method === 'PATCH') {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return sendError(res, 'ERR_VAL_INVALID_JSON');
    }
  }

  // PATCH — dergi güncelle (editor veya üstü)
  if (req.method === 'PATCH' || (req.method === 'POST' && action === 'update')) {
    if (!verifyRole(req, 'editor')) return sendError(res, 'ERR_AUTH_INSUFFICIENT_ROLE');

    const magazines = await getMagazines();
    const idx = magazines.findIndex(m => m.id === id);
    if (idx === -1) return sendError(res, 'ERR_MAG_NOT_FOUND');

    const mag = magazines[idx];

    try {
      if (body.title !== undefined) {
        if (!String(body.title).trim()) return sendError(res, 'ERR_VAL_TITLE_REQUIRED');
        if (String(body.title).trim().length > 120) return sendError(res, 'ERR_VAL_TITLE_TOO_LONG');
        mag.title = String(body.title).trim().slice(0, 120);
      }
      if (body.issue !== undefined) mag.issue = body.issue ? parseInt(body.issue) || null : null;
      if (body.date !== undefined) {
        mag.date = body.date || null;
        if (body.date) mag.publishedAt = new Date(body.date).toISOString();
      }
      if (body.description !== undefined) {
        mag.description = body.description ? String(body.description).trim().slice(0, 500) : null;
      }
      if (body.pdfUrl !== undefined && body.pdfUrl) {
        try { new URL(body.pdfUrl); } catch { return sendError(res, 'ERR_VAL_PDF_URL_INVALID'); }
        const gDriveMatch = body.pdfUrl.match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]{20,})/);
        const fileId = gDriveMatch?.[1] || null;
        mag.pdfUrl = fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : body.pdfUrl;
        if (!body.coverUrl && fileId) {
          mag.coverUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;
        }
      }
      if (body.coverUrl !== undefined) {
        if (body.coverUrl) {
          try { new URL(body.coverUrl); } catch { return sendError(res, 'ERR_VAL_COVER_URL_INVALID'); }
        }
        mag.coverUrl = body.coverUrl || null;
      }

      await saveMagazines(magazines);
      return res.status(200).json(mag);
    } catch (err) {
      return sendError(res, 'ERR_MAG_SAVE_FAILED', err.message);
    }
  }

  // DELETE — dergi sil (admin veya üstü)
  if (req.method === 'DELETE' || (req.method === 'POST' && action === 'delete')) {
    if (!verifyAdmin(req)) return sendError(res, 'ERR_AUTH_INSUFFICIENT_ROLE');

    const magazines = await getMagazines();
    const idx = magazines.findIndex((m) => m.id === id);
    if (idx === -1) return sendError(res, 'ERR_MAG_NOT_FOUND');

    try {
      const [removed] = magazines.splice(idx, 1);
      if (removed.pdfUrl) await deleteFile(removed.pdfUrl);
      if (removed.coverUrl) await deleteFile(removed.coverUrl);
      await saveMagazines(magazines);
      return res.status(200).json({ success: true });
    } catch (err) {
      return sendError(res, 'ERR_MAG_SAVE_FAILED', err.message);
    }
  }

  return sendError(res, 'ERR_METHOD_NOT_ALLOWED');
};
