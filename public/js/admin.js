/* ============================================
   admin.js — Dergi Yönetim Paneli
   ============================================ */

const TOKEN_KEY = 'dr_admin_token';
let authToken = localStorage.getItem(TOKEN_KEY);
let currentUser = null;
let pendingDeleteId = null;

// ---- Auth ----
function isLoggedIn() { return !!authToken; }

function saveToken(t) {
  authToken = t;
  localStorage.setItem(TOKEN_KEY, t);
}

function clearToken() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders() {
  return { 'Authorization': `Bearer ${authToken}` };
}

function parseJWT(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

function hasRole(minRole) {
  if (!currentUser) return false;
  const levels = { owner: 3, admin: 2, editor: 1, pending: 0 };
  return (levels[currentUser.role] || 0) >= (levels[minRole] || 0);
}

// ---- URL'den token oku (Google callback) ----
function checkUrlToken() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const authError = params.get('auth_error');

  if (authError) {
    history.replaceState({}, '', '/admin/');
    showToast('Google ile giriş başarısız. Tekrar deneyin.', 'error');
    return;
  }

  if (token) {
    saveToken(token);
    history.replaceState({}, '', '/admin/');
  }
}

// ---- Başlangıç ----
function init() {
  checkUrlToken();
  if (isLoggedIn()) {
    currentUser = parseJWT(authToken);
    if (!currentUser || !currentUser.role) {
      clearToken();
      showLoginScreen();
      return;
    }
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
  document.getElementById('userBadge').style.display = 'none';
}

function showAdminContent() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminContent').classList.add('visible');
  document.getElementById('btnLogout').style.display = '';

  // Kullanıcı bilgisi göster
  const badge = document.getElementById('userBadge');
  badge.style.display = 'flex';
  document.getElementById('userName').textContent = currentUser.name || currentUser.email || '';
  const roleLabels = { owner: '👑 Owner', admin: '🔑 Admin', editor: '✏️ Editor', pending: '⏳ Beklemede' };
  document.getElementById('roleChip').textContent = roleLabels[currentUser.role] || currentUser.role;
  if (currentUser.picture) {
    const avatar = document.getElementById('userAvatar');
    avatar.src = currentUser.picture;
    avatar.style.display = '';
  }

  // Pending kullanıcı: yükleme panelini gizle, bilgi notu göster
  if (currentUser.role === 'pending') {
    document.getElementById('uploadPanel').style.display = 'none';
    const notice = document.createElement('section');
    notice.className = 'panel';
    notice.innerHTML = `
      <div class="panel-body" style="text-align:center;padding:2.5rem 1.5rem;">
        <div style="font-size:2.5rem;margin-bottom:.75rem;">⏳</div>
        <h3 style="margin:0 0 .5rem">Hesabınız onay bekliyor</h3>
        <p style="color:var(--text-muted);margin:0">
          Yönetici hesabınızı onayladıktan sonra dergi ekleyebileceksiniz.<br/>
          Dergileri görüntüleyebilir ve okuyabilirsiniz.
        </p>
      </div>`;
    document.getElementById('adminContent').insertBefore(notice, document.getElementById('uploadPanel'));
  }

  // Kullanıcı panelini sadece owner'a göster
  if (hasRole('owner')) {
    document.getElementById('usersPanel').style.display = '';
    loadUsers();
  }

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
    currentUser = parseJWT(data.token);
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

  const canDelete = hasRole('admin');

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
        ${canDelete ? `<button class="btn btn-outline" data-id="${esc(mag.id)}" data-title="${esc(mag.title)}" onclick="confirmDelete(this)" title="Sil">🗑</button>` : ''}
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
    if (res.status === 401 || res.status === 403) { handleUnauthorized(); return; }
    if (!res.ok) throw new Error('Silme başarısız');
    showToast('Dergi başarıyla silindi.', 'success');
    loadMagazines();
  } catch (err) {
    showToast('Silme sırasında hata: ' + err.message, 'error');
  }
});

// ---- PDF Kaynak Toggler ----
let pdfSource = 'upload'; // 'upload' | 'url'

function setPdfSource(mode) {
  pdfSource = mode;
  document.getElementById('pdfDrop').style.display     = mode === 'upload' ? '' : 'none';
  document.getElementById('pdfUrlZone').style.display  = mode === 'url'    ? '' : 'none';
  document.getElementById('srcUploadBtn').classList.toggle('src-btn--active', mode === 'upload');
  document.getElementById('srcUrlBtn').classList.toggle('src-btn--active',   mode === 'url');
  // Required zorunluluğu ayarla
  document.getElementById('inPdf').required    = mode === 'upload';
  document.getElementById('inPdfUrl').required = mode === 'url';
}

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

  // URL modunda: dosya alanını temizle, pdfUrl'u ekle
  if (pdfSource === 'url') {
    formData.delete('pdf');
    const urlVal = document.getElementById('inPdfUrl').value.trim();
    if (!urlVal) {
      showToast('Lütfen bir PDF URL\'si girin.', 'error');
      btn.disabled = false; btn.textContent = '📤 Dergiyi Yükle';
      progressWrap.style.display = 'none';
      return;
    }
    formData.set('pdfUrl', urlVal);
  }

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
        if (xhr.status === 401 || xhr.status === 403) { handleUnauthorized(); reject(new Error('Yetkisiz')); return; }
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

// ---- Kullanıcı yönetimi ----
async function loadUsers() {
  const listEl = document.getElementById('usersList');
  const countEl = document.getElementById('usersCount');
  listEl.innerHTML = '<div class="empty-list">Yükleniyor…</div>';

  try {
    const res = await fetch('/api/users', { headers: authHeaders() });
    if (!res.ok) throw new Error('Yüklenemedi');
    const users = await res.json();
    countEl.textContent = `${users.length} kullanıcı`;
    renderUsers(users);
  } catch {
    listEl.innerHTML = '<div class="empty-list">Kullanıcılar yüklenemedi.</div>';
  }
}

function renderUsers(users) {
  const listEl = document.getElementById('usersList');
  if (!users.length) {
    listEl.innerHTML = '<div class="empty-list">Henüz hiç kullanıcı yok.</div>';
    return;
  }

  // Pending kullanıcılar üste, owner alta (sabit)
  const sorted = [...users].sort((a, b) => {
    const order = { pending: 0, editor: 1, admin: 2, owner: 3 };
    return (order[a.role] ?? 1) - (order[b.role] ?? 1);
  });

  const pendingCount = sorted.filter(u => u.role === 'pending').length;
  document.getElementById('usersCount').textContent =
    `${users.length} kullanıcı${pendingCount ? ` · ${pendingCount} onay bekliyor` : ''}`;

  listEl.innerHTML = '';
  sorted.forEach(user => {
    const isOwner = user.role === 'owner';
    const isPending = user.role === 'pending';
    const item = document.createElement('div');
    item.className = 'user-item' + (isPending ? ' user-item--pending' : '');
    item.innerHTML = `
      <div class="user-thumb">
        ${user.picture ? `<img src="${esc(user.picture)}" alt="${esc(user.name)}" />` : '👤'}
      </div>
      <div class="user-details">
        <h3>${esc(user.name || user.email)}${isPending ? ' <span class="role-chip role-chip--pending">⏳ Onay Bekliyor</span>' : ''}</h3>
        <div class="user-meta">${esc(user.email)} · Son giriş: ${user.lastLogin ? new Date(user.lastLogin).toLocaleDateString('tr-TR') : '—'}</div>
      </div>
      <div class="user-actions">
        ${isOwner ? `<span class="role-chip">👑 Owner</span>` : `
          <select class="role-select" data-userid="${esc(user.id)}" onchange="changeRole(this)">
            <option value="pending" ${user.role === 'pending' ? 'selected' : ''}>⏳ Beklemede</option>
            <option value="editor"  ${user.role === 'editor'  ? 'selected' : ''}>✏️ Editor</option>
            <option value="admin"   ${user.role === 'admin'   ? 'selected' : ''}>🔑 Admin</option>
            <option value="owner"   ${user.role === 'owner'   ? 'selected' : ''}>👑 Owner</option>
          </select>
          <button class="btn btn-outline btn-sm" data-userid="${esc(user.id)}" data-username="${esc(user.name || user.email)}" onclick="confirmDeleteUser(this)" title="Kullanıcıyı Sil">🗑</button>
        `}
      </div>`;
    listEl.appendChild(item);
  });
}

async function changeRole(select) {
  const userId = select.dataset.userid;
  const role = select.value;
  try {
    const res = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error || 'Rol güncellenemedi');
    }
    showToast(`Rol "${role}" olarak güncellendi.`, 'success');
  } catch (err) {
    showToast('Hata: ' + err.message, 'error');
    loadUsers(); // listeyi geri yükle
  }
}

let pendingDeleteUserId = null;
function confirmDeleteUser(btn) {
  pendingDeleteUserId = btn.dataset.userid;
  // Silme modalını yeniden kullan
  document.getElementById('deleteModalMsg').textContent =
    `"${btn.dataset.username}" kullanıcısını kaldırmak istediğinize emin misiniz?`;
  document.getElementById('deleteModal').dataset.mode = 'user';
  document.getElementById('deleteModal').classList.add('open');
}

document.getElementById('deleteConfirmBtn').addEventListener('click', async () => {
  const modal = document.getElementById('deleteModal');
  const mode = modal.dataset.mode;

  if (mode === 'user') {
    modal.dataset.mode = '';
    modal.classList.remove('open');
    if (!pendingDeleteUserId) return;
    const id = pendingDeleteUserId;
    pendingDeleteUserId = null;
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error('Silinemedi');
      showToast('Kullanıcı kaldırıldı.', 'success');
      loadUsers();
    } catch (err) {
      showToast('Hata: ' + err.message, 'error');
    }
    return;
  }

  // Dergi silme (mevcut akış)
  if (!pendingDeleteId) return;
  const id = pendingDeleteId;
  pendingDeleteId = null;
  modal.classList.remove('open');

  try {
    const res = await fetch(`/api/magazines/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (res.status === 401 || res.status === 403) { handleUnauthorized(); return; }
    if (!res.ok) throw new Error('Silme başarısız');
    showToast('Dergi başarıyla silindi.', 'success');
    loadMagazines();
  } catch (err) {
    showToast('Silme sırasında hata: ' + err.message, 'error');
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
