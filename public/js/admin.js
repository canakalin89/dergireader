/* ============================================
   admin.js — Dergi Yönetim Paneli (v2)
   Sıfırdan yeniden yazıldı: event delegation,
   temiz modal yönetimi, retry mantığı.
   ============================================ */

// ── API hata ayrıştırıcı ────────────────────────────────────────────────────
async function parseApiError(res, fallback) {
  try {
    const data = await res.json();
    if (data.code && data.message) return `[${data.code}] ${data.message}`;
    if (data.message) return data.message;
    if (data.error) return data.error;
  } catch { /* ignore */ }
  return fallback || 'Bilinmeyen hata';
}

// ── PDF kapak oluşturucu ────────────────────────────────────────────────────
function initPdfCovers() {
  const canvases = document.querySelectorAll('canvas.pdf-cover-canvas:not([data-rendered])');
  if (!canvases.length || typeof pdfjsLib === 'undefined') return;
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc)
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      renderPdfCover(entry.target, entry.target.dataset.pdf);
    });
  }, { rootMargin: '400px' });
  canvases.forEach(c => observer.observe(c));
}

async function renderPdfCover(canvas, url) {
  if (!url || canvas.dataset.rendered) return;
  canvas.dataset.rendered = '1';
  try {
    const pdf = await pdfjsLib.getDocument({ url, withCredentials: false }).promise;
    const page = await pdf.getPage(1);
    const vp0 = page.getViewport({ scale: 1 });
    const scale = 200 / vp0.width;
    const vp = page.getViewport({ scale });
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  } catch {
    canvas.style.display = 'none';
  }
}

// ── Token & Auth ────────────────────────────────────────────────────────────
const TOKEN_KEY = 'dr_admin_token';
let authToken = localStorage.getItem(TOKEN_KEY);
let currentUser = null;

// Tüm dergileri bellekte tut — renderList ve modal işlemleri için
let allMagazines = [];

function isLoggedIn() { return !!authToken; }
function saveToken(t) { authToken = t; localStorage.setItem(TOKEN_KEY, t); }
function clearToken() { authToken = null; currentUser = null; localStorage.removeItem(TOKEN_KEY); }
function authHeaders() { return { 'Authorization': `Bearer ${authToken}` }; }

function parseJWT(token) {
  try { return JSON.parse(atob(token.split('.')[1])); } catch { return null; }
}

function hasRole(minRole) {
  if (!currentUser) return false;
  const levels = { owner: 3, admin: 2, editor: 1, pending: 0 };
  return (levels[currentUser.role] || 0) >= (levels[minRole] || 0);
}

function handleUnauthorized() {
  clearToken();
  showLoginScreen();
  showToast('Oturum süresi doldu, tekrar giriş yapın.', 'error');
}

// ── Ekran yönetimi ──────────────────────────────────────────────────────────
function checkUrlToken() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const authError = params.get('auth_error');
  if (authError) { history.replaceState({}, '', '/admin/'); showToast('Google ile giriş başarısız.', 'error'); return; }
  if (token) { saveToken(token); history.replaceState({}, '', '/admin/'); }
}

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

  if (currentUser.role === 'pending') {
    document.getElementById('uploadPanel').style.display = 'none';
    const notice = document.createElement('section');
    notice.className = 'panel';
    notice.innerHTML = `
      <div class="panel-body" style="text-align:center;padding:2.5rem 1.5rem;">
        <div style="font-size:2.5rem;margin-bottom:.75rem;">⏳</div>
        <h3 style="margin:0 0 .5rem">Hesabınız onay bekliyor</h3>
        <p style="color:var(--text-muted);margin:0">
          Yönetici hesabınızı onayladıktan sonra dergi ekleyebileceksiniz.
        </p>
      </div>`;
    document.getElementById('adminContent').insertBefore(notice, document.getElementById('uploadPanel'));
  }

  if (hasRole('owner')) {
    document.getElementById('usersPanel').style.display = '';
    loadUsers();
  }

  loadMagazines();
}

// ── Başlangıç ───────────────────────────────────────────────────────────────
function init() {
  checkUrlToken();
  if (isLoggedIn()) {
    currentUser = parseJWT(authToken);
    if (!currentUser || !currentUser.role) { clearToken(); showLoginScreen(); return; }
    showAdminContent();
  } else {
    showLoginScreen();
  }
}

// ── Çıkış ───────────────────────────────────────────────────────────────────
document.getElementById('btnLogout').addEventListener('click', () => {
  clearToken();
  showLoginScreen();
  showToast('Çıkış yapıldı.', 'success');
});

// ── E-posta Auth ────────────────────────────────────────────────────────────
let authMode = 'login';

// setAuthMode'u global yap (HTML onclick kullanıyor)
window.setAuthMode = function(mode) {
  authMode = mode;
  const isReg = mode === 'register';
  document.getElementById('fieldName').style.display = isReg ? '' : 'none';
  document.getElementById('inputName').required = isReg;
  document.getElementById('fieldConfirmPassword').style.display = isReg ? '' : 'none';
  document.getElementById('inputConfirmPassword').required = isReg;
  document.getElementById('inputPassword').autocomplete = isReg ? 'new-password' : 'current-password';
  document.getElementById('emailAuthBtn').textContent = isReg ? 'Kayıt Ol' : 'Giriş Yap';
  document.getElementById('tabLogin').classList.toggle('auth-tab--active', !isReg);
  document.getElementById('tabRegister').classList.toggle('auth-tab--active', isReg);
  document.getElementById('loginError').style.display = 'none';
};

document.getElementById('emailAuthForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('inputEmail').value.trim();
  const password = document.getElementById('inputPassword').value;
  const confirm = document.getElementById('inputConfirmPassword').value;
  const name = document.getElementById('inputName').value.trim();
  const hp = document.getElementById('hpField').value;
  const btn = document.getElementById('emailAuthBtn');
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';

  if (hp) return;
  if (authMode === 'register' && password !== confirm) { errEl.textContent = 'Şifreler eşleşmiyor'; errEl.style.display = 'block'; return; }
  if (authMode === 'register' && password.length < 6) { errEl.textContent = 'Şifre en az 6 karakter olmalıdır'; errEl.style.display = 'block'; return; }

  btn.disabled = true;
  btn.textContent = authMode === 'register' ? 'Kaydediliyor…' : 'Giriş yapılıyor…';

  try {
    const endpoint = authMode === 'register' ? '/api/auth/register' : '/api/auth/login-email';
    const bodyData = authMode === 'register'
      ? JSON.stringify({ name, email, password, _hp: hp })
      : JSON.stringify({ email, password, _hp: hp });
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyData });
    const data = await res.json();
    if (!res.ok) throw new Error((data.code && data.message) ? `[${data.code}] ${data.message}` : (data.message || data.error || 'İşlem başarısız'));
    saveToken(data.token);
    currentUser = parseJWT(data.token);
    showAdminContent();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = authMode === 'register' ? 'Kayıt Ol' : 'Giriş Yap';
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ██ DERGİ CRUD — sıfırdan
// ══════════════════════════════════════════════════════════════════════════════

// ── Dergi listesini yükle ───────────────────────────────────────────────────
async function loadMagazines() {
  const listEl = document.getElementById('magazineList');
  const countEl = document.getElementById('listCount');
  listEl.innerHTML = '<div class="empty-list">Yükleniyor…</div>';

  try {
    const res = await fetch('/api/magazines');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allMagazines = await res.json();
    countEl.textContent = `${allMagazines.length} dergi`;
    renderList(allMagazines);
  } catch (err) {
    listEl.innerHTML = '<div class="empty-list">Dergiler yüklenemedi. Sayfayı yenileyin.</div>';
    console.error('[loadMagazines]', err);
  }
}

// ── Dergi listesi render ────────────────────────────────────────────────────
function renderList(magazines) {
  const listEl = document.getElementById('magazineList');
  if (!magazines.length) {
    listEl.innerHTML = '<div class="empty-list">Henüz hiç dergi eklenmedi.</div>';
    return;
  }

  const canDelete = hasRole('admin');
  const canEdit = hasRole('editor');

  listEl.innerHTML = '';
  magazines.forEach(mag => {
    const item = document.createElement('div');
    item.className = 'mag-item';
    item.dataset.id = mag.id;
    item.innerHTML = `
      <div class="mag-thumb">
        ${mag.coverUrl
          ? `<img src="${esc(mag.coverUrl)}" alt="${esc(mag.title)}" loading="lazy" />`
          : `<canvas class="pdf-cover-canvas" data-pdf="${esc(mag.pdfUrl || '')}"></canvas>`}
      </div>
      <div class="mag-details">
        <h3>${esc(mag.title)}</h3>
        <div class="mag-meta">
          ${mag.issue ? `Sayı ${mag.issue} · ` : ''}${mag.date ? new Date(mag.date).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long' }) : (mag.year || '')}
          ${mag.description ? `<span class="mag-desc">${esc(mag.description)}</span>` : ''}
        </div>
      </div>
      <div class="mag-actions">
        <a href="/reader.html?id=${esc(mag.id)}" target="_blank" class="btn btn-outline" title="Önizle">👁</a>
        ${canEdit ? `<button class="btn btn-outline btn-edit-mag" data-id="${esc(mag.id)}" title="Düzenle">✏️</button>` : ''}
        ${canDelete ? `<button class="btn btn-outline btn-delete-mag" data-id="${esc(mag.id)}" data-title="${esc(mag.title)}" title="Sil">🗑</button>` : ''}
      </div>`;
    listEl.appendChild(item);
  });
  initPdfCovers();
}

// ── Event Delegation — dergi listesi tıklamaları ────────────────────────────
document.getElementById('magazineList').addEventListener('click', (e) => {
  const editBtn = e.target.closest('.btn-edit-mag');
  if (editBtn) {
    const mag = allMagazines.find(m => m.id === editBtn.dataset.id);
    if (mag) openEditModal(mag);
    return;
  }

  const deleteBtn = e.target.closest('.btn-delete-mag');
  if (deleteBtn) {
    openDeleteModal('magazine', deleteBtn.dataset.id, deleteBtn.dataset.title);
    return;
  }
});

// ── Dergi Ekleme ────────────────────────────────────────────────────────────
document.getElementById('uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const title = document.getElementById('inTitle').value.trim();
  const pdfUrl = document.getElementById('inPdfUrl').value.trim();

  if (!title) { showToast('Başlık zorunludur', 'error'); return; }
  if (!pdfUrl) { showToast('PDF bağlantısı zorunludur', 'error'); return; }
  try { new URL(pdfUrl); } catch { showToast('Geçerli bir URL girin (https:// ile başlamalı)', 'error'); return; }

  btn.disabled = true;
  btn.textContent = 'Kaydediliyor…';

  try {
    const res = await fetch('/api/magazines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        title,
        issue: document.getElementById('inIssue').value.trim() || null,
        date: document.getElementById('inDate').value || null,
        description: document.getElementById('inDesc').value.trim() || null,
        pdfUrl,
        coverUrl: document.getElementById('inCoverUrl').value.trim() || null,
      }),
    });

    if (res.status === 401 || res.status === 403) { handleUnauthorized(); return; }
    if (!res.ok) throw new Error(await parseApiError(res, `Kayıt hatası (${res.status})`));

    showToast('Dergi başarıyla eklendi!', 'success');
    e.target.reset();
    await loadMagazines();
  } catch (err) {
    showToast('Hata: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Kaydet';
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ██ SİLME — temiz modal yönetimi
// ══════════════════════════════════════════════════════════════════════════════

let deleteState = { mode: null, id: null, busy: false };

function openDeleteModal(mode, id, label) {
  deleteState = { mode, id, busy: false };
  const msgEl = document.getElementById('deleteModalMsg');
  msgEl.textContent = mode === 'user'
    ? `"${label}" kullanıcısını kaldırmak istediğinize emin misiniz?`
    : `"${label}" dergisini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`;
  document.getElementById('deleteConfirmBtn').disabled = false;
  document.getElementById('deleteConfirmBtn').textContent = 'Evet, Sil';
  document.getElementById('deleteModal').classList.add('open');
}

function closeDeleteModal() {
  deleteState = { mode: null, id: null, busy: false };
  document.getElementById('deleteModal').classList.remove('open');
}

document.getElementById('deleteCancelBtn').addEventListener('click', () => {
  if (deleteState.busy) return;
  closeDeleteModal();
});

document.getElementById('deleteConfirmBtn').addEventListener('click', async () => {
  if (deleteState.busy || !deleteState.id) return;
  deleteState.busy = true;

  const btn = document.getElementById('deleteConfirmBtn');
  btn.disabled = true;
  btn.textContent = 'Siliniyor…';

  try {
    if (deleteState.mode === 'user') {
      const res = await fetch(`/api/users/${encodeURIComponent(deleteState.id)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await parseApiError(res, 'Silinemedi'));
      showToast('Kullanıcı kaldırıldı.', 'success');
      closeDeleteModal();
      loadUsers();
      return;
    }

    // Dergi silme
    const res = await fetch(`/api/magazines/${encodeURIComponent(deleteState.id)}?action=delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: '{}',
    });
    if (res.status === 401 || res.status === 403) { handleUnauthorized(); closeDeleteModal(); return; }
    if (!res.ok) throw new Error(await parseApiError(res, 'Silme başarısız'));

    showToast('Dergi başarıyla silindi.', 'success');
    closeDeleteModal();
    await loadMagazines();
  } catch (err) {
    const prefix = deleteState.mode === 'user' ? 'Kullanıcı silinirken hata: ' : 'Silme sırasında hata: ';
    showToast(prefix + err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Evet, Sil';
    deleteState.busy = false;
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ██ DÜZENLEME — temiz modal yönetimi
// ══════════════════════════════════════════════════════════════════════════════

function openEditModal(mag) {
  document.getElementById('editId').value = mag.id;
  document.getElementById('editTitle').value = mag.title || '';
  document.getElementById('editIssue').value = mag.issue || '';
  document.getElementById('editDate').value = mag.date ? mag.date.slice(0, 10) : '';
  document.getElementById('editPdfUrl').value = mag.pdfUrl || '';
  document.getElementById('editCoverUrl').value = mag.coverUrl || '';
  document.getElementById('editDesc').value = mag.description || '';
  document.getElementById('editModal').classList.add('open');
}

document.getElementById('editCancelBtn').addEventListener('click', () => {
  document.getElementById('editModal').classList.remove('open');
});

document.getElementById('editForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('editId').value;
  const btn = document.getElementById('editSaveBtn');
  btn.disabled = true;
  btn.textContent = 'Kaydediliyor…';

  const body = {
    title: document.getElementById('editTitle').value.trim(),
    issue: document.getElementById('editIssue').value,
    date: document.getElementById('editDate').value,
    pdfUrl: document.getElementById('editPdfUrl').value.trim(),
    coverUrl: document.getElementById('editCoverUrl').value.trim(),
    description: document.getElementById('editDesc').value.trim(),
  };

  if (!body.title) {
    showToast('Başlık zorunludur.', 'error');
    btn.disabled = false; btn.textContent = '💾 Kaydet';
    return;
  }

  try {
    const res = await fetch(`/api/magazines/${encodeURIComponent(id)}?action=update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (res.status === 401 || res.status === 403) { handleUnauthorized(); return; }
    if (!res.ok) throw new Error(await parseApiError(res, 'Güncelleme başarısız'));

    document.getElementById('editModal').classList.remove('open');
    showToast('Dergi başarıyla güncellendi.', 'success');
    await loadMagazines();
  } catch (err) {
    showToast('Hata: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Kaydet';
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ██ KULLANICI YÖNETİMİ
// ══════════════════════════════════════════════════════════════════════════════

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
          <select class="role-select" data-userid="${esc(user.id)}">
            <option value="pending" ${user.role === 'pending' ? 'selected' : ''}>⏳ Beklemede</option>
            <option value="editor"  ${user.role === 'editor'  ? 'selected' : ''}>✏️ Editor</option>
            <option value="admin"   ${user.role === 'admin'   ? 'selected' : ''}>🔑 Admin</option>
            <option value="owner"   ${user.role === 'owner'   ? 'selected' : ''}>👑 Owner</option>
          </select>
          <button class="btn btn-outline btn-sm btn-delete-user" data-userid="${esc(user.id)}" data-username="${esc(user.name || user.email)}" title="Kullanıcıyı Sil">🗑</button>
        `}
      </div>`;
    listEl.appendChild(item);
  });
}

// ── Event Delegation — kullanıcı listesi ────────────────────────────────────
document.getElementById('usersList').addEventListener('click', (e) => {
  const deleteBtn = e.target.closest('.btn-delete-user');
  if (deleteBtn) {
    openDeleteModal('user', deleteBtn.dataset.userid, deleteBtn.dataset.username);
    return;
  }
});

document.getElementById('usersList').addEventListener('change', async (e) => {
  const select = e.target.closest('.role-select');
  if (!select) return;

  const userId = select.dataset.userid;
  const role = select.value;
  try {
    const res = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) throw new Error(await parseApiError(res, 'Rol güncellenemedi'));
    showToast(`Rol "${role}" olarak güncellendi.`, 'success');
  } catch (err) {
    showToast('Hata: ' + err.message, 'error');
    loadUsers();
  }
});

// ── Toast ───────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 4000);
}

// ── Yardımcı ────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Başlat ──────────────────────────────────────────────────────────────────
init();
