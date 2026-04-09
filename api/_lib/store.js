const { put, list, del } = require('@vercel/blob');

const METADATA_KEY = 'data/magazines.json';
const USERS_KEY = 'data/users.json';

async function getMagazines() {
  try {
    const { blobs } = await list({ prefix: METADATA_KEY });
    if (!blobs.length) return [];
    const res = await fetch(blobs[0].url);
    return await res.json();
  } catch {
    return [];
  }
}

async function saveMagazines(magazines) {
  const content = JSON.stringify(magazines, null, 2);
  await put(METADATA_KEY, content, {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  });
}

async function uploadFile(buffer, filename, contentType) {
  const { url } = await put(filename, buffer, {
    access: 'public',
    contentType,
    addRandomSuffix: true,
  });
  return url;
}

async function deleteFile(url) {
  try {
    await del(url);
  } catch {
    // Blob zaten silinmiş olabilir, sessizce geç
  }
}

async function getUsers() {
  try {
    const { blobs } = await list({ prefix: USERS_KEY });
    if (!blobs.length) return [];
    const res = await fetch(blobs[0].url + '?t=' + Date.now());
    return await res.json();
  } catch {
    return [];
  }
}

async function saveUsers(users) {
  const content = JSON.stringify(users, null, 2);
  await put(USERS_KEY, content, {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  });
}

// Kullanıcıyı oluştur ya da son girişi güncelle
async function upsertUser({ id, email, name, picture, provider }) {
  const users = await getUsers();
  const idx = users.findIndex(u => u.id === id);
  const isOwner = email === process.env.OWNER_EMAIL;

  if (idx >= 0) {
    // Var olan kullanıcı — owner rolü korunsun
    if (isOwner) users[idx].role = 'owner';
    users[idx] = { ...users[idx], name, picture, lastLogin: new Date().toISOString() };
    await saveUsers(users);
    return users[idx];
  }

  // Yeni kullanıcı
  const user = {
    id, email, name, picture, provider,
    role: isOwner ? 'owner' : 'editor',
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString(),
  };
  users.push(user);
  await saveUsers(users);
  return user;
}

module.exports = { getMagazines, saveMagazines, uploadFile, deleteFile, getUsers, saveUsers, upsertUser };
