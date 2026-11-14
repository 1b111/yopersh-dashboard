// This month's real records (read once, kept in memory only) through the new
// table code, to catch shapes the made-up data does not have. Prints counts,
// never the records. Loaded by scenarios.js.
const audit = (page, bodyId, headSel) => page.evaluate((id, hs) => {
  const body = document.getElementById(id);
  const head = [...document.querySelectorAll(hs)].map((th) => th.textContent.trim());
  const by = head.indexOf('Completed By') > -1 ? head.indexOf('Completed By') : head.indexOf('Handler');
  const type = head.indexOf('Type');
  const rows = [...body.rows];
  const cellCounts = [...new Set(rows.map((r) => r.cells.length))];
  const text = rows.map((r) => r.innerText).join('\n');
  const who = by > -1 ? rows.map((r) => (r.cells[by] ? r.cells[by].innerText.replace(/\s+/g, ' ').trim() : '')) : [];
  return {
    rows: rows.length,
    header: head.length,
    cellCounts,
    undefinedOrNull: (text.match(/\b(undefined|null|NaN|\[object Object\])\b/g) || []).length,
    phoneAsName: who.filter((w) => /^\+?\d{9,}/.test(w)).length,
    blankWho: who.filter((w) => !w || w === '—').length,
    safeboda: type > -1 ? rows.filter((r) => r.cells[type] && /SafeBoda/.test(r.cells[type].innerText)).length + who.filter((w) => /\(SafeBoda\)/.test(w)).length : who.filter((w) => /\(SafeBoda\)/.test(w)).length,
    safebodaNames: [...new Set(who.filter((w) => /SafeBoda/.test(w)))].slice(0, 3),
  };
}, bodyId, headSel);

module.exports = {
  realmonth: {
    variant: { realMonth: true },
    steps: async ({ page, sleep }) => {
      await sleep(4000);
      console.log('month figures:', await page.evaluate(() => ['in-store-month', 'dispatched-month', 'picked-up-month', 'delivered-month'].map((i) => document.getElementById(i).textContent).join(' / ')));
      for (const cat of ['delivered', 'picked_up', 'dispatched', 'in_store']) {
        await page.evaluate((c) => showPackagesInModal(c, 'month'), cat);
        await sleep(700);
        // draw everything, a screenful at a time, the way scrolling would
        for (let i = 0; i < 12; i++) {
          const more = await page.evaluate(() => { const b = document.getElementById('packageTableBody'); const st = b._long; if (st && st.shown < st.total) { drawMoreRows(b); return true; } return false; });
          if (!more) break;
          await sleep(350);
        }
        console.log(cat, 'this month:', JSON.stringify(await audit(page, 'packageTableBody', '#packageTableHead th')));
        await page.evaluate(() => { document.getElementById('packageModal').style.display = 'none'; });
      }
      await page.evaluate(() => openAllDispatchedModal('month'));
      await sleep(900);
      for (let i = 0; i < 12; i++) {
        const more = await page.evaluate(() => { const b = document.getElementById('allDispatchedTableBody'); const st = b._long; if (st && st.shown < st.total) { drawMoreRows(b); return true; } return false; });
        if (!more) break;
        await sleep(350);
      }
      console.log('all dispatched this month:', JSON.stringify(await audit(page, 'allDispatchedTableBody', '#allDispatchedModal thead th')));
      await page.evaluate(() => { document.getElementById('allDispatchedModal').style.display = 'none'; });
      // dates: what the date column says in each step's table (counts only)
      const dateCol = async (cat, heading) => {
        await page.evaluate((c) => showPackagesInModal(c, 'month'), cat);
        await sleep(2500);
        for (let i = 0; i < 12; i++) {
          const more = await page.evaluate(() => { const b = document.getElementById('packageTableBody'); const st = b._long; if (st && st.shown < st.total) { drawMoreRows(b); return true; } return false; });
          if (!more) break;
          await sleep(900);
        }
        const r = await page.evaluate((h) => {
          const idx = [...document.querySelectorAll('#packageTableHead th')].map((th) => th.textContent.trim()).indexOf(h);
          const cells = [...document.getElementById('packageTableBody').rows].map((row) => row.cells[idx]);
          const main = cells.map((td) => (td.querySelector('.when-main') || {}).innerText || '');
          return { headed: idx > -1, rows: cells.length, withTime: main.filter((m) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(m.trim())).length, dayOnly: main.filter((m) => /^\d{4}-\d{2}-\d{2}$/.test(m.trim())).length, notRecorded: main.filter((m) => /not recorded/.test(m)).length, lookingUp: main.filter((m) => /looking up/.test(m)).length, sameAsStoreDay: cells.filter((td) => !/In store:/.test(td.innerText)).length };
        }, heading);
        await page.evaluate(() => { document.getElementById('packageModal').style.display = 'none'; });
        return r;
      };
      console.log('delivered on:', JSON.stringify(await dateCol('delivered', 'Delivered on')));
      console.log('picked up on:', JSON.stringify(await dateCol('picked_up', 'Picked up on')));
      console.log('dispatched on:', JSON.stringify(await dateCol('dispatched', 'Dispatched on')));
      // statements for three real packages: a rider's delivery, a SafeBoda delivery, a pickup (shapes only)
      const st = await page.evaluate(async () => {
        const y = String(new Date().getFullYear()), S = window.__STUB_DATA.Shoppers;
        const del = S.deliveries.annual[y] || {}, pk = S.pickups.annual[y] || {};
        const pickIds = { rider: Object.keys(del).find((k) => del[k] && !del[k].deliveryProvider && del[k].deliveredAt), safeboda: Object.keys(del).find((k) => del[k] && del[k].deliveryProvider === 'safeboda'), pickup: Object.keys(pk).find((k) => pk[k] && !pk[k].completedAt) };
        const out = {};
        for (const kind of Object.keys(pickIds)) {
          if (!pickIds[kind]) { out[kind] = 'none this month'; continue; }
          document.getElementById('packageIdInput').value = pickIds[kind];
          await loadPackageStatement();
          const el = document.createElement('div');
          el.innerHTML = window._pkgStmtBodyHTML || '';
          out[kind] = [...el.querySelectorAll('.j-step')].map((s) => {
            const f = Object.fromEntries([...s.querySelectorAll('.j-grid > div')].map((x) => [x.querySelector('.j-field-lbl').innerText.trim(), x.querySelector('.j-field-val').innerText.trim()]));
            const who = Object.keys(f).find((k) => / by$/.test(k)) || '';
            return s.querySelector('.j-status').innerText.trim() + ': date ' + (/^\d{2} \w{3,4} \d{4}, \d{2}:\d{2}$/.test(f.Date) ? 'with time' : (/^\d{2} \w{3,4} \d{4}$/.test(f.Date) ? 'day only' : f.Date)) + '; ' + who + ' ' + (f[who] && f[who] !== '—' ? (/^\+?\d{9,}$/.test(f[who]) ? 'PHONE NUMBER' : 'named') : 'blank') + (f['Rider\u2019s phone'] ? '; phone' : '') + (f['Number plate'] ? '; plate' : '') + (f['Given to the rider'] ? '; given-to-rider time' : '');
          });
        }
        return out;
      });
      console.log('statements:', JSON.stringify(st, null, 1));
      const exp = await page.evaluate(() => {
        const labels = allDispatchedData.map((p) => handlerLabel(p));
        return { rows: labels.length, blank: labels.filter((l) => !l).length, phones: labels.filter((l) => /^\+?\d{9,}$/.test(String(l))).length, safeboda: labels.filter((l) => /\(SafeBoda\)$/.test(String(l))).length };
      });
      console.log('export "Handler" column:', JSON.stringify(exp));
    },
  },
};
