/* ============================================
   admin.js — Dergi Yönetim Paneli
   ============================================ */

const TOKEN_KEY = 'dr_admin_token';
let authToken = localStorage.getItem(TOKEN_KEY);
let pendingDeleteId = null;

// ---- Auth ----
function isLoggedIn() { return !!authToken; }

function saveToken(t) {
  authToken = t;
  localStorage.setItem(TOKEN_KEY, t);
}

function clearToken() {
  authToken = null;
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders() {
  return { 'Authorization': `Bearer ${authToken}` };
}

// ---- Başlangıç ----
function init() {
  if (isLoggedIn()) {
    showAdminContent();
  } else {
    showLoginScreen();
  }
}

// ---- Ekran yönetimi ----
function showLoginScreen() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('adminContent').classList.remove('visible');
  document.getElementById('btnLogout').style.display = 'none';
}

function showAdminContent() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminContent').classList.add('visible');
  document.getElementById('btnLogout').style.display = '';
  loadMagazines();
}

// ---- Login formu ----
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('passwordInput').value;
  const btn = document.getElementById('loginBtn');
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Giriş yapılıyor…';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Giriş başarısız');
    saveToken(data.token);
    showAdminContent();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Giriş Yap';
  }
});

// ---- Çıkış ----
document.getElementById('btnLogout').addEventListener('click', () => {
  clearToken();
  showLoginScreen();
  showToast('Çıkış yapıldı.', 'success');
});

// ---- Dergi listesi ----
async function loadMagazines() {
  const listEl = document.getElementById('magazineList');
  const countEl = document.getElementById('listCount');
  listEl.innerHTML = '<div class="empty-list">Yükleniyor…</div>';

  try {
    const res = await fetch('/api/magazines');
    const magazines = await res.json();
    countEl.textContent = `${magazines.length} dergi`;
    renderList(magazines);
  } catch (err) {
    listEl.innerHTML = '<div class="empty-list">Dergiler yüklenemedi.</div>';
  }
}

function renderList(magazines) {
  const listEl = document.getElementById('magazineList');
  if (!magazines.length) {
    listEl.innerHTML = '<div class="empty-list">Henüz hiç dergi eklenmedi.</div>';
    return;
  }

  listEl.innerHTML = '';
  magazines.forEach(mag => {
    const item = document.createElement('div');
    item.className = 'mag-item';
    item.innerHTML = `
      <div class="mag-thumb">
        ${mag.coverUrl
          ? `<img src="${esc(mag.coverUrl)}" alt="${esc(mag.title)}" loading="lazy" />`
          : '📄'}
      </div>
      <div class="mag-details">
        <h3>${esc(mag.title)}</h3>
        <div class="mag-meta">Sayı ${mag.issue} · ${mag.year} ${mag.term ? '· ' + esc(mag.term) : ''} · ${new Date(mag.publishedAt).toLocaleDateString('tr-TR')}</div>
      </div>
      <div class="mag-actions">
        <a href="/reader.html?id=${esc(mag.id)}" target="_blank" class="btn btn-outline" title="Önizle">👁</a>
        <button class="btn btn-outline" data-id="${esc(mag.id)}" data-title="${esc(mag.title)}" onclick="confirmDelete(this)" title="Sil">🗑</button>
      </div>`;
    listEl.appendChild(item);
  });
}

// ---- Silme onayı ----
function confirmDelete(btn) {
  pendingDeleteId = btn.dataset.id;
  document.getElementById('deleteModalMsg').textContent =
    `"${btn.dataset.title}" dergisini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`;
  document.getElementById('deleteModal').classList.add('open');
}

document.getElementById('deleteCancelBtn').addEventListener('click', () => {
  pendingDeleteId = null;
  document.getElementById('deleteModal').classList.remove('open');
});

document.getElementById('deleteConfirmBtn').addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  const id = pendingDeleteId;
  pendingDeleteId = null;
  document.getElementById('deleteModal').classList.remove('open');

  try {
    const res = await fetch(`/api/magazines/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (res.status === 401) { handleUnauthorized(); return; }
    if (!res.ok) throw new Error('Silme başarısız');
    showToast('Dergi başarıyla silindi.', 'success');
    loadMagazines();
  } catch (err) {
    showToast('Silme sırasında hata: ' + err.message, 'error');
  }
});

// ---- Yükleme formu ----
setupDropZone('pdfDrop', 'inPdf', 'pdfChosen');
setupDropZone('coverDrop', 'inCover', 'coverChosen');

function setupDropZone(zoneId, inputId, chosenId) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  const chosen = document.getElementById(chosenId);

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) {
      const dt = new DataTransfer();
      dt.items.add(e.dataTransfer.files[0]);
      input.files = dt.files;
      chosen.textContent = '✓ ' + e.dataTransfer.files[0].name;
    }
  });

  input.addEventListener('change', () => {
    if (input.files[0]) chosen.textContent = '✓ ' + input.files[0].name;
    else chosen.textContent = '';
  });
}

document.getElementById('uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const progressWrap = document.getElementById('progressWrap');
  const progressFill = document.getElementById('progressFill');
  const progressLabel = document.getElementById('progressLabel');

  btn.disabled = true;
  btn.textContent = 'Yükleniyor…';
  progressWrap.style.display = 'block';

  const formData = new FormData(e.target);

  try {
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/magazines');
      xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          const pct = Math.round((ev.loaded / ev.total) * 100);
          progressFill.style.width = pct + '%';
          progressLabel.textContent = `Yükleniyor… ${pct}%`;
        }
      };

      xhr.onload = () => {
        if (xhr.status === 401) { handleUnauthorized(); reject(new Error('Oturum süresi doldu')); return; }
        if (xhr.status === 201) resolve(JSON.parse(xhr.responseText));
        else {
          try { reject(new Error(JSON.parse(xhr.responseText).error || 'Yükleme başarısız')); }
          catch { reject(new Error('Sunucu hatası')); }
        }
      };
      xhr.onerror = () => reject(new Error('Ağ hatası'));
      xhr.send(formData);
    });

    showToast('Dergi başarıyla yüklendi!', 'success');
    e.target.reset();
    document.getElementById('pdfChosen').textContent = '';
    document.getElementById('coverChosen').textContent = '';
    loadMagazines();
  } catch (err) {
    showToast('Hata: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '📤 Dergiyi Yükle';
    progressWrap.style.display = 'none';
    progressFill.style.width = '0%';
  }
});

// ---- JWT süresi dolmuşsa ----
function handleUnauthorized() {
  clearToken();
  showLoginScreen();
  showToast('Oturum süresi doldu, tekrar giriş yapın.', 'error');
}

// ---- Toast ----
let toastTimer = null;
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

// ---- Yardımcı ----
function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

init();
