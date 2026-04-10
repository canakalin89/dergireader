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

// ── Page flip sounds (6 random variants) ──
var flipSounds = [];
(function preloadFlipSounds() {
  for (var i = 1; i <= 6; i++) {
    var a = new Audio('/sounds/flip' + i + '.mp3');
    a.preload = 'auto';
    a.volume = 0.4;
    flipSounds.push(a);
  }
})();
var lastFlipIdx = -1;
var soundEnabled = localStorage.getItem('dr_sound') !== 'off';
function playFlipSound() {
  if (!soundEnabled) return;
  try {
    var idx;
    do { idx = Math.floor(Math.random() * flipSounds.length); } while (idx === lastFlipIdx && flipSounds.length > 1);
    lastFlipIdx = idx;
    var s = flipSounds[idx];
    s.currentTime = 0;
    s.play().catch(function() {});
  } catch (e) { /* ses yoksa sessiz devam */ }
}
function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem('dr_sound', soundEnabled ? 'on' : 'off');
  var btn = document.getElementById('btnSound');
  if (btn) btn.textContent = soundEnabled ? '🔊' : '🔇';
}

// ── DOM ──
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingMsg     = document.getElementById('loadingMsg');
const loadProgressFill = document.getElementById('loadProgressFill');
const readerError    = document.getElementById('readerError');
const toolbarTitle   = document.getElementById('toolbarTitle');
const btnFirst       = document.getElementById('btnFirst');
const btnPrev        = document.getElementById('btnPrev');
const btnNext        = document.getElementById('btnNext');
const btnLast        = document.getElementById('btnLast');
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
  setMsg('Sayfalar arşivden çekiliyor…');
  setLoadProgress(10);

  const task = pdfjsLib.getDocument({
    url,
    cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
    cMapPacked: true,
    withCredentials: false,
  });

  var tips = [
    'Dergi raftan alınıyor…',
    'Kapak açılıyor…',
    'Sayfalar çevrilmeye hazırlanıyor…',
    'Okuma köşeniz hazırlanıyor…',
    'Neredeyse hazır, iyi okumalar…',
  ];
  var tipIdx = 0;

  task.onProgress = ({ loaded, total }) => {
    if (total > 0) {
      const pct = Math.min(Math.round((loaded / total) * 80) + 10, 90);
      setLoadProgress(pct);
      var newTip = Math.floor((loaded / total) * tips.length);
      if (newTip !== tipIdx && newTip < tips.length) {
        tipIdx = newTip;
        setMsg(tips[tipIdx]);
      }
    }
  };

  pdfDoc     = await task.promise;
  totalPages = pdfDoc.numPages;
  totalLabel.textContent = totalPages;

  setLoadProgress(92);
  setMsg('Keyifli okumalar! ' + totalPages + ' sayfa hazır');

  // Görüntüleme sayacını artır (fire & forget)
  if (magazineId) {
    fetch('/api/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: magazineId }),
    }).catch(() => {});
  }

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
    playFlipSound();
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

  // Annotation links overlay
  try {
    var annots = await page.getAnnotations({ intent: 'display' });
    if (annots && annots.length) {
      var linkLayer = document.createElement('div');
      linkLayer.className = 'pdf-link-layer';
      linkLayer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';

      // Container, canvas'ın CSS boyutuna eşit (%100). 
      // PDF rect orijinal koordinatlarda (bottom-left). Viewport scale ile çarpıp
      // sonra container boyutuna oranlarız.
      var pageHeight = vp.height / RENDER_SCALE;  // orijinal yükseklik
      var pageWidth  = vp.width  / RENDER_SCALE;

      annots.forEach(function(a) {
        var url = null;
        if (a.subtype === 'Link' && a.url) {
          url = a.url;
        } else if (a.subtype === 'Link' && a.unsafeUrl) {
          url = a.unsafeUrl;
        }
        if (!url || !a.rect) return;

        // rect: [x1, y1(bottom), x2, y2(top)] — bottom-left origin
        // yüzde olarak hesapla (container boyutuna bağımsız)
        var left   = (a.rect[0] / pageWidth * 100) + '%';
        var top    = ((pageHeight - a.rect[3]) / pageHeight * 100) + '%';
        var width  = ((a.rect[2] - a.rect[0]) / pageWidth * 100) + '%';
        var height = ((a.rect[3] - a.rect[1]) / pageHeight * 100) + '%';

        var link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'pdf-link-hit';
        link.style.cssText =
          'position:absolute;pointer-events:auto;cursor:pointer;' +
          'left:' + left + ';top:' + top + ';' +
          'width:' + width + ';height:' + height + ';' +
          'background:rgba(59,130,246,.08);border-radius:2px;' +
          'transition:background .2s;';
        link.title = url.length > 60 ? url.substring(0, 57) + '…' : url;

        link.addEventListener('mouseenter', function() { this.style.background = 'rgba(59,130,246,.2)'; });
        link.addEventListener('mouseleave', function() { this.style.background = 'rgba(59,130,246,.08)'; });
        link.addEventListener('click', function(ev) {
          ev.stopPropagation();  // Don't trigger page flip
        });

        linkLayer.appendChild(link);
      });

      if (linkLayer.children.length) {
        container.style.position = 'relative';
        container.appendChild(linkLayer);
      }
    }
  } catch(e) { /* annotation extraction failed — ignore */ }

  // QR code scanning
  scanQrCodes(canvas, container);
}

// ── QR Code Scanner ──
function scanQrCodes(canvas, container) {
  if (typeof jsQR !== 'function') return;
  try {
    var ctx = canvas.getContext('2d');
    var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var found = [];
    // Multi-pass: full image scan, then quadrant scans for small QR codes
    scanPass(imgData, canvas.width, canvas.height, 0, 0, found);
    // Quadrant scans (smaller region = better detection for small QRs)
    var hw = Math.floor(canvas.width / 2), hh = Math.floor(canvas.height / 2);
    for (var qy = 0; qy < 2; qy++) {
      for (var qx = 0; qx < 2; qx++) {
        var sx = qx * hw, sy = qy * hh;
        var qData = ctx.getImageData(sx, sy, hw, hh);
        scanPass(qData, hw, hh, sx, sy, found);
      }
    }

    if (!found.length) return;

    // Ensure link layer exists
    var linkLayer = container.querySelector('.pdf-link-layer');
    if (!linkLayer) {
      linkLayer = document.createElement('div');
      linkLayer.className = 'pdf-link-layer';
      linkLayer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
      container.style.position = 'relative';
      container.appendChild(linkLayer);
    }

    // Deduplicate by URL
    var seen = {};
    found.forEach(function(qr) {
      var key = qr.url + '|' + Math.round(qr.x / 20);
      if (seen[key]) return;
      seen[key] = true;

      var left   = (qr.x / canvas.width * 100) + '%';
      var top    = (qr.y / canvas.height * 100) + '%';
      var width  = (qr.w / canvas.width * 100) + '%';
      var height = (qr.h / canvas.height * 100) + '%';

      var link = document.createElement('a');
      link.href = qr.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'pdf-link-hit qr-hit';
      link.style.cssText =
        'position:absolute;pointer-events:auto;cursor:pointer;' +
        'left:' + left + ';top:' + top + ';' +
        'width:' + width + ';height:' + height + ';' +
        'background:rgba(16,185,129,.1);border:1.5px dashed rgba(16,185,129,.5);border-radius:4px;' +
        'transition:background .2s,border-color .2s;' +
        'display:flex;align-items:flex-end;justify-content:center;';
      link.title = '🔗 QR: ' + (qr.url.length > 50 ? qr.url.substring(0, 47) + '…' : qr.url);

      // Small QR badge
      var badge = document.createElement('span');
      badge.className = 'qr-badge';
      badge.textContent = 'QR';
      link.appendChild(badge);

      link.addEventListener('mouseenter', function() {
        this.style.background = 'rgba(16,185,129,.2)';
        this.style.borderColor = 'rgba(16,185,129,.8)';
      });
      link.addEventListener('mouseleave', function() {
        this.style.background = 'rgba(16,185,129,.1)';
        this.style.borderColor = 'rgba(16,185,129,.5)';
      });
      link.addEventListener('click', function(ev) { ev.stopPropagation(); });

      linkLayer.appendChild(link);
    });
  } catch(e) { /* QR scan failed — ignore */ }
}

function scanPass(imgData, w, h, offsetX, offsetY, results) {
  var code = jsQR(imgData.data, w, h, { inversionAttempts: 'dontInvert' });
  if (!code || !code.data) return;
  var url = code.data.trim();
  // Only treat as link if it looks like a URL
  if (!/^https?:\/\//i.test(url)) return;

  var loc = code.location;
  var x1 = Math.min(loc.topLeftCorner.x, loc.bottomLeftCorner.x) + offsetX;
  var y1 = Math.min(loc.topLeftCorner.y, loc.topRightCorner.y) + offsetY;
  var x2 = Math.max(loc.topRightCorner.x, loc.bottomRightCorner.x) + offsetX;
  var y2 = Math.max(loc.bottomLeftCorner.y, loc.bottomRightCorner.y) + offsetY;

  // Add padding around QR code
  var pad = Math.max((x2 - x1), (y2 - y1)) * 0.08;
  results.push({
    url: url,
    x: Math.max(0, x1 - pad),
    y: Math.max(0, y1 - pad),
    w: Math.min(x2 - x1 + pad * 2, w * 2),
    h: Math.min(y2 - y1 + pad * 2, h * 2)
  });
}

// ── Navigation ──
function updateNav() {
  const cp = pageFlip ? pageFlip.getCurrentPageIndex() : currentIndex;
  pageLabel.textContent = cp + 1;
  btnFirst.disabled = cp <= 0;
  btnPrev.disabled = cp <= 0;
  btnNext.disabled = cp >= totalPages - 1;
  btnLast.disabled = cp >= totalPages - 1;

  // Progress bar
  if (progressFill && totalPages > 1) {
    progressFill.style.width = (((cp + 1) / totalPages) * 100) + '%';
  }
}

btnFirst.addEventListener('click', function() { if (pageFlip) pageFlip.flip(0); });
btnPrev.addEventListener('click', function() { if (pageFlip) pageFlip.flipPrev(); });
btnNext.addEventListener('click', function() { if (pageFlip) pageFlip.flipNext(); });
btnLast.addEventListener('click', function() { if (pageFlip) pageFlip.flip(totalPages - 1); });

// Mobile tap zones
document.getElementById('navLeft').addEventListener('click', function() {
  if (pageFlip) pageFlip.flipPrev();
});
document.getElementById('navRight').addEventListener('click', function() {
  if (pageFlip) pageFlip.flipNext();
});

// ── Swipe gesture (tüm sahne alanında) ──
(function initSwipe() {
  var startX = 0, startY = 0, tracking = false;
  var THRESHOLD = 50;

  scene.addEventListener('touchstart', function(e) {
    if (e.touches.length !== 1) return;
    // Don't interfere with PDF link/QR taps
    if (e.target.closest && e.target.closest('.pdf-link-hit')) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });

  scene.addEventListener('touchend', function(e) {
    if (!tracking || !pageFlip) return;
    // Don't interfere with PDF link/QR taps
    if (e.target.closest && e.target.closest('.pdf-link-hit')) { tracking = false; return; }
    tracking = false;
    var dx = e.changedTouches[0].clientX - startX;
    var dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) < THRESHOLD || Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0) pageFlip.flipNext();
    else pageFlip.flipPrev();
  }, { passive: true });
})();

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
    case 's': case 'S':
      toggleSound();
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

// ── Sound toggle ──
var btnSound = document.getElementById('btnSound');
if (btnSound) {
  btnSound.textContent = soundEnabled ? '🔊' : '🔇';
  btnSound.addEventListener('click', toggleSound);
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
