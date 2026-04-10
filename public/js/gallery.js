/* ============================================
   gallery.js — Dergi Galerisi
   ============================================ */

const API = '/api/magazines';
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

let allMagazines = [];

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
    const isNew = Date.now() - new Date(mag.publishedAt).getTime() < THIRTY_DAYS;
    const card = document.createElement('a');
    card.className = 'magazine-card';
    card.href = `/reader.html?id=${encodeURIComponent(mag.id)}`;
    card.setAttribute('aria-label', `${mag.title} — Sayı ${mag.issue}`);

    const coverHtml = mag.coverUrl
      ? `<div class="card-cover"><img src="${escHtml(mag.coverUrl)}" alt="${escHtml(mag.title)} kapak görseli" loading="lazy" />${isNew ? '<span class="badge-new">YENİ</span>' : ''}</div>`
      : `<div class="card-cover"><canvas class="pdf-cover-canvas" data-pdf="${escHtml(mag.pdfUrl || '')}"></canvas>${isNew ? '<span class="badge-new">YENİ</span>' : ''}</div>`;

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

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const canvas = entry.target;
      observer.unobserve(canvas);
      renderPdfFirstPage(canvas, canvas.dataset.pdf);
    });
  }, { rootMargin: '400px' });
  canvases.forEach(c => observer.observe(c));
}

async function renderPdfFirstPage(canvas, url) {
  if (!url || canvas.dataset.rendered) return;
  canvas.dataset.rendered = '1';
  try {
    const pdf = await pdfjsLib.getDocument({ url, withCredentials: false }).promise;
    const page = await pdf.getPage(1);
    const vp0 = page.getViewport({ scale: 1 });
    const scale = 300 / vp0.width;
    const vp = page.getViewport({ scale });
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  } catch {
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
