// How the long tables behave: more rows on scroll, the buttons on rows added
// later, the store's tick boxes, live updates, loading, and the order the
// lists are asked for. Loaded by scenarios.js.
const BIG = { packages: 6000, dispatch: 5600, pickups: 1500, deliveries: 3500 };
const count = (page, category, period) => page.evaluate((c, p) => allPackages.filter((x) => x.category === c && x.period === p).length, category, period);
const fmt = (n) => n.toLocaleString('en-US');
const rows = (page, id = 'packageTableBody') => page.evaluate((i) => document.getElementById(i).rows.length, id);
const bar = (page, id = 'packageTableBody') => page.evaluate((i) => {
  const b = document.getElementById(i)._moreBar;
  if (!b || getComputedStyle(b).display === 'none') return '(hidden)';
  const btn = b.querySelector('.table-more-btn');
  return b.querySelector('.table-more-count').textContent + (getComputedStyle(btn).display === 'none' ? '' : ' [Show more rows]');
}, id);
const scrollEnd = async (page, sleep, id = 'packageTableBody') => {
  await page.evaluate((i) => { const c = document.getElementById(i).closest('.table-container'); c.scrollTop = c.scrollHeight; }, id);
  await sleep(500);
};
const check = (name, ok, detail) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + JSON.stringify(detail)}`);

module.exports = {
  tables: {
    variant: { big: BIG },
    steps: async ({ page, shot, sleep }) => {
      await sleep(5000);

      // ── Delivered, this year ───────────────────────────────────────────
      await page.evaluate(() => showPackagesInModal('delivered', 'year'));
      await sleep(400);
      check('first screenful is 120 rows', (await rows(page)) === 120, await rows(page));
      const delivered = await count(page, 'delivered', 'year');
      check('the line under the table says how many', (await bar(page)).startsWith('Showing the first 120 of ' + fmt(delivered) + ' rows'), [await bar(page), delivered]);
      await shot('delivered-top');
      await scrollEnd(page, sleep);
      check('scrolling to the end adds a screenful', (await rows(page)) === 240, await rows(page));
      await scrollEnd(page, sleep);
      await scrollEnd(page, sleep);
      check('and again', (await rows(page)) === 480, await rows(page));
      await page.evaluate(() => document.getElementById('packageTableBody')._moreBar.querySelector('.table-more-btn').click());
      await sleep(400);
      check('"Show more rows" adds a screenful', (await rows(page)) === 600, await rows(page));

      // a row that was added later behaves like any other
      const lateId = await page.evaluate(() => document.querySelector('#packageTableBody tr:nth-child(550) .details-row-btn').dataset.pkgid);
      await page.evaluate(() => document.querySelector('#packageTableBody tr:nth-child(550) .details-row-btn').click());
      await sleep(300);
      const details = await page.evaluate(() => { const m = [...document.querySelectorAll('.modal')].filter((x) => x.style.display === 'block' || x.style.display === 'flex').map((x) => x.id); return { open: m, text: document.body.innerText.includes('deliveryBoyName') || document.body.innerText.includes('Delivery Boy') }; });
      check('Details opens for a row added later', details.open.length >= 2, { lateId, details });
      await page.evaluate(() => { [...document.querySelectorAll('.modal')].forEach((m) => { if (m.id !== 'packageModal') m.style.display = 'none'; }); });
      const del = await page.evaluate(() => { const b = document.querySelector('#packageTableBody tr:nth-child(550) .delete-btn'); return [b.dataset.id, b.dataset.category, b.dataset.period, b.dataset.sourcepath]; });
      check('its Delete button carries the record', del[0] === lateId && del[1] === 'delivered' && del[2] === 'year' && /deliveries\/annual/.test(del[3]), del);

      // a live update of THIS list keeps the rows already drawn
      const before = await page.evaluate(() => document.getElementById('packageTableBody').closest('.table-container').scrollTop);
      await page.evaluate(() => (window.__STUB_LISTENERS || []).filter((l) => /deliveries\/annual/.test(l.path)).forEach((l) => l.fire()));
      await sleep(900);
      const after = await page.evaluate(() => document.getElementById('packageTableBody').closest('.table-container').scrollTop);
      check('a live update of the open list keeps the rows drawn', (await rows(page)) === 600, await rows(page));
      check('and the place scrolled to', Math.abs(after - before) < 5, { before, after });

      // SafeBoda rider
      const sb = await page.evaluate(() => {
        const head = [...document.querySelectorAll('#packageTableHead th')].map((th) => th.textContent.trim());
        const by = head.indexOf('Completed By'), type = head.indexOf('Type');
        const tr = [...document.querySelectorAll('#packageTableBody tr')].find((r) => r.cells[type].innerText.trim() === 'SafeBoda');
        return tr ? { by: tr.cells[by].innerText.replace(/\s+/g, ' ').trim(), type: tr.cells[type].innerText.trim() } : null;
      });
      check('a SafeBoda delivery shows the rider by name, with the plate', !!sb && /^[A-Z][a-z]+ [A-Z][a-z]+ SafeBoda · UF[A-Z] \d+X$/.test(sb.by), sb);
      const phoneShown = await page.evaluate(() => {
        const head = [...document.querySelectorAll('#packageTableHead th')].map((th) => th.textContent.trim());
        const by = head.indexOf('Completed By');
        return [...document.querySelectorAll('#packageTableBody tr')].filter((r) => /^\+?\d{9,}/.test(r.cells[by].innerText.trim())).length;
      });
      check('no row shows a phone number where a name belongs', phoneShown === 0, phoneShown);
      const lookups = await page.evaluate(() => (window.__STUB_READS || []).filter((p) => /Shoppers\/Riders\/2567[5]/.test(p)).length);
      check('SafeBoda riders are not looked up in our riders list', lookups === 0, lookups);
      const label = await page.evaluate(() => {
        const sbp = (window._lastDisplayedPackages || []).find((p) => p.deliveryProvider === 'safeboda');
        const own = (window._lastDisplayedPackages || []).find((p) => !p.deliveryProvider && !p.handlerName && p.riderContact);
        const dash = (window._lastDisplayedPackages || []).find((p) => p.handlerName);
        return [handlerLabel(sbp), handlerLabel(own), handlerLabel(dash)];
      });
      check('the Excel "Handler" column gets the same names', /\(SafeBoda\)$/.test(label[0]) && /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(label[1]) && label[2] === 'Esther', label);

      // search narrows the whole list, not only the rows drawn
      const farId = await page.evaluate(() => { const l = allPackages.filter((x) => x.category === 'delivered' && x.period === 'year'); return l[l.length - 5].packageId; });
      await page.evaluate((v) => { document.getElementById('searchInput').value = v; searchPackages(); }, farId);
      await sleep(300);
      const found = await page.evaluate(() => ({ n: document.getElementById('packageTableBody').rows.length, id: (document.querySelector('#packageTableBody td') || {}).innerText }));
      check('search finds a record far beyond the rows drawn', found.n === 1 && found.id.includes(farId), [found, farId]);
      await page.evaluate(() => { document.getElementById('searchInput').value = 'zzzz-nothing'; searchPackages(); });
      await sleep(300);
      const none = await page.evaluate(() => ({ n: document.getElementById('packageTableBody').rows.length, msg: document.getElementById('tableLoading').textContent, shown: getComputedStyle(document.getElementById('tableLoading')).display, listed: (window._lastDisplayedPackages || []).length }));
      check('nothing found: says so, and nothing is listed', none.n === 0 && none.msg === 'No packages found' && none.shown !== 'none' && none.listed === 0, none);
      check('the line under the table is gone', (await bar(page)) === '(hidden)', await bar(page));
      await page.evaluate(() => { document.getElementById('searchInput').value = ''; searchPackages(); document.getElementById('packageModal').style.display = 'none'; });
      await sleep(300);

      // ── In store, available: the tick boxes and bulk bar ───────────────
      await page.evaluate(() => showPackagesInModal('in_store', 'available'));
      await sleep(600);
      const store = await page.evaluate(() => ({ rows: document.getElementById('packageTableBody').rows.length, ticks: document.querySelectorAll('#packageTableBody .store-row-check').length, listed: (window._lastDisplayedPackages || []).length, stickers: getComputedStyle(document.getElementById('printStickersBtn')).display }));
      check('store list: every drawn row has its tick box', store.rows === 120 && store.ticks === 120 && store.listed === 180 && store.stickers !== 'none', store);
      await page.evaluate(() => document.getElementById('storeSelectAll').click());
      await sleep(200);
      const sel = await page.evaluate(() => document.getElementById('storeSelCount').textContent);
      check('"Select all listed" selects the whole list, drawn or not', sel === '180 selected', sel);
      await scrollEnd(page, sleep);
      const more = await page.evaluate(() => ({ rows: document.getElementById('packageTableBody').rows.length, ticks: document.querySelectorAll('#packageTableBody .store-row-check').length, ticked: document.querySelectorAll('#packageTableBody .store-row-check:checked').length }));
      check('rows added later arrive ticked', more.rows === 180 && more.ticks === 180 && more.ticked === 180, more);
      check('all rows drawn: the line says so', /^All 180 rows are shown/.test(await bar(page)), await bar(page));
      await page.evaluate(() => { document.getElementById('storeClearSel').click(); document.getElementById('packageModal').style.display = 'none'; });

      // ── Dispatched: columns under their headings ───────────────────────
      await page.evaluate(() => showPackagesInModal('dispatched', 'year'));
      await sleep(500);
      const top = await page.evaluate(() => ({ at: document.getElementById('packageTableBody').closest('.table-container').scrollTop, rows: document.getElementById('packageTableBody').rows.length }));
      check('a newly opened table starts at its top, wherever the last one was left', top.at === 0 && top.rows === 120, top);
      await scrollEnd(page, sleep);
      const cols = await page.evaluate(() => ({ head: document.querySelectorAll('#packageTableHead th').length, cells: [...new Set([...document.querySelectorAll('#packageTableBody tr')].map((r) => r.cells.length))], rows: document.getElementById('packageTableBody').rows.length }));
      check('dispatched: every row has as many cells as the header, also rows added later', cols.rows === 240 && cols.cells.length === 1 && cols.cells[0] === cols.head, cols);
      await shot('dispatched');
      await page.evaluate(() => { document.getElementById('packageModal').style.display = 'none'; });

      // ── All dispatched ─────────────────────────────────────────────────
      await page.evaluate(() => openAllDispatchedModal('year'));
      await sleep(900);
      check('all dispatched: first screenful', (await rows(page, 'allDispatchedTableBody')) === 120, await rows(page, 'allDispatchedTableBody'));
      const picked = await count(page, 'picked_up', 'year');
      check('all dispatched: the line under the table', (await bar(page, 'allDispatchedTableBody')).startsWith('Showing the first 120 of ' + fmt(picked + delivered) + ' rows'), [await bar(page, 'allDispatchedTableBody'), picked, delivered]);
      await scrollEnd(page, sleep, 'allDispatchedTableBody');
      check('all dispatched: scrolling adds rows', (await rows(page, 'allDispatchedTableBody')) === 240, await rows(page, 'allDispatchedTableBody'));
      const totals = await page.evaluate(() => [document.getElementById('allDispatchedPickupCount').textContent, document.getElementById('allDispatchedDeliveryCount').textContent, document.getElementById('allDispatchedTotalCount').textContent].join('/'));
      check('all dispatched: the totals count everything', totals === picked + '/' + delivered + '/' + (picked + delivered), totals);
      await page.evaluate(() => { document.getElementById('allDispatchedSearchInput').value = 'safeboda'; filterAllDispatched(); });
      await sleep(300);
      await page.evaluate(() => { document.getElementById('allDispatchedSearchInput').value = ''; filterAllDispatched(); });
      await sleep(300);
      const handler = await page.evaluate(() => [...new Set([...document.querySelectorAll('#allDispatchedTableBody tr')].map((r) => r.cells[9].innerText.trim()))]);
      check('all dispatched: handler column has names, SafeBoda marked', handler.some((h) => /\(SafeBoda\)$/.test(h)) && !handler.some((h) => /^\+?\d{9,}$/.test(h)), handler);
      await shot('all-dispatched');
      await page.evaluate(() => { document.getElementById('allDispatchedModal').style.display = 'none'; });
      console.log('page errors would be listed above this line');
    },
  },

  // The year arrives late: what the page shows meanwhile, and the order of asking.
  slowyear: {
    variant: { big: BIG, slowYear: 6000, cachedStats: { 'delivered-year': 2222, 'in-store-year': 3333, 'picked-up-year': 1111, 'dispatched-year': 1999, 'all-dispatched-year': 3333, 'delivered-today': 7 } },
    steps: async ({ page, shot, sleep }) => {
      await sleep(2500);
      const order = await page.evaluate(() => (window.__STUB_LISTENERS || []).map((l) => l.path));
      const yearIdx = order.map((p, i) => (/annual|yearly/.test(p) ? i : -1)).filter((i) => i > -1);
      // the lists the first screen needs: today, this week, this month, and what is in store / in dispatch
      const smallMax = order.map((p, i) => (/\/(daily|weekly|monthly)\//.test(p) || /^Shoppers\/(packages|dispatch)$/.test(p) ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
      check('the year lists are asked for after everything else', yearIdx.length === 4 && Math.min(...yearIdx) > smallMax, { order });
      const early = await page.evaluate(() => ['delivered-year', 'in-store-year', 'delivered-today'].map((i) => document.getElementById(i).textContent).join('/'));
      const todayDelivered = await count(page, 'delivered', 'today');
      check('until the year arrives its figures stay as last seen (today is already fresh)', early === '2222/3333/' + todayDelivered && todayDelivered > 0, [early, todayDelivered]);
      await page.evaluate(() => showPackagesInModal('delivered', 'year'));
      await sleep(300);
      const loading = await page.evaluate(() => ({ msg: document.getElementById('tableLoading').textContent, shown: getComputedStyle(document.getElementById('tableLoading')).display, rows: document.getElementById('packageTableBody').rows.length }));
      check('a year table opened early says it is loading', loading.rows === 0 && /Loading this year/.test(loading.msg) && loading.shown !== 'none', loading);
      await shot('loading');
      await sleep(6500);
      const late = await page.evaluate(() => ({ counts: ['delivered-year', 'in-store-year'].map((i) => document.getElementById(i).textContent).join('/'), rows: document.getElementById('packageTableBody').rows.length, loading: getComputedStyle(document.getElementById('tableLoading')).display, cache: JSON.parse(localStorage.getItem('yps_stats_cache'))['delivered-year'] }));
      const yDelivered = await count(page, 'delivered', 'year'), yStore = await count(page, 'in_store', 'year');
      check('when the year arrives the figures and the open table fill in', late.counts === yDelivered + '/' + yStore && yDelivered > 1000 && late.rows === 120 && late.loading === 'none' && late.cache === yDelivered, [late, yDelivered, yStore]);
    },
  },
};
