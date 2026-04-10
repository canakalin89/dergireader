/* api/views.js — Görüntüleme sayaçları
   GET  /api/views          → { magazineId: count, … }
   POST /api/views          → { id } body → sayacı artır, { id, views } döner
*/
const { parseBody, getViews, incrementView } = require('./_lib/store');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const views = await getViews();
      return res.status(200).json(views);
    }

    if (req.method === 'POST') {
      const body = await parseBody(req);
      const id = body.id || (req.query && req.query.id);
      if (!id) return res.status(400).json({ error: 'id gerekli' });

      const count = await incrementView(id);
      return res.status(200).json({ id, views: count });
    }

    return res.status(405).json({ error: 'Desteklenmeyen metod' });
  } catch (err) {
    console.error('[views]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
