const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Gerçek hesaplara, Google'a veya Blob deposuna bağlanmadan üretim kodunu çalıştırır.
function loadModule(file, dependencies, globals = {}) {
  const module = { exports: {} };
  const context = vm.createContext({
    module,
    exports: module.exports,
    require(name) {
      if (!(name in dependencies)) throw new Error(`Beklenmeyen bağımlılık: ${name}`);
      return dependencies[name];
    },
    console: { log() {}, error() {} },
    process: { env: {
      OWNER_EMAIL: 'owner@example.test',
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_REDIRECT_URI: 'https://site.example.test/api/auth/callback',
    } },
    setTimeout: callback => { callback(); },
    URLSearchParams,
    URL,
    ...globals,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
  return module.exports;
}

const clone = value => JSON.parse(JSON.stringify(value));
const users = [
  { id: 'google:owner', email: 'owner@example.test', name: 'Owner', provider: 'google', role: 'owner', createdAt: '2026-01-01' },
  { id: 'google:editor', email: 'editor@example.test', name: 'Editor', provider: 'google', role: 'editor', createdAt: '2026-01-02' },
  { id: 'local-account', email: 'local@example.test', provider: 'local', role: 'admin', passwordHash: 'synthetic-test-hash' },
];

function createStore({ failure = null, empty = false } = {}) {
  const data = new Map(empty ? [] : [
    ['data/users.json', clone(users)],
    ['data/magazines.json', [{ id: 'mag-1' }, { id: 'mag-2' }]],
    ['data/categories.json', [{ id: 'cat-1' }]],
    ['data/views.json', { 'mag-1': 12, 'mag-2': 7 }],
  ]);
  const writes = [];
  const blob = {
    async list({ prefix }) {
      if (failure === 'list') throw new Error('Depo erişilemiyor');
      return { blobs: data.has(prefix) ? [{ url: `https://blob.example.test/${prefix}` }] : [] };
    },
    async put(key, body, options) {
      writes.push({ key, options });
      // Blob SDK v2, mevcut dosya için açık üzerine yazma izni ister.
      if (data.has(key) && options.allowOverwrite !== true) throw new Error('This blob already exists');
      data.set(key, options.contentType === 'application/json' ? JSON.parse(body) : body);
      return { url: `https://blob.example.test/${key}` };
    },
    async del() { throw new Error('Test sırasında silme beklenmiyor'); },
  };
  const store = loadModule('api/_lib/store.js', { '@vercel/blob': blob }, {
    async fetch(url) {
      if (failure === 'http') return { ok: false, status: 503 };
      const key = new URL(url).pathname.slice(1);
      return { ok: true, json: async () => clone(data.get(key)) };
    },
  });
  return { store, data, writes };
}

for (const [name, key, update] of [
  ['saveUsers', 'data/users.json', [...users, { id: 'new', role: 'pending' }]],
  ['saveMagazines', 'data/magazines.json', [{ id: 'mag-1' }, { id: 'mag-2' }, { id: 'mag-3' }]],
  ['saveCategories', 'data/categories.json', [{ id: 'cat-1' }, { id: 'cat-2' }]],
]) {
  test(`${name}: mevcut JSON dosyası güncellenebilir`, async () => {
    const { store, data } = createStore();
    await store[name](update);
    assert.deepEqual(data.get(key), update);
  });
}

test('Sayaç güncellenirken diğer derginin sayacı korunur', async () => {
  const { store, data } = createStore();
  assert.equal(await store.incrementView('mag-1'), 13);
  assert.deepEqual(data.get('data/views.json'), { 'mag-1': 13, 'mag-2': 7 });
});

for (const name of ['getUsers', 'getMagazines', 'getCategories', 'getViews']) {
  test(`${name}: okuma hatası boş veri olarak gizlenmez`, async () => {
    for (const failure of ['list', 'http']) {
      const { store } = createStore({ failure });
      await assert.rejects(store[name](), /Depo erişilemiyor|Blob okuma hatası: 503/);
    }
  });
}

function callbackHarness(store, account) {
  const signed = [];
  const handler = loadModule('api/auth/callback.js', {
    '../_lib/store': store,
    '../_lib/auth': { requireJwtSecret: () => 'test-only-secret' },
    jsonwebtoken: { sign(payload) { signed.push(clone(payload)); return 'test-only-token'; } },
  }, {
    async fetch(url, options) {
      if (url === 'https://oauth2.googleapis.com/token') {
        assert.equal(options.body.get('redirect_uri'), 'https://site.example.test/api/auth/callback');
        return { ok: true, json: async () => ({ access_token: 'test-only-access-token' }) };
      }
      assert.equal(url, 'https://www.googleapis.com/oauth2/v2/userinfo');
      return { ok: true, json: async () => ({ id: account.id.slice(7), email: account.email, name: 'Yeni Ad' }) };
    },
  });
  const req = {
    query: { code: 'test-code', state: 'test-state' },
    headers: { cookie: 'google_oauth_state=test-state', host: 'localhost:3000', 'x-forwarded-proto': 'https' },
  };
  const res = { redirect(status, url) { this.status = status; this.url = url; } };
  return { handler, req, res, signed };
}

for (const account of users.slice(0, 2)) {
  test(`Google girişi: mevcut ${account.role} hesabı ve diğer hesaplar korunur`, async () => {
    const { store, data } = createStore();
    const { handler, req, res, signed } = callbackHarness(store, account);
    await handler(req, res);
    assert.equal(res.url, '/admin/?token=test-only-token');
    assert.equal(signed[0].id, account.id);
    assert.equal(signed[0].role, account.role);
    const saved = data.get('data/users.json');
    assert.equal(saved.length, users.length);
    assert.deepEqual(saved.filter(u => u.id !== account.id), users.filter(u => u.id !== account.id));
    assert.equal(saved.find(u => u.id === account.id).createdAt, account.createdAt);
  });
}

test('Kullanıcılar okunamazsa Google girişi hiçbir kaydı yazmaz veya sıfırlamaz', async () => {
  const { store, data, writes } = createStore({ failure: 'http' });
  const { handler, req, res, signed } = callbackHarness(store, users[0]);
  await handler(req, res);
  assert.equal(res.url, '/admin/?auth_error=1');
  assert.equal(writes.length, 0);
  assert.equal(signed.length, 0);
  assert.deepEqual(data.get('data/users.json'), users);
});

test('Sayaçlar okunamazsa mevcut sayaçlar üzerine yazılmaz', async () => {
  const { store, data, writes } = createStore({ failure: 'http' });
  await assert.rejects(store.incrementView('mag-1'), /Blob okuma hatası: 503/);
  assert.equal(writes.length, 0);
  assert.deepEqual(data.get('data/views.json'), { 'mag-1': 12, 'mag-2': 7 });
});

test('Gerçekten boş depoda ilk kayıt oluşturulabilir', async () => {
  const { store, data } = createStore({ empty: true });
  assert.deepEqual(clone(await store.getUsers()), []);
  await store.saveUsers([users[0]]);
  assert.deepEqual(data.get('data/users.json'), [users[0]]);
});

test('PDF ve kapak yüklemeleri ayrı dosya oluşturmaya devam eder', async () => {
  const { store, writes } = createStore();
  await store.uploadFile('test-pdf', 'test.pdf', 'application/pdf');
  assert.equal(writes[0].options.addRandomSuffix, true);
  assert.notEqual(writes[0].options.allowOverwrite, true);
});

test('Google başlangıcı önce kayıtlı alana geçer ve state çerezini o alanda oluşturur', async () => {
  const handler = loadModule('api/auth/google.js', { crypto: require('node:crypto') });
  const res = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    redirect(status, url) { this.status = status; this.url = url; },
  };
  await handler({ method: 'GET', headers: { host: 'localhost:3000', 'x-forwarded-proto': 'https' } }, res);
  assert.equal(res.url, 'https://site.example.test/api/auth/google');
  assert.equal(res.headers['Set-Cookie'], undefined);
  await handler({ method: 'GET', headers: { host: 'localhost:3000', 'x-forwarded-host': 'site.example.test', 'x-forwarded-proto': 'https' } }, res);
  const params = new URL(res.url).searchParams;
  assert.equal(params.get('redirect_uri'), 'https://site.example.test/api/auth/callback');
  assert.ok(params.get('state'));
  assert.ok(res.headers['Set-Cookie'].includes(`google_oauth_state=${params.get('state')};`));
  assert.ok(res.headers['Set-Cookie'].includes('HttpOnly'));
});

test('Google dönüş adresi yoksa localhost adresi uydurulmaz', async () => {
  const handler = loadModule('api/auth/google.js', { crypto: require('node:crypto') }, {
    process: { env: { GOOGLE_CLIENT_ID: 'test-client-id' } },
  });
  const res = {
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; },
    setHeader() {},
    redirect() { assert.fail('Eksik ayarla Google yönlendirmesi yapılmamalı'); },
  };
  await handler({ method: 'GET', headers: { host: 'localhost:3000' } }, res);
  assert.equal(res.code, 500);
});

test('Geçersiz Google dönüş adresiyle yönlendirme yapılmaz', async () => {
  for (const redirectUri of ['geçersiz-adres', 'javascript:alert(1)']) {
    const handler = loadModule('api/auth/google.js', { crypto: require('node:crypto') }, {
      process: { env: { GOOGLE_CLIENT_ID: 'test-client-id', GOOGLE_REDIRECT_URI: redirectUri } },
    });
    const res = {
      status(code) { this.code = code; return this; },
      json(body) { this.body = body; },
      setHeader() { assert.fail('Geçersiz ayarda çerez oluşturulmamalı'); },
      redirect() { assert.fail('Geçersiz ayarda yönlendirme yapılmamalı'); },
    };
    await handler({ method: 'GET', headers: { host: 'site.example.test' } }, res);
    assert.equal(res.code, 500);
  }
});

test('Google state kontrolü korunur; eşleşmeyen istekte hesaplara dokunulmaz', async () => {
  const { store, writes } = createStore();
  const { handler, req, res, signed } = callbackHarness(store, users[0]);
  req.query.state = 'different-state';
  await handler(req, res);
  assert.equal(res.url, '/admin/?auth_error=1');
  assert.equal(writes.length, 0);
  assert.equal(signed.length, 0);
});
