// When each step happened and who did it: the tables, the details window,
// the statements, the Excel sheets, and SafeBoda packages on the road.
// Loaded by scenarios.js.
const BIG = { packages: 6000, dispatch: 5600, pickups: 1500, deliveries: 3500 };
const check = (name, ok, detail) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + JSON.stringify(detail).slice(0, 700)}`);
const close = (page) => page.evaluate(() => { [...document.querySelectorAll('.modal')].forEach((m) => { m.style.display = 'none'; }); });
const head = (page, sel = '#packageTableHead th') => page.evaluate((s) => [...document.querySelectorAll(s)].map((th) => th.textContent.trim()), sel);
// What the date column says, row by row, for the rows drawn.
const dates = (page, bodyId, headSel, heading) => page.evaluate((id, hs, h) => {
  const idx = [...document.querySelectorAll(hs)].map((th) => th.textContent.trim()).indexOf(h);
  return [...document.getElementById(id).rows].map((r) => {
    const td = r.cells[idx];
    const main = td.querySelector('.when-main');
    return { id: td.getAttribute('data-wid'), main: main ? main.innerText.trim() : '', pending: td.hasAttribute('data-wpending'), sub: [...td.querySelectorAll('div')].slice(1).map((d) => d.innerText.trim()) };
  });
}, bodyId, headSel, heading);
const summary = (rows) => ({
  rows: rows.length,
  withTime: rows.filter((r) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(r.main)).length,
  dayOnly: rows.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.main)).length,
  notRecorded: rows.filter((r) => r.main === 'not recorded').length,
  lookingUp: rows.filter((r) => r.pending || /looking up/.test(r.main)).length,
  inStoreLine: rows.filter((r) => r.sub.some((s) => /^In store: \d{4}-\d{2}-\d{2}$/.test(s))).length,
});
const truth = (page, list, id) => page.evaluate((l, i) => {
  // the day a record was really filed under, straight from the pretend database
  const days = (window.__STUB_DATA.Shoppers[l] || {}).daily || {};
  return Object.keys(days).find((d) => days[d][i]) || '';
}, list, id);

module.exports = {
  journey: {
    variant: { big: BIG },
    steps: async ({ page, shot, sleep }) => {
      await sleep(5000);
      const today = await page.evaluate(() => getCurrentDateFormats().today);

      // ── Delivered, this year ───────────────────────────────────────────
      await page.evaluate(() => showPackagesInModal('delivered', 'year'));
      await sleep(1500);
      check('delivered: the column is headed "Delivered on"', (await head(page)).includes('Delivered on') && !(await head(page)).includes('Date'), await head(page));
      let d = await dates(page, 'packageTableBody', '#packageTableHead th', 'Delivered on');
      let s = summary(d);
      check('delivered: every row drawn has a date, most with the time', s.rows === 120 && s.lookingUp === 0 && s.withTime > 40 && s.withTime + s.dayOnly + s.notRecorded === 120, s);
      check('delivered: early deliveries (no time on the record) get their day from the day list', s.dayOnly > 0, s);
      const early = d.find((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.main));
      check('…and it is the day the delivery was filed under', !!early && early.main === (await truth(page, 'deliveries', early.id)), [early, early && (await truth(page, 'deliveries', early.id))]);
      check('delivered: the day it came into the store is underneath', s.inStoreLine > 80, s);
      await shot('delivered');

      // Excel
      await page.evaluate(() => { window.__sheet = null; XLSX.writeFile = (wb, name) => { window.__sheet = { name, rows: XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) }; }; });
      await page.evaluate(() => generateReport());
      for (let i = 0; i < 40 && !(await page.evaluate(() => !!window.__sheet)); i++) await sleep(500);
      const sheet = await page.evaluate(() => { const r = window.__sheet.rows; const sb = r.find((x) => /\(SafeBoda\)/.test(x.Handler || '')); return { n: r.length, cols: Object.keys(r[0]), blank: r.filter((x) => !x['Delivered On']).length, sb: sb && { on: sb['Delivered On'], phone: sb['Rider Phone'], plate: sb['Number Plate'], handler: sb.Handler } }; });
      check('Excel: a "Delivered On" column, filled for every row', sheet.cols.includes('Delivered On') && sheet.cols.indexOf('Delivered On') === sheet.cols.indexOf('Date') + 1 && sheet.blank === 0 && sheet.n > 2000, sheet);
      check('Excel: a SafeBoda delivery carries the rider, his phone and plate', !!sheet.sb && /^\+2567\d{8}$/.test(sheet.sb.phone) && /^UF/.test(sheet.sb.plate) && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(sheet.sb.on), sheet.sb);

      // Details of a SafeBoda delivery
      const sbRow = await page.evaluate(() => {
        const type = [...document.querySelectorAll('#packageTableHead th')].map((th) => th.textContent.trim()).indexOf('Type');
        const tr = [...document.querySelectorAll('#packageTableBody tr')].find((r) => r.cells[type].innerText.trim() === 'SafeBoda');
        tr.querySelector('.details-row-btn').click();
        return tr.querySelector('.details-row-btn').dataset.pkgid;
      });
      await sleep(400);
      const det = await page.evaluate(() => {
        const box = document.getElementById('pkgDetailsStep');
        const rows = [...box.querySelectorAll(':scope > div > div')].map((r) => r.innerText.replace(/\s+/g, ' ').trim());
        const a = box.querySelector('a[href^="tel:"]');
        return { rows, tel: a && a.getAttribute('href'), copy: !!box.querySelector('.copy-btn') };
      });
      check('details: a SafeBoda delivery shows when, the rider, his phone and plate', det.rows.some((r) => /^Delivered \d{2} \w{3,4} \d{4}, \d{2}:\d{2}$/.test(r)) && det.rows.some((r) => /^Delivered by [A-Z][a-z]+ [A-Z][a-z]+ SafeBoda$/.test(r)) && /^tel:\+2567\d{8}$/.test(det.tel || '') && det.copy && det.rows.some((r) => /^Number plate UF/.test(r)), det);
      await shot('details-safeboda');
      await close(page);

      // ── Picked up, this year ───────────────────────────────────────────
      await page.evaluate(() => showPackagesInModal('picked_up', 'year'));
      await sleep(1800);
      check('picked up: the column is headed "Picked up on"', (await head(page)).includes('Picked up on'), await head(page));
      d = await dates(page, 'packageTableBody', '#packageTableHead th', 'Picked up on');
      s = summary(d);
      check('picked up: every row drawn has its day (the app records no time), dashboard ones the time too', s.rows === 120 && s.lookingUp === 0 && s.dayOnly > 60 && s.withTime > 5, s);
      const app = d.find((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.main));
      check('…and it is the day the pickup was filed under, not the day it came into the store', !!app && app.main === (await truth(page, 'pickups', app.id)) && (app.sub[0] || '') !== 'In store: ' + app.main, [app, app && (await truth(page, 'pickups', app.id))]);
      // a pickup that was never filed under a day says so, and stops looking
      await page.evaluate(() => { document.getElementById('searchInput').value = 'PK000004'; searchPackages(); });
      await sleep(1500);
      const lost = await dates(page, 'packageTableBody', '#packageTableHead th', 'Picked up on');
      check('a pickup filed under no day reads "not recorded"', lost.length === 1 && lost[0].main === 'not recorded' && !lost[0].pending, lost);
      await page.evaluate(() => { document.getElementById('searchInput').value = ''; searchPackages(); });
      await shot('picked-up');
      // details of an app pickup
      await page.evaluate(() => document.querySelector('#packageTableBody tr .details-row-btn').click());
      await sleep(500);
      const pk = await page.evaluate(() => [...document.querySelectorAll('#pkgDetailsStep > div > div')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
      check('details: a pickup shows when and who handed it over', pk.some((r) => /^Picked up \d{2} \w{3,4} \d{4}/.test(r)) && pk.some((r) => /^Handed over by \w+/.test(r)), pk);
      await close(page);

      // today's list needs no looking up
      const readsBefore = await page.evaluate(() => (window.__STUB_READS || []).length);
      await page.evaluate(() => showPackagesInModal('picked_up', 'today'));
      await sleep(600);
      d = await dates(page, 'packageTableBody', '#packageTableHead th', 'Picked up on');
      const readsAfter = await page.evaluate((n) => (window.__STUB_READS || []).slice(n).filter((p) => /pickups\/daily$/.test(p)).length, readsBefore);
      check('picked up today: the day is today, with nothing looked up', d.length >= 1 && d.every((r) => r.main.startsWith(today)) && readsAfter === 0, [d.slice(0, 2), readsAfter]);
      await close(page);

      // ── Dispatched, this year ──────────────────────────────────────────
      await page.evaluate(() => showPackagesInModal('dispatched', 'year'));
      await sleep(1800);
      const dh = await head(page);
      d = await dates(page, 'packageTableBody', '#packageTableHead th', 'Dispatched on');
      s = summary(d);
      check('dispatched: headed "Dispatched on", every row dated, columns in line', dh.includes('Dispatched on') && s.rows === 120 && s.lookingUp === 0 && s.withTime > 30 && (await page.evaluate(() => [...new Set([...document.querySelectorAll('#packageTableBody tr')].map((r) => r.cells.length))].join(','))) === String(dh.length), [dh, s]);
      await close(page);

      // ── All dispatched, this year ──────────────────────────────────────
      await page.evaluate(() => openAllDispatchedModal('year'));
      await sleep(2500);
      const ah = await head(page, '#allDispatchedModal thead th');
      d = await dates(page, 'allDispatchedTableBody', '#allDispatchedModal thead th', 'Completed on');
      s = summary(d);
      const order = d.map((r) => r.main.slice(0, 10));
      check('all dispatched: headed "Completed on", every row dated', ah.includes('Completed on') && s.rows === 120 && s.lookingUp === 0 && s.notRecorded === 0, [ah, s]);
      check('all dispatched: newest first by when it was completed', order.every((v, i) => i === 0 || v <= order[i - 1]) && order[0] >= order[order.length - 1], order.slice(0, 6));
      await page.evaluate(() => { window.__sheet = null; exportAllDispatched(); });
      const ad = await page.evaluate(() => { const r = window.__sheet.rows; return { n: r.length, cols: Object.keys(r[0]), blank: r.filter((x) => !x['Completed On']).length }; });
      check('all dispatched Excel: "Completed On" for every row but the few never filed under a day', ad.cols.includes('Completed On') && ad.blank <= 8 && ad.n > 3000, ad);
      await close(page);

      // ── Statements ─────────────────────────────────────────────────────
      const ids = await page.evaluate(() => {
        const y = String(new Date().getFullYear()), S = window.__STUB_DATA.Shoppers;
        const del = S.deliveries.annual[y], pk = S.pickups.annual[y];
        const rider = Object.keys(del).find((k) => del[k].deliveredAt && del[k].assignedAt && !del[k].deliveryProvider);
        const sb = Object.keys(del).find((k) => del[k].deliveryProvider === 'safeboda');
        const old = Object.keys(del).find((k) => !del[k].deliveredAt && !del[k].completedAt);
        const picked = Object.keys(pk).find((k) => !pk[k].completedAt && k !== 'PK000004');
        return { rider, sb, old, picked, phone: del[rider].customerPhone };
      });
      const statement = async (pid) => {
        await page.evaluate((v) => { document.getElementById('packageIdInput').value = v; return loadPackageStatement(); }, pid);
        await sleep(300);
        return page.evaluate(() => {
          const el = document.createElement('div');
          el.innerHTML = window._pkgStmtBodyHTML;
          const steps = [...el.querySelectorAll('.j-step')].map((st) => ({ step: st.querySelector('.j-status').innerText.trim(), fields: Object.fromEntries([...st.querySelectorAll('.j-grid > div')].map((f) => [f.querySelector('.j-field-lbl').innerText.trim(), f.querySelector('.j-field-val').innerText.trim()])) }));
          const stats = [...el.querySelectorAll('.doc-stat')].map((x) => x.innerText.replace(/\s+/g, ' ').trim());
          return { steps, stats, screen: document.getElementById('packageStatementContent').innerText.replace(/\s+/g, ' ').slice(0, 900), excel: window.currentPackageStatementData.map((x) => x.timestamp) };
        });
      };
      let st = await statement(ids.rider);
      const by = (label) => st.steps.find((x) => x.step === label) || { fields: {} };
      const dayOf = (v) => (v || '').slice(0, 11);
      check('package statement: store, dispatch and delivery each have their own date', st.steps.length === 3 && new Set(st.steps.map((x) => dayOf(x.fields.Date))).size >= 2 && st.steps.every((x) => /^\d{2} \w{3,4} \d{4}/.test(x.fields.Date)), st.steps);
      check('package statement: who sorted it, who released it, who delivered it', !!by('Received in Store').fields['Sorted by'] && !!by('Dispatched').fields['Released by'] && /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(by('Delivered').fields['Delivered by'] || ''), st.steps);
      check('package statement: the rider’s phone and when he was given the package', /^\+2567\d{8}$/.test(by('Delivered').fields['Rider’s phone'] || '') && /^\d{2} \w{3,4} \d{4}, \d{2}:\d{2}$/.test(by('Delivered').fields['Given to the rider'] || ''), by('Delivered'));
      check('package statement: "Last updated" is the delivery day, not the day it came in', st.stats.some((x) => x.includes(dayOf(by('Delivered').fields.Date).trim()) && /Last Updated/i.test(x)), st.stats);
      check('package statement: the same on screen and in the Excel sheet', st.screen.includes(by('Delivered').fields.Date) && st.excel.every((x) => /^\d{4}-\d{2}-\d{2}/.test(x)), [st.screen.slice(0, 200), st.excel]);
      await page.evaluate(() => { document.getElementById('packageStatementModal').style.display = 'block'; });
      await sleep(300);
      await shot('statement');
      await close(page);

      st = await statement(ids.sb);
      check('package statement: a SafeBoda delivery names the rider, his phone and plate', /\(SafeBoda\)$/.test(by('Delivered').fields['Delivered by'] || '') && /^\+2567\d{8}$/.test(by('Delivered').fields['Rider’s phone'] || '') && /^UF/.test(by('Delivered').fields['Number plate'] || ''), by('Delivered'));

      st = await statement(ids.old);
      const oldTruth = await truth(page, 'deliveries', ids.old);
      const asText = await page.evaluate((dd) => new Date(dd + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), oldTruth);
      check('package statement: a delivery with no time on record still gets its day', by('Delivered').fields.Date === asText && by('Dispatched').fields.Date !== 'Not recorded', [by('Delivered'), by('Dispatched'), asText]);

      st = await statement(ids.picked);
      const pkTruth = await truth(page, 'pickups', ids.picked);
      const pkText = await page.evaluate((dd) => new Date(dd + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), pkTruth);
      check('package statement: a pickup shows the day it was collected and who handed it over', by('Picked Up').fields.Date === pkText && !!by('Picked Up').fields['Handed over by'], [by('Picked Up'), pkText]);

      await page.evaluate((v) => { document.getElementById('customerPhoneInput').value = v; return loadCustomerStatement(); }, ids.phone);
      await sleep(300);
      const cs = await page.evaluate(() => {
        const el = document.createElement('div');
        el.innerHTML = window._customerStmtBodyHTML;
        const steps = [...el.querySelectorAll('.j-step')].map((x) => ({ step: x.querySelector('.j-status').innerText.trim(), date: (x.querySelector('.j-field-val') || {}).innerText }));
        window.__sheet = null;
        exportCustomerStatement();
        const rows = window.__sheet.rows;
        return { cards: el.querySelectorAll('.pkg-card').length, steps: steps.length, undated: steps.filter((x) => !/^\d{2} \w{3,4} \d{4}/.test(x.date)).length, cols: Object.keys(rows[0]), rowDates: rows.filter((r) => /^\d{4}-\d{2}-\d{2}/.test(r.Date)).length, rows: rows.length };
      });
      const why = await page.evaluate(() => {
        const S = window.__STUB_DATA.Shoppers, res = [];
        window.currentCustomerStatementData.forEach((p) => {
          [['inStore', 'packages'], ['dispatched', 'dispatch_events'], ['pickedUp', 'pickups'], ['delivered', 'deliveries']].forEach(([k, list]) => {
            if (!p[k]) return;
            const w = stepWhen(k, p[k]);
            if (w.known) return;
            const days = (S[list] || {}).daily || {};
            res.push({ id: p.packageId, step: k, storeDate: p[k].date, filedUnder: Object.keys(days).find((d) => days[d][p.packageId]) || '(none)', missed: dayIndexMissed(k, p.packageId) });
          });
        });
        return res;
      });
      check('customer statement: every step of every package is dated', cs.cards >= 5 && cs.steps >= 10 && cs.undated <= 1, [cs, why]);
      check('customer statement Excel: dates, rider phone and plate columns', cs.cols.includes('Rider Phone') && cs.cols.includes('Number Plate') && cs.rowDates >= cs.rows - 1, cs);
      await close(page);

      // ── Remembered: finished months are kept in this browser ───────────
      const kept = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('yps_days|1|')).map((k) => k.split('|').slice(2).join(' ')));
      const thisMonth = today.slice(0, 7);
      check('finished months are remembered in the browser, the running month is not', kept.filter((k) => k.startsWith('pickups')).length >= 6 && !kept.some((k) => k.endsWith(thisMonth)), kept);

      // ── SafeBoda on the road ───────────────────────────────────────────
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(1800);
      const road = await page.evaluate(() => {
        const el = document.getElementById('sfbTransit');
        return el ? { head: (el.querySelector('.sfbt-head') || {}).innerText, cards: [...el.querySelectorAll('.transit-rider-card')].map((c) => c.innerText.replace(/\s+/g, ' ').trim()), own: document.querySelectorAll('#transitSummary .transit-rider-card').length } : null;
      });
      check('on the road: SafeBoda trips appear under the transit panel, one card per trip', !!road && road.cards.length === 2 && /3 package\(s\) with 2 SafeBoda rider\(s\)/.test(road.head) && road.own === 1, road);
      check('…the accepted trip shows the rider and his phone, the other says no rider yet', !!road && road.cards.some((c) => c.includes('+256700900000') && c.includes('Peter Okello') && c.includes('Rider is coming to the shop')) && road.cards.some((c) => c.includes('No rider yet') && c.includes('Finding a rider')), road);
      await page.evaluate(() => document.getElementById('sfbTransit').scrollIntoView({ block: 'center' }));
      await sleep(300);
      await shot('road');
      await page.evaluate(() => [...document.querySelectorAll('#sfbTransit .transit-rider-card')].find((c) => c.innerText.includes('Peter Okello')).click());
      await sleep(400);
      const win = await page.evaluate(() => {
        const m = document.getElementById('sfbTransitModal');
        return { open: m.style.display === 'block', title: document.getElementById('sfbTransitTitle').innerText, tel: (m.querySelector('a[href^="tel:"]') || { getAttribute: () => '' }).getAttribute('href'), text: m.innerText.replace(/\s+/g, ' '), pkgs: m.querySelectorAll('.transit-pkg-card').length, actions: m.querySelectorAll('.transit-action-btn').length };
      });
      check('on the road: the window gives the rider’s phone and plate and lists his packages, with nothing to press', win.open && /Peter Okello/.test(win.title) && win.tel === 'tel:+256700900000' && win.text.includes('UFB 204K') && win.pkgs === 2 && win.actions === 0, win);
      await shot('road-window');
      // the trip ends: the packages leave transit
      await page.evaluate(() => { const S = window.__STUB_DATA; return firebase.database().ref('Shoppers/transit/safeboda').set(null); });
      await page.evaluate(() => (window.__STUB_LISTENERS || []).filter((l) => /transit\/safeboda$/.test(l.path)).forEach((l) => l.fire()));
      await sleep(500);
      const gone = await page.evaluate(() => ({ cards: document.querySelectorAll('#sfbTransit .transit-rider-card').length, text: document.getElementById('sfbTransitBody').innerText }));
      check('on the road: when the trip ends its card goes and the window says so', gone.cards === 0 && /no longer in transit/.test(gone.text), gone);
      await close(page);
      console.log('page errors would be listed above this line');
    },
  },
};
