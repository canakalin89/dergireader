/* ============================================
   pdf-proxy.js — Google Drive PDF Proxy (Edge)
   Edge Function = streaming response, boyut limiti yok.
   Drive PDF'lerini CORS sorunsuz stream eder.
   ============================================ */

export const config = { runtime: 'edge' };

const ALLOWED = ['drive.google.com', 'docs.google.com', 'googleapis.com', 'vercel-storage.com'];
const CORS = { 'Access-Control-Allow-Origin': '*' };

function json(status, body) {
  return Response.json(body, { status, headers: CORS });
}

function isAllowed(raw) {
  try {
    const h = new URL(raw).hostname;
    return ALLOWED.some(d => h === d || h.endsWith('.' + d));
  } catch { return false; }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': '*' },
    });
  }

  const url = new URL(req.url).searchParams.get('url');
  if (!url) return json(400, { error: 'MISSING_URL', message: 'url parametresi gerekli.' });
  if (!isAllowed(url)) return json(403, { error: 'DOMAIN_NOT_ALLOWED', message: 'Sadece Google Drive desteklenir.' });

  try {
    let res = await fetch(url, { redirect: 'follow' });
    const ct = res.headers.get('content-type') || '';

    // Drive confirmation page for large files
    if (ct.includes('text/html')) {
      const html = await res.text();
      const m = html.match(/confirm=([0-9A-Za-z_-]+)/);
      if (m) {
        const sep = url.includes('?') ? '&' : '?';
        res = await fetch(url + sep + 'confirm=' + m[1], { redirect: 'follow' });
      } else if (html.includes('ServiceLogin') || html.includes('signin') || html.includes('accounts.google')) {
        return json(403, { error: 'DRIVE_ACCESS_DENIED', message: 'Dosya paylaşıma açık değil. Drive ayarlarını kontrol edin.' });
      } else {
        return json(422, { error: 'NOT_A_PDF', message: 'İçerik PDF değil.' });
      }
    }

    // Stream the PDF — no body size limit with Edge Functions
    const cl = res.headers.get('content-length');
    return new Response(res.body, {
      headers: {
        ...CORS,
        'Content-Type': 'application/pdf',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        ...(cl ? { 'Content-Length': cl } : {}),
      },
    });
  } catch (e) {
    return json(502, { error: 'FETCH_FAILED', message: 'PDF indirilemedi: ' + e.message });
  }
}
