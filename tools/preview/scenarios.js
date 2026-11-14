// Scenarios for preview.js. Each has an optional `variant` for the pretend
// function and `steps({page, shot, sleep})`.
const openSettings = async (page, sleep) => {
  await page.evaluate(() => {
    const t = document.querySelector('.nav-tab[data-tab="settings"]');
    if (t) t.click();
  });
  await sleep(1200);
};
const toSafeboda = async (page, sleep, wait = 5000) => {
  await page.evaluate(() => {
    const el = document.getElementById('sfbSection');
    if (el) el.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -80);
  });
  await sleep(wait);
};
const clickTab = async (page, sleep, name) => {
  await page.evaluate((n) => {
    const b = [...document.querySelectorAll('.sfb-tab')].find((x) => x.textContent.includes(n));
    if (b) b.click();
  }, name);
  await sleep(4000);
};
const type = async (page, id, text) => {
  await page.click('#' + id, { clickCount: 3 });
  await page.type('#' + id, text, { delay: 5 });
};
const text = (page, id) => page.evaluate((i) => (document.getElementById(i) || {}).textContent || '', id);

module.exports = {
  // What the Settings page looks like before anything is added.
  before: {
    steps: async ({ page, shot, sleep }) => {
      await openSettings(page, sleep);
      await shot('top');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(500);
      await shot('bottom');
    },
  },

  // Uganda: connected on the live server with the keys kept on the server.
  open: {
    steps: async ({ page, shot, sleep }) => {
      await openSettings(page, sleep);
      await toSafeboda(page, sleep, 7000);
      await shot('uganda');
      await shot('uganda-section', '#sfbSection');
    },
  },

  // Kenya: nothing set up, no shop contact.
  kenya: {
    steps: async ({ page, shot, sleep }) => {
      await openSettings(page, sleep);
      await toSafeboda(page, sleep, 5000);
      await clickTab(page, sleep, 'Kenya');
      await shot('empty-section', '#sfbSection');
    },
  },

  // Kenya goes live: wrong keys first, then the right ones, with the dialogs.
  golive: {
    steps: async ({ page, shot, sleep }) => {
      await openSettings(page, sleep);
      await toSafeboda(page, sleep, 4000);
      await clickTab(page, sleep, 'Kenya');
      await page.evaluate(() => document.querySelector('input[name="sfbEnv"][value="production"]').click());
      await sleep(300);
      // one field only
      await type(page, 'sfbKey', 'ke-live-key-7001');
      await page.click('#sfbSave');
      await sleep(300);
      console.log('half:', await text(page, 'sfbAcctMsg'));
      // wrong secret
      await type(page, 'sfbSecret', 'wrong-secret');
      await type(page, 'sfbKey', 'ke-live-key-0000');
      await page.click('#sfbSave');
      await sleep(500);
      await shot('confirm');
      await page.click('#confirmOkBtn');
      await sleep(400);
      await shot('password');
      await page.type('#sfbPassInput', 'not-my-password');
      await page.keyboard.press('Enter');
      await sleep(1200);
      console.log('wrong password:', await text(page, 'sfbPassErr'));
      await shot('password-wrong');
      await page.type('#sfbPassInput', 'preview-pass');
      await page.keyboard.press('Enter');
      await sleep(1500);
      console.log('wrong keys:', await text(page, 'sfbAcctMsg'));
      await shot('rejected', '#sfbSection');
      // right keys; the password is remembered now
      await type(page, 'sfbKey', 'ke-live-key-7001');
      await page.click('#sfbSave');
      await sleep(500);
      await page.click('#confirmOkBtn');
      await sleep(200);
      await shot('checking', '#sfbSection');
      await sleep(1500);
      console.log('result:', await text(page, 'sfbAcctMsg'), '|', await text(page, 'sfbStateT'), '|', await text(page, 'sfbStateS'));
      await shot('saved', '#sfbSection');
      console.log('key field after save:', JSON.stringify(await page.evaluate(() => [document.getElementById('sfbKey').value, document.getElementById('sfbSecret').value])));
      // test connection, then back to test without test keys
      await page.click('#sfbTest');
      await sleep(1200);
      console.log('test:', await text(page, 'sfbAcctMsg'));
      await page.evaluate(() => document.querySelector('input[name="sfbEnv"][value="staging"]').click());
      await sleep(200);
      console.log('note:', await text(page, 'sfbEnvNote'));
      await page.click('#sfbSave');
      await sleep(1500);
      console.log('to test without keys:', await text(page, 'sfbAcctMsg'));
      await shot('missing', '#sfbSection');
    },
  },

  // Shop contact: search, paste, drag, save.
  shop: {
    steps: async ({ page, shot, sleep }) => {
      await openSettings(page, sleep);
      await toSafeboda(page, sleep, 6000);
      await clickTab(page, sleep, 'Kenya');
      await page.click('#sfbShopSave');
      await sleep(200);
      console.log('empty save:', await text(page, 'sfbShopMsg'));
      await type(page, 'sfbName', 'Your Personal Shopper Nairobi');
      await type(page, 'sfbPhone', '0712 345 678');
      await type(page, 'sfbFind', 'Kenyatta Avenue');
      await page.click('#sfbFindBtn');
      await sleep(4000);
      await shot('results', '#sfbSection');
      const n = await page.evaluate(() => document.querySelectorAll('.sfb-result').length);
      console.log('results:', n);
      if (n) await page.evaluate(() => document.querySelector('.sfb-result').click());
      await sleep(3500);
      console.log('after pick:', await text(page, 'sfbCoords'), '| address:', await page.evaluate(() => document.getElementById('sfbAddress').value), '|', await text(page, 'sfbShopMeta'));
      await type(page, 'sfbFind', '-1.283300, 36.816700');
      await page.keyboard.press('Enter');
      await sleep(2500);
      console.log('after coords:', await text(page, 'sfbCoords'));
      await type(page, 'sfbFind', 'https://maps.app.goo.gl/abc123');
      await page.keyboard.press('Enter');
      await sleep(2500);
      console.log('after link:', await text(page, 'sfbCoords'));
      await type(page, 'sfbFind', '-1.286389, 36.817223');
      await page.keyboard.press('Enter');
      await sleep(3000);
      // click the map a little off centre
      const box = await (await page.$('#sfbMap')).boundingBox();
      await page.mouse.click(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30);
      await sleep(800);
      console.log('after map click:', await text(page, 'sfbCoords'));
      await shot('placed', '#sfbSection');
      await page.click('#sfbShopSave');
      await sleep(800);
      console.log('result:', await text(page, 'sfbShopMsg'), '|', await text(page, 'sfbShopMeta'));
      await shot('saved', '#sfbSection');
      // leaving with unsaved edits
      await type(page, 'sfbName', 'Changed');
      await clickTab(page, sleep, 'Uganda');
      await shot('leave');
    },
  },

  // The real function (status only: nothing is saved), pretend database.
  real: {
    variant: { real: true },
    steps: async ({ page, shot, sleep }) => {
      await openSettings(page, sleep);
      await toSafeboda(page, sleep, 9000);
      console.log('tabs:', await page.evaluate(() => [...document.querySelectorAll('.sfb-tab')].map((b) => b.textContent.trim()).join(' | ')));
      console.log('state:', await text(page, 'sfbStateT'), '|', await text(page, 'sfbStateS'));
      await shot('uganda', '#sfbSection');
      await page.click('#sfbTest');
      await sleep(4000);
      console.log('test:', await text(page, 'sfbAcctMsg'), '|', await text(page, 'sfbStateT'));
      await clickTab(page, sleep, 'Kenya');
      console.log('kenya:', await text(page, 'sfbStateT'), '|', await text(page, 'sfbStateS'));
      await shot('kenya', '#sfbSection');
    },
  },

  // Someone who can open Settings but is not an admin.
  readonly: {
    variant: { role: 'receptionist' },
    steps: async ({ page, shot, sleep }) => {
      await openSettings(page, sleep);
      await toSafeboda(page, sleep, 6000);
      await shot('section', '#sfbSection');
    },
  },

  // The server cannot be reached.
  offline: {
    variant: { offline: true },
    steps: async ({ page, shot, sleep }) => {
      await openSettings(page, sleep);
      await toSafeboda(page, sleep, 6000);
      await shot('section', '#sfbSection');
    },
  },
};

Object.assign(module.exports, require('./scenarios_perf.js'));
Object.assign(module.exports, require('./scenarios_debug.js'));
Object.assign(module.exports, require('./scenarios_tables.js'));
Object.assign(module.exports, require('./scenarios_real.js'));
Object.assign(module.exports, require('./scenarios_journey.js'));
Object.assign(module.exports, require('./scenarios_debug2.js'));
