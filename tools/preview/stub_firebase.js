// Stands in for the Firebase SDK in previews: an in-memory database seeded
// from window.__STUB_DATA. Nothing reaches the real database.
(function () {
  var root = JSON.parse(JSON.stringify(window.__STUB_DATA || {}));
  var writes = (window.__STUB_WRITES = []);
  function split(p) { return String(p || '').split('/').filter(Boolean); }
  function clone(v) { return v === undefined || v === null ? null : JSON.parse(JSON.stringify(v)); }
  function get(parts) {
    var n = root;
    for (var i = 0; i < parts.length; i++) {
      if (n === null || typeof n !== 'object') return null;
      n = n[parts[i]];
      if (n === undefined) return null;
    }
    return n;
  }
  function put(parts, value) {
    if (!parts.length) { root = value || {}; return; }
    var n = root;
    for (var i = 0; i < parts.length - 1; i++) {
      if (n[parts[i]] === null || typeof n[parts[i]] !== 'object') n[parts[i]] = {};
      n = n[parts[i]];
    }
    if (value === null || value === undefined) delete n[parts[parts.length - 1]];
    else n[parts[parts.length - 1]] = clone(value);
  }
  function snap(parts) {
    var v = clone(get(parts));
    if (parts.join('/') === '.info/connected') v = true;
    return {
      key: parts.length ? parts[parts.length - 1] : null,
      val: function () { return v; },
      exists: function () { return v !== null; },
      numChildren: function () { return v && typeof v === 'object' ? Object.keys(v).length : 0; },
      hasChild: function (c) { return !!(v && typeof v === 'object' && v[c] !== undefined); },
      hasChildren: function () { return !!(v && typeof v === 'object' && Object.keys(v).length); },
      child: function (c) { return snap(parts.concat(split(c))); },
      forEach: function (cb) {
        // Children come from the copy already made, one clone per val() like the real SDK.
        if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { cb(childSnap(parts, k, v[k])); });
        return false;
      },
      get ref() { return ref(parts.join('/')); },
    };
  }
  function childSnap(parts, k, value) {
    return {
      key: k,
      val: function () { return clone(value); },
      exists: function () { return value !== null && value !== undefined; },
      numChildren: function () { return value && typeof value === 'object' ? Object.keys(value).length : 0; },
      hasChild: function (c) { return !!(value && typeof value === 'object' && value[c] !== undefined); },
      child: function (c) { return snap(parts.concat([k]).concat(split(c))); },
      forEach: function (cb) { return snap(parts.concat([k])).forEach(cb); },
      get ref() { return ref(parts.concat([k]).join('/')); },
    };
  }
  var pushN = 0;
  function ref(path) {
    var parts = split(path);
    var r = {
      key: parts.length ? parts[parts.length - 1] : null,
      toString: function () { return parts.join('/'); },
      child: function (c) { return ref(parts.concat(split(c)).join('/')); },
      once: function (ev, cb) { (window.__STUB_READS = window.__STUB_READS || []).push(parts.join('/')); var s = snap(parts); if (typeof cb === 'function') setTimeout(function () { cb(s); }, 0); return Promise.resolve(s); },
      on: function (ev, cb) {
        if (ev === 'value') (window.__STUB_LISTENERS = window.__STUB_LISTENERS || []).push({ path: parts.join('/'), fire: function () { cb(snap(parts)); } });
        setTimeout(function () {
          if (ev === 'value') cb(snap(parts));
          else if (ev === 'child_added') snap(parts).forEach(function (c) { cb(c); });
        }, (window.__STUB_DELAY && window.__STUB_DELAY(parts.join('/'))) || 0);
        return cb;
      },
      off: function () {},
      get: function () { return Promise.resolve(snap(parts)); },
      set: function (v) { writes.push({ op: 'set', path: parts.join('/'), value: clone(v) }); put(parts, v); return Promise.resolve(); },
      update: function (o) {
        writes.push({ op: 'update', path: parts.join('/'), value: clone(o) });
        Object.keys(o || {}).forEach(function (k) { put(parts.concat(split(k)), o[k]); });
        return Promise.resolve();
      },
      remove: function () { writes.push({ op: 'remove', path: parts.join('/') }); put(parts, null); return Promise.resolve(); },
      push: function (v) {
        var c = ref(parts.concat(['-stub' + (++pushN)]).join('/'));
        if (v !== undefined) c.set(v);
        return c;
      },
      transaction: function (fn) { var next = fn(clone(get(parts))); if (next !== undefined) put(parts, next); return Promise.resolve({ committed: next !== undefined, snapshot: snap(parts) }); },
      onDisconnect: function () { var p = function () { return Promise.resolve(); }; return { set: p, remove: p, update: p, cancel: p }; },
    };
    ['orderByChild', 'orderByKey', 'orderByValue', 'equalTo', 'limitToLast', 'limitToFirst', 'startAt', 'endAt', 'startAfter', 'endBefore']
      .forEach(function (m) { r[m] = function () { return r; }; });
    Object.defineProperty(r, 'parent', { get: function () { return parts.length ? ref(parts.slice(0, -1).join('/')) : null; } });
    Object.defineProperty(r, 'ref', { get: function () { return r; } });
    return r;
  }
  var db = { ref: function (p) { return ref(p || ''); }, goOnline: function () {}, goOffline: function () {} };
  var database = function () { return db; };
  database.ServerValue = { TIMESTAMP: Date.now(), increment: function (n) { return n; } };
  window.firebase = { apps: [], initializeApp: function () { return {}; }, database: database };
})();
