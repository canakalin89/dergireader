const { put, list, del, head, getDownloadUrl } = require('@vercel/blob');

const METADATA_KEY = 'data/magazines.json';

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

module.exports = { getMagazines, saveMagazines, uploadFile, deleteFile };
