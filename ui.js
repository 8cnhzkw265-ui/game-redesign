/* ==========================================================================
   FT.ui — shell behaviour shared by every page
   Preferences live in localStorage, the look is applied as data-attributes on
   <html> so the CSS layers do the painting, and every picker in the app is
   generated from js/catalog.js rather than hand-written markup — one source of
   truth for the 20 boards and 20 backgrounds.
   ========================================================================== */
(function (global) {
  'use strict';
  var FT = global.FT = global.FT || {};
  var C = FT.catalog, H = FT.hex;
  var doc = global.document;

  var VIEWS = ['play', 'watch', 'ranks', 'themes', 'system', 'rules', 'mobile'];
  var TITLES = {
    play: 'Arena · Fortress', watch: 'Watch · Fortress',
    ranks: 'Leaderboard · Fortress', themes: 'Arena library · Fortress',
    system: 'The Forged system · Fortress', rules: 'Rules of Fortress · Fortress',
    mobile: 'Mobile layout · Fortress'
  };

  /* ------------------------------------------------------------ preferences */
  function defaults() {
    var out = {};
    Object.keys(C.DEFAULTS).forEach(function (k) { out[k] = C.DEFAULTS[k]; });
    return out;
  }

  function loadPrefs() {
    var prefs = defaults();
    try {
      var raw = global.localStorage && global.localStorage.getItem(C.PREF_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        Object.keys(prefs).forEach(function (k) { if (saved[k] !== undefined) { prefs[k] = saved[k]; } });
      } else if (global.matchMedia && global.matchMedia('(prefers-color-scheme: light)').matches) {
        prefs.mode = 'light';
      }
    } catch (err) { /* storage blocked — defaults are perfectly usable */ }
    return prefs;
  }

  function savePrefs(prefs) {
    try { global.localStorage.setItem(C.PREF_KEY, JSON.stringify(prefs)); }
    catch (err) { /* ignore: private browsing, file://, quota */ }
    return prefs;
  }

  function applyLook(prefs) {
    var html = doc.documentElement;
    html.setAttribute('data-mode', prefs.mode === 'light' ? 'light' : 'dark');
    html.setAttribute('data-board', C.board(prefs.board).id);
    html.setAttribute('data-bg', C.background(prefs.background).id);
    /* The menu rail is part of the look: set it here so a saved "mini"
       preference never flashes a full-width sidebar on first paint. */
    html.setAttribute('data-rail', prefs.rail === 'mini' ? 'mini' : 'full');
    renderTokens(doc.getElementById('token-grid'));
    renderContrastTable(doc.getElementById('contrast-body'));
    return prefs;
  }

  /* ------------------------------------------------------------------ views */
  function setView(id, opts) {
    if (VIEWS.indexOf(id) < 0) { id = 'play'; }
    VIEWS.forEach(function (v) {
      var el = doc.getElementById('view-' + v);
      if (el) { el.classList.toggle('is-active', v === id); }
    });
    var navs = doc.querySelectorAll('[data-nav]');
    for (var i = 0; i < navs.length; i++) {
      var on = navs[i].getAttribute('data-nav') === id;
      if (on) { navs[i].setAttribute('aria-current', 'page'); }
      else { navs[i].removeAttribute('aria-current'); }
    }
    if (TITLES[id]) { doc.title = TITLES[id]; }
    if (!opts || opts.scroll !== false) { global.scrollTo(0, 0); }
    return id;
  }

  function route() { return setView(String(global.location.hash || '#play').replace('#', '')); }

  function linkNav() {
    global.addEventListener('hashchange', function () { route(); });
    var navs = doc.querySelectorAll('[data-nav]');
    for (var i = 0; i < navs.length; i++) {
      navs[i].addEventListener('click', function (evt) {
        var id = this.getAttribute('data-nav');
        evt.preventDefault();
        if (global.location.hash === '#' + id) { route(); }
        else { global.location.hash = '#' + id; }
      });
    }
    return VIEWS;
  }

  /* ---------------------------------------------------------------- toasts */
  function toast(title, body, kind) {
    var host = doc.getElementById('toasts');
    if (!host) { return null; }
    var el = doc.createElement('div');
    el.className = 'toast' + (kind ? ' is-' + kind : '');
    el.setAttribute('role', 'status');
    var strong = doc.createElement('b');
    strong.textContent = title;
    el.appendChild(strong);
    if (body) {
      var span = doc.createElement('span');
      span.textContent = body;
      el.appendChild(span);
    }
    host.appendChild(el);
    while (host.children.length > 3) { host.removeChild(host.firstChild); }
    global.setTimeout(function () {
      if (el.parentNode) { el.parentNode.removeChild(el); }
    }, 4600);
    return el;
  }


  /* ----------------------------------------------------------------- modal */
  var openOverlay = null;

  function closeModal() {
    if (openOverlay && openOverlay.parentNode) { openOverlay.parentNode.removeChild(openOverlay); }
    openOverlay = null;
  }

  function openModal(cfg) {
    var o = cfg || {};
    closeModal();
    var overlay = doc.createElement('div');
    overlay.className = 'overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', o.title || 'Dialog');

    var modal = doc.createElement('div');
    modal.className = 'modal' + (o.wide ? ' modal-lg' : '');

    var head = doc.createElement('div');
    head.className = 'modal-head';
    var title = doc.createElement('h3');
    title.textContent = o.title || '';
    head.appendChild(title);
    var close = doc.createElement('button');
    close.type = 'button';
    close.className = 'btn btn-ghost btn-icon modal-close';
    close.setAttribute('aria-label', 'Close dialog');
    close.textContent = '\u00d7';
    close.addEventListener('click', closeModal);
    head.appendChild(close);

    var body = doc.createElement('div');
    body.className = 'modal-body';
    if (typeof o.body === 'string') { body.innerHTML = o.body; }
    else if (o.body) { body.appendChild(o.body); }

    var foot = doc.createElement('div');
    foot.className = 'modal-foot';
    (o.actions || []).forEach(function (a) {
      var b = doc.createElement('button');
      b.type = 'button';
      b.className = 'btn ' + (a.kind || 'btn-secondary');
      b.textContent = a.label;
      b.addEventListener('click', function () {
        if (a.close !== false) { closeModal(); }
        if (a.onClick) { a.onClick(); }
      });
      foot.appendChild(b);
    });

    modal.appendChild(head);
    modal.appendChild(body);
    if (foot.children.length) { modal.appendChild(foot); }
    overlay.appendChild(modal);
    overlay.addEventListener('click', function (evt) {
      if (evt.target === overlay && !o.sticky) { closeModal(); }
    });
    doc.body.appendChild(overlay);
    openOverlay = overlay;
    try { (foot.querySelector('.btn') || close).focus(); } catch (err) { /* best effort */ }
    return overlay;
  }

  doc.addEventListener('keydown', function (evt) {
    if (evt.key === 'Escape' && openOverlay) { closeModal(); }
  });

  /* ---------------------------------------------------------------- helpers */
  function el(tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined && text !== null) { e.textContent = text; }
    return e;
  }

  function clear(node) {
    if (!node) { return null; }
    while (node.firstChild) { node.removeChild(node.firstChild); }
    return node;
  }

  /* The clock is the one number that must read from across the room. */
  function fmtClock(sec) {
    if (sec === null || sec === undefined || !isFinite(sec)) { return '--:--'; }
    var s = Math.max(0, Math.floor(sec));
    var m = Math.floor(s / 60), rest = s % 60;
    if (m >= 60) {
      var h = Math.floor(m / 60);
      return h + ':' + String(m % 60).padStart(2, '0') + ':' + String(rest).padStart(2, '0');
    }
    return m + ':' + String(rest).padStart(2, '0');
  }

  var NS = 'http://www.w3.org/2000/svg';

  function svgPath(d, cls, fill, stroke, width) {
    var p = doc.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    if (cls) { p.setAttribute('class', cls); }
    if (fill) { p.setAttribute('fill', fill); }
    if (stroke) { p.setAttribute('stroke', stroke); }
    if (width) { p.setAttribute('stroke-width', width); }
    return p;
  }

  function polygon(radius, scale) {
    var pts = H.points(radius, scale).split(' ');
    var d = 'M' + pts[0];
    for (var i = 1; i < pts.length; i++) { d += 'L' + pts[i]; }
    return d + 'Z';
  }

  /* Two hexes and a plate: enough to read a material at a glance. Flat-top
     cells, matching the arena — a neighbour sits sqrt3*R above or below. */
  function miniBoard() {
    var R = 10, dy = R * Math.sqrt(3) / 2;
    var svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('viewBox',
      (-R - 1).toFixed(1) + ' ' + (-dy - R - 1).toFixed(1) + ' ' +
      (2 * R + 2).toFixed(1) + ' ' + (2 * dy + 2 * R + 2).toFixed(1));
    [-dy, dy].forEach(function (y) {
      var g = doc.createElementNS(NS, 'g');
      g.setAttribute('transform', 'translate(0,' + y.toFixed(2) + ')');
      g.appendChild(svgPath(polygon(R, 1), 'cell', 'var(--cell-a)', 'var(--cell-line)', 1));
      g.appendChild(svgPath(polygon(R, 0.78), 'cell-inner', 'var(--cell-b)', null, null));
      g.appendChild(svgPath(polygon(R * 0.62, 1), 'p-plate', 'var(--p-w-a)', 'var(--p-w-line)', 1));
      g.appendChild(svgPath(polygon(R * 0.62, 0.7), 'p-inner', 'var(--p-w-b)', null, null));
      svg.appendChild(g);
    });
    return svg;
  }

  /* ---------------------------------------------------------------- pickers */
  function fillThemeGrid(host, prefs, onPick, group) {
    if (!host) { return null; }
    clear(host);
    C.BOARDS.forEach(function (b) {
      if (group && group !== 'all' && b.group !== group) { return; }
      var card = el('button', 'theme-card');
      card.type = 'button';
      card.setAttribute('data-board', b.id);
      card.setAttribute('aria-pressed', b.id === prefs.board ? 'true' : 'false');
      card.setAttribute('aria-label', b.name + ' board theme');
      if (b.id === C.DEFAULTS.board) { card.classList.add('is-default'); }
      var swatch = el('span', 'swatch');
      var face = el('span', 'swatch-board');
      face.appendChild(miniBoard());
      swatch.appendChild(face);
      card.appendChild(swatch);
      card.appendChild(el('span', 'name', b.name));
      card.appendChild(el('span', 'sub', b.group + ' · ' + b.sub));
      card.addEventListener('click', function () { onPick(b.id); });
      host.appendChild(card);
    });
    return host;
  }

  function fillBackgroundGrid(host, prefs, onPick, group) {
    if (!host) { return null; }
    clear(host);
    C.BACKGROUNDS.forEach(function (b) {
      if (group && group !== 'all' && b.group !== group) { return; }
      var card = el('button', 'choice-card');
      card.type = 'button';
      card.setAttribute('aria-pressed', b.id === prefs.background ? 'true' : 'false');
      card.setAttribute('aria-label', b.name + ' background');
      var chip = el('span', 'bg-chip');
      chip.setAttribute('data-bg', b.id);
      card.appendChild(chip);
      card.appendChild(el('b', null, b.name));
      card.appendChild(el('span', 'meta', b.group + ' · ' + b.sub));
      card.addEventListener('click', function () { onPick(b.id); });
      host.appendChild(card);
    });
    return host;
  }

  function fillSegmented(host, options, current, onPick) {
    if (!host) { return null; }
    clear(host);
    options.forEach(function (o) {
      var b = el('button', null, o.label);
      b.type = 'button';
      b.setAttribute('aria-pressed', o.id === current ? 'true' : 'false');
      b.addEventListener('click', function () { onPick(o.id); });
      host.appendChild(b);
    });
    return host;
  }

  /* The seven-level ladder is a card grid, not a segmented bar. Seven labels
     will not fit on one row inside the 372px turn rail, and squeezing them
     would produce a control that is unreadable and hard to hit. The cards are
     the same control the board and clock pickers already use, so the three
     pickers in a dialog look like one family.

     Each card carries its rung number as well as its name, because the ladder
     is an ordered thing and "Sovereign" alone does not say where it sits. */
  function fillLevelGrid(host, prefs, onPick) {
    if (!host) { return null; }
    clear(host);
    C.DIFFICULTIES.forEach(function (d) {
      var card = el('button', 'choice-card level-card');
      card.type = 'button';
      card.setAttribute('data-level', d.id);
      card.setAttribute('aria-pressed', d.id === prefs.difficulty ? 'true' : 'false');
      card.setAttribute('aria-label', 'Level ' + d.level + ' of ' + C.DIFFICULTIES.length + ', ' + d.name);
      var head = el('span', 'level-head');
      head.appendChild(el('span', 'level-no', String(d.level)));
      head.appendChild(el('b', null, d.name));
      card.appendChild(head);
      card.appendChild(el('span', 'meta', d.sub));
      card.addEventListener('click', function () { onPick(d.id); });
      host.appendChild(card);
    });
    return host;
  }


  /* --------------------------------------------------- design-system readouts */
  var TOKENS = [
    ['--text-1', 'Body text and headings'],
    ['--text-2', 'Secondary copy'],
    ['--text-3', 'Meta labels only — never body copy'],
    ['--accent', 'Primary accent: the action the game awaits'],
    ['--move', 'Legal move / destination'],
    ['--danger', 'Threat, capture, resign'],
    ['--success', 'Confirmed, survived'],
    ['--warning', 'Collapse, stagnation risk'],
    ['--info', 'Neutral information'],
    ['--promo', 'Promotion square'],
    ['--surface-1', 'Panel surface'],
    ['--surface-2', 'Panel header, chrome'],
    ['--surface-inset', 'Inset well: inputs, meters, board stage'],
    ['--line', 'Hairline border'],
    ['--cell-a', 'Board cell (board theme)'],
    ['--cell-b', 'Board cell inner (board theme)'],
    ['--cell-line', 'Cell inlay line (board theme)'],
    ['--p-w-a', 'White piece plate'],
    ['--p-b-a', 'Black piece plate']
  ];

  var PAIRS = [
    ['--text-1', '--surface-1', 'Body text on a panel', 4.5],
    ['--text-2', '--surface-1', 'Secondary copy on a panel', 4.5],
    ['--text-3', '--surface-1', 'Meta labels on a panel', 4.5],
    ['--accent', '--surface-1', 'Accent text on a panel', 3],
    ['--on-accent', '--accent', 'Button label on the accent fill', 4.5],
    ['--move', '--surface-1', 'Move colour on a panel', 3],
    ['--danger', '--surface-1', 'Threat colour on a panel', 3],
    ['--cell-coord', '--cell-a', 'Coordinates on a cell', 3],
    ['--p-w-ink', '--p-w-a', 'White glyph on its plate', 4.5],
    ['--p-b-ink', '--p-b-a', 'Black glyph on its plate', 4.5]
  ];

  function probe() {
    var p = doc.getElementById('ft-color-probe');
    if (!p) {
      p = el('span', null, '');
      p.id = 'ft-color-probe';
      p.setAttribute('aria-hidden', 'true');
      p.style.position = 'absolute';
      p.style.left = '-9999px';
      p.style.top = '0';
      p.style.width = '1px';
      p.style.height = '1px';
      doc.body.appendChild(p);
    }
    return p;
  }

  /* Resolve any token (even color-mix()) to rgb by asking the browser. */
  function resolveColor(varName) {
    var p = probe();
    p.style.color = 'var(' + varName + ')';
    var nums = String(global.getComputedStyle(p).color).match(/-?\d*\.?\d+/g) || [];
    return [+nums[0] || 0, +nums[1] || 0, +nums[2] || 0];
  }

  function luminance(rgb) {
    var ch = rgb.map(function (v) {
      var s = Math.min(1, Math.max(0, v / 255));
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }

  function contrast(a, b) {
    var l1 = luminance(a), l2 = luminance(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  function renderTokens(host) {
    if (!host) { return null; }
    var cs = global.getComputedStyle(doc.documentElement), rows = [];
    TOKENS.forEach(function (row) {
      var value = String(cs.getPropertyValue(row[0])).trim();
      var wrap = el('div', 'row-3');
      var chip = el('span');
      chip.setAttribute('aria-hidden', 'true');
      chip.style.width = '34px';
      chip.style.height = '22px';
      chip.style.flex = '0 0 auto';
      chip.style.borderRadius = 'var(--r-xs)';
      chip.style.border = '1px solid var(--line-strong)';
      chip.style.background = 'var(' + row[0] + ')';
      var text = el('div', 'grow');
      text.appendChild(el('div', 'mono', row[0] + '  ' + (value || 'resolved by the browser')));
      text.appendChild(el('div', 'meta', row[1]));
      wrap.appendChild(chip);
      wrap.appendChild(text);
      rows.push(wrap);
    });
    clear(host);
    rows.forEach(function (r) { host.appendChild(r); });
    return host;
  }

  function renderContrastTable(tbody) {
    if (!tbody) { return null; }
    clear(tbody);
    PAIRS.forEach(function (row) {
      var ratio = contrast(resolveColor(row[0]), resolveColor(row[1]));
      var tr = el('tr');
      tr.appendChild(el('td', null, row[0] + ' on ' + row[1]));
      var td = el('td', 'num', ratio.toFixed(2) + ':1');
      td.className = 'num ' + (ratio >= row[3] ? 'text-success' : 'text-danger');
      tr.appendChild(td);
      tr.appendChild(el('td', null, ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA large / UI' : 'below 3'));
      tr.appendChild(el('td', 'meta', row[2]));
      tbody.appendChild(tr);
    });
    return tbody;
  }

  /* ---------------------------------------------------------------- account
     There is no server in this build, so an "account" is a local record: one
     name and one passphrase, hashed, kept in this browser's storage. That is
     honest about what it is — it is enough to show the signed-in experience
     and to carry a rating between reloads, and it is not a substitute for a
     real auth service. The password is never stored, only a salted digest of
     it, so reading storage back does not hand over the passphrase itself. */
  function hashPass(pass, salt) {
    var s = salt + ' ' + pass, h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 16777619) >>> 0;   /* FNV-1a: small, fast, good enough here */
    }
    return h.toString(16);
  }

  function makeSalt() {
    var s = '';
    for (var i = 0; i < 4; i++) { s += Math.floor(Math.random() * 0x10000).toString(16); }
    return s;
  }

  function cleanName(name) {
    return String(name || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  }

  function initials(name) {
    var parts = cleanName(name).split(' ').filter(Boolean);
    if (!parts.length) { return 'G'; }
    if (parts.length === 1) { return parts[0].charAt(0).toUpperCase(); }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function validEmail(mail) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(mail || '').trim()); }

  function loadAccount() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(C.ACCOUNT_KEY);
      if (!raw) { return null; }
      var rec = JSON.parse(raw);
      return (rec && rec.name && rec.hash) ? rec : null;
    } catch (err) { return null; }
  }

  function saveAccount(rec) {
    try {
      if (rec) { global.localStorage.setItem(C.ACCOUNT_KEY, JSON.stringify(rec)); }
      else { global.localStorage.removeItem(C.ACCOUNT_KEY); }
    } catch (err) { /* storage blocked — the session still works in memory */ }
    return rec;
  }

  function signUp(name, mail, pass) {
    var clean = cleanName(name);
    if (clean.length < 2) { return { ok: false, field: 'name', error: 'Pick a name of at least two characters.' }; }
    if (!validEmail(mail)) { return { ok: false, field: 'email', error: 'That does not look like an email address.' }; }
    if (String(pass).length < 8) { return { ok: false, field: 'pass', error: 'Use at least eight characters.' }; }
    var salt = makeSalt();
    var rec = {
      name: clean,
      email: String(mail).trim(),
      salt: salt,
      hash: hashPass(pass, salt),
      rating: 1200,
      wins: 0, losses: 0, draws: 0,
      since: new Date().toISOString().slice(0, 10)
    };
    saveAccount(rec);
    return { ok: true, account: rec };
  }

  function signIn(mail, pass) {
    var rec = loadAccount();
    if (!rec) { return { ok: false, field: 'mail', error: 'No account on this browser yet. Create one first.' }; }
    var mailOk = String(mail).trim().toLowerCase() === String(rec.email).toLowerCase();
    if (!mailOk || hashPass(pass, rec.salt) !== rec.hash) {
      return { ok: false, field: 'pass', error: 'That email and passphrase do not match.' };
    }
    return { ok: true, account: rec };
  }

  function signOut() { saveAccount(null); return null; }

  /* -------------------------------------------------------------- session
     The live game, so a refresh does not throw the position away. It is
     deliberately a separate key from the prefs: a stale session must be
     droppable without un-flipping anybody's board, and a broken one must not
     be able to take the preferences down with it. */
  function loadSession() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(C.SESSION_KEY);
      if (!raw) { return null; }
      var rec = JSON.parse(raw);
      return (rec && rec.v === 1 && rec.state) ? rec : null;
    } catch (err) { return null; }
  }

  function saveSession(rec) {
    try {
      if (rec) { global.localStorage.setItem(C.SESSION_KEY, JSON.stringify(rec)); }
      else { global.localStorage.removeItem(C.SESSION_KEY); }
    } catch (err) { /* storage blocked or over quota — the game runs in memory */ }
    return rec;
  }

  function clearSession() { return saveSession(null); }

  /* One place decides what the session block says, so signing in and reloading
     can never disagree about who is at the keyboard. */
  function sessionLabel(account) {
    if (!account) { return { name: 'guest43', badge: 'Guest', sub: 'Guest session', initials: 'G' }; }
    var played = account.wins + account.losses + account.draws;
    return {
      name: account.name,
      badge: String(account.rating),
      sub: played ? (account.wins + 'W · ' + account.losses + 'L · ' + account.draws + 'D')
                  : 'Signed in · no games yet',
      initials: initials(account.name)
    };
  }

  /* A result only counts for the side the human actually played. */
  function recordResult(account, result, humanSide) {
    if (!account) { return null; }
    if (result === 'draw') { account.draws += 1; }
    else if (result === humanSide) { account.wins += 1; }
    else { account.losses += 1; }
    saveAccount(account);
    return account;
  }


  FT.ui = {
    VIEWS: VIEWS,
    defaults: defaults,
    loadPrefs: loadPrefs,
    savePrefs: savePrefs,
    applyLook: applyLook,
    loadAccount: loadAccount,
    saveAccount: saveAccount,
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    loadSession: loadSession,
    saveSession: saveSession,
    clearSession: clearSession,
    sessionLabel: sessionLabel,
    recordResult: recordResult,
    setView: setView,
    route: route,
    linkNav: linkNav,
    toast: toast,
    openModal: openModal,
    closeModal: closeModal,
    el: el,
    clear: clear,
    fmtClock: fmtClock,
    polygon: polygon,
    svgPath: svgPath,
    miniBoard: miniBoard,
    fillThemeGrid: fillThemeGrid,
    fillBackgroundGrid: fillBackgroundGrid,
    fillSegmented: fillSegmented,
    fillLevelGrid: fillLevelGrid,
    renderTokens: renderTokens,
    renderContrastTable: renderContrastTable,
    resolveColor: resolveColor,
    contrast: contrast
  };
})(window);

