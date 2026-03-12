/* ============================================
   reader.js — PDF.js Tabanlı Dergi Okuyucu
   ============================================ */

// PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const params = new URLSearchParams(location.search);
const magazineId = params.get('id');

let pdfDoc = null;
let currentPage = 1;
let totalPages = 0;
let scale = 1.0;
let fitScale = 1.0;
let isRendering = false;
let thumbsRendered = false;
let magazineData = null;

const canvas = document.getElementById('pdfCanvas');
const ctx = canvas.getContext('2d');
const loadingOverlay = document.getElementById('loadingOverlay');
const readerError = document.getElementById('readerError');
const viewport = document.getElementById('viewport');
const pageWrapper = document.getElementById('pageWrapper');
const thumbStrip = document.getElementById('thumbStrip');

// ---- Navigasyon butonları ----
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');
const pageInput = document.getElementById('pageInput');
const totalPagesEl = document.getElementById('totalPages');
const zoomValue = document.getElementById('zoomValue');
const toolbarTitle = document.getElementById('toolbarTitle');
const btnDownload = document.getElementById('btnDownload');

// ---- Başlat ----
async function init() {
  if (!magazineId) return showError('Geçersiz dergi bağlantısı.');

  try {
    const res = await fetch('/api/magazines');
    if (!res.ok) throw new Error('API hatası');
    const magazines = await res.json();
    magazineData = magazines.find(m => m.id === magazineId);
    if (!magazineData) return showError('Dergi bulunamadı.');

    document.title = `${magazineData.title} — Sayı ${magazineData.issue}`;
    toolbarTitle.textContent = `${magazineData.title} #${magazineData.issue}`;

    if (magazineData.pdfUrl) {
      btnDownload.href = magazineData.pdfUrl;
      btnDownload.download = `${magazineData.title}-sayi-${magazineData.issue}.pdf`;
      await loadPdf(magazineData.pdfUrl);
    } else {
      showError('Bu dergiye ait PDF bulunamadı.');
    }
  } catch (err) {
    showError('Dergi bilgileri yüklenemedi: ' + err.message);
  }
}

// ---- PDF Yükle ----
async function loadPdf(url) {
  try {
    const loadingTask = pdfjsLib.getDocument({ url, cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/', cMapPacked: true });
    pdfDoc = await loadingTask.promise;
    totalPages = pdfDoc.numPages;
    totalPagesEl.textContent = totalPages;

    // Kaydedilmiş sayfa kontrolü
    const saved = localStorage.getItem(`dr_progress_${magazineId}`);
    currentPage = (saved && parseInt(saved) <= totalPages) ? parseInt(saved) : 1;

    calcFitScale();
    scale = fitScale;
    updateZoomDisplay();

    await renderPage(currentPage);
    updateNav();
    renderThumbs();
    hideLoading();
  } catch (err) {
    showError('PDF yüklenirken hata: ' + err.message);
  }
}

// ---- Sayfa Render ----
async function renderPage(num, direction = 'next') {
  if (isRendering) return;
  isRendering = true;

  // Flip animasyonu — çıkış
  if (pdfDoc && totalPages > 1) {
    canvas.classList.add('page-flip-exit');
    await new Promise(r => setTimeout(r, 140));
    canvas.classList.remove('page-flip-exit');
  }

  const page = await pdfDoc.getPage(num);
  const vp = page.getViewport({ scale });
  canvas.width = vp.width;
  canvas.height = vp.height;

  await page.render({ canvasContext: ctx, viewport: vp }).promise;

  // Flip animasyonu — giriş
  canvas.classList.add('page-flip-enter');
  canvas.addEventListener('animationend', () => canvas.classList.remove('page-flip-enter'), { once: true });

  currentPage = num;
  pageInput.value = num;
  localStorage.setItem(`dr_progress_${magazineId}`, String(num));
  updateThumbActive();
  isRendering = false;
}

// ---- Fit scale hesapla ----
function calcFitScale() {
  if (!pdfDoc) return;
  pdfDoc.getPage(1).then(page => {
    const vp = page.getViewport({ scale: 1 });
    const availW = viewport.clientWidth - 48;
    const availH = viewport.clientHeight - 48;
    fitScale = Math.min(availW / vp.width, availH / vp.height, 2.5);
    fitScale = Math.max(fitScale, 0.3);
    scale = fitScale;
    updateZoomDisplay();
    renderPage(currentPage);
  });
}

// ---- Zoom ----
document.getElementById('btnZoomIn').addEventListener('click', () => {
  scale = Math.min(scale + 0.2, 3.5);
  updateZoomDisplay();
  renderPage(currentPage);
});
document.getElementById('btnZoomOut').addEventListener('click', () => {
  scale = Math.max(scale - 0.2, 0.3);
  updateZoomDisplay();
  renderPage(currentPage);
});
document.getElementById('btnZoomFit').addEventListener('click', () => {
  calcFitScale();
});

function updateZoomDisplay() {
  zoomValue.textContent = Math.round(scale * 100) + '%';
}

// ---- Navigasyon ----
function updateNav() {
  btnPrev.disabled = currentPage <= 1;
  btnNext.disabled = currentPage >= totalPages;
}

btnPrev.addEventListener('click', () => goToPage(currentPage - 1));
btnNext.addEventListener('click', () => goToPage(currentPage + 1));

pageInput.addEventListener('change', () => {
  const n = parseInt(pageInput.value);
  if (n >= 1 && n <= totalPages) goToPage(n);
  else pageInput.value = currentPage;
});

function goToPage(n) {
  if (n < 1 || n > totalPages || n === currentPage || isRendering) return;
  const dir = n > currentPage ? 'next' : 'prev';
  renderPage(n, dir);
  updateNav();
}

// ---- Klavye ----
document.addEventListener('keydown', (e) => {
  if (e.target === pageInput) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goToPage(currentPage + 1);
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goToPage(currentPage - 1);
  if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  if (e.key === 'Escape' && document.fullscreenElement) document.exitFullscreen();
  if (e.key === '+') { document.getElementById('btnZoomIn').click(); }
  if (e.key === '-') { document.getElementById('btnZoomOut').click(); }
});

// ---- Touch/swipe ----
let touchStartX = 0;
viewport.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
viewport.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(dx) > 50) dx < 0 ? goToPage(currentPage + 1) : goToPage(currentPage - 1);
}, { passive: true });

// ---- Tam ekran ----
document.getElementById('btnFullscreen').addEventListener('click', toggleFullscreen);
function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen();
  else document.exitFullscreen();
}

// ---- Küçük resimler ----
async function renderThumbs() {
  if (thumbsRendered || !pdfDoc) return;
  thumbsRendered = true;
  thumbStrip.innerHTML = '';

  for (let i = 1; i <= Math.min(totalPages, 100); i++) {
    const item = document.createElement('div');
    item.className = 'thumb-item' + (i === currentPage ? ' active' : '');
    item.dataset.page = i;
    item.setAttribute('title', `Sayfa ${i}`);

    const tc = document.createElement('canvas');
    item.appendChild(tc);

    const num = document.createElement('span');
    num.className = 'thumb-num';
    num.textContent = i;
    item.appendChild(num);

    thumbStrip.appendChild(item);

    item.addEventListener('click', () => goToPage(parseInt(item.dataset.page)));

    // Thumbnail renderı sıra sıra yap (arka planda)
    const pageNum = i;
    requestIdleCallback ? requestIdleCallback(() => renderThumb(pageNum, tc)) : setTimeout(() => renderThumb(pageNum, tc), pageNum * 30);
  }
}

async function renderThumb(num, tc) {
  try {
    const page = await pdfDoc.getPage(num);
    const vp = page.getViewport({ scale: 0.15 });
    tc.width = vp.width;
    tc.height = vp.height;
    await page.render({ canvasContext: tc.getContext('2d'), viewport: vp }).promise;
  } catch { /* thumbnail hatası sessizce geç */ }
}

function updateThumbActive() {
  thumbStrip.querySelectorAll('.thumb-item').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.page) === currentPage);
  });
  const active = thumbStrip.querySelector('.thumb-item.active');
  if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

// ---- Geri butonu ----
document.getElementById('btnBack').addEventListener('click', () => {
  history.length > 1 ? history.back() : location.href = '/';
});

// ---- Yardımcılar ----
function hideLoading() {
  loadingOverlay.style.display = 'none';
}

function showError(msg) {
  loadingOverlay.style.display = 'none';
  readerError.style.display = 'flex';
  document.getElementById('errorMsg').textContent = msg;
}

// Pencere boyutu değişince fit scale güncelle
window.addEventListener('resize', () => {
  if (pdfDoc) calcFitScale();
});

init();
