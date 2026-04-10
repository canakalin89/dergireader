const { put, list, del } = require('@vercel/blob');

const METADATA_KEY = 'data/magazines.json';
const USERS_KEY = 'data/users.json';
const VIEWS_KEY  = 'data/views.json';
const CATEGORIES_KEY = 'data/categories.json';
const MAX_RETRIES = 2;

// ── Yardımcılar ─────────────────────────────────────────────────────────────

/** İstek gövdesini chunk olarak oku ve JSON olarak parse et. */
async function parseBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  return JSON.parse(raw);
}

/** Blob okuma/yazma işlemlerini retry ile sar. */
async function withRetry(fn, label) {
  let lastErr;
  for (let i = 0; i <= MAX_RETRIES; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.error(`[store:${label}] deneme ${i + 1}/${MAX_RETRIES + 1} başarısız:`, err.message);
      if (i < MAX_RETRIES) await new Promise(r => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr;
}

// ── Blob JSON okuma/yazma ───────────────────────────────────────────────────

async function readBlobJson(key) {
  const { blobs } = await list({ prefix: key });
  if (!blobs.length) return [];
  const url = blobs[0].url + '?t=' + Date.now();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Blob okuma hatası: ${res.status}`);
  return await res.json();
}

async function readBlobJsonObj(key) {
  const { blobs } = await list({ prefix: key });
  if (!blobs.length) return {};
  const url = blobs[0].url + '?t=' + Date.now();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Blob okuma hatası: ${res.status}`);
  return await res.json();
}

async function writeBlobJson(key, data) {
  await put(key, JSON.stringify(data, null, 2), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  });
}

// ── Dergi CRUD ──────────────────────────────────────────────────────────────

async function getMagazines() {
  return withRetry(() => readBlobJson(METADATA_KEY), 'getMagazines').catch(() => []);
}

async function saveMagazines(magazines) {
  return withRetry(() => writeBlobJson(METADATA_KEY, magazines), 'saveMagazines');
}

// ── Dosya CRUD ──────────────────────────────────────────────────────────────

async function uploadFile(buffer, filename, contentType) {
  const { url } = await put(filename, buffer, {
    access: 'public',
    contentType,
    addRandomSuffix: true,
  });
  return url;
}

async function deleteFile(url) {
  if (!url) return;
  // Google Drive URL'lerini silmeye çalışma — sadece Vercel Blob URL'leri
  if (!url.includes('vercel-storage.com') && !url.includes('blob.vercel-storage')) return;
  try { await del(url); } catch { /* blob zaten silinmiş olabilir */ }
}

// ── Kategori CRUD ───────────────────────────────────────────────────────────

async function getCategories() {
  return withRetry(() => readBlobJson(CATEGORIES_KEY), 'getCategories').catch(() => []);
}

async function saveCategories(categories) {
  return withRetry(() => writeBlobJson(CATEGORIES_KEY, categories), 'saveCategories');
}

// ── Görüntüleme sayaçları ───────────────────────────────────────────────────

async function getViews() {
  return withRetry(() => readBlobJsonObj(VIEWS_KEY), 'getViews').catch(() => ({}));
}

async function incrementView(magazineId) {
  const views = await getViews();
  views[magazineId] = (views[magazineId] || 0) + 1;
  await withRetry(() => writeBlobJson(VIEWS_KEY, views), 'incrementView');
  return views[magazineId];
}

// ── Kullanıcı CRUD ──────────────────────────────────────────────────────────

async function getUsers() {
  return withRetry(() => readBlobJson(USERS_KEY), 'getUsers').catch(() => []);
}

async function saveUsers(users) {
  return withRetry(() => writeBlobJson(USERS_KEY, users), 'saveUsers');
}

async function upsertUser({ id, email, name, picture, provider }) {
  const users = await getUsers();
  const idx = users.findIndex(u => u.id === id);
  const isOwner = email === process.env.OWNER_EMAIL;

  if (idx >= 0) {
    if (isOwner) users[idx].role = 'owner';
    users[idx] = { ...users[idx], name, picture, lastLogin: new Date().toISOString() };
    await saveUsers(users);
    return users[idx];
  }

  const user = {
    id, email, name, picture, provider,
    role: isOwner ? 'owner' : 'pending',
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString(),
  };
  users.push(user);
  await saveUsers(users);
  return user;
}

module.exports = {
  parseBody,
  getMagazines, saveMagazines,
  uploadFile, deleteFile,
  getUsers, saveUsers, upsertUser,
  getViews, incrementView,
  getCategories, saveCategories,
};
