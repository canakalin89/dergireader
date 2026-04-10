const { handleUpload } = require('@vercel/blob/client');
const { verifyRole } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Yalnızca generate-client-token isteğinde auth gerekli
  // (upload-completed callback'i Vercel sunucularından gelir, JWT taşımaz)
  let rawBody = '';
  for await (const chunk of req) rawBody += chunk;

  let body;
  try { body = JSON.parse(rawBody); }
  catch { return res.status(400).json({ error: 'Geçersiz JSON' }); }

  if (body?.type === 'blob.generate-client-token') {
    if (!verifyRole(req, 'editor')) {
      return res.status(401).json({ error: 'Yetkisiz erişim' });
    }
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname) => ({
        allowedContentTypes: [
          'application/pdf',
          'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
        ],
        maximumSizeInBytes: 50 * 1024 * 1024, // 50 MB
      }),
      onUploadCompleted: async ({ blob }) => {
        // Dosya doğrudan Vercel Blob'a yüklendi — client URL'yi kullanacak
        console.log('[blob-upload] tamamlandı:', blob.url);
      },
    });
    return res.status(200).json(jsonResponse);
  } catch (err) {
    console.error('[blob-upload] hata:', err);
    return res.status(500).json({ error: 'Yükleme başlatılamadı: ' + err.message });
  }
};
