// Looks at how the package table's columns line up after opening, searching
// and a live update, for each kind of table. Loaded by scenarios.js.
const shape = (page) => page.evaluate(() => {
  const head = [...document.querySelectorAll('#packageTableHead th')].map((th) => th.textContent.trim());
  const counts = {};
  [...document.querySelectorAll('#packageTableBody tr')].forEach((tr) => { counts[tr.cells.length] = (counts[tr.cells.length] || 0) + 1; });
  return { head: head.join(' | '), headerCells: head.length, rowsByCellCount: counts, renders: window.__renders };
});

module.exports = {
  columns: {
    variant: { big: { packages: 300, dispatch: 300, pickups: 300, deliveries: 300 } },
    steps: async ({ page, shot, sleep }) => {
      await sleep(3000);
      await page.evaluate(() => {
        window.__renders = 0;
        const orig = window.displayPackagesInTable;
        window.displayPackagesInTable = function () { window.__renders++; return orig.apply(this, arguments); };
      });
      for (const cat of ['dispatched', 'picked_up', 'delivered', 'in_store']) {
        await page.evaluate((c) => showPackagesInModal(c, 'year'), cat);
        console.log(cat, 'just opened:', JSON.stringify(await shape(page)));
        await sleep(500);
        console.log(cat, 'half a second later:', JSON.stringify(await shape(page)));
        await page.evaluate(() => { document.getElementById('searchInput').value = 'nak'; searchPackages(); });
        await sleep(500);
        console.log(cat, 'after a search:', JSON.stringify(await shape(page)));
        await page.evaluate(() => { (window.__STUB_LISTENERS || []).filter((l) => /deliveries\/daily/.test(l.path)).forEach((l) => l.fire()); });
        await sleep(700);
        console.log(cat, 'after a live update:', JSON.stringify(await shape(page)));
        if (cat === 'dispatched') await shot('dispatched-after-search');
        await page.evaluate(() => { document.getElementById('packageModal').style.display = 'none'; document.getElementById('searchInput').value = ''; });
      }
    },
  },
};
