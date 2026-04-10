const { v4: uuidv4 } = require('uuid');
const { verifyRole } = require('../_lib/auth');
const { getMagazines, saveMagazines, parseBody } = require('../_lib/store');
const { sendError } = require('../_lib/errors');

// Google Drive file ID çıkar
function extractDriveId(url) {
  const m = url.match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]{20,})/);
  return m ? m[1] : null;
}

// PDF URL'yi normalize et + kapak oluştur
function normalizePdfData(rawPdfUrl, coverUrl) {
  const fileId = extractDriveId(rawPdfUrl);
  const pdfUrl = fileId
    ? `https://drive.google.com/uc?export=download&id=${fileId}`
    : rawPdfUrl;
  const autoCover = fileId
    ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`
    : null;
  return { pdfUrl, coverUrl: coverUrl || autoCover || null };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET — herkese açık dergi listesi ──────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const magazines = await getMagazines();
      // coverUrl boş kalmış dergilere Drive thumbnail ekle
      magazines.forEach(m => {
        if (!m.coverUrl && m.pdfUrl) {
          const fid = extractDriveId(m.pdfUrl);
          if (fid) m.coverUrl = `https://drive.google.com/thumbnail?id=${fid}&sz=w400`;
        }
      });
      magazines.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
      return res.status(200).json(magazines);
    } catch (err) {
      return sendError(res, 'ERR_STORE_READ_FAILED', err.message);
    }
  }

  // ── POST — yeni dergi ekle (editor veya üstü) ────────────────────────────
  if (req.method === 'POST') {
    if (!verifyRole(req, 'editor')) return sendError(res, 'ERR_AUTH_INSUFFICIENT_ROLE');

    let body;
    try {
      body = await parseBody(req);
    } catch {
      return sendError(res, 'ERR_VAL_INVALID_JSON');
    }

    const { title, issue, date, description, pdfUrl: rawPdfUrl, coverUrl: rawCoverUrl, categoryId } = body;

    // Doğrulama
    if (!title || !String(title).trim()) return sendError(res, 'ERR_VAL_TITLE_REQUIRED');
    if (String(title).trim().length > 120) return sendError(res, 'ERR_VAL_TITLE_TOO_LONG');
    if (!rawPdfUrl) return sendError(res, 'ERR_VAL_PDF_URL_REQUIRED');
    try { new URL(rawPdfUrl); } catch { return sendError(res, 'ERR_VAL_PDF_URL_INVALID'); }
    if (rawCoverUrl) { try { new URL(rawCoverUrl); } catch { return sendError(res, 'ERR_VAL_COVER_URL_INVALID'); } }

    try {
      const { pdfUrl, coverUrl } = normalizePdfData(rawPdfUrl, rawCoverUrl);

      const magazine = {
        id: uuidv4(),
        title: String(title).trim().slice(0, 120),
        issue: issue ? parseInt(issue) || null : null,
        date: date || null,
        description: description ? String(description).trim().slice(0, 500) : null,
        publishedAt: date ? new Date(date).toISOString() : new Date().toISOString(),
        pdfUrl,
        coverUrl,
        categoryId: categoryId || null,
        views: 0,
      };

      const magazines = await getMagazines();
      magazines.push(magazine);
      await saveMagazines(magazines);

      console.log(`[API] Dergi eklendi: ${magazine.id} — "${magazine.title}"`);
      return res.status(201).json(magazine);
    } catch (err) {
      return sendError(res, 'ERR_MAG_SAVE_FAILED', err.message);
    }
  }

  return sendError(res, 'ERR_METHOD_NOT_ALLOWED');
};
