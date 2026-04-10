const { verifyAdmin, verifyRole } = require('../_lib/auth');
const { getMagazines, saveMagazines, deleteFile } = require('../_lib/store');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;

  // PATCH — dergi güncelle (editor veya üstü)
  if (req.method === 'PATCH') {
    if (!verifyRole(req, 'editor')) {
      return res.status(401).json({ error: 'Yetkisiz erişim' });
    }

    let body;
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      body = JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: 'Geçersiz istek — JSON bekleniyordu' });
    }

    const magazines = await getMagazines();
    const idx = magazines.findIndex(m => m.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Dergi bulunamadı' });

    const mag = magazines[idx];

    // Sadece gelen alanları güncelle
    if (body.title !== undefined) {
      if (!String(body.title).trim()) return res.status(400).json({ error: 'Başlık boş olamaz' });
      mag.title = String(body.title).trim().slice(0, 120);
    }
    if (body.issue !== undefined) mag.issue = body.issue ? parseInt(body.issue) || null : null;
    if (body.date  !== undefined) {
      mag.date = body.date || null;
      if (body.date) mag.publishedAt = new Date(body.date).toISOString();
    }
    if (body.description !== undefined) mag.description = body.description ? String(body.description).trim().slice(0, 500) : null;
    if (body.pdfUrl !== undefined && body.pdfUrl) {
      try { new URL(body.pdfUrl); } catch { return res.status(400).json({ error: 'Geçersiz PDF URL' }); }
      const gDriveMatch = body.pdfUrl.match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]{20,})/);
      const fileId = gDriveMatch?.[1] || null;
      mag.pdfUrl = fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : body.pdfUrl;
      // Cover URL'si değiştirilmediyse Drive thumbnail'i güncelle
      if (!body.coverUrl && fileId) {
        mag.coverUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;
      }
    }
    if (body.coverUrl !== undefined) mag.coverUrl = body.coverUrl || null;

    await saveMagazines(magazines);
    return res.status(200).json(mag);
  }

  // DELETE — dergi sil (admin veya üstü)
  if (req.method === 'DELETE') {
    if (!verifyAdmin(req)) {
      return res.status(401).json({ error: 'Yetkisiz erişim' });
    }

    const magazines = await getMagazines();
    const idx = magazines.findIndex((m) => m.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Dergi bulunamadı' });

    const [removed] = magazines.splice(idx, 1);
    if (removed.pdfUrl) await deleteFile(removed.pdfUrl);
    if (removed.coverUrl) await deleteFile(removed.coverUrl);

    await saveMagazines(magazines);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
