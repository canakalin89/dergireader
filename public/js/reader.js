/* ============================================
   reader.js — PDF.js + StPageFlip Entegrasyonu
   ============================================ */

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const params       = new URLSearchParams(location.search);
const magazineId   = params.get('id');

let pdfDoc        = null;
let pageFlip      = null;
let totalPages    = 0;
let currentIndex  = 0; // 0-based, StPageFlip index
let renderedPages = new Set();
let magazineData  = null;
let isPortrait    = false;

const RENDER_SCALE = 1.8;

const loadingOverlay = document.getElementById('loadingOverlay');
const loadingMsg     = document.getElementById('loadingMsg');
const readerError    = document.getElementById('readerError');
const toolbarTitle   = document.getElementById('toolbarTitle');
const btnPrev        = document.getElementById('btnPrev');
const btnNext        = document.getElementById('btnNext');
const pageLabel      = document.getElementById('pageInput');
const totalLabel     = document.getElementById('totalPages');
const btnDownload    = document.getElementById('btnDownload');
const flipbookEl     = document.getElementById('flipbook');
const scene          = document.getElementById('flipbookScene');

// ---- Ana başlangıç ----
async function init() {
  if (!magazineId) return showError('Geçersiz dergi bağlantısı.');

  try {
    const res = await fetch('/api/magazines');
    if (!res.ok) throw new Error('API hatası');
    const list = await res.json();
    magazineData = list.find(m => m.id === magazineId);
    if (!magazineData) return showError('Dergi bulunamadı.');

    document.title   = `${magazineData.title} — Sayı ${magazineData.issue}`;
    toolbarTitle.textContent = `${magazineData.title} #${magazineData.issue}`;

    if (magazineData.pdfUrl) {
      btnDownload.href     = magazineData.pdfUrl;
      btnDownload.download = `${magazineData.title}-sayi-${magazineData.issue}.pdf`;
      await loadPdf(magazineData.pdfUrl);
    } else {
      showError('Bu dergiye ait PDF bulunamadı.');
    }
  } catch (err) {
    showError('Dergi bilgileri yüklenemedi: ' + err.message);
  }
}

// ---- PDF yükleme ----
async function loadPdf(url) {
  setMsg('PDF yükleniyor…');
  const task = pdfjsLib.getDocument({
    url,
    cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
    cMapPacked: true,
  });
  pdfDoc     = await task.promise;
  totalPages = pdfDoc.numPages;
  totalLabel.textContent = totalPages;

  setMsg('Sayfalar hazırlanıyor…');
  const firstPage = await pdfDoc.getPage(1);
  const baseVp    = firstPage.getViewport({ scale: RENDER_SCALE });
  const pageW     = Math.floor(baseVp.width);
  const pageH     = Math.floor(baseVp.height);

  isPortrait = window.innerWidth < 600;
  buildPages(pageW, pageH);
  initFlipBook(pageW, pageH);
}

// ---- Sayfa div'lerini oluştur ----
function buildPages(w, h) {
  flipbookEl.innerHTML = '';
  for (let i = 1; i <= totalPages; i++) {
    const div = document.createElement('div');
    div.className   = 'flip-page';
    div.id          = `fp-${i}`;
    div.style.width  = w + 'px';
    div.style.height = h + 'px';

    const inner = document.createElement('div');
    inner.className = 'flip-page-loading';
    inner.textContent = `Sayfa ${i}`;
    div.appendChild(inner);

    flipbookEl.appendChild(div);
  }
}

// ---- StPageFlip başlat ----
function initFlipBook(pageW, pageH) {
  const sceneW   = scene.clientWidth  - 32;
  const sceneH   = scene.clientHeight - 32;
  const scaleF   = Math.min(sceneW / (isPortrait ? pageW : pageW * 2), sceneH / pageH, 1);
  const dispW    = Math.floor(pageW * scaleF);
  const dispH    = Math.floor(pageH * scaleF);

  const saved    = localStorage.getItem(`dr_progress_${magazineId}`);
  const startPg  = saved ? Math.min(Math.max(parseInt(saved) - 1, 0), totalPages - 1) : 0;

  pageFlip = new St.PageFlip(flipbookEl, {
    width:           dispW,
    height:          dispH,
    size:            'fixed',
    showCover:       true,
    usePortrait:     isPortrait,
    startPage:       startPg,
    drawShadow:      true,
    flippingTime:    700,
    useMouseEvents:  true,
    mobileScrollSupport: false,
    autoSize:        false,
  });

  pageFlip.loadFromHTML(document.querySelectorAll('.flip-page'));

  pageFlip.on('flip', e => {
    currentIndex = e.data;
    updateNav();
    renderSpread(currentIndex);
    localStorage.setItem(`dr_progress_${magazineId}`, String(currentIndex + 1));
  });

  currentIndex = startPg;
  updateNav();
  hideLoading();
  renderSpread(currentIndex);
}

// ---- İlgili sayfaları render et ----
async function renderSpread(idx) {
  // Şimdiki spread + bir sonraki spread (4 sayfa)
  const candidates = [idx - 1, idx, idx + 1, idx + 2, idx + 3]
    .filter(p => p >= 0 && p < totalPages);

  for (const p of candidates) {
    if (!renderedPages.has(p)) {
      renderedPages.add(p);
      renderPdfPage(p + 1); // PDF.js 1-indexed
    }
  }
}

async function renderPdfPage(pageNum) {
  const container = document.getElementById(`fp-${pageNum}`);
  if (!container || container.querySelector('canvas')) return;

  const page = await pdfDoc.getPage(pageNum);
  const vp   = page.getViewport({ scale: RENDER_SCALE });

  const canvas   = document.createElement('canvas');
  canvas.width   = vp.width;
  canvas.height  = vp.height;
  canvas.style.width  = '100%';
  canvas.style.height = '100%';

  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

  container.innerHTML = '';
  container.appendChild(canvas);
}

// ---- Navigasyon ----
function updateNav() {
  const cp = pageFlip ? pageFlip.getCurrentPageIndex() : currentIndex;
  pageLabel.textContent = cp + 1;
  btnPrev.disabled = cp <= 0;
  btnNext.disabled = cp >= totalPages - 1;
}

btnPrev.addEventListener('click', () => { pageFlip?.flipPrev(); });
btnNext.addEventListener('click', () => { pageFlip?.flipNext(); });

document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') pageFlip?.flipNext();
  if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   pageFlip?.flipPrev();
  if (e.key === 'f' || e.key === 'F') toggleFullscreen();
});

// ---- Tam ekran ----
document.getElementById('btnFullscreen').addEventListener('click', toggleFullscreen);
function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen();
  else document.exitFullscreen();
}

// ---- Geri ----
document.getElementById('btnBack').addEventListener('click', () => {
  history.length > 1 ? history.back() : (location.href = '/');
});

// ---- Pencere resize ----
window.addEventListener('resize', () => {
  if (pageFlip) pageFlip.update();
});

// ---- Yardımcılar ----
function setMsg(t)  { loadingMsg.textContent = t; }
function hideLoading() { loadingOverlay.style.display = 'none'; }
function showError(msg) {
  loadingOverlay.style.display = 'none';
  readerError.style.display = 'flex';
  document.getElementById('errorMsg').textContent = msg;
}

init();
