// Speed scenarios for preview.js: a made-up year of records the size of the
// real one. Loaded by scenarios.js.
const measure = (page, expr) => page.evaluate(async (code) => {
  const t0 = performance.now();
  await (0, eval)(code);
  const t1 = performance.now();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const t2 = performance.now();
  const body = document.getElementById('packageTableBody');
  return { script_ms: Math.round(t1 - t0), until_painted_ms: Math.round(t2 - t0), rows: body.rows.length, elements: body.getElementsByTagName('*').length };
}, expr);

const handlers = (page, n) => page.evaluate((count) => {
  const head = [...document.querySelectorAll('#packageTableHead th')].map((th) => th.textContent.trim());
  const by = head.indexOf('Completed By');
  const type = head.indexOf('Type');
  const seen = [];
  [...document.querySelectorAll('#packageTableBody tr')].slice(0, 120).forEach((tr) => {
    const v = (by > -1 && tr.cells[by] ? tr.cells[by].innerText.replace(/\s+/g, ' ').trim() : '?') + ' [' + (type > -1 && tr.cells[type] ? tr.cells[type].innerText.trim() : '?') + ']';
    if (seen.indexOf(v) === -1) seen.push(v);
  });
  return seen.slice(0, count);
}, n);

const shape = (page) => page.evaluate(() => {
  const head = document.querySelectorAll('#packageTableHead th').length;
  const rows = [...document.querySelectorAll('#packageTableBody tr')];
  const counts = {};
  rows.forEach((tr) => { counts[tr.cells.length] = (counts[tr.cells.length] || 0) + 1; });
  return { headerCells: head, rowsByCellCount: counts };
});

module.exports = {
  perf: {
    variant: { big: { packages: 16000, dispatch: 15000, pickups: 5000, deliveries: 11000 } },
    steps: async ({ page, shot, sleep }) => {
      await sleep(7000);
      console.log('year counts:', await page.evaluate(() => ['in-store-year', 'dispatched-year', 'picked-up-year', 'delivered-year'].map((i) => document.getElementById(i).textContent).join(' / ')));
      for (const cat of ['delivered', 'in_store', 'dispatched', 'picked_up']) {
        console.log(`open ${cat} year:`, JSON.stringify(await measure(page, `showPackagesInModal('${cat}','year')`)));
        await sleep(400);
        console.log('  columns:', JSON.stringify(await shape(page)));
        if (cat === 'delivered') {
          await shot('delivered-year');
          console.log('  completed by:', JSON.stringify(await handlers(page, 8)));
          console.log('  search "nak":', JSON.stringify(await measure(page, `document.getElementById('searchInput').value='nak'; searchPackages(); new Promise(r=>setTimeout(r,50))`)));
          console.log('  clear search:', JSON.stringify(await measure(page, `document.getElementById('searchInput').value=''; searchPackages(); new Promise(r=>setTimeout(r,50))`)));
          console.log('  live update while open:', JSON.stringify(await measure(page, `(window.__STUB_LISTENERS||[]).filter(l=>/deliveries\\/daily/.test(l.path)).forEach(l=>l.fire()); new Promise(r=>setTimeout(r,400))`)));
        }
        if (cat === 'dispatched') {
          console.log('  after a search:', JSON.stringify(await measure(page, `document.getElementById('searchInput').value='nak'; searchPackages(); new Promise(r=>setTimeout(r,50))`)), JSON.stringify(await shape(page)));
        }
        await page.evaluate(() => { document.getElementById('packageModal').style.display = 'none'; });
      }
      const t = await page.evaluate(async () => {
        const t0 = performance.now();
        await openAllDispatchedModal('year');
        const t1 = performance.now();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return { script_ms: Math.round(t1 - t0), until_painted_ms: Math.round(performance.now() - t0), rows: document.getElementById('allDispatchedTableBody').rows.length };
      });
      console.log('open all dispatched year:', JSON.stringify(t));
    },
  },
};
