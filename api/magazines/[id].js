const { verifyAdmin, verifyRole } = require('../_lib/auth');
const { getMagazines, saveMagazines, deleteFile, parseBody } = require('../_lib/store');
const { sendError } = require('../_lib/errors');

// Google Drive file ID çıkar
function extractDriveId(url) {
  const m = url.match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]{20,})/);
  return m ? m[1] : null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;

  // ── GET — tekil dergi bilgisi ─────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const magazines = await getMagazines();
      const mag = magazines.find(m => m.id === id);
      if (!mag) return sendError(res, 'ERR_MAG_NOT_FOUND');
      return res.status(200).json(mag);
    } catch (err) {
      return sendError(res, 'ERR_STORE_READ_FAILED', err.message);
    }
  }

  // Gövde oku (POST, PATCH için)
  let body = {};
  if (req.method === 'POST' || req.method === 'PATCH') {
    try {
      body = await parseBody(req);
    } catch {
      return sendError(res, 'ERR_VAL_INVALID_JSON');
    }
  }

  // ── GÜNCELLEME: PATCH veya POST?action=update ─────────────────────────────
  if (req.method === 'PATCH' || (req.method === 'POST' && action === 'update')) {
    if (!verifyRole(req, 'editor')) return sendError(res, 'ERR_AUTH_INSUFFICIENT_ROLE');

    let magazines;
    try {
      magazines = await getMagazines();
    } catch (err) {
      return sendError(res, 'ERR_STORE_READ_FAILED', err.message);
    }

    const idx = magazines.findIndex(m => m.id === id);
    if (idx === -1) return sendError(res, 'ERR_MAG_NOT_FOUND');
    const mag = magazines[idx];

    // Başlık doğrulama
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

    // PDF URL güncelleme + Drive kapak
    if (body.pdfUrl !== undefined && body.pdfUrl) {
      try { new URL(body.pdfUrl); } catch { return sendError(res, 'ERR_VAL_PDF_URL_INVALID'); }
      const fileId = extractDriveId(body.pdfUrl);
      mag.pdfUrl = fileId
        ? `https://drive.google.com/uc?export=download&id=${fileId}`
        : body.pdfUrl;
      if (!body.coverUrl && fileId) {
        mag.coverUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;
      }
    }

    // Kapak URL güncelleme
    if (body.coverUrl !== undefined) {
      if (body.coverUrl) {
        try { new URL(body.coverUrl); } catch { return sendError(res, 'ERR_VAL_COVER_URL_INVALID'); }
      }
      mag.coverUrl = body.coverUrl || null;
    }

    try {
      await saveMagazines(magazines);
      console.log(`[API] Dergi güncellendi: ${mag.id} — "${mag.title}"`);
      return res.status(200).json(mag);
    } catch (err) {
      return sendError(res, 'ERR_MAG_SAVE_FAILED', err.message);
    }
  }

  // ── SİLME: DELETE veya POST?action=delete ─────────────────────────────────
  if (req.method === 'DELETE' || (req.method === 'POST' && action === 'delete')) {
    if (!verifyAdmin(req)) return sendError(res, 'ERR_AUTH_INSUFFICIENT_ROLE');

    let magazines;
    try {
      magazines = await getMagazines();
    } catch (err) {
      return sendError(res, 'ERR_STORE_READ_FAILED', err.message);
    }

    const idx = magazines.findIndex(m => m.id === id);
    if (idx === -1) return sendError(res, 'ERR_MAG_NOT_FOUND');

    try {
      const [removed] = magazines.splice(idx, 1);

      // Önce listeyi kaydet — blob silme başarısız olsa bile dergi listeden çıksın
      await saveMagazines(magazines);

      // Sonra dosyaları temizle (başarısız olursa sorun değil)
      await deleteFile(removed.pdfUrl);
      await deleteFile(removed.coverUrl);

      console.log(`[API] Dergi silindi: ${removed.id} — "${removed.title}"`);
      return res.status(200).json({ success: true, id: removed.id });
    } catch (err) {
      return sendError(res, 'ERR_MAG_SAVE_FAILED', err.message);
    }
  }

  return sendError(res, 'ERR_METHOD_NOT_ALLOWED');
};
