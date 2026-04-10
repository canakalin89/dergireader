const { v4: uuidv4 } = require('uuid');
const { verifyAdmin, verifyRole } = require('../_lib/auth');
const { getMagazines, saveMagazines } = require('../_lib/store');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — herkese açık dergi listesi
  if (req.method === 'GET') {
    const magazines = await getMagazines();
    magazines.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    return res.status(200).json(magazines);
  }

  // POST — yeni dergi ekle (editor veya üstü)
  if (req.method === 'POST') {
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

    try {
      const { title, issue, date, description, pdfUrl: rawPdfUrl, coverUrl } = body;

      if (!title || !String(title).trim()) {
        return res.status(400).json({ error: 'Başlık zorunludur' });
      }
      if (!rawPdfUrl) {
        return res.status(400).json({ error: 'PDF dosyası veya URL zorunludur' });
      }

      try { new URL(rawPdfUrl); } catch {
        return res.status(400).json({ error: 'Geçerli bir PDF URL\'si girin (https:// ile başlamalı)' });
      }

      // Google Drive link dönüşümü + otomatik kapak
      const gDriveMatch = rawPdfUrl.match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]{20,})/);
      const fileId = gDriveMatch?.[1] || null;
      const pdfUrl = fileId
        ? `https://drive.google.com/uc?export=download&id=${fileId}`
        : rawPdfUrl;

      // Kapak: manuel girilmişse onu kullan, yoksa Google Drive ise otomatik thumbnail
      const autoCover = fileId ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w400` : null;
      const finalCoverUrl = coverUrl || autoCover || null;

      const magazine = {
        id: uuidv4(),
        title: String(title).trim().slice(0, 120),
        issue: issue ? parseInt(issue) || null : null,
        date: date || null,
        description: description ? String(description).trim().slice(0, 500) : null,
        publishedAt: date ? new Date(date).toISOString() : new Date().toISOString(),
        pdfUrl,
        coverUrl: finalCoverUrl,
        views: 0,
      };

      const magazines = await getMagazines();
      magazines.push(magazine);
      await saveMagazines(magazines);

      return res.status(201).json(magazine);
    } catch (err) {
      console.error('[magazines POST] hata:', err);
      return res.status(500).json({ error: 'Kayıt sırasında hata: ' + err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
