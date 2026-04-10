const { verifyRole } = require('./_lib/auth');
const { getCategories, saveCategories, parseBody } = require('./_lib/store');
const { sendError } = require('./_lib/errors');

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function slugify(str) {
  return str.toLowerCase().trim()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET — herkese açık ───────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const cats = await getCategories();
      return res.status(200).json(cats);
    } catch (err) {
      return sendError(res, 'ERR_STORE_READ_FAILED', err.message);
    }
  }

  // ── POST — sadece owner ───────────────────────────────────────────────────
  if (req.method === 'POST') {
    if (!verifyRole(req, 'owner')) return sendError(res, 'ERR_AUTH_INSUFFICIENT_ROLE');

    let body = {};
    try { body = await parseBody(req); } catch { return sendError(res, 'ERR_VAL_INVALID_JSON'); }

    const action = req.query.action || body.action;

    // Oluştur
    if (action === 'create' || !action) {
      const name = String(body.name || '').trim().slice(0, 60);
      if (!name) return sendError(res, 'ERR_VAL', 'Kategori adı zorunludur');

      const cats = await getCategories();
      const slug = slugify(name);
      if (cats.find(c => c.slug === slug)) return sendError(res, 'ERR_VAL', 'Bu isimde kategori zaten var');

      const cat = {
        id: uuidv4(),
        name,
        slug,
        color: body.color || '#6366f1',
        order: cats.length,
        createdAt: new Date().toISOString(),
      };
      cats.push(cat);
      await saveCategories(cats);
      return res.status(201).json(cat);
    }

    // Güncelle
    if (action === 'update') {
      const { id, name, color } = body;
      if (!id) return sendError(res, 'ERR_VAL', 'id zorunludur');

      const cats = await getCategories();
      const idx = cats.findIndex(c => c.id === id);
      if (idx === -1) return sendError(res, 'ERR_NOT_FOUND', 'Kategori bulunamadı');

      if (name) {
        const trimmed = String(name).trim().slice(0, 60);
        cats[idx].name = trimmed;
        cats[idx].slug = slugify(trimmed);
      }
      if (color) cats[idx].color = color;

      await saveCategories(cats);
      return res.status(200).json(cats[idx]);
    }

    // Sil
    if (action === 'delete') {
      const { id } = body;
      if (!id) return sendError(res, 'ERR_VAL', 'id zorunludur');

      const cats = await getCategories();
      const idx = cats.findIndex(c => c.id === id);
      if (idx === -1) return sendError(res, 'ERR_NOT_FOUND', 'Kategori bulunamadı');

      cats.splice(idx, 1);
      await saveCategories(cats);
      return res.status(200).json({ ok: true });
    }

    return sendError(res, 'ERR_VAL', 'Geçersiz action');
  }

  return sendError(res, 'ERR_METHOD_NOT_ALLOWED');
};
