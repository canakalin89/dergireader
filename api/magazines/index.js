const { v4: uuidv4 } = require('uuid');
const { verifyAdmin, verifyRole } = require('../_lib/auth');
const { getMagazines, saveMagazines, uploadFile } = require('../_lib/store');
const formidable = require('formidable');
const fs = require('fs');

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

    const form = formidable({ maxFileSize: 50 * 1024 * 1024 });
    let fields, files;
    try {
      [fields, files] = await form.parse(req);
    } catch (err) {
      return res.status(400).json({ error: 'Form verisi okunamadı' });
    }

    const get = (v) => (Array.isArray(v) ? v[0] : v);
    const title       = get(fields.title);
    const issue       = get(fields.issue) ? parseInt(get(fields.issue)) : null;
    const date        = get(fields.date) || null;
    const description = (get(fields.description) || '').trim() || null;

    if (!title) {
      return res.status(400).json({ error: 'Başlık zorunludur' });
    }

    const pdfFile = Array.isArray(files.pdf) ? files.pdf[0] : files.pdf;
    const coverFile = Array.isArray(files.cover) ? files.cover[0] : files.cover;
    const pdfUrlField = get(fields.pdfUrl);

    // PDF kaynağı: URL veya dosya
    let pdfUrl = null;
    if (pdfUrlField && pdfUrlField.trim()) {
      // URL modu — doğrulama
      try { new URL(pdfUrlField.trim()); } catch {
        return res.status(400).json({ error: 'Geçerli bir PDF URL\'si girin' });
      }
      // Google Drive paylaşım linkini direkt indirme linkine çevir
      const gDriveMatch = pdfUrlField.match(/\/d\/([a-zA-Z0-9_-]+)/);
      pdfUrl = gDriveMatch
        ? `https://drive.google.com/uc?export=download&id=${gDriveMatch[1]}`
        : pdfUrlField.trim();
    } else if (pdfFile) {
      if (!pdfFile.mimetype?.includes('pdf')) {
        return res.status(400).json({ error: 'Sadece PDF dosyaları kabul edilir' });
      }
      const pdfBuffer = fs.readFileSync(pdfFile.filepath);
      pdfUrl = await uploadFile(pdfBuffer, `pdfs/${uuidv4()}.pdf`, 'application/pdf');
    } else {
      return res.status(400).json({ error: 'PDF dosyası veya URL zorunludur' });
    }

    let coverUrl = null;
    if (coverFile) {
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowed.includes(coverFile.mimetype)) {
        return res.status(400).json({ error: 'Kapak için sadece JPG, PNG veya WebP kabul edilir' });
      }
      const ext = coverFile.originalFilename?.split('.').pop() || 'jpg';
      const coverBuffer = fs.readFileSync(coverFile.filepath);
      coverUrl = await uploadFile(coverBuffer, `covers/${uuidv4()}.${ext}`, coverFile.mimetype);
    }

    const magazine = {
      id: uuidv4(),
      title,
      issue,
      date,
      description,
      publishedAt: date ? new Date(date).toISOString() : new Date().toISOString(),
      pdfUrl,
      coverUrl,
      views: 0,
    };

    const magazines = await getMagazines();
    magazines.push(magazine);
    await saveMagazines(magazines);

    return res.status(201).json(magazine);
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

module.exports.config = { api: { bodyParser: false } };
