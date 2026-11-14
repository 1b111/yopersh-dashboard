# Dashboard preview and checks

Runs the dashboard (`..\..\work\index.html`) in headless Chrome against a
pretend database, so a change can be looked at and checked before it is
published. Nothing here reaches Firebase or SafeBoda, except the two
scenarios marked "real" below, which only read.

This folder is outside `work`, so it is never published.

## Once

```
cd C:\Users\jonathan basaki\sayfa_fixed\sayfa\tools\preview
npm install puppeteer-core
```

Chrome is expected at `C:\Program Files\Google\Chrome\Application\chrome.exe`.

## Running

```
node preview.js ..\..\work out <scenario> [width] [height]
node check_scripts.js ..\..\work\index.html
```

Screenshots land in `out\`. `check_scripts.js` syntax-checks every inline
script of the page.

| Scenario | What it does |
|---|---|
| `journey` | When each step happened and who did it: the date column of each table, package details, both statements, the Excel sheets, SafeBoda packages on the road (33 checks) |
| `tables` | Long tables: first screenful, more on scroll, row buttons, the store's tick boxes, live updates, SafeBoda rider names, search (27 checks) |
| `slowyear` | The year's lists arriving late: order of asking, figures, "Loading" (4 checks) |
| `perf` | Times opening each year table with a made-up year of 47,000 records |
| `columns` | Cells under their headings after opening, searching and a live update |
| `open`, `kenya`, `golive`, `shop`, `readonly`, `offline` | Settings → SafeBoda delivery, with a pretend server |
| `real` | The SafeBoda section against the real server (status only, nothing saved) |
| `realmonth` | This month's real records through the tables; prints counts only |

## How it works

- `stub_firebase.js` replaces the Firebase SDK with an in-memory database
  seeded in `preview.js` (`SEED`, plus a made-up year when a scenario asks
  for `big`).
- The sign-in is skipped by setting `sessionStorage` before the page loads.
- The service worker is switched off: on a first visit it reloads the page
  once, which cuts a scenario in half.
- The `safeboda` function is replaced by a small pretend one in
  `installMocks`; its password is `preview-pass`.

## Publishing the dashboard

```
cd C:\Users\jonathan basaki\sayfa_fixed\sayfa
firebase deploy --only hosting --project yopersh
```

Bump `CACHE_VERSION` in `work\sw.js` first, and keep a copy of the page in
`..\..\backups\`.
