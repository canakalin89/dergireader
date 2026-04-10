/* ============================================
   reader.js — Dergi Okuyucu v3
   Her zaman sayfa çevirme animasyonlu flipbook.
   Google Drive linkleri server-side proxy üzerinden
   PDF.js ile yüklenir — iframe yok.
   ============================================ */

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const params     = new URLSearchParams(location.search);
const magazineId = params.get('id');

let pdfDoc       = null;
let pageFlip     = null;
let totalPages   = 0;
let currentIndex = 0;
let renderedPages  = new Set();
let renderingPages = new Set();
let magazineData = null;
let isPortrait   = false;
let pageW = 0, pageH = 0;

const RENDER_SCALE = 2;
const ZOOM_SCALE   = 3;

// ── DOM ──
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingMsg     = document.getElementById('loadingMsg');
const loadProgressFill = document.getElementById('loadProgressFill');
const readerError    = document.getElementById('readerError');
const toolbarTitle   = document.getElementById('toolbarTitle');
const btnPrev        = document.getElementById('btnPrev');
const btnNext        = document.getElementById('btnNext');
const pageLabel      = document.getElementById('pageInput');
const totalLabel     = document.getElementById('totalPages');
const btnDownload    = document.getElementById('btnDownload');
const flipbookEl     = document.getElementById('flipbook');
const scene          = document.getElementById('flipbookScene');
const progressFill   = document.getElementById('progressFill');
const zoomOverlay    = document.getElementById('zoomOverlay');
const zoomCanvas     = document.getElementById('zoomCanvas');

// ── Drive helpers ──
function getDriveFileId(url) {
  const m = url.match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]{20,})/);
  return m ? m[1] : null;
}

function isDriveUrl(url) {
  return url && (url.includes('drive.google.com') || url.includes('docs.google.com'));
}

function buildProxyUrl(pdfUrl) {
  return '/api/pdf-proxy?url=' + encodeURIComponent(pdfUrl);
}

// ── Init ──
async function init() {
  if (!magazineId) return showError('Geçersiz dergi bağlantısı.');

  try {
    // Use dedicated single-magazine endpoint
    const res = await fetch('/api/magazines/' + encodeURIComponent(magazineId));
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return showError(data.message || 'Dergi bulunamadı.');
    }
    magazineData = await res.json();

    const title = magazineData.title + (magazineData.issue ? ' #' + magazineData.issue : '');
    document.title = title + ' — DergiReader';
    toolbarTitle.textContent = title;

    if (!magazineData.pdfUrl) return showError('Bu dergiye ait PDF bulunamadı.');

    btnDownload.href = magazineData.pdfUrl;
    btnDownload.download = (magazineData.title || 'dergi') + '.pdf';

    // Always load through PDF.js — proxy if Drive URL
    const loadUrl = isDriveUrl(magazineData.pdfUrl)
      ? buildProxyUrl(magazineData.pdfUrl)
      : magazineData.pdfUrl;

    try {
      await loadPdf(loadUrl);
    } catch (pdfErr) {
      // If proxy failed, offer Drive iframe fallback
      const fileId = getDriveFileId(magazineData.pdfUrl);
      if (fileId) {
        showDriveFallback(fileId, pdfErr.message || 'PDF yüklenemedi');
      } else {
        showError('PDF yüklenemedi: ' + (pdfErr.message || 'Bilinmeyen hata'));
      }
    }
  } catch (err) {
    showError('Dergi bilgileri yüklenemedi: ' + err.message);
  }
}

// ── PDF Loading ──
async function loadPdf(url) {
  setMsg('PDF indiriliyor…');
  setLoadProgress(10);

  const task = pdfjsLib.getDocument({
    url,
    cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
    cMapPacked: true,
    withCredentials: false,
  });

  task.onProgress = ({ loaded, total }) => {
    if (total > 0) {
      const pct = Math.min(Math.round((loaded / total) * 80) + 10, 90);
      setLoadProgress(pct);
      setMsg('PDF indiriliyor… %' + Math.round((loaded / total) * 100));
    }
  };

  pdfDoc     = await task.promise;
  totalPages = pdfDoc.numPages;
  totalLabel.textContent = totalPages;

  setLoadProgress(92);
  setMsg(totalPages + ' sayfa hazırlanıyor…');

  const firstPage = await pdfDoc.getPage(1);
  const baseVp    = firstPage.getViewport({ scale: RENDER_SCALE });
  pageW = Math.floor(baseVp.width);
  pageH = Math.floor(baseVp.height);

  setLoadProgress(95);
  isPortrait = window.innerWidth < 768;

  buildPages();
  initFlipBook();
  setLoadProgress(100);
}

// ── Build page containers ──
function buildPages() {
  flipbookEl.innerHTML = '';
  for (let i = 1; i <= totalPages; i++) {
    const div       = document.createElement('div');
    div.className   = 'flip-page';
    div.id          = 'fp-' + i;
    div.dataset.page = i;
    div.style.width  = pageW + 'px';
    div.style.height = pageH + 'px';

    const inner       = document.createElement('div');
    inner.className   = 'flip-page-loading';
    inner.innerHTML   = '<div class="page-spinner"></div><span>Sayfa ' + i + '</span>';
    div.appendChild(inner);

    flipbookEl.appendChild(div);
  }
}

// ── StPageFlip initialization ──
function initFlipBook() {
  const padding = isPortrait ? 16 : 40;
  const sceneW  = scene.clientWidth  - padding;
  const sceneH  = scene.clientHeight - padding;
  const scaleF  = Math.min(
    sceneW / (isPortrait ? pageW : pageW * 2),
    sceneH / pageH,
    1
  );
  const dispW = Math.floor(pageW * scaleF);
  const dispH = Math.floor(pageH * scaleF);

  // Restore reading position
  const saved   = localStorage.getItem('dr_progress_' + magazineId);
  const startPg = saved ? Math.min(Math.max(parseInt(saved) - 1, 0), totalPages - 1) : 0;

  pageFlip = new St.PageFlip(flipbookEl, {
    width:               dispW,
    height:              dispH,
    size:                'fixed',
    showCover:           true,
    usePortrait:         isPortrait,
    startPage:           startPg,
    drawShadow:          true,
    flippingTime:        600,
    useMouseEvents:      true,
    mobileScrollSupport: false,
    autoSize:            false,
    swipeDistance:        30,
    maxShadowOpacity:    0.35,
  });

  pageFlip.loadFromHTML(document.querySelectorAll('.flip-page'));

  pageFlip.on('flip', function(e) {
    currentIndex = e.data;
    updateNav();
    renderSpread(currentIndex);
    localStorage.setItem('dr_progress_' + magazineId, String(currentIndex + 1));
  });

  currentIndex = startPg;
  updateNav();
  hideLoading();
  renderSpread(currentIndex);
}

// ── Render visible pages + prefetch neighbors ──
async function renderSpread(idx) {
  const targets = [idx - 1, idx, idx + 1, idx + 2, idx + 3]
    .filter(function(p) { return p >= 0 && p < totalPages; });

  for (var i = 0; i < targets.length; i++) {
    var p = targets[i];
    if (!renderedPages.has(p) && !renderingPages.has(p)) {
      renderingPages.add(p);
      renderPdfPage(p + 1).then(function(pg) {
        return function() { renderedPages.add(pg); renderingPages.delete(pg); };
      }(p)).catch(function(pg) {
        return function() { renderingPages.delete(pg); };
      }(p));
    }
  }
}

async function renderPdfPage(pageNum) {
  const container = document.getElementById('fp-' + pageNum);
  if (!container || container.querySelector('canvas')) return;

  const page   = await pdfDoc.getPage(pageNum);
  const vp     = page.getViewport({ scale: RENDER_SCALE });
  const canvas = document.createElement('canvas');
  canvas.width  = vp.width;
  canvas.height = vp.height;
  canvas.style.width  = '100%';
  canvas.style.height = '100%';

  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

  container.innerHTML = '';
  container.appendChild(canvas);
}

// ── Navigation ──
function updateNav() {
  const cp = pageFlip ? pageFlip.getCurrentPageIndex() : currentIndex;
  pageLabel.textContent = cp + 1;
  btnPrev.disabled = cp <= 0;
  btnNext.disabled = cp >= totalPages - 1;

  // Progress bar
  if (progressFill && totalPages > 1) {
    progressFill.style.width = (((cp + 1) / totalPages) * 100) + '%';
  }
}

btnPrev.addEventListener('click', function() { if (pageFlip) pageFlip.flipPrev(); });
btnNext.addEventListener('click', function() { if (pageFlip) pageFlip.flipNext(); });

// Mobile tap zones
document.getElementById('navLeft').addEventListener('click', function() {
  if (pageFlip) pageFlip.flipPrev();
});
document.getElementById('navRight').addEventListener('click', function() {
  if (pageFlip) pageFlip.flipNext();
});

// Keyboard navigation
document.addEventListener('keydown', function(e) {
  // Don't hijack input fields
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (e.key === 'Escape' && zoomOverlay.style.display !== 'none') {
    closeZoom();
    return;
  }

  switch (e.key) {
    case 'ArrowRight': case 'ArrowDown': case ' ':
      e.preventDefault();
      if (pageFlip) pageFlip.flipNext();
      break;
    case 'ArrowLeft': case 'ArrowUp':
      e.preventDefault();
      if (pageFlip) pageFlip.flipPrev();
      break;
    case 'f': case 'F':
      toggleFullscreen();
      break;
    case 'Home':
      if (pageFlip) pageFlip.flip(0);
      break;
    case 'End':
      if (pageFlip) pageFlip.flip(totalPages - 1);
      break;
  }
});

// ── Zoom — double click/tap on page ──
scene.addEventListener('dblclick', function(e) {
  if (!pdfDoc) return;
  // Find which page was clicked
  const pageEl = e.target.closest('.flip-page');
  if (!pageEl) return;
  const pageNum = parseInt(pageEl.dataset.page);
  if (!pageNum || pageNum < 1 || pageNum > totalPages) return;
  openZoom(pageNum);
});

async function openZoom(pageNum) {
  try {
    const page = await pdfDoc.getPage(pageNum);
    const vp   = page.getViewport({ scale: ZOOM_SCALE });
    zoomCanvas.width  = vp.width;
    zoomCanvas.height = vp.height;
    await page.render({ canvasContext: zoomCanvas.getContext('2d'), viewport: vp }).promise;
    zoomOverlay.style.display = 'flex';
  } catch { /* ignore */ }
}

function closeZoom() {
  zoomOverlay.style.display = 'none';
}

zoomOverlay.addEventListener('click', function(e) {
  if (e.target === zoomOverlay || e.target === zoomCanvas) closeZoom();
});
document.getElementById('zoomClose').addEventListener('click', closeZoom);

// ── Fullscreen ──
document.getElementById('btnFullscreen').addEventListener('click', toggleFullscreen);
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(function() {});
  } else {
    document.exitFullscreen();
  }
}

// ── Back ──
document.getElementById('btnBack').addEventListener('click', function() {
  if (history.length > 1) history.back();
  else location.href = '/';
});

// ── Resize ──
var resizeTimer;
window.addEventListener('resize', function() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(function() {
    if (!pageFlip || !pdfDoc) return;
    var wasPortrait = isPortrait;
    isPortrait = window.innerWidth < 768;
    if (wasPortrait !== isPortrait) {
      var currentPage = pageFlip.getCurrentPageIndex();
      pageFlip.destroy();
      renderedPages.clear();
      renderingPages.clear();
      buildPages();
      initFlipBook();
    } else {
      pageFlip.update();
    }
  }, 300);
});

// ── Drive fallback (only if proxy can't handle it) ──
function showDriveFallback(fileId, errMsg) {
  loadingOverlay.style.display = 'none';
  scene.style.display = 'none';
  document.getElementById('progressBar').style.display = 'none';

  // Hide page controls since Drive has its own
  btnPrev.style.display  = 'none';
  btnNext.style.display  = 'none';
  document.querySelector('.page-info').style.display = 'none';

  var fallback = document.getElementById('driveFallback');
  fallback.style.display = 'flex';
  document.getElementById('driveFrame').src =
    'https://drive.google.com/file/d/' + fileId + '/preview';

  var errEl = document.getElementById('fallbackError');
  if (errEl && errMsg) errEl.textContent = '(' + errMsg + ')';
}

// ── Helpers ──
function setMsg(t) { loadingMsg.textContent = t; }
function setLoadProgress(pct) {
  if (loadProgressFill) loadProgressFill.style.width = Math.min(pct, 100) + '%';
}
function hideLoading() { loadingOverlay.style.display = 'none'; }
function showError(msg) {
  loadingOverlay.style.display = 'none';
  readerError.style.display = 'flex';
  document.getElementById('errorMsg').textContent = msg;
}

// Start
init();
