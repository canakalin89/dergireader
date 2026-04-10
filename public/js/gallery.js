/* ============================================
   gallery.js — Dergi Galerisi
   ============================================ */

const API = '/api/magazines';

let allMagazines = [];
let newestMagId  = null; // en son eklenen derginin id'si — "YENİ" badge

// ---- Tema ----
const html = document.documentElement;
const themeToggle = document.getElementById('themeToggle');

function applyTheme(theme) {
  html.setAttribute('data-theme', theme);
  themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
  themeToggle.setAttribute('title', theme === 'dark' ? 'Aydınlık mod' : 'Karanlık mod');
}

(function initTheme() {
  const saved = localStorage.getItem('dr_theme') || 'light';
  applyTheme(saved);
})();

themeToggle.addEventListener('click', () => {
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  localStorage.setItem('dr_theme', next);
  applyTheme(next);
});

// ---- Veri yükleme ----
async function loadMagazines() {
  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error('API hatası');
    allMagazines = await res.json();
    // En son eklenen dergiyi bul — "YENİ" etiketi sadece ona konur
    if (allMagazines.length) {
      const sorted = [...allMagazines].sort((a, b) =>
        new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()
      );
      newestMagId = sorted[0].id;
    }
    renderStats(allMagazines);
    populateYearFilter(allMagazines);
    renderGallery(allMagazines);
  } catch (err) {
    document.getElementById('errorBanner').style.display = 'block';
    document.getElementById('galleryGrid').innerHTML = '';
  }
}

// ---- İstatistikler ----
function renderStats(magazines) {
  document.getElementById('statCount').textContent = magazines.length;
  const years = [...new Set(magazines.map(m =>
    m.date ? m.date.substring(0, 4) : (m.year ? String(m.year) : null)
  ).filter(Boolean))].sort();
  if (years.length > 1) {
    document.getElementById('statYears').textContent = `${years[0]}–${years[years.length - 1]}`;
  } else if (years.length === 1) {
    document.getElementById('statYears').textContent = String(years[0]);
  } else {
    document.getElementById('statYears').textContent = '—';
  }
  const statsBar = document.getElementById('statsBar');
  const spans = statsBar.querySelectorAll('span');
  if (spans[2]) spans[2].textContent = `📖 ${magazines.length} yayın arşivde`;
}

// ---- Yıl filtresi doldur ----
function populateYearFilter(magazines) {
  const sel = document.getElementById('filterYear');
  const years = [...new Set(magazines.map(m =>
    m.date ? m.date.substring(0, 4) : (m.year ? String(m.year) : null)
  ).filter(Boolean))].sort((a, b) => b - a);
  years.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    sel.appendChild(opt);
  });
}

// ---- Galeri render ----
function renderGallery(magazines) {
  const grid = document.getElementById('galleryGrid');
  grid.innerHTML = '';

  if (!magazines.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <h3>Henüz dergi eklenmedi</h3>
        <p>İlk dergi admin panelinden yüklenebilir.</p>
      </div>`;
    return;
  }

  magazines.forEach(mag => {
    const isNew = mag.id === newestMagId;
    const card = document.createElement('a');
    card.className = 'magazine-card';
    card.href = `/reader.html?id=${encodeURIComponent(mag.id)}`;
    card.setAttribute('aria-label', `${mag.title} — Sayı ${mag.issue}`);

    var badgeHtml = isNew ? '<span class="badge-new">YENİ</span>' : '';
    // PDF proxy üzerinden ilk sayfayı canvas'a render et
    var proxyUrl = '/api/pdf-proxy?url=' + encodeURIComponent(mag.pdfUrl);
    const coverHtml = `<div class="card-cover"><canvas class="pdf-cover-canvas" data-pdf="${escHtml(proxyUrl)}"></canvas><div class="card-cover-placeholder">📄</div>${badgeHtml}</div>`;

    const metaParts = [];
    if (mag.issue) metaParts.push(`<span>Sayı ${mag.issue}</span>`);
    if (mag.date) {
      metaParts.push(`<span class="${metaParts.length ? 'dot' : ''}">${new Date(mag.date).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long' })}</span>`);
    } else if (mag.year) {
      metaParts.push(`<span class="${metaParts.length ? 'dot' : ''}">${mag.year}</span>`);
    }

    card.innerHTML = `
      ${coverHtml}
      <div class="card-info">
        <div class="card-title">${escHtml(mag.title)}</div>
        ${mag.description ? `<div class="card-desc">${escHtml(mag.description)}</div>` : ''}
        <div class="card-meta">${metaParts.join('')}</div>
      </div>`;

    grid.appendChild(card);
  });

  initPdfCovers();
}

// ---- PDF Otomatik Kapak ----
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

function initPdfCovers() {
  const canvases = document.querySelectorAll('canvas.pdf-cover-canvas:not([data-rendered])');
  if (!canvases.length || typeof pdfjsLib === 'undefined') return;
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc)
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;

  // Az sayıda dergi — hepsini hemen render et
  canvases.forEach(c => renderPdfFirstPage(c, c.dataset.pdf));
}

async function renderPdfFirstPage(canvas, url) {
  if (!url || canvas.dataset.rendered) return;
  canvas.dataset.rendered = '1';
  var ph = canvas.parentElement.querySelector('.card-cover-placeholder');
  try {
    var pdf = await pdfjsLib.getDocument({
      url: url,
      disableRange: true,
      disableStream: true,
      withCredentials: false
    }).promise;
    var page = await pdf.getPage(1);
    var vp0 = page.getViewport({ scale: 1 });
    var scale = 400 / vp0.width;
    var vp = page.getViewport({ scale: scale });
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    if (ph) ph.style.display = 'none';
  } catch (e) {
    console.warn('[Cover] PDF kapak render hatası:', url, e);
    canvas.style.display = 'none';
  }
}


function applyFilters() {
  const year = document.getElementById('filterYear').value;
  const filtered = allMagazines.filter(m => {
    const magYear = m.date ? m.date.substring(0, 4) : (m.year ? String(m.year) : null);
    return !year || magYear === year;
  });
  renderGallery(filtered);
}

document.getElementById('filterYear').addEventListener('change', applyFilters);
document.getElementById('filterReset').addEventListener('click', () => {
  document.getElementById('filterYear').value = '';
  renderGallery(allMagazines);
});

// ---- Yardımcı ----
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Başlat
loadMagazines();
