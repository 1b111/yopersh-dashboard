// Opens the dashboard from a local folder in headless Chrome with a pretend
// database and a pretend `safeboda` function, then runs a scenario and saves
// screenshots. Nothing reaches Firebase or SafeBoda.
//   node preview.js <dashboardDir> <outDir> <scenario> [width] [height]
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const root = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);
const scenario = process.argv[4] || 'settings';
const W = +(process.argv[5] || 1440);
const H = +(process.argv[6] || 900);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let REAL = false;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

const SEED = {
  Shoppers: {
    branches: { 1: { name: 'Uganda', active: true }, 2: { name: 'Kenya', active: true }, 3: { name: 'Dubai', active: true } },
    Users: { preview: { fullName: 'Amina Nakato', password: 'preview-pass', role: 'principal' } },
    settings: {
      company: { name: 'Your Personal Shopper', address: 'Kampala, Uganda', phone: '+256 700 000 000', email: 'info@example.com', logo: 'icon.jpeg' },
      messaging: { smsEnabled: true, smsWithCode: true, whatsappEnabled: true, whatsappWithCode: false },
      rates: { types: [{ name: 'weight', rate: 12000 }, { name: 'perfumes', rate: 5000 }] },
      safeboda: {
        appKey: 'preview-app-key',
        environment: 'staging',
        environments: { 1: 'production' },
        origins: { 1: { lat: 0.34, lng: 32.587553, address: 'Kampala', name: 'Uganda', phone: '0700123456' } },
      },
    },
  },
};

// The pretend function, run inside the page. Keeps its own state so saving
// and switching behave like the real thing.
function installMocks(seed, variant) {
  window.__STUB_DATA = seed;
  if (variant.slowYear) window.__STUB_DELAY = function (path) { return /annual|yearly/.test(path) ? variant.slowYear : 0; };
  if (variant.cachedStats) { try { localStorage.setItem('yps_stats_cache', JSON.stringify(variant.cachedStats)); } catch (e) {} }
  // The dashboard's service worker reloads the page once when it takes over
  // on a first visit, which would cut a scenario in half. No worker here.
  try {
    ServiceWorkerContainer.prototype.register = function () { return Promise.reject(new Error('no service worker in previews')); };
  } catch (e) {}
  try {
    sessionStorage.setItem('currentUser', 'preview');
    sessionStorage.setItem('currentUserRole', variant.role || 'principal');
    sessionStorage.setItem('currentUserName', 'Amina Nakato');
    sessionStorage.setItem('currentBranchId', String(variant.branch || 1));
  } catch (e) {}
  if (variant.big) {
    // A made-up year the size of the real one, built in the page. Every package
    // has a life: into the store, then (most) dispatched, then picked up or
    // delivered, each step filed under its own day the way the apps file them.
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dayKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const localIso = (d) => dayKey(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '.123456';
    const year = now.getFullYear();
    const today = dayKey(now);
    const month = today.slice(0, 7);
    const first = ['Amina', 'Brian', 'Catherine', 'David', 'Esther', 'Fahad', 'Grace', 'Hassan', 'Irene', 'Joseph', 'Kevin', 'Lydia', 'Moses', 'Nakato', 'Okello', 'Patience'];
    const last = ['Namukasa', 'Okello', 'Ssemanda', 'Nabirye', 'Mugisha', 'Achieng', 'Kato', 'Nansubuga', 'Byaruhanga', 'Auma'];
    const staff = ['ggubya', 'monica', 'esther', 'baker'];
    const riders = [];
    const S = seed.Shoppers;
    S.Riders = {};
    for (let i = 0; i < 12; i++) {
      const c = '2567' + String(81000000 + i * 7919);
      riders.push('+' + c);
      S.Riders[c] = { fullName: first[i] + ' ' + last[i % 10], contact: '+' + c };
    }
    const B = variant.big;
    const id = (i) => 'PK' + String(i + 1).padStart(6, '0');
    const put = (root, list, key, pid, rec) => { const a = (root[list] = root[list] || {}); (a[key] = a[key] || {})[pid] = rec; };
    S.packages = { yearly: {}, monthly: {}, daily: {}, weekly: {} };
    S.dispatch_events = { annual: {}, monthly: {}, daily: {} };
    S.pickups = { annual: {}, monthly: {}, daily: {} };
    S.deliveries = { annual: {}, monthly: {}, daily: {} };
    const span = Math.max(1, Math.floor((now - new Date(year, 1, 1)) / 86400000) - 3); // days since 1 Feb
    for (let i = 0; i < B.packages; i++) {
      const pid = id(i);
      const cust = i % 400;
      const inStore = new Date(year, 1, 1 + (i * 37) % span, 9, 30 + (i % 25), 0);
      const rec = {
        packageId: pid, customerName: first[cust % 16] + ' ' + last[(cust * 7) % 10], customerPhone: '07' + String(10000000 + cust * 7919),
        company: ['SHEIN', 'Temu', 'Amazon', 'AliExpress'][i % 4], date: dayKey(inStore), timestamp: localIso(inStore),
        numberOfItems: 1 + (i % 6), missingItemsCount: i % 9 === 0 ? 1 : 0, staff_id: staff[i % 4],
        sofdasOrderId: 14000 + i, amountPaid: 20000 + (i % 30) * 1000, balance: i % 5 === 0 ? 5000 : 0, status: 'in_store',
        orderDate: dayKey(new Date(inStore.getTime() - 6 * 86400000)), trackingNumber: 'TRK' + (900000 + i),
        notes: 'Handle with care, call before delivery', branchId: 1,
      };
      put(S.packages, 'yearly', String(year), pid, rec);
      if (i >= B.dispatch) continue;
      // dispatched one to four days later; early in the year the record kept the store's timestamp
      const out = new Date(inStore.getTime() + (1 + (i % 4)) * 86400000 + 3600000);
      if (out > now) continue;
      const early = out.getMonth() < 5;
      const disp = Object.assign({}, rec, { status: 'out_for_delivery', releasedBy: staff[(i + 1) % 4], releasedByRole: 'sub_admin', staff_id: staff[(i + 1) % 4] }, early ? {} : { timestamp: out.getTime() });
      put(S.dispatch_events, 'annual', String(year), pid, disp);
      put(S.dispatch_events, 'daily', dayKey(out), pid, disp);
      const done = new Date(out.getTime() + (i % 20) * 86400000 + 2 * 3600000 + (i % 50) * 60000);
      if (done > now) continue;
      if (i < B.pickups) {
        // picked up: the app files the dispatch record as it is (no time of pickup); the dashboard stamps completedAt
        const dash = i % 6 === 0;
        const pk = Object.assign({}, rec, { status: 'out_for_delivery', pickedUpBy: staff[(i + 2) % 4], pickedUpByRole: 'sub_admin', staff_id: staff[(i + 2) % 4] },
          dash ? { date: dayKey(done), timestamp: done.toISOString(), completedAt: done.toISOString(), completedBy: 'Esther', handlerName: 'Esther', handlerRole: 'super_admin', pickedUpBy: undefined } : {});
        if (dash) delete pk.pickedUpBy;
        put(S.pickups, 'annual', String(year), pid, pk);
        if (i % 251 !== 3) put(S.pickups, 'daily', dayKey(done), pid, pk); // a few were never filed under a day
        if (dayKey(done).slice(0, 7) === month) put(S.pickups, 'monthly', month, pid, pk);
      } else if (i < B.pickups + B.deliveries) {
        const j = i - B.pickups;
        const given = new Date(done.getTime() - 3 * 3600000);
        let dv;
        if (j % 37 === 0) {
          const phone = '+2567' + String(50000000 + j);
          dv = Object.assign({}, rec, { status: 'delivered', deliveryProvider: 'safeboda', deliveryBoyName: first[(j * 3) % 16] + ' ' + last[(j * 5) % 10], riderContact: phone, deliveryBoyPhone: phone, deliveredBy: phone, bikePlate: 'UF' + String.fromCharCode(65 + (j % 26)) + ' ' + (100 + (j % 900)) + 'X', deliveredAt: done.toISOString(), safebodaTrackingId: 'trip-' + j, scannedBy: 'safeboda', scannedByRole: 'provider' });
        } else if (j % 11 === 0) {
          dv = Object.assign({}, rec, { status: 'delivery', date: dayKey(done), timestamp: done.toISOString(), completedAt: done.toISOString(), handlerRole: 'super_admin', handlerName: 'Esther', completedBy: 'Esther' });
        } else if (done.getMonth() < 5) {
          // early in the year the rider app did not record when it delivered
          dv = Object.assign({}, rec, { status: 'in_transit' });
        } else {
          const r = riders[j % 12];
          dv = Object.assign({}, rec, { status: 'in_transit', riderContact: r, deliveryBoyPhone: r, deliveryBoyName: r, deliveredBy: r, assignedAt: localIso(given), deliveredAt: localIso(done) });
        }
        put(S.deliveries, 'annual', String(year), pid, dv);
        put(S.deliveries, 'daily', dayKey(done), pid, dv);
        if (dayKey(done).slice(0, 7) === month) put(S.deliveries, 'monthly', month, pid, dv);
      }
    }
    // today: a pickup by the app (no time on it) and a delivery by a rider
    const t1 = id(B.packages + 1), t2 = id(B.packages + 2);
    const base = { customerName: 'Grace Kato', customerPhone: '0700111222', company: 'SHEIN', date: dayKey(new Date(now.getTime() - 4 * 86400000)), timestamp: localIso(new Date(now.getTime() - 4 * 86400000)), numberOfItems: 2, staff_id: 'monica', sofdasOrderId: 99001, balance: 0, amountPaid: 30000 };
    put(S.pickups, 'daily', today, t1, Object.assign({ packageId: t1, pickedUpBy: 'baker', status: 'out_for_delivery' }, base));
    put(S.deliveries, 'daily', today, t2, Object.assign({ packageId: t2, riderContact: riders[0], deliveryBoyPhone: riders[0], deliveryBoyName: riders[0], deliveredAt: localIso(now), assignedAt: localIso(new Date(now.getTime() - 3600000)), status: 'in_transit' }, base));
    for (let i = 0; i < 180; i++) { const k = id(B.packages + 10 + i); S.packages[k] = { packageId: k, customerName: first[i % 16] + ' ' + last[i % 10], customerPhone: '0701' + String(100000 + i), company: 'Temu', date: today, timestamp: localIso(now), numberOfItems: 1 + (i % 3), staff_id: staff[i % 4], sofdasOrderId: 80000 + i, balance: 0 }; }
    // on the road: two with one of our riders, three with SafeBoda (one trip accepted, one still finding a rider)
    const road = (n, extra) => Object.assign({ packageId: id(B.packages + 300 + n), customerName: first[n % 16] + ' ' + last[n % 10], customerPhone: '0702' + String(200000 + n), company: 'Amazon', date: today, numberOfItems: 1 + n, staff_id: 'ggubya', sofdasOrderId: 70000 + n, balance: 0, status: 'in_transit', assignedAt: localIso(new Date(now.getTime() - 40 * 60000)) }, extra);
    S.transit = {};
    S.transit[riders[0]] = { [id(B.packages + 300)]: road(0, {}), [id(B.packages + 301)]: road(1, {}) };
    const drv = { name: 'Peter Okello', phoneNumber: '+256700900000', vehicle: { type: 'bike', sbNumber: 'UFB 204K' } };
    S.transit.safeboda = {
      [id(B.packages + 302)]: road(2, { deliveryProvider: 'safeboda', safebodaTrackingId: 'trip-live-1', transitGroupId: 'SB1', deliveryBoyName: 'Peter Okello', deliveryBoyPhone: '+256700900000', bikePlate: 'UFB 204K', safebodaDriver: drv, riderAcceptedAt: new Date(now.getTime() - 20 * 60000).toISOString() }),
      [id(B.packages + 303)]: road(3, { deliveryProvider: 'safeboda', safebodaTrackingId: 'trip-live-1', transitGroupId: 'SB1', deliveryBoyName: 'Peter Okello', deliveryBoyPhone: '+256700900000', bikePlate: 'UFB 204K', safebodaDriver: drv, riderAcceptedAt: new Date(now.getTime() - 20 * 60000).toISOString() }),
      [id(B.packages + 304)]: road(4, { deliveryProvider: 'safeboda', safebodaTrackingId: 'trip-live-2', transitGroupId: 'SB2', deliveryBoyName: 'SafeBoda rider (finding rider)', deliveryBoyPhone: 'safeboda' }),
    };
  }
  const GOOD = { production: { 1: 'ug-live-key-93b2', 2: 'ke-live-key-7001' }, staging: { 2: 'ke-test-key-5001' } };
  const state = {
    env: { 1: 'production', 2: 'staging', 3: 'staging' },
    saved: { 1: {}, 2: {}, 3: {} },
    calls: [],
  };
  if (variant.kenyaLive) {
    state.env[2] = 'production';
    state.saved[2].production = { keyHint: '7001', updatedAt: '2026-11-10T09:12:00.000Z', updatedBy: 'preview' };
  }
  window.__FN_STATE = state;
  const status = (id) => {
    const env = state.env[id] || 'staging';
    const s = state.saved[id] || {};
    const out = { branchId: id, vault: 'ok', environment: env, saved: { staging: s.staging || null, production: s.production || null } };
    if (s[env]) { out.source = 'dashboard'; out.keyHint = s[env].keyHint; out.connected = true; }
    else if (id === 1) { out.source = 'main'; out.keyHint = '93b2'; out.connected = env === 'production'; if (!out.connected) { out.code = 'INVALID_CREDENTIALS'; out.message = 'invalid api key or secret'; } }
    else { out.connected = false; out.code = 'NO_BRANCH_KEYS'; out.message = 'SafeBoda is not set up for this branch yet.'; }
    return out;
  };
  if (variant.real) return;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, opts) => {
    if (String(url).indexOf('cloudfunctions.net/safeboda') === -1) return realFetch(url, opts);
    const body = JSON.parse((opts && opts.body) || '{}');
    state.calls.push(JSON.parse(JSON.stringify(body, (k, v) => (k === 'password' || k === 'secret' ? '(hidden)' : v))));
    await new Promise((r) => setTimeout(r, variant.slow ? 2500 : 350));
    const answer = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (variant.offline) throw new TypeError('Failed to fetch');
    const id = parseInt(body.branchId, 10) || 1;
    if (body.action === 'adminStatus') return answer({ ok: true, status: 200, data: status(id) });
    if (body.action === 'resolveLink') {
      const m = /(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/.exec(String(body.text));
      if (/goo\.gl/.test(String(body.text))) return answer({ ok: true, status: 200, data: { lat: 0.3135946, lng: 32.5836749 } });
      return m ? answer({ ok: true, status: 200, data: { lat: +m[1], lng: +m[2] } }) : answer({ ok: false, status: 404, data: { code: 'NO_COORDINATES', message: 'No location could be read from that link.' } });
    }
    if (body.action === 'adminSave' || body.action === 'adminRemove') {
      const a = body.admin || {};
      if (!a.password) return answer({ ok: false, status: 401, data: { code: 'LOGIN_REQUIRED', message: 'Enter your dashboard password to make this change.' } });
      if (a.password !== 'preview-pass') return answer({ ok: false, status: 403, data: { code: 'LOGIN_REJECTED', message: 'That password is not correct.' } });
      const env = body.environment;
      if (body.action === 'adminRemove') { delete state.saved[id][env]; return answer({ ok: true, status: 200, data: status(id) }); }
      if (body.key) {
        if ((GOOD[env] || {})[id] !== body.key) return answer({ ok: false, status: 401, data: { code: 'KEYS_REJECTED', message: "SafeBoda's " + (env === 'production' ? 'live' : 'test') + ' server did not accept these keys. Nothing was changed. SafeBoda said: invalid api key or secret' } });
        state.saved[id][env] = { keyHint: body.key.slice(-4), updatedAt: new Date().toISOString(), updatedBy: a.username };
      } else if (!state.saved[id][env] && !(id === 1 && env === 'production')) {
        return answer({ ok: false, status: 400, data: { code: 'KEYS_MISSING', message: "This branch has no keys for SafeBoda's " + (env === 'production' ? 'live' : 'test') + ' server yet. Enter the key and the secret.' } });
      }
      state.env[id] = env;
      return answer({ ok: true, status: 200, data: status(id) });
    }
    return answer({ ok: false, status: 400, data: { code: 'BAD_ACTION' } });
  };
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  fs.mkdirSync(out, { recursive: true });
  const stub = fs.readFileSync(path.join(__dirname, 'stub_firebase.js'), 'utf8');
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    protocolTimeout: 90000,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars', '--force-device-scale-factor=1'],
  });
  const steps = require(path.join(__dirname, 'scenarios.js'));
  const run = steps[scenario];
  if (!run) throw new Error('unknown scenario ' + scenario);
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 260)); });
  page.on('pageerror', (e) => console.log('pageerror:', String(e).slice(0, 260)));
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('gstatic.com/firebasejs') && u.endsWith('firebase-app.js')) return req.respond({ status: 200, contentType: 'application/javascript', body: stub });
    if (u.includes('gstatic.com/firebasejs')) return req.respond({ status: 200, contentType: 'application/javascript', body: '' });
    if (u.endsWith('/sw.js')) return req.abort();
    if (u.includes('firebaseio.com')) return req.abort();
    if (u.includes('cloudfunctions.net')) return REAL ? req.continue() : req.abort();
    return req.continue();
  });
  const variant = run.variant || {};
  REAL = !!variant.real;
  if (variant.realMonth) {
    // Read-only: this month's lists and the riders' names, straight into the pretend database.
    const db = 'https://kias-4c883-default-rtdb.firebaseio.com/Shoppers';
    const now = new Date();
    const month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    const get = async (p) => (await fetch(db + '/' + p + '.json')).json();
    const S = SEED.Shoppers;
    S.Riders = (await get('Riders')) || {};
    S.packages = { monthly: { [month]: (await get('packages/monthly/' + month)) || {} } };
    S.dispatch_events = { monthly: { [month]: (await get('dispatch_events/monthly/' + month)) || {} } };
    S.pickups = { monthly: { [month]: (await get('pickups/monthly/' + month)) || {} } };
    S.deliveries = { monthly: { [month]: (await get('deliveries/monthly/' + month)) || {} } };
    // the same month's day lists (which day each record was filed under) and, so that
    // statements find them, the month's records under the year too
    const range = async (p) => (await fetch(db + '/' + p + '.json?orderBy=%22%24key%22&startAt=%22' + month + '-01%22&endAt=%22' + month + '-31%22')).json();
    const year = String(now.getFullYear());
    for (const k of ['dispatch_events', 'pickups', 'deliveries']) {
      S[k].daily = (await range(k + '/daily')) || {};
      S[k].annual = { [year]: S[k].monthly[month] };
    }
    S.packages.yearly = { [year]: S.packages.monthly[month] };
    console.log('real records this month:', ['packages', 'dispatch_events', 'pickups', 'deliveries'].map((k) => k + ' ' + Object.keys(S[k].monthly[month]).length).join(', '), '| riders', Object.keys(S.Riders).length);
  }
  if (REAL) {
    // The real function needs the real app key and is shown the real shop contact (both read-only here).
    const base = 'https://kias-4c883-default-rtdb.firebaseio.com/Shoppers/settings/safeboda';
    SEED.Shoppers.settings.safeboda.appKey = await (await fetch(base + '/appKey.json')).json();
    SEED.Shoppers.settings.safeboda.origins = { 1: await (await fetch(base + '/origins/1.json')).json() };
  }
  await page.evaluateOnNewDocument(installMocks, SEED, variant);
  try {
    await page.goto(process.env.PREVIEW_URL || `http://127.0.0.1:${port}/`, { waitUntil: 'networkidle2', timeout: 90000 });
  } catch (e) {
    console.log('goto:', String(e).slice(0, 160));
  }
  await sleep(1500);
  const shot = async (name, selector) => {
    const file = path.join(out, `${scenario}-${name}-${W}.png`);
    try {
      if (selector) {
        const el = await page.$(selector);
        if (!el) { console.log('no element', selector); return; }
        await el.screenshot({ path: file });
      } else {
        await page.screenshot({ path: file, fullPage: false });
      }
      console.log('saved', file);
    } catch (e) {
      console.log('screenshot failed', name, String(e).slice(0, 160));
    }
  };
  await run.steps({ page, shot, sleep });
  const calls = await page.evaluate(() => (window.__FN_STATE ? window.__FN_STATE.calls : []));
  const writes = await page.evaluate(() => window.__STUB_WRITES || []);
  console.log('function calls:', JSON.stringify(calls));
  console.log('database writes:', JSON.stringify(writes.filter((w) => w.path.includes('safeboda'))));
  await browser.close();
  server.close();
})().catch((e) => { console.error('failed:', String(e).slice(0, 400)); process.exit(1); });
