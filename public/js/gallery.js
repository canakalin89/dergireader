/* ============================================
   gallery.js — Dergi Galerisi
   ============================================ */

const API = '/api/magazines';

let allMagazines = [];
let newestMagId  = null;

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

// ---- Renk paleti ----
const PALETTES = [
  { bg: 'linear-gradient(145deg, #1a3a5c, #2d6aa0)', ac: '#4da6e8' },
  { bg: 'linear-gradient(145deg, #2d1b4e, #6b3fa0)', ac: '#a87de8' },
  { bg: 'linear-gradient(145deg, #1b3d2f, #2d8a5e)', ac: '#4de8a0' },
  { bg: 'linear-gradient(145deg, #5c1a2a, #a03d5a)', ac: '#e84d7a' },
  { bg: 'linear-gradient(145deg, #3d2d1b, #8a6a2d)', ac: '#e8b84d' },
  { bg: 'linear-gradient(145deg, #1b3d3d, #2d8a8a)', ac: '#4de8e8' },
  { bg: 'linear-gradient(145deg, #3d1b2d, #8a2d6a)', ac: '#e84dc0' },
  { bg: 'linear-gradient(145deg, #1b2d3d, #2d5c8a)', ac: '#4d8ae8' },
];

let viewsData = {};

// ---- Veri yükleme ----
async function loadMagazines() {
  try {
    const [magRes, viewsRes] = await Promise.all([
      fetch(API),
      fetch('/api/views').catch(() => null),
    ]);
    if (!magRes.ok) throw new Error('API hatası');
    allMagazines = await magRes.json();
    if (viewsRes && viewsRes.ok) {
      viewsData = await viewsRes.json().catch(() => ({}));
    }
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
    document.getElementById('statYears').textContent = years[0] + '–' + years[years.length - 1];
  } else if (years.length === 1) {
    document.getElementById('statYears').textContent = String(years[0]);
  } else {
    document.getElementById('statYears').textContent = '—';
  }
  var statsBar = document.getElementById('statsBar');
  var spans = statsBar.querySelectorAll('span');
  if (spans[2]) spans[2].textContent = '📖 ' + magazines.length + ' yayın arşivde';
}

// ---- Yıl filtresi ----
function populateYearFilter(magazines) {
  var sel = document.getElementById('filterYear');
  var years = [...new Set(magazines.map(m =>
    m.date ? m.date.substring(0, 4) : (m.year ? String(m.year) : null)
  ).filter(Boolean))].sort((a, b) => b - a);
  years.forEach(y => {
    var opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    sel.appendChild(opt);
  });
}

// ---- Galeri render ----
function renderGallery(magazines) {
  var grid = document.getElementById('galleryGrid');
  grid.innerHTML = '';

  if (!magazines.length) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div>' +
      '<h3>Henüz dergi eklenmedi</h3><p>İlk dergi admin panelinden yüklenebilir.</p></div>';
    return;
  }

  magazines.forEach(function (mag, idx) {
    var isNew = mag.id === newestMagId;
    var card = document.createElement('a');
    card.className = 'magazine-card';
    card.href = '/reader.html?id=' + encodeURIComponent(mag.id);
    card.setAttribute('aria-label', mag.title + ' — Sayı ' + mag.issue);

    var badge = isNew ? '<span class="badge-new">YENİ</span>' : '';
    var magYear = mag.date ? mag.date.substring(0, 4) : (mag.year || '');
    var issueStr = mag.issue ? 'Sayı ' + mag.issue : '';
    var pal = PALETTES[idx % PALETTES.length];

    // Kapak: coverUrl (harici resim) varsa onu göster, yoksa stilize kapak
    var inner;
    if (mag.coverUrl && !mag.coverUrl.includes('drive.google.com/thumbnail')) {
      inner = '<img src="' + escHtml(mag.coverUrl) + '" alt="' + escHtml(mag.title) + '" loading="lazy">';
    } else {
      inner =
        '<div class="cover-styled" style="background:' + pal.bg + '">' +
          '<div class="cover-deco" style="border-color:' + pal.ac + '"></div>' +
          '<div class="cover-body">' +
            '<span class="cover-icon">📖</span>' +
            '<span class="cover-title">' + escHtml(mag.title) + '</span>' +
            (issueStr ? '<span class="cover-issue" style="border-color:' + pal.ac + '">' + escHtml(issueStr) + '</span>' : '') +
            (magYear  ? '<span class="cover-year">' + escHtml(magYear) + '</span>' : '') +
          '</div>' +
          '<div class="cover-stripe" style="background:' + pal.ac + '"></div>' +
        '</div>';
    }

    var meta = [];
    if (mag.issue) meta.push('<span>Sayı ' + mag.issue + '</span>');
    if (mag.date) {
      meta.push('<span class="' + (meta.length ? 'dot' : '') + '">' +
        new Date(mag.date).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long' }) + '</span>');
    } else if (mag.year) {
      meta.push('<span class="' + (meta.length ? 'dot' : '') + '">' + mag.year + '</span>');
    }
    var vCount = viewsData[mag.id] || 0;
    var viewBadge = '<span class="view-count' + (meta.length ? ' dot' : '') + '" title="Görüntülenme">👁 ' + formatViews(vCount) + '</span>';

    card.innerHTML =
      '<div class="card-cover">' + inner + badge + '</div>' +
      '<div class="card-info">' +
        '<div class="card-title">' + escHtml(mag.title) + '</div>' +
        (mag.description ? '<div class="card-desc">' + escHtml(mag.description) + '</div>' : '') +
        '<div class="card-meta">' + meta.join('') + viewBadge + '</div>' +
      '</div>';

    grid.appendChild(card);
  });
}

// ---- Filtre ----
function applyFilters() {
  var year = document.getElementById('filterYear').value;
  var filtered = allMagazines.filter(function (m) {
    var my = m.date ? m.date.substring(0, 4) : (m.year ? String(m.year) : null);
    return !year || my === year;
  });
  renderGallery(filtered);
}

document.getElementById('filterYear').addEventListener('change', applyFilters);
document.getElementById('filterReset').addEventListener('click', function () {
  document.getElementById('filterYear').value = '';
  renderGallery(allMagazines);
});

// ---- Yardımcı ----
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatViews(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'b';
  return String(n);
}

// Başlat
loadMagazines();
