/* ============================================
   pdf-proxy.js — Google Drive PDF Proxy
   Drive URL'lerini server-side fetch ile indirip
   CORS sorunsuz döndürür. Flipbook modunun
   Drive dosyalarıyla çalışmasını sağlar.
   ============================================ */

const ALLOWED_DOMAINS = [
  'drive.google.com',
  'docs.google.com',
  'vercel-storage.com',
  'googleapis.com',
];

const MAX_SIZE = 4 * 1024 * 1024; // 4 MB (Vercel Hobby response limit ~4.5MB)

export default async function handler(req, res) {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const rawUrl = req.query.url;
  if (!rawUrl) {
    return res.status(400).json({ error: 'MISSING_URL', message: 'url parametresi gerekli.' });
  }

  let decoded;
  try { decoded = decodeURIComponent(rawUrl); } catch {
    return res.status(400).json({ error: 'INVALID_URL', message: 'URL çözümlenemedi.' });
  }

  // Domain whitelist
  const isAllowed = ALLOWED_DOMAINS.some(d => decoded.includes(d));
  if (!isAllowed) {
    return res.status(403).json({ error: 'DOMAIN_NOT_ALLOWED', message: 'Bu kaynak desteklenmiyor.' });
  }

  try {
    let response = await fetch(decoded, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DergiReader/1.0)' },
    });

    // Google Drive may return HTML confirm page for large files
    const ct = response.headers.get('content-type') || '';
    if (ct.includes('text/html')) {
      const html = await response.text();

      // Try extracting the confirm token
      const confirmMatch = html.match(/confirm=([a-zA-Z0-9_-]+)/);
      if (confirmMatch) {
        const sep = decoded.includes('?') ? '&' : '?';
        const confirmUrl = `${decoded}${sep}confirm=${confirmMatch[1]}`;
        response = await fetch(confirmUrl, {
          redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DergiReader/1.0)' },
        });
      } else {
        // Drive blocked access — file not shared publicly
        return res.status(502).json({
          error: 'DRIVE_ACCESS_DENIED',
          message: 'Google Drive dosyaya erişimi engelledi. Dosyanın "Bağlantıya sahip herkes" ile paylaşıldığından emin olun.',
        });
      }
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Size check
    if (buffer.length > MAX_SIZE) {
      return res.status(413).json({
        error: 'PDF_TOO_LARGE',
        message: `PDF çok büyük (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Limit: 4 MB.`,
        size: buffer.length,
      });
    }

    // PDF signature check
    if (buffer.length < 5 || buffer.toString('utf-8', 0, 5) !== '%PDF-') {
      return res.status(502).json({
        error: 'NOT_A_PDF',
        message: 'İndirilen dosya geçerli bir PDF değil.',
      });
    }

    // Success — send PDF with caching
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return res.send(buffer);
  } catch (err) {
    console.error('[pdf-proxy] Fetch error:', err.message);
    return res.status(502).json({
      error: 'FETCH_FAILED',
      message: 'PDF indirilemedi: ' + err.message,
    });
  }
}
