const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Panelin gerçek olay işleyicilerini ağ ve hesap erişimi olmadan çalıştırır.
function panel(fetch) {
  function element() {
    const classes = new Set();
    return {
      children: [], dataset: {}, style: {}, value: '', disabled: false,
      textContent: '', listeners: {}, resets: 0,
      classList: {
        add: name => classes.add(name), remove: name => classes.delete(name),
        contains: name => classes.has(name), toggle() {},
      },
      set innerHTML(value) { this.html = value; this.children = []; },
      get innerHTML() { return this.html || ''; },
      addEventListener(name, handler) { this.listeners[name] = handler; },
      appendChild(child) { this.insertBefore(child, null); },
      insertBefore(child, next) {
        child.parent = this;
        const index = next ? this.children.indexOf(next) : this.children.length;
        this.children.splice(index, 0, child);
      },
      remove() {
        const siblings = this.parent.children;
        siblings.splice(siblings.indexOf(this), 1);
      },
      querySelector(selector) {
        assert.equal(selector, '.mag-item');
        return this.children.find(child => child.className === 'mag-item') || null;
      },
      querySelectorAll() { return []; },
      reset() { this.resets++; },
    };
  }
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  const calls = [];
  const context = vm.createContext({
    document: { getElementById: get, createElement: element, querySelectorAll: () => [] },
    window: { location: { search: '' } }, localStorage: { getItem: () => null, removeItem() {} },
    URL, URLSearchParams, console: { error() {} },
    setTimeout: () => 1, clearTimeout() {},
    fetch: async (url, options = {}) => {
      calls.push({ url, method: options.method || 'GET', body: options.body });
      return fetch(url, options);
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/admin.js'), 'utf8'), context);
  vm.runInContext("currentUser = { role: 'editor' }; authToken = 'test-only';", context);
  get('inTitle').value = 'Yeni dergi';
  get('inPdfUrl').value = 'https://example.test/dergi.pdf';
  return {
    get, calls, context,
    submit: () => get('uploadForm').listeners.submit({ preventDefault() {}, target: get('uploadForm') }),
    seed(magazines) {
      context.seed = magazines;
      vm.runInContext('allMagazines = seed.slice(); renderList(allMagazines);', context);
    },
    ids: () => get('magazineList').children.map(child => child.dataset.id),
    saved: () => JSON.parse(vm.runInContext('JSON.stringify(allMagazines)', context)),
  };
}

const magazine = (id, date) => ({ id, title: id, publishedAt: date, pdfUrl: 'https://example.test/file.pdf' });
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

for (const [date, expected] of [
  ['2026-09-05', ['new', 'old']],
  ['2025-01-01', ['old', 'new']],
]) {
  test(`Ekleme tek POST ile tamamlanır, tarih sırası ve mevcut kart korunur (${date})`, async () => {
    const saved = { ...magazine('new', date), title: '<Yeni>', coverUrl: 'https://example.test/cover.jpg' };
    const p = panel(() => response(saved, 201));
    p.seed([magazine('old', '2026-01-01')]);
    const oldCard = p.get('magazineList').children[0];
    await p.submit();
    assert.deepEqual(p.calls.map(call => [call.url, call.method]), [['/api/magazines', 'POST']]);
    assert.deepEqual(p.ids(), expected);
    assert.equal(p.get('magazineList').children.find(item => item.dataset.id === 'old'), oldCard);
    const newCard = p.get('magazineList').children.find(item => item.dataset.id === 'new');
    assert.match(newCard.innerHTML, /&lt;Yeni&gt;/);
    assert.match(newCard.innerHTML, /cover\.jpg/);
    assert.equal(p.get('listCount').textContent, '2 dergi');
    assert.equal(p.get('uploadForm').resets, 1);
    assert.equal(p.get('submitBtn').disabled, false);
    assert.equal(p.get('loadingOverlay').classList.contains('active'), false);
    assert.deepEqual(p.saved().find(mag => mag.id === 'new'), saved);
  });
}

test('Boş listeye ekleme boş durum mesajını kaldırır', async () => {
  const p = panel(() => response(magazine('first', '2026-09-05'), 201));
  p.seed([]);
  await p.submit();
  assert.deepEqual(p.ids(), ['first']);
  assert.equal(p.get('magazineList').innerHTML, '');
  assert.equal(p.get('listCount').textContent, '1 dergi');
});

for (const status of [401, 403, 500]) {
  test(`Başarısız kayıt (${status}) listeyi ve formu değiştirmez`, async () => {
    const p = panel(() => response({ message: 'Kayıt başarısız' }, status));
    p.seed([magazine('old', '2026-01-01')]);
    await p.submit();
    assert.deepEqual(p.ids(), ['old']);
    assert.equal(p.get('uploadForm').resets, 0);
    assert.equal(p.get('submitBtn').disabled, false);
    assert.equal(p.get('loadingOverlay').classList.contains('active'), false);
    assert.equal(p.calls.length, 1);
  });
}

test('Sunucu onayı beklenir ve beklerken ikinci gönderim yapılmaz', async () => {
  const pending = deferred();
  const p = panel(() => pending.promise);
  p.seed([]);
  const first = p.submit();
  await p.submit();
  assert.equal(p.calls.length, 1);
  assert.deepEqual(p.ids(), []);
  assert.equal(p.get('submitBtn').disabled, true);
  pending.resolve(response(magazine('new', '2026-09-05'), 201));
  await first;
  assert.deepEqual(p.ids(), ['new']);
});

for (const listStatus of [200, 500]) {
  test(`İlk liste geç dönerse yeni kayıt kaybolmaz (${listStatus})`, async () => {
    const pending = deferred();
    const saved = magazine('new', '2026-09-05');
    const p = panel((url, options) => options.method === 'POST' ? response(saved, 201) : pending.promise);
    const loading = p.context.loadMagazines();
    await p.submit();
    assert.deepEqual(p.ids(), ['new']);
    pending.resolve(response([magazine('old', '2026-01-01')], listStatus));
    await loading;
    assert.deepEqual(p.ids(), listStatus === 200 ? ['new', 'old'] : ['new']);
    assert.equal(p.saved().filter(mag => mag.id === 'new').length, 1);
    assert.equal(p.calls.length, 2);
  });
}

test('Ağ hatasında form tekrar kullanılabilir ve sahte başarı gösterilmez', async () => {
  const p = panel(() => { throw new Error('Bağlantı kesildi'); });
  p.seed([]);
  await p.submit();
  assert.deepEqual(p.ids(), []);
  assert.equal(p.get('uploadForm').resets, 0);
  assert.match(p.get('toast').textContent, /Bağlantı kesildi/);
  assert.equal(p.get('submitBtn').disabled, false);
  assert.equal(p.get('loadingOverlay').classList.contains('active'), false);
});
