const { verifyAdmin, verifyRole } = require('../_lib/auth');
const { getMagazines, saveMagazines, deleteFile } = require('../_lib/store');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  if (!verifyAdmin(req)) {  // admin veya owner gerekli (editor silemez)
    return res.status(401).json({ error: 'Yetkisiz erişim' });
  }

  const { id } = req.query;
  const magazines = await getMagazines();
  const idx = magazines.findIndex((m) => m.id === id);

  if (idx === -1) return res.status(404).json({ error: 'Dergi bulunamadı' });

  const [removed] = magazines.splice(idx, 1);

  // Blob dosyalarını sil
  if (removed.pdfUrl) await deleteFile(removed.pdfUrl);
  if (removed.coverUrl) await deleteFile(removed.coverUrl);

  await saveMagazines(magazines);
  return res.status(200).json({ success: true });
};
