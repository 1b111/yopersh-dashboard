// Why are some steps of a customer statement undated? Loaded by scenarios.js.
module.exports = {
  undated: {
    variant: { big: { packages: 6000, dispatch: 5600, pickups: 1500, deliveries: 3500 } },
    steps: async ({ page, sleep }) => {
      await sleep(5000);
      const out = await page.evaluate(async () => {
        const y = String(new Date().getFullYear()), S = window.__STUB_DATA.Shoppers;
        const del = S.deliveries.annual[y];
        const rider = Object.keys(del).find((k) => del[k].deliveredAt && del[k].assignedAt && !del[k].deliveryProvider);
        document.getElementById('customerPhoneInput').value = del[rider].customerPhone;
        await loadCustomerStatement();
        const res = [];
        window.currentCustomerStatementData.forEach((p) => {
          [['inStore', 'packages'], ['dispatched', 'dispatch_events'], ['pickedUp', 'pickups'], ['delivered', 'deliveries']].forEach(([k, list]) => {
            if (!p[k]) return;
            const w = stepWhen(k, p[k]);
            if (w.known) return;
            const days = (S[list] || {}).daily || {};
            const filed = Object.keys(days).find((d) => days[d][p.packageId]) || '(none)';
            res.push({ id: p.packageId, step: k, storeDate: p[k].date, filedUnder: filed, ts: typeof p[k].timestamp, missed: dayIndexMissed(k, p.packageId), inIndex: dayIndexGet(k, p.packageId) });
          });
        });
        return res;
      });
      console.log(JSON.stringify(out, null, 1));
    },
  },
};
