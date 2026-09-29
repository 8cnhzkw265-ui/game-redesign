/* ==========================================================================
   FT.app — the game itself
   Owns one rules state, paints every mounted board from it, and enforces the
   rhythm the rules define: Move 1 -> Move 2 -> Preview -> Accept. The human
   always presses Accept (that is the decision point); the bot plans a whole
   turn with js/bot.js and then accepts on its own.
   ========================================================================== */
(function (global) {
  'use strict';
  var FT = global.FT, U = FT.ui, C = FT.catalog, H = FT.hex, R = FT.rules, B = FT.bot;
  var SND = FT.sound;
  var doc = global.document;

  /* Watch/Ranks render from js/social.js; the filter is the only piece of
     state these two pages own, and it never survives a reload. */
  var S = FT.social;
  var watchFilter = 'all';

  var prefs = null;
  var state = null;
  var human = 'white';
  var vsAI = true;
  var account = null;
  var selected = null;
  var lastMove = null;
  var boards = [];
  var clocks = null;
  var clockTimer = null;
  var aiTimer = null;
  var hintTimer = null;
  var busy = false;
  var scored = false;
  var hinted = [];
  var filters = { themes: 'all', backgrounds: 'all' };
  var roomCode = null;
  var clockSavedSecond = -1;
  var savedClocks = null;

  function $(sel) { return doc.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(doc.querySelectorAll(sel)); }
  function setText(sel, text) { var n = $(sel); if (n) { n.textContent = text; } }

  /* --------------------------------------------------------------- session
     A refresh used to end the game: boot() opened a fresh position behind the
     hero, so reloading threw away the board, the move log, the side you were
     playing and both clocks. The session record below is the whole live game
     — position, side, opponent, clocks, which page you were on — written on
     every render and read back on boot.

     What is deliberately NOT saved: `selected`, `hinted` and `busy`. They are
     mid-interaction scratch state (a picked piece, a hint on the board, the
     bot's turn in flight), and restoring any of them would put the player into
     a gesture they never finished making. The last move IS saved, because the
     highlight it draws is how the board says "this is where we got to".

     Saving on every render rather than on a timer is what keeps it honest:
     render() is the one place every state change already passes through, so a
     move, an accept, an undo, a new game and a side change are all captured by
     the same call, and none of them can be forgotten. */
  function saveSession() {
    if (!state) { return; }
    U.saveSession({
      v: 1,
      state: state,
      human: human,
      vsAI: vsAI,
      scored: scored,
      room: roomCode,
      /* Clocks are stored as remaining seconds, not as a deadline: the tab was
         closed for an unknown length of time, and charging the player for it
         would be a punishment for using the browser. */
      clocks: clocks ? { base: clocks.base, inc: clocks.inc, white: clocks.white, black: clocks.black } : null,
      lastMove: lastMove,
      filters: { themes: filters.themes, backgrounds: filters.backgrounds },
      watch: watchFilter,
      lobby: lobbyTab,
      stage: stage(),
      view: viewId(),
      at: new Date().toISOString()
    });
  }

  /* A stored state is only usable if it still looks like a Fortress position.
     Anything else — a half-written record, a save from a broken build, a
     hand-edited localStorage value — is discarded and the visitor gets a new
     game rather than a board that throws on the first click. */
  function usableState(s) {
    if (!s || typeof s !== 'object') { return false; }
    if (!s.pieces || !s.positions || !s.hexOccupant) { return false; }
    if (s.turn !== 'white' && s.turn !== 'black') { return false; }
    if (typeof s.moveNumber !== 'number' || s.moveNumber < 1) { return false; }
    var phases = ['awaiting_move1', 'awaiting_move2', 'preview', 'resolved'];
    if (phases.indexOf(s.phase) < 0) { return false; }
    if (!Array.isArray(s.turnMoves) || !Array.isArray(s.history)) { return false; }
    if (!Array.isArray(s.capturedByWhite) || !Array.isArray(s.capturedByBlack)) { return false; }
    if (!s.stagnation || typeof s.stagnation !== 'object') { return false; }
    /* The playable set is derived from the lattice, not stored — rebuilding it
       is one call and removes 64 keys from every save. */
    if (Object.keys(s.pieces).length < 2) { return false; }
    s.playable = H.playableSet();
    if (!s.positionCounts) { s.positionCounts = {}; }
    return true;
  }

  function restoreSession() {
    var rec = U.loadSession();
    if (!rec || !usableState(rec.state)) { return false; }
    state = rec.state;
    human = rec.human === 'black' ? 'black' : 'white';
    vsAI = rec.vsAI !== false;
    scored = !!rec.scored || !!state.result;
    roomCode = typeof rec.room === 'string' ? rec.room : null;
    lastMove = (rec.lastMove && rec.lastMove.from && rec.lastMove.to) ? rec.lastMove : null;
    selected = null;
    hinted = [];
    busy = false;
    if (rec.filters) {
      filters.themes = rec.filters.themes || 'all';
      filters.backgrounds = rec.filters.backgrounds || 'all';
    }
    if (rec.watch) { watchFilter = rec.watch; }
    if (rec.lobby) { lobbyTab = rec.lobby; }
    /* Kept aside for resumeClock(), which needs the numbers but is called
       after boot's painting — reading them here keeps that call honest
       instead of having it re-parse localStorage behind the helper's back. */
    savedClocks = (rec.clocks && typeof rec.clocks.white === 'number' && typeof rec.clocks.black === 'number')
      ? rec.clocks : null;
    return true;
  }

  /* Clocks resume from whatever was left, not from scratch: a 30-minute game
     reloaded at 24:12 is still a 30-minute game. An untimed game stores no
     clocks at all, and neither does a game whose time control has since been
     changed to No clock — the numbers are then meaningless, so the clock is
     simply left off. */
  function resumeClock() {
    stopClock();
    var tc = C.timeControl(prefs.timeControl);
    if (!tc.base) { clocks = null; return; }
    clocks = (savedClocks && savedClocks.white > 0 && savedClocks.black > 0)
      ? { base: tc.base, inc: tc.inc, white: savedClocks.white, black: savedClocks.black }
      : { base: tc.base, inc: tc.inc, white: tc.base, black: tc.base };
    clockSavedSecond = -1;
    clockTimer = global.setInterval(tickClock, 250);
  }

  /* --------------------------------------------------------------- mounting */
  function mountBoards() {
    boards.forEach(function (b) { b.api.destroy(); });
    boards = [];
    [['#board', 40, true], ['#board-mini', 24, false]].forEach(function (spec) {
      var svg = $(spec[0]);
      if (!svg) { return; }
      var api = FT.board.mount(svg, {
        radius: spec[1], flip: prefs.flip, coords: spec[2] ? prefs.coords : false
      });
      api.on('select', onHexClick);
      boards.push({ api: api, mini: !spec[2] });
    });
  }

  /* ------------------------------------------------------------------- hero
     The arena opens on a still, not on the board. The still is not drawn by
     hand: js/rules.js plays a short deterministic opening and stops the first
     time the two armies are actually in contact, and js/board.js paints that
     position with the same classes as the live arena. So the picture in the
     hero is a real Fortress position wearing the visitor's own material, light
     or dark — the theme is inherited, never restated.

     It is mounted decorative: no listeners, no roving tabindex, aria-hidden.
     A still that could be played would be a second game behind the first. */
  var heroBoard = null;
  var heroStill = null;

  function buildHeroStill() {
    var s = R.newGame('white'), last = null;
    for (var i = 0; i < 24 && !s.result; i++) {
      var moves = R.allLegalMoves(s);
      if (!moves.length) { break; }
      /* A fixed stride, not a random one: the hero must be the same picture on
         every reload, or it stops being a brand and becomes a slot machine. */
      var mv = moves[(i * 11 + 5) % moves.length];
      var next = R.applyMove(s, mv.pieceId, mv.to);
      if (!next) { break; }
      last = { from: H.clone(mv.from), to: H.clone(mv.to) };
      s = next;
      if (s.pendingPromotion) { s = R.choosePromotion(s, 'turret') || s; }
      if (s.phase !== 'preview') { continue; }
      /* Stop on the turn where something is in contact. That is the whole game
         in one frame; two armies standing at attention says nothing. */
      var pre = R.preview(s);
      if (pre.hexes.some(function (row) { return row.incoming > 0; })) {
        return { state: s, lastMove: last };
      }
      s = R.accept(s) || s;
    }
    return { state: s, lastMove: last };
  }

  function paintHero() {
    if (!heroBoard) { return; }
    if (!heroStill) { heroStill = buildHeroStill(); }
    var s = heroStill.state;
    heroBoard.paint({
      state: s,
      legal: [],
      lastMove: heroStill.lastMove,
      preview: s.phase === 'preview' ? R.preview(s) : null,
      hinted: [],
      selected: null
    });
    setText('#hero-still-note', s.result ? 'The opening, already decided.'
      : 'Frozen on turn ' + s.moveNumber + ', one move before combat resolves.');
  }

  function mountHero() {
    var svg = $('#board-hero');
    if (!svg) { return; }
    if (heroBoard) { heroBoard.destroy(); heroBoard = null; }
    heroBoard = FT.board.mount(svg, {
      radius: 30, flip: prefs.flip, coords: false, decorative: true
    });
    paintHero();
  }

  /* The play view is the hero OR the cockpit, never both. Hiding rather than
     collapsing keeps the arena out of the tab order and off the screen until
     Play is pressed, which is the whole point of putting it behind the button. */
  function setStage(stage) {
    var view = $('#view-play');
    if (view) { view.setAttribute('data-stage', stage === 'game' ? 'game' : 'hero'); }
    return stage;
  }

  /* The stage as it currently stands, read back off the DOM rather than from
     a parallel variable — the attribute is what the CSS and the keyboard
     shortcuts actually read, so it is the only honest answer to "is the arena
     on screen right now". */
  function stage() {
    var view = $('#view-play');
    return (view && view.getAttribute('data-stage') === 'game') ? 'game' : 'hero';
  }

  /* Which page the visitor is on. The hash is the router's own state, so it is
     read from there rather than tracked alongside it. */
  function viewId() {
    var active = $('.view.is-active');
    if (active && active.id) { return active.id.replace(/^view-/, ''); }
    return String(global.location.hash || '#play').replace('#', '');
  }

  function showHero(focus) {
    setStage('hero');
    global.scrollTo(0, 0);
    /* Focus only when a person asked for the hero. On boot it would be a focus
       steal on a page nobody has interacted with yet. */
    if (focus !== false) {
      var btn = $('[data-action="hero-play"]');
      if (btn) { btn.focus({ preventScroll: true }); }
    }
  }

  /* Play means "set me up", not "start the last thing you happened to be
     playing". The hero sits in front of a live game, so pressing Play used to
     drop the visitor into a match whose side, opponent and clock they never
     chose. It now opens the same setup sheet as New game, and only Start
     crosses into the arena. The view stays on the hero while the sheet is up,
     so cancelling puts the visitor back exactly where they were — the still,
     the copy, and the button they pressed. */
  function startFromHero() {
    newGameDialog();
  }

  function paintBoards() {
    if (!state) { return; }
    var legal = legalForSelection();
    if (!selected && prefs.hints && (state.phase === 'awaiting_move1' || state.phase === 'awaiting_move2')) {
      legal = openTargets();   /* hint overlay: every reachable hex, dimmed */
    }
    var view = {
      state: state,
      legal: legal,
      lastMove: lastMove,
      preview: state.phase === 'preview' ? R.preview(state) : null,
      hinted: hinted,
      selected: selected ? state.positions[selected] : null
    };
    boards.forEach(function (b) { b.api.paint(view); });
  }

  function legalForSelection() {
    if (!selected || !state) { return []; }
    if (state.phase !== 'awaiting_move1' && state.phase !== 'awaiting_move2') { return []; }
    return R.legalMoves(state, selected);
  }

  function openTargets() {
    var seen = {}, out = R.allLegalMoves(state);
    return out.filter(function (mv) {
      var k = H.key(mv.to);
      if (seen[k]) { return false; }
      seen[k] = true;
      return true;
    }).map(function (mv) { return mv.to; });
  }

  /* ------------------------------------------------------------------ look */
  function refreshPickers() {
    /* Rebuilding the pickers replaces every card node, so the two shortcut wells
       are read first: where they were scrolled, and which card had focus. Both
       are put back below, so choosing a material can never jump the panel back
       to the top or drop the keyboard onto the page body. */
    var wells = ['#theme-quick', '#bg-quick'].map(function (sel) {
      var host = $(sel);
      if (!host) { return null; }
      var active = doc.activeElement;
      return {
        host: host,
        top: host.scrollTop,
        index: active && host.contains(active)
          ? Array.prototype.indexOf.call(host.children, active) : -1
      };
    });
    U.fillThemeGrid($('#theme-grid'), prefs, pickBoard, filters.themes);
    U.fillBackgroundGrid($('#bg-grid'), prefs, pickBackground, filters.backgrounds);
    U.fillThemeGrid($('#theme-quick'), prefs, pickBoard, 'all');
    U.fillBackgroundGrid($('#bg-quick'), prefs, pickBackground, 'all');
    setText('#arena-board-name', C.board(prefs.board).name);
    setText('#arena-bg-name', C.background(prefs.background).name);
    setText('#arena-bg-quick-name', C.background(prefs.background).name);
    paintLooksIntoBoards();
    wells.forEach(function (w) {
      if (!w) { return; }
      w.host.scrollTop = w.top;
      var card = w.host.children[w.index];
      if (card && card.focus) { card.focus({ preventScroll: true }); }
    });
  }

  function paintLooksIntoBoards() {
    var b = C.board(prefs.board);
    setText('#board-material', b.name + ' board');
    boards.forEach(function (inst) { inst.api.setCoords(inst.mini ? false : prefs.coords); });
  }

  function pickBoard(id) {
    prefs.board = C.board(id).id;
    U.savePrefs(prefs);
    U.applyLook(prefs);
    refreshPickers();
    U.toast('Board theme', C.board(prefs.board).name + ' · ' + C.board(prefs.board).sub);
  }

  function pickBackground(id) {
    prefs.background = C.background(id).id;
    U.savePrefs(prefs);
    U.applyLook(prefs);
    refreshPickers();
    U.toast('Background', C.background(prefs.background).name);
  }

  function setMode(mode) {
    prefs.mode = mode === 'light' ? 'light' : 'dark';
    U.savePrefs(prefs);
    U.applyLook(prefs);
    syncModeButton();
    syncUserMenu();
  }

  /* The mode control exists twice — in the menu rail and in the compact bar —
     so every copy has to be told the current mode, not just the first one. */
  function syncModeButton() {
    var light = prefs.mode === 'light';
    var label = light ? 'Switch to dark material' : 'Switch to light material';
    $all('[data-action="mode"]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', light ? 'true' : 'false');
      btn.setAttribute('aria-label', label);
      var t = btn.querySelector('[data-mode-text]');
      if (t) { t.textContent = light ? 'Light' : 'Dark'; }
    });
  }

  /* Sound is a pref rather than a flag, so a muted player stays muted across
     reloads — and the audio module is told, not merely the button repainted. */
  function setSound(on) {
    prefs.sound = !!on;
    U.savePrefs(prefs);
    SND.setMuted(!prefs.sound);
    syncUserMenu();
  }

  /* ---------------------------------------------------------------- user menu
     The session block opens a panel, and the panel is written from state
     rather than from markup: the labels name the ACTION the press will take
     ("Light mode" while the page is dark) while the chip at the end of the row
     names what is currently in force ("Dark"). Sign-in state decides the last
     row outright — there is nothing to sign out of as a guest, so as a guest
     that row is the way in instead. */
  var userMenuOpen = false;

  function userPop() { return $('#user-pop'); }

  function userMenuItems() {
    var pop = userPop();
    return pop ? Array.prototype.slice.call(pop.querySelectorAll('.user-item')) : [];
  }

  function setUserMenu(open) {
    var pop = userPop();
    if (!pop) { return; }
    userMenuOpen = !!open;
    pop.hidden = !userMenuOpen;
    $all('.side-user').forEach(function (btn) {
      btn.setAttribute('aria-expanded', userMenuOpen ? 'true' : 'false');
    });
    /* Opening moves the keyboard inside, so the next Tab leaves the menu rather
       than walking back through it. Closing hands focus back to the row that
       opened it, so the keyboard never ends up on the page body. */
    if (userMenuOpen) {
      var items = userMenuItems();
      if (items.length) { items[0].focus(); }
    }
  }

  function syncUserMenu() {
    var pop = userPop();
    if (!pop) { return; }
    var light = prefs.mode === 'light';
    var quiet = prefs.sound === false;
    var signedIn = !!account;

    /* The class hooks let CSS pick the live icon off the same state, so the
       glyph and the label can never drift apart. */
    pop.classList.toggle('is-muted', quiet);
    pop.classList.toggle('is-signed-in', signedIn);

    setText('[data-user-mode-label]', light ? 'Dark mode' : 'Light mode');
    setText('[data-user-mode-state]', light ? 'Light' : 'Dark');
    setText('[data-user-sound-label]', quiet ? 'Enable sound' : 'Mute sound');
    setText('[data-user-sound-state]', quiet ? 'Muted' : 'On');
    setText('[data-user-account-label]', signedIn ? 'Your account' : 'Create account');
    setText('[data-user-session-label]', signedIn ? 'Sign out' : 'Sign in');
    var session = $('[data-user-session]');
    if (session) { session.classList.toggle('is-danger', signedIn); }
  }

  /* ---------------------------------------------------------------- sidebar
     One control, two meanings. Wide screens collapse the rail to icons;
     narrow screens slide the whole rail off canvas. Both are driven from the
     same data-action="sidebar" so the chevron and the drawer handle agree. */
  var narrow = global.matchMedia ? global.matchMedia('(max-width: 860px)') : null;

  function railIsMini() { return prefs.rail === 'mini'; }
  function drawerIsOpen() { return doc.documentElement.classList.contains('is-drawer-open'); }

  function syncSidebar() {
    var mini = railIsMini(), open = drawerIsOpen();
    $all('[data-action="sidebar"]').forEach(function (btn) {
      if (btn.classList.contains('side-toggle')) {
        var what = mini ? 'Expand the menu' : 'Collapse the menu';
        btn.setAttribute('aria-expanded', mini ? 'false' : 'true');
        btn.setAttribute('aria-label', what);
        btn.setAttribute('data-tip', what);
      } else {
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.setAttribute('aria-label', open ? 'Close the menu' : 'Open the menu');
      }
    });
  }

  function setDrawer(open) {
    if (open) { doc.documentElement.classList.add('is-drawer-open'); }
    else { doc.documentElement.classList.remove('is-drawer-open'); }
    /* A menu left open behind a drawer that has just slid away would be
       stranded mid-screen with nothing left to close it. */
    if (!open) { setUserMenu(false); }
    syncSidebar();
  }

  function toggleSidebar() {
    if (narrow && narrow.matches) { setDrawer(!drawerIsOpen()); return; }
    prefs.rail = railIsMini() ? 'full' : 'mini';
    U.savePrefs(prefs);
    doc.documentElement.setAttribute('data-rail', railIsMini() ? 'mini' : 'full');
    syncSidebar();
  }

  function setDifficulty(id) {
    prefs.difficulty = C.difficulty(id).id;
    U.savePrefs(prefs);
    syncSettings();
    syncLobby();
  }

  /* One sentence about the chosen level, written the same way everywhere it
     appears. The ladder has seven rungs, so the rung number is part of the
     fact being reported — "Recruit" alone does not say which one of seven. */
  function levelNote() {
    var d = C.difficulty(prefs.difficulty);
    return 'Level ' + d.level + ' of ' + C.DIFFICULTIES.length + ' · ' + d.sub;
  }

  /* The level ladder, wherever it is being shown: the turn rail panel, the
     settings sheet, and both game-setup dialogs. It repaints itself on a pick
     so the pressed card and the note underneath can never disagree, and it
     hands focus to the card that is now pressed so the keyboard survives the
     redraw. Built here rather than in four places because four copies of a
     seven-rung control is four chances to ship a stale one. */
  function levelField() {
    var wrap = U.el('div', 'stack-2');
    var host = U.el('div', 'choice level-grid');
    var note = U.el('p', 'meta');
    var paint = function (refocus) {
      U.fillLevelGrid(host, prefs, function (id) {
        setDifficulty(id);
        paint(true);
      });
      note.textContent = levelNote();
      if (refocus) {
        var on = host.querySelector('[aria-pressed="true"]');
        if (on && on.focus) { on.focus(); }
      }
    };
    paint(false);
    wrap.appendChild(host);
    wrap.appendChild(note);
    return wrap;
  }

  /* The clock, wherever it is being shown. Same contract as levelField: it
     repaints on a pick and keeps focus on the pressed card. */
  function timeField() {
    var host = U.el('div', 'choice');
    var paint = function (refocus) {
      U.clear(host);
      C.TIME_CONTROLS.forEach(function (tc) {
        var card = U.el('button', 'choice-card');
        card.type = 'button';
        card.setAttribute('aria-pressed', tc.id === prefs.timeControl ? 'true' : 'false');
        card.appendChild(U.el('b', null, tc.name));
        card.appendChild(U.el('span', 'meta', tc.sub));
        card.addEventListener('click', function () {
          setTimeControl(tc.id);
          paint(true);
        });
        host.appendChild(card);
      });
      if (refocus) {
        var on = host.querySelector('[aria-pressed="true"]');
        if (on && on.focus) { on.focus(); }
      }
    };
    paint(false);
    return host;
  }

  function syncSettings() {
    /* The rail's own copy of the ladder is a plain host, not a dialog field:
       it is rebuilt by syncSettings() on every change, which is what the
       existing #difficulty-seg contract already promised. */
    U.fillLevelGrid($('#difficulty-seg'), prefs, setDifficulty);
    setText('#difficulty-note', levelNote());
    var toggle = $('#ai-toggle');
    if (toggle) { toggle.checked = vsAI; }
  }

  /* ------------------------------------------------------------------ lobby
     The mode chooser at the top of the right rail. Two of its four entry
     points need a dialog: picking a bot persona, and joining a room by code.
     Both reuse the same pieces as newGameDialog so a game started from the
     lobby is identical to one started from the match bar. */
  var lobbyTab = 'new';

  function setLobbyTab(id) {
    lobbyTab = id;
    $all('[data-lobby]').forEach(function (btn) {
      var on = btn.getAttribute('data-lobby') === id;
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      btn.setAttribute('tabindex', on ? '0' : '-1');
    });
    $all('[data-lobby-panel]').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-lobby-panel') !== id;
    });
    saveSession();
  }

  /* One dialog serves both lobby verbs that lead to a real game: a bot persona
     and a room code. `mode` picks which body is built; the footer is identical
     so the two never drift apart. */
  function lobbyGameDialog(mode) {
    var online = mode === 'online';
    var body = U.el('div', 'stack');

    if (online) {
      body.appendChild(U.el('p', 'lede',
        'Give the code to your friend, or type theirs in. This build ships without a server, so the room is local to this browser — the code is a label for the game, not a network address.'));
      var code = U.el('input', 'input mono');
      code.id = 'lobby-code';
      code.type = 'text';
      code.placeholder = 'ABCD12';
      code.maxLength = 6;
      code.autocomplete = 'off';
      code.spellcheck = false;
      body.appendChild(field('Room code', code));
    } else {
      body.appendChild(U.el('p', 'lede',
        'Pick a level and a clock, then start. Every level plays the same rules — they differ in how much of the turn they search.'));
      body.appendChild(U.el('div', 'label', 'Opponent level'));
      body.appendChild(levelField());
      body.appendChild(U.el('div', 'label', 'Clock'));
      body.appendChild(timeField());
    }

    U.openModal({
      title: online ? 'Join a private room' : 'Play vs Bot',
      wide: !online, body: body,
      actions: [
        { label: online ? 'Join room' : 'Start game', kind: 'btn-primary', onClick: function () {
          if (!online) { newGame(human === 'black' ? 'black' : 'white'); return; }
          var typed = code.value.trim().toUpperCase();
          if (typed && !/^[A-Z0-9]{4,6}$/.test(typed)) {
            U.toast('That code looks wrong', 'A room code is four to six letters or numbers.', 'danger');
            code.focus();
            return;
          }
          U.closeModal();
          newGame('hotseat');
          U.toast('Room ' + (typed || makeRoomCode()),
            'Hot seat on this device — this build has no server to carry the game between browsers.', 'move');
        } },
        { label: 'Cancel', kind: 'btn-secondary' }
      ]
    });
  }

  /* A room code is a label, not a secret: six characters, no two alike. */
  function makeRoomCode() {
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', out = '';
    for (var i = 0; i < 6; i++) {
      out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return out;
  }

  /* The lobby mirrors the session and the current match, so it never claims a
     guest is signed in or that no game is running when one is. */
  function syncLobby() {
    var tc = C.timeControl(prefs.timeControl);
    var mins = tc.base ? Math.round(tc.base / 60) + ' min' : 'No clock';
    setText('#quick-play-sub', mins + ' · ' + (vsAI ? 'Casual vs ' + C.difficulty(prefs.difficulty).name : 'Hot seat'));
    setText('#lobby-bot-sub', 'Level ' + C.difficulty(prefs.difficulty).level +
      ' of ' + C.DIFFICULTIES.length + ' · ' + C.difficulty(prefs.difficulty).name);

    var signedIn = !!account;
    var copy = signedIn
      ? 'Signed in as ' + account.name + ' — your record and rating live on this device.'
      : 'Create a free account to save your games, chat, and climb the leaderboard.';
    setText('#lobby-account-copy', copy);
    $all('[data-action="lobby-account"]').forEach(function (btn) {
      btn.textContent = signedIn ? 'Your account' : 'Create account';
    });

    var running = !!state && !state.result;
    setText('#lobby-games-current', running
      ? 'Move ' + state.moveNumber + ' · ' + (state.result ? 'finished' : R.statusText(state))
      : '');
    var empty = $('#lobby-games-empty');
    if (empty) { empty.hidden = running || signedIn; }
  }

  /* ------------------------------------------------------------ interaction */
  function humanToMove() {
    return !!state && !state.result && (!vsAI || state.turn === human);
  }

  function onHexClick(hex) {
    if (!hex || !state || state.result || busy) { return; }
    if (state.pendingPromotion) { return; }
    if (!humanToMove()) { U.toast('Hold on', 'The opponent is moving.', 'move'); return; }

    var id = state.hexOccupant[H.key(hex)];
    if (selected) {
      var legal = legalForSelection();
      for (var i = 0; i < legal.length; i++) {
        if (H.same(legal[i], hex)) { playMove(selected, hex); return; }
      }
    }
    if (id && state.pieces[id].color === state.turn) {
      selected = (selected === id) ? null : id;
      hinted = [];
      clearHintTimer();
      SND.play('select');
      render();
      return;
    }
    selected = null;
    render();
  }

  function playMove(pieceId, to) {
    var from = H.clone(state.positions[pieceId]);
    var next = R.applyMove(state, pieceId, to);
    if (!next) { U.toast('Illegal move', 'That piece cannot reach that hex.', 'danger'); SND.play('illegal'); return; }
    state = next;
    lastMove = { from: from, to: H.clone(to) };
    selected = null;
    hinted = [];
    SND.play('move');
    if (state.pendingPromotion) { askPromotion(); }
    render();
  }

  function askPromotion() {
    U.openModal({
      title: 'Promote on the back rank',
      sticky: true,
      body: '<p>A wall that reaches the enemy back rank always promotes — it never stays a wall.</p>' +
            '<p class="meta">Tower: slides any distance along the six directions. Turret: jumps exactly two hexes, over anything.</p>',
      actions: [
        { label: 'Tower', kind: 'btn-primary', onClick: function () { finishPromotion('tower'); } },
        { label: 'Turret', kind: 'btn-secondary', onClick: function () { finishPromotion('turret'); } }
      ]
    });
  }

  function finishPromotion(kind) {
    state = R.choosePromotion(state, kind) || state;
    SND.play('promote');
    U.toast('Promoted', 'The wall stands as a ' + kind + '.', 'success');
    render();
  }

  /* Accept = the decision point: resolve simultaneous combat, hand over. */
  function acceptTurn() {
    if (!state || state.result || state.phase !== 'preview') { return; }
    var pre = R.preview(state);
    var kills = [], collapses = [];
    pre.hexes.forEach(function (row) {
      if (row.willDie) { kills.push(row.hex); }
      if (row.willCollapse) { collapses.push(row.hex); }
    });
    var mover = state.turn;
    var next = R.accept(state);
    if (!next) { return; }
    state = next;
    boards.forEach(function (b) {
      b.api.flash(kills, 'kill');
      b.api.flash(collapses, 'collapse');
    });
    if (pre.captured.length) {
      var kinds = pre.captured.map(function (c) {
        return c.kind + (c.how === 'collapsed' ? ' (collapsed)' : '');
      });
      U.toast(pre.captured.length + ' piece' + (pre.captured.length > 1 ? 's' : '') + ' lost',
        kinds.join(', '), 'danger');
    }
    /* Combat is the loudest moment in a turn, so it gets the noise burst, and
       pieces actually falling get a second, lower one on top. A turn that
       resolved in silence stays silent — an accept with nothing in contact is
       not an event, and cueing it would train the ear to ignore the cue. */
    if (kills.length || collapses.length) { SND.play('strike'); }
    if (pre.captured.length) { SND.play('capture'); }
    if (!kills.length && !collapses.length) { SND.play('turn'); }
    if (clocks && clocks.base) { clocks[mover] = Math.min(clocks.base, clocks[mover] + clocks.inc); }
    selected = null; lastMove = null; hinted = [];
    clearHintTimer();
    render();
    if (state.result) { finish(); } else { scheduleAI(); }
  }

  function finish() {
    stopClock();
    var text = R.resultText(state);
    /* The end of a game is the one cue the whole session builds towards, and
       which one it is depends on the side the human actually sat on — a
       hot-seat game belongs to nobody, so it gets the draw. */
    if (state.result === 'draw') { SND.play('draw'); }
    else if (!vsAI) { SND.play('draw'); }
    else { SND.play(state.result === human ? 'win' : 'lose'); }
    /* Only a game the human actually played is worth remembering, and only for
       the side they sat on — a hotseat draw belongs to nobody. `scored` keeps a
       game to one result even if a flag fall and an accept both land here. */
    if (vsAI && !scored) {
      scored = true;
      U.recordResult(account, state.result, human);
      syncAccount();
    }
    var body = U.el('div', 'stack');
    body.appendChild(U.el('p', 'lede', text));
    var stats = U.el('div', 'grid-3');
    [['White pieces', countOf(state, 'white')], ['Black pieces', countOf(state, 'black')],
     ['Turns played', state.moveNumber]].forEach(function (row) {
      var card = U.el('div', 'stat');
      card.appendChild(U.el('div', 'stat-label', row[0]));
      card.appendChild(U.el('div', 'stat-value', String(row[1])));
      stats.appendChild(card);
    });
    body.appendChild(stats);
    body.appendChild(U.el('p', 'meta', 'Ended by: ' + R.endReasonLabel(state.endReason)));
    U.openModal({
      title: state.result === 'draw' ? 'Draw' : (state.result === 'white' ? 'White wins' : 'Black wins'),
      body: body,
      actions: [
        { label: 'Rematch', kind: 'btn-primary', onClick: function () { newGame(vsAI ? human : 'hotseat'); } },
        { label: 'Review the board', kind: 'btn-secondary' }
      ]
    });
  }

  /* -------------------------------------------------------------------- bot */
  function scheduleAI() {
    global.clearTimeout(aiTimer);
    if (!vsAI || !state || state.result || state.turn === human) { return; }
    busy = true;
    aiTimer = global.setTimeout(runAITurn, 400);
  }

  function runAITurn() {
    if (!state || state.result) { busy = false; return; }
    var plan = { moves: [] };
    try { plan = B.plan(state, C.difficulty(prefs.difficulty)) || plan; }
    catch (err) { U.toast('Opponent stalled', 'The planner returned no move.', 'danger'); }
    playPlan(plan.moves || [], 0);
  }

  /* The bot moves piece by piece, so the player can follow the turn. */
  function playPlan(moves, i) {
    if (!state || state.result) { busy = false; render(); return; }
    if (i >= moves.length) {
      busy = false;
      if (state.phase === 'preview') { acceptTurn(); } else { render(); }
      return;
    }
    var mv = moves[i];
    var from = H.clone(state.positions[mv.pieceId]);
    var next = R.applyMove(state, mv.pieceId, mv.to);
    if (!next) { busy = false; render(); return; }
    state = next;
    lastMove = { from: from, to: H.clone(mv.to) };
    /* The opponent's moves are cued too, just more quietly: the player still
       gets to watch the turn happen, and a board that moves in silence while
       you wait is indistinguishable from one that has hung. */
    SND.play('move');
    if (state.pendingPromotion) {
      state = R.choosePromotion(state, B.promotionChoice(state, state.pendingPromotion.hex)) || state;
    }
    render();
    aiTimer = global.setTimeout(function () { playPlan(moves, i + 1); }, 380);
  }

  /* ------------------------------------------------------------------ hints */
  function clearHintTimer() { global.clearTimeout(hintTimer); hintTimer = null; }

  function showHint() {
    if (!state || state.result || !humanToMove()) { return; }
    var best = B.bestSingleMove(state, C.difficulty(prefs.difficulty));
    if (!best) { U.toast('No suggestion', 'Nothing legal in this position.', 'danger'); return; }
    hinted = [best.move.from, best.move.to];
    U.toast('One good move', R.subMoveText({
      pieceId: best.move.pieceId, from: best.move.from, to: best.move.to,
      kind: state.pieces[best.move.pieceId].kind
    }), 'move');
    render();
  }

  /* -------------------------------------------------------------- painting */
  function countOf(s, color) {
    var n = 0;
    Object.keys(s.pieces).forEach(function (id) { if (s.pieces[id].color === color) { n++; } });
    return n;
  }

  function strengthOf(s, color) {
    var n = 0;
    Object.keys(s.pieces).forEach(function (id) {
      if (s.pieces[id].color === color) { n += R.strength(s, id); }
    });
    return n;
  }

  function render() {
    if (!state) { return; }
    paintBoards();
    paintStrips();
    paintChrome();
    paintActionBar();
    paintTurnPanel();
    paintPreviewPanel();
    paintLog();
    paintClocks();
    syncLobby();
    /* Every mutation above reaches the store from here, so the saved game can
       never drift behind the board the player is looking at. */
    saveSession();
  }

  function paintStrips() {
    ['white', 'black'].forEach(function (color) {
      var strip = $('#strip-' + color);
      if (!strip) { return; }
      strip.classList.toggle('is-turn', state.turn === color && !state.result);
      setText('#' + color + '-name', color === human ? 'You'
        : (vsAI ? C.difficulty(prefs.difficulty).name + ' AI' : 'Opponent'));
      setText('#' + color + '-sub', countOf(state, color) + ' pieces · total STR ' + strengthOf(state, color));
      var host = $('#captured-' + color);
      if (!host) { return; }
      U.clear(host);
      var caps = color === 'white' ? state.capturedByWhite : state.capturedByBlack;
      if (!caps.length) { host.appendChild(U.el('span', 'meta', 'Nothing lost yet')); return; }
      caps.forEach(function (c) {
        var chip = U.el('span', 'chip', R.KIND_LETTER[c.kind] || '?');
        chip.title = c.kind + ' — ' + (c.how === 'collapsed' ? 'wall collapse' : 'destroyed in combat');
        host.appendChild(chip);
      });
    });
  }

  function paintChrome() {
    setText('#board-material', C.board(prefs.board).name + ' · ' + C.background(prefs.background).name);
    setText('#board-cursor', selected
      ? 'Selected ' + selected + ' at ' + H.square(state.positions[selected])
      : 'Arrow keys move the cursor, Enter selects');
  }

  function paintActionBar() {
    setText('#phase-text', state.result ? 'Game over' : R.statusText(state));
    setText('#status-text', state.result ? R.resultText(state) : promptText());
    var canAccept = R.canAccept(state) && humanToMove();
    $all('[data-action="accept"]').forEach(function (b) {
      b.disabled = !canAccept;
      b.classList.toggle('btn-pulse', !!canAccept);
    });
    $all('[data-action="undo"]').forEach(function (b) {
      b.disabled = !R.canUndo(state) || !humanToMove();
    });
  }

  function promptText() {
    if (state.pendingPromotion) { return 'Choose what the promoted wall becomes.'; }
    if (state.phase === 'preview') {
      var pre = R.preview(state);
      var inContact = pre.hexes.filter(function (r) { return r.incoming > 0; }).length;
      var doomed = Object.keys(pre.doomed).length;
      if (!inContact) { return 'No piece is in contact — accept to hand the turn over.'; }
      return inContact + ' hex' + (inContact > 1 ? 'es' : '') + ' in contact, ' + doomed +
        ' piece' + (doomed === 1 ? '' : 's') + ' would fall. Accept, or undo your last move.';
    }
    if (state.phase === 'awaiting_move1') {
      return (state.isFirstTurn && state.turn === 'white')
        ? 'White opens with a single move: pick a piece, then a highlighted hex.'
        : 'Move 1 of 2 — pick a piece, then a highlighted hex.';
    }
    if (state.phase === 'awaiting_move2') { return 'Move 2 of 2 — a piece may not move twice in one turn.'; }
    return '';
  }

  function paintTurnPanel() {
    setText('#move-number', String(state.moveNumber));
    setText('#turn-name', state.result ? 'Game over'
      : (state.turn === 'white' ? 'White to move' : 'Black to move'));
    setText('#phase-detail', R.statusText(state));
    var st = state.stagnation || { turns: 0 };
    var meter = $('#stagnation-meter');
    if (meter) { meter.style.width = Math.min(100, Math.round(st.turns / R.STAGNATION_LIMIT * 100)) + '%'; }
    setText('#stagnation-text', st.turns + ' of ' + R.STAGNATION_LIMIT + ' quiet turns');
    var max = 0;
    Object.keys(state.positionCounts || {}).forEach(function (k) {
      if (state.positionCounts[k] > max) { max = state.positionCounts[k]; }
    });
    setText('#repeat-text', max + ' of ' + R.REPEAT_LIMIT + ' occurrences of the most repeated position');
  }

  function paintPreviewPanel() {
    var host = $('#preview-list'), empty = $('#preview-empty');
    if (!host) { return; }
    U.clear(host);
    var pre = state.phase === 'preview' ? R.preview(state) : null;
    var hits = pre ? pre.hexes.filter(function (row) { return row.incoming > 0; }) : [];
    if (empty) { empty.classList.toggle('hidden', hits.length > 0); }
    host.classList.toggle('hidden', hits.length === 0);
    if (!hits.length) { return; }
    hits.sort(function (a, b) { return b.incoming - a.incoming; }).forEach(function (row) {
      var piece = state.pieces[row.id];
      if (!piece) { return; }
      var tr = U.el('div', 'list-row');
      tr.appendChild(U.el('span', 'list-main mono',
        H.square(row.hex) + ' · ' + (R.KIND_LETTER[piece.kind] || '?') + ' ' + piece.color));
      tr.appendChild(U.el('span', 'mono', '\u2212' + row.incoming + ' / ' + row.str));
      tr.appendChild(U.el('span', 'badge ' + (row.willDie ? 'badge-danger' : 'badge-warn'),
        row.willDie ? 'destroyed' : (row.willCollapse ? 'collapses' : 'survives')));
      host.appendChild(tr);
    });
  }

  function paintLog() {
    var host = $('#log-list');
    if (!host) { return; }
    U.clear(host);
    var rows = state.history.map(function (entry) {
      return { num: entry.moveNumber, color: entry.color, text: entry.text, caps: entry.captured.length };
    });
    if (state.turnMoves.length && !state.result) {
      rows.push({
        num: state.moveNumber, color: state.turn,
        text: state.turnMoves.map(R.subMoveText).join(', ') + (state.phase === 'preview' ? ' · preview' : ''),
        caps: 0, live: true
      });
    }
    if (!rows.length) {
      host.appendChild(U.el('div', 'empty', 'No moves yet. White opens with a single move.'));
      return;
    }
    rows.slice().reverse().forEach(function (r) {
      var row = U.el('div', 'list-row' + (r.live ? ' is-active' : ''));
      row.appendChild(U.el('span', 'list-rank', r.num + '.'));
      row.appendChild(U.el('span', 'badge ' + (r.color === 'white' ? 'badge-move' : 'badge-accent'),
        r.color === 'white' ? 'W' : 'B'));
      row.appendChild(U.el('span', 'list-main mono', r.text));
      if (r.caps) { row.appendChild(U.el('span', 'badge-danger', '+' + r.caps)); }
      host.appendChild(row);
    });
  }

  function paintClocks() {
    ['white', 'black'].forEach(function (color) {
      var el = $('#clock-' + color);
      if (!el) { return; }
      el.textContent = clocks ? U.fmtClock(clocks[color]) : '\u2014';
      el.classList.toggle('is-active', !!clocks && state.turn === color && !state.result);
      el.classList.toggle('is-low', !!clocks && clocks[color] <= 20);
    });
  }

  /* --------------------------------------------------------------- new game */
  function newGame(mode, code) {
    /* Starting a game IS the decision to leave the hero, whichever door the
       game was started from — the hero button, a rematch, or the N shortcut.
       Doing it here rather than at each call site is what stops "the new-game
       dialog opened on top of the hero and closed back onto the hero". */
    setStage('game');
    if (mode === 'black') { vsAI = true; human = 'black'; }
    else if (mode === 'hotseat') { vsAI = false; human = 'white'; }
    else { vsAI = true; human = 'white'; }
    /* A room code is a label on the game, so it is set here with everything
       else that starts one and cleared by any start that does not carry one —
       otherwise a code would outlive the game it named. */
    roomCode = code || null;
    state = R.newGame('white');
    selected = null; lastMove = null; hinted = []; busy = false; scored = false;
    global.clearTimeout(aiTimer);
    U.closeModal();
    startClock();
    SND.play('newgame');
    render();
    /* The match bar's subtitle is a fact about the game being played, so it is
       written from the settings this game was actually started with rather than
       left as the placeholder copy in the markup. "15 min · Casual" used to sit
       there permanently — a visitor on a 30-minute clock against Sovereign was
       told 15 minutes, Casual. */
    var tc = C.timeControl(prefs.timeControl);
    var mins = tc.base ? Math.round(tc.base / 60) + ' min' : 'No clock';
    var who = vsAI ? C.difficulty(prefs.difficulty).name : 'Hot seat';
    setText('#match-top-sub', mins + ' · ' + (roomCode ? 'Room ' + roomCode + ' · ' : '') + who);
    U.toast('New game', vsAI
      ? (human === 'white' ? 'You are white: your opening turn is a single move.' : 'You are black: the AI opens the game.')
      : 'Two-player hot seat: both sides are yours.', 'move');
    /* The board is what the player just agreed to play, so it takes focus.
       Without this the keyboard is left on the Start button that no longer
       exists and the first arrow key goes nowhere. */
    var board = $('#board');
    if (board) { board.focus({ preventScroll: true }); }
    scheduleAI();
  }

  /* ----------------------------------------------------------------- clocks */
  function startClock() {
    stopClock();
    var tc = C.timeControl(prefs.timeControl);
    if (!tc.base) { clocks = null; paintClocks(); return; }
    clocks = { base: tc.base, inc: tc.inc, white: tc.base, black: tc.base };
    clockSavedSecond = -1;
    clockTimer = global.setInterval(tickClock, 250);
  }

  function stopClock() {
    if (clockTimer) { global.clearInterval(clockTimer); clockTimer = null; }
  }

  function tickClock() {
    if (!clocks || !state || state.result) { return; }
    clocks[state.turn] -= 0.25;
    if (clocks[state.turn] <= 0) {
      clocks[state.turn] = 0;
      var loser = state.turn;
      state = R.flagFall(state, loser) || state;
      paintClocks();
      U.toast('Flag fall', (loser === 'white' ? 'White' : 'Black') + ' ran out of time.', 'danger');
      finish();
      return;
    }
    paintClocks();
    /* The clock is the one thing that moves without a render behind it, so it
       writes the session itself — once a second rather than four times a
       second, which is all a visible countdown needs. */
    if (Math.floor(clocks[state.turn]) !== clockSavedSecond) {
      clockSavedSecond = Math.floor(clocks[state.turn]);
      saveSession();
    }
  }

  function setTimeControl(id) {
    prefs.timeControl = C.timeControl(id).id;
    U.savePrefs(prefs);
    startClock();
  }

  /* --------------------------------------------------------------- account
     The account is local to this browser, so the two verbs are the whole story:
     create one, or return to the one that is already here. The dialog keeps the
     form open on a mistake and names the field at fault, rather than closing and
     throwing the typed values away. */
  function syncAccount() {
    var who = U.sessionLabel(account);
    setText('[data-user-name]', who.name);
    setText('[data-user-badge]', who.badge);
    setText('[data-user-sub]', who.sub);
    setText('[data-user-avatar]', who.initials);
    var tip = account ? (account.name + ' — ' + account.email) : 'Sign in or create an account';
    $all('.side-user').forEach(function (btn) { btn.setAttribute('data-tip', tip); });
    /* The lobby mirrors the same three fields, so both are written from one
       place and the guest badge can never appear in one and not the other. */
    syncLobby();
    /* Same reason for the menu: whether the last row reads "Sign in" or
       "Sign out" is a fact about the session, not a label written by hand. */
    syncUserMenu();
  }

  /* Signing out and signing in are the same transition seen from two ends, so
     they live together: one clears the record and re-reads the session, the
     other hands the dialog the verb that is missing. */
  function signOutNow() {
    U.signOut();
    account = null;
    syncAccount();
    setUserMenu(false);
    SND.play('click');
    U.toast('Signed out', 'Back to a guest session.');
  }

  function signInNow() {
    setUserMenu(false);
    authDialog('in');
  }

  function field(labelText, input) {
    var f = U.el('div', 'field');
    var l = U.el('label', 'label', labelText);
    l.setAttribute('for', input.id);
    f.appendChild(l);
    f.appendChild(input);
    return f;
  }

  function textInput(id, type, placeholder) {
    var i = doc.createElement('input');
    i.className = 'input';
    i.id = id;
    i.type = type;
    i.placeholder = placeholder || '';
    i.autocomplete = type === 'password' ? 'current-password' : 'off';
    return i;
  }

  /* One dialog serves both verbs; `mode` only decides which fields exist and
     which button sits in the footer. */
  function authDialog(mode) {
    var signingUp = mode !== 'in';
    var body = U.el('div', 'stack');
    body.appendChild(U.el('p', 'lede', signingUp
      ? 'An account keeps your rating and record on this browser. No server, no email — it never leaves this device.'
      : 'Welcome back. Your rating and record are waiting exactly where you left them.'));

    var name = null;
    if (signingUp) {
      name = textInput('auth-name', 'text', 'Commander');
      name.setAttribute('autocomplete', 'nickname');
      body.appendChild(field('Name', name));
    }

    var mail = textInput('auth-email', 'email', 'you@example.com');
    mail.setAttribute('autocomplete', 'email');
    body.appendChild(field('Email', mail));

    var pass = textInput('auth-pass', 'password', 'At least eight characters');
    pass.setAttribute('autocomplete', signingUp ? 'new-password' : 'current-password');
    body.appendChild(field('Passphrase', pass));

    var err = U.el('p', 'auth-error');
    err.setAttribute('role', 'alert');
    err.hidden = true;
    body.appendChild(err);

    var submit = function () {
      var res = signingUp
        ? U.signUp(name.value, mail.value, pass.value)
        : U.signIn(mail.value, pass.value);
      if (!res.ok) {
        err.textContent = res.error;
        err.hidden = false;
        var bad = { name: name, email: mail, pass: pass, mail: mail }[res.field];
        if (bad) { bad.focus(); }
        return;
      }
      account = res.account;
      U.closeModal();
      syncAccount();
      SND.play('signin');
      U.toast('Signed in', account.name + ' · rating ' + account.rating, 'success');
    };

    /* Enter submits from any field, because a form with three boxes and a
       button below it is a form people abandon halfway. */
    body.addEventListener('keydown', function (evt) {
      if (evt.key === 'Enter') { evt.preventDefault(); submit(); }
    });

    U.openModal({
      title: signingUp ? 'Create an account' : 'Sign in',
      body: body,
      actions: [
        /* close:false — the dialog only shuts on a successful sign-in, so a
           rejected passphrase leaves the typed values on screen. */
        { label: signingUp ? 'Create account' : 'Sign in', kind: 'btn-primary', close: false, onClick: submit },
        { label: signingUp ? 'I already have one' : 'Create an account instead', kind: 'btn-ghost',
          onClick: function () { authDialog(signingUp ? 'in' : 'signup'); } }
      ]
    });
  }

  function accountDialog() {
    var body = U.el('div', 'stack');
    var head = U.el('div', 'row');
    var who = U.el('span', 'avatar avatar-lg auth-avatar', U.sessionLabel(account).initials);
    head.appendChild(who);
    var idBlock = U.el('div', 'stack-2 grow');
    idBlock.appendChild(U.el('strong', null, account.name));
    idBlock.appendChild(U.el('span', 'meta', account.email));
    head.appendChild(idBlock);
    body.appendChild(head);

    var stats = U.el('div', 'grid-3');
    [['Rating', account.rating], ['Wins', account.wins], ['Losses', account.losses]].forEach(function (row) {
      var card = U.el('div', 'stat');
      card.appendChild(U.el('div', 'stat-label', row[0]));
      card.appendChild(U.el('div', 'stat-value', String(row[1])));
      stats.appendChild(card);
    });
    body.appendChild(stats);
    body.appendChild(U.el('p', 'meta', 'Playing since ' + account.since + '. This record lives in this browser only.'));

    U.openModal({
      title: 'Your account',
      body: body,
      actions: [
        { label: 'Sign out', kind: 'btn-secondary', onClick: function () {
          signOutNow();
        } },
        { label: 'Keep playing', kind: 'btn-primary' }
      ]
    });
  }

  /* Settings is the one dialog that is entirely preference. Each control here
     is the SAME control the rail and the lobby already write, so there is one
     source of truth per setting and no second copy to fall out of step: a
     switch here and the button on the board chrome cannot disagree, because
     they are the same pref read twice. */
  function settingsDialog() {
    var body = U.el('div', 'stack');
    body.appendChild(U.el('p', 'lede',
      'Everything here is remembered in this browser and nowhere else. This build ships without a server, so nothing on this page is sent anywhere.'));

    /* Switches repaint themselves rather than rebuilding the dialog, so
       toggling one never costs the keyboard the place it was standing. */
    function toggleRow(label, sub, read, flip) {
      var row = U.el('label', 'switch');
      var box = doc.createElement('input');
      box.type = 'checkbox';
      box.checked = !!read();
      box.addEventListener('change', function () { flip(box.checked); });
      var track = U.el('span', 'switch-track');
      track.setAttribute('aria-hidden', 'true');
      row.appendChild(box);
      row.appendChild(track);
      var text = U.el('span', 'switch-text');
      text.appendChild(U.el('span', null, label));
      text.appendChild(U.el('span', 'hint', sub));
      row.appendChild(text);
      return row;
    }

    /* Segmented groups redraw only their own host, and hand focus back to the
       button that is now pressed, so the keyboard follows the setting. */
    function segGroup(label, options, read, pick) {
      var wrap = U.el('div', 'stack-2');
      wrap.appendChild(U.el('div', 'label', label));
      var seg = U.el('div', 'segmented');
      var refocus = function () {
        var on = seg.querySelector('[aria-pressed="true"]');
        if (on && on.focus) { on.focus(); }
      };
      var paint = function () {
        U.fillSegmented(seg, options, read(), function (id) { pick(id); paint(); refocus(); });
      };
      paint();
      wrap.appendChild(seg);
      return wrap;
    }

    body.appendChild(U.el('div', 'title-rule', 'Appearance'));
    body.appendChild(segGroup('Material',
      [{ id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }],
      function () { return prefs.mode; },
      function (id) { setMode(id); SND.play('click'); }));

    body.appendChild(segGroup('Sound',
      [{ id: 'on', label: 'On' }, { id: 'off', label: 'Muted' }],
      function () { return prefs.sound === false ? 'off' : 'on'; },
      function (id) { setSound(id === 'on'); if (id === 'on') { SND.play('select'); } }));

    body.appendChild(U.el('div', 'title-rule', 'Board'));
    var board = U.el('div', 'stack-2');
    board.appendChild(toggleRow('Coordinates', 'Name every hex, so a position can be talked about.',
      function () { return prefs.coords; },
      function (on) { if (on !== prefs.coords) { toggleCoords(); } }));
    board.appendChild(toggleRow('Reachable hexes', 'Dim every legal destination before you commit to one.',
      function () { return prefs.hints; },
      function (on) { if (on !== prefs.hints) { toggleHints(); } }));
    board.appendChild(toggleRow('Flip the board', 'Black sits at the bottom instead of the top.',
      function () { return prefs.flip; },
      function (on) { if (on !== prefs.flip) { toggleFlip(); } }));
    body.appendChild(board);

    body.appendChild(U.el('div', 'title-rule', 'Opponent'));
    body.appendChild(U.el('div', 'label', 'Strength'));
    /* The full seven-rung ladder, not the three-era segmented bar: the ladder
       is the main way a player shapes the game, and Settings is where someone
       goes specifically to change it. */
    body.appendChild(levelField());

    body.appendChild(U.el('div', 'title-rule', 'Clock'));
    body.appendChild(U.el('div', 'label', 'Time control'));
    body.appendChild(timeField());

    U.openModal({
      title: 'Settings', wide: true, body: body,
      actions: [
        { label: 'Done', kind: 'btn-primary' },
        { label: 'Arena library', kind: 'btn-ghost', onClick: function () { U.setView('themes'); } }
      ]
    });
  }

  /* --------------------------------------------------------------- dialogs
     The one place a game gets configured. Three doors lead here — the hero's
     Play button, the match bar's New game, and the N shortcut — and they all
     land on this sheet, so a visitor who starts from the landing page is
     choosing from exactly the same options as someone rematching. That is the
     whole point of the setup step: Play commits to entering the game, not to a
     particular game, and this sheet is what turns the first click into a
     decision about side, opponent and clock.

     `chosen` is a dialog-local choice, not a pref: picking Black here should
     not silently rewrite the last game's side for the next one. The level and
     the clock DO write through, because those are preferences a player expects
     to keep — hence levelField()/timeField() calling setDifficulty and
     setTimeControl, while the side only mutates the local variable.

     The room code sits in the side section because that is what it decides:
     a code IS a hot seat that two people share, so it is the fourth way of
     answering "who is playing" rather than a separate feature bolted on. It
     stays collapsed until asked for, because a game without a code is the
     common case and the sheet should not open wider than it needs to. */
  function newGameDialog() {
    var chosen = vsAI ? human : 'hotseat';
    var code = null;          /* null until the code field has been opened */
    var body = U.el('div', 'stack');
    body.appendChild(U.el('p', 'lede',
      'Two moves per turn, then Accept. Combat is simultaneous — everything in contact strikes at once.'));

    /* ------------------------------------------------------------ your side */
    body.appendChild(U.el('div', 'label', 'Your side'));
    var sideSeg = U.el('div', 'segmented');
    body.appendChild(sideSeg);

    var codeField = roomCodeField(function () { return code; });
    var codeBtn = U.el('button', 'btn btn-outline btn-sm', 'Play with code');
    codeBtn.type = 'button';
    codeBtn.setAttribute('aria-expanded', 'false');
    codeBtn.setAttribute('aria-controls', 'newgame-code');
    codeBtn.addEventListener('click', function () {
      var open = codeField.hidden;
      codeField.hidden = !open;
      codeBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        SND.play('click');
        /* Pre-fill with a fresh code so the common move — send it to a friend —
           is a press and a copy, and someone who has a code can type over it.
           An empty box would make the button look broken. */
        codeField.querySelector('input').value = makeRoomCode();
        codeField.querySelector('input').focus();
        codeField.querySelector('input').select();
      }
    });
    body.appendChild(codeBtn);
    body.appendChild(codeField);

    /* --------------------------------------------------------- opponent/clock
       The level and the clock only mean something against an opponent, so a
       hot-seat game is not asked for them. The group is hidden rather than
       removed, so the sheet does not change height under the reader's cursor. */
    var vsBot = U.el('div', 'stack');   /* .stack[hidden] is what makes this hide */
    vsBot.appendChild(U.el('div', 'label', 'Opponent level'));
    vsBot.appendChild(levelField());
    vsBot.appendChild(U.el('div', 'label', 'Clock'));
    vsBot.appendChild(timeField());
    body.appendChild(vsBot);

    /* The segmented control rebuilds its buttons on every pick, so the hot-seat
       visibility rule lives inside that redraw: by the time the callback runs,
       the buttons it might want to touch have already been replaced. */
    var drawSides = function (refocus) {
      U.fillSegmented(sideSeg, [
        { id: 'white', label: 'White (first)' },
        { id: 'black', label: 'Black (second)' },
        { id: 'hotseat', label: 'Two players' }
      ], chosen, function (id) { chosen = id; drawSides(true); });
      /* A code names a shared hot seat, so opening one settles the side
         question too — otherwise the sheet would claim two players and then
         ask which one you are. */
      vsBot.hidden = chosen === 'hotseat' || !codeField.hidden;
      if (refocus) {
        var on = sideSeg.querySelector('[aria-pressed="true"]');
        if (on && on.focus) { on.focus(); }
      }
    };
    drawSides(false);

    U.openModal({
      title: 'New game', wide: true, body: body,
      actions: [
        { label: 'Start game', kind: 'btn-primary', onClick: function () {
          /* An open code field wins over the segmented side: that is what the
             visitor just typed, and asking them to also pick White or Black
             would be a second question they already answered. */
          if (!codeField.hidden) {
            var typed = codeField.querySelector('input').value.trim().toUpperCase();
            if (!/^[A-Z0-9]{4,6}$/.test(typed)) {
              U.toast('That code looks wrong', 'A room code is four to six letters or numbers.', 'danger');
              codeField.querySelector('input').focus();
              return;
            }
            newGame('hotseat', typed);
            return;
          }
          newGame(chosen);
        } },
        { label: 'Cancel', kind: 'btn-secondary' }
      ]
    });
  }

  function resignDialog() {
    if (!state || state.result) { return; }
    var color = state.turn;
    U.openModal({
      title: 'Resign?',
      body: '<p>' + (color === 'white' ? 'White' : 'Black') + ' concedes. This cannot be undone.</p>',
      actions: [
        { label: 'Resign', kind: 'btn-danger', onClick: function () {
          state = R.resign(state, color) || state;
          U.toast('Resigned', R.resultText(state), 'danger');
          finish();
        } },
        { label: 'Keep playing', kind: 'btn-secondary' }
      ]
    });
  }

  function drawDialog() {
    if (!state || state.result) { return; }
    if (!vsAI) {
      U.openModal({
        title: 'Agree a draw?',
        body: '<p>Under the rules a draw needs both players to agree. Announce it, then confirm.</p>',
        actions: [
          { label: 'We agree', kind: 'btn-primary', onClick: function () {
            state = R.agreeDraw(state) || state; finish();
          } },
          { label: 'Play on', kind: 'btn-secondary' }
        ]
      });
      return;
    }
    var aiColor = human === 'white' ? 'black' : 'white';
    var aiScore = B.evalState(state, aiColor, C.difficulty(prefs.difficulty));
    if (aiScore < -40) {
      state = R.agreeDraw(state) || state;
      U.toast('Draw agreed', 'The opponent cannot see progress and accepts.', 'success');
      finish();
    } else {
      U.toast(C.difficulty(prefs.difficulty).name + ' declines', 'It still sees a way through.', 'danger');
    }
  }

  /* ---------------------------------------------------------------- toggles */
  function undoMove() {
    if (!humanToMove() || !R.canUndo(state)) { return; }
    var next = R.undo(state);
    if (!next) { return; }
    state = next;
    selected = null; lastMove = null; hinted = [];
    render();
  }

  function toggleFlip() {
    prefs.flip = !prefs.flip;
    U.savePrefs(prefs);
    mountBoards();
    /* The hero still is a board too, and a flipped arena that kept its old
       orientation in the hero would be the one place the two disagreed. */
    mountHero();
    render();
    U.toast('Board flipped', prefs.flip ? 'Black sits at the bottom.' : 'White sits at the bottom.');
  }

  function toggleCoords() {
    prefs.coords = !prefs.coords;
    U.savePrefs(prefs);
    boards.forEach(function (b) { b.api.setCoords(b.mini ? false : prefs.coords); });
    syncToggles();
    paintChrome();
  }

  function toggleHints() {
    prefs.hints = !prefs.hints;
    U.savePrefs(prefs);
    hinted = [];
    syncToggles();
    render();
  }

  function syncToggles() {
    $all('[data-action="coords"]').forEach(function (b) {
      b.setAttribute('aria-pressed', prefs.coords ? 'true' : 'false');
    });
    $all('[data-action="hints"]').forEach(function (b) {
      b.setAttribute('aria-pressed', prefs.hints ? 'true' : 'false');
    });
  }

  function applyFilter(btn) {
    var group = btn.getAttribute('data-filter-group');
    var value = btn.getAttribute('data-filter-value');
    if (!group) { return; }
    filters[group] = value;
    var seg = btn.parentNode;
    Array.prototype.slice.call(seg.children).forEach(function (b) {
      b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
    });
    refreshPickers();
    /* A filter is part of where you were, so it is part of the session. */
    saveSession();
  }

  /* The Watch filter is the same shape as the library filter, but it repaints
     a different list, so it asks js/social.js rather than the pickers. */
  function applyWatchFilter(btn) {
    var value = btn.getAttribute('data-watch-filter');
    if (!value) { return; }
    watchFilter = value;
    Array.prototype.slice.call(btn.parentNode.children).forEach(function (b) {
      b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
    });
    S.showWatch(watchFilter);
    saveSession();
  }

  /* ---------------------------------------------------------------- actions */
  function wireActions() {
    doc.addEventListener('click', function (evt) {
      var target = evt.target;
      var btn = target && target.closest ? target.closest('[data-action]') : null;
      if (!btn) { return; }
      var action = btn.getAttribute('data-action');
      if (btn.tagName !== 'A') { evt.preventDefault(); }
      if (action === 'accept') { acceptTurn(); }
      else if (action === 'undo') { undoMove(); }
      else if (action === 'hint') { showHint(); }
      else if (action === 'new') { newGameDialog(); }
      else if (action === 'hero-play') { startFromHero(); }
      else if (action === 'hero-back') { showHero(); }
      else if (action === 'lobby-tab') { setLobbyTab(btn.getAttribute('data-lobby') || 'new'); }
      else if (action === 'quick-play') { newGame(human === 'black' ? 'black' : 'white'); }
      else if (action === 'play-bot') { lobbyGameDialog('bot'); }
      else if (action === 'private-room' || action === 'join-code') { lobbyGameDialog('online'); }
      else if (action === 'lobby-account') { account ? accountDialog() : authDialog('signup'); }
      else if (action === 'watch-goto') { U.setView('watch'); }
      else if (action === 'resign') { resignDialog(); }
      else if (action === 'draw') { drawDialog(); }
      else if (action === 'flip') { toggleFlip(); }
      else if (action === 'coords') { toggleCoords(); }
      else if (action === 'hints') { toggleHints(); }
      else if (action === 'mode') { setMode(prefs.mode === 'light' ? 'dark' : 'light'); }
      else if (action === 'sidebar') { toggleSidebar(); }
      else if (action === 'sidebar-close') { setDrawer(false); }
      else if (action === 'feedback') {
        U.toast('Feedback', 'This build ships without a server — notes go to the issue tracker.');
      }
      else if (action === 'notifications') {
        U.toast('Notifications', 'Nothing new. Press H whenever you want a hint.', 'move');
      }
      else if (action === 'profile') {
        account ? accountDialog() : authDialog('signup');
      }
      /* --- the session menu. Toggling the mode or the sound deliberately
         LEAVES the panel open: those are the two rows a reader presses more
         than once, and a menu that shut on the first press would make the
         second one a two-step job. Everything that navigates away closes it. */
      else if (action === 'user-menu') { setUserMenu(!userMenuOpen); }
      else if (action === 'user-account') {
        setUserMenu(false);
        account ? accountDialog() : authDialog('signup');
      }
      else if (action === 'user-settings') { setUserMenu(false); settingsDialog(); }
      else if (action === 'user-mode') { setMode(prefs.mode === 'light' ? 'dark' : 'light'); }
      else if (action === 'user-sound') { setSound(prefs.sound === false); }
      else if (action === 'user-session') { account ? signOutNow() : signInNow(); }
      else if (action === 'filter') { applyFilter(btn); }
      else if (action === 'watch-filter') { applyWatchFilter(btn); }
      else if (action === 'spectate') {
        U.toast('Spectating', 'This build has no server, so there is no board to join yet.', 'move');
      }
    });

    var aiToggle = $('#ai-toggle');
    if (aiToggle) {
      aiToggle.addEventListener('change', function () {
        vsAI = aiToggle.checked;
        setText('#ai-note', vsAI ? 'The AI plays the other side.' : 'Hot seat: you move for both sides.');
        if (vsAI) { selected = null; render(); scheduleAI(); }
        else { global.clearTimeout(aiTimer); busy = false; render(); }
      });
    }
    var prevBtn = $('#prev-btn'), nextBtn = $('#next-btn');
    if (prevBtn) { prevBtn.addEventListener('click', function () { stepLook(-1); }); }
    if (nextBtn) { nextBtn.addEventListener('click', function () { stepLook(1); }); }
  }

  /* The arena page can walk the library without opening a picker. */
  function stepLook(delta) {
    var boardsList = C.BOARDS, i = 0;
    boardsList.forEach(function (b, idx) { if (b.id === prefs.board) { i = idx; } });
    pickBoard(boardsList[(i + delta + boardsList.length) % boardsList.length].id);
  }

  /* -------------------------------------------------------------- shortcuts */
  function wireShortcuts() {
    doc.addEventListener('keydown', function (evt) {
      if (doc.querySelector('.overlay')) { return; }
      var tag = (evt.target && evt.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') { return; }
      if (evt.target && evt.target.closest && evt.target.closest('#board')) { return; }
      /* Enter and Space both accept a turn, and both also activate whichever
         button holds focus. Inside the session menu that would accept a turn as
         a side effect of pressing a menu row, so the menu claims them first. */
      if (evt.target && evt.target.closest && evt.target.closest('.user-menu')) { return; }
      /* The hero is a landing state and it owns the whole keyboard while it is
         up: the arena behind it is display:none, so Enter, Space and N must not
         quietly drive a game nobody can see. */
      var playView = $('#view-play');
      if (playView && playView.getAttribute('data-stage') === 'hero') { return; }
      var key = String(evt.key).toLowerCase();
      if (key === ' ' || key === 'enter') { acceptTurn(); }
      else if (key === 'u') { undoMove(); }
      else if (key === 'h') { showHint(); }
      else if (key === 'n') { newGameDialog(); }
      else if (key === 'f') { toggleFlip(); }
      else if (key === 'c') { toggleCoords(); }
      else if (key === 'r') { resignDialog(); }
      else if (key === 'm') { setMode(prefs.mode === 'light' ? 'dark' : 'light'); }
      else { return; }
      evt.preventDefault();
    });
  }

  /* The drawer has to behave like a dialog: it closes on Escape, on the way
     out of the narrow range, and once a destination has been chosen. */
  function wireSidebar() {
    if (narrow && narrow.addEventListener) {
      narrow.addEventListener('change', function (evt) { if (!evt.matches) { setDrawer(false); } });
    }
    doc.addEventListener('keydown', function (evt) {
      if (evt.key === 'Escape' && drawerIsOpen()) { setDrawer(false); }
    });
    $all('.side-nav a').forEach(function (link) {
      link.addEventListener('click', function () {
        if (narrow && narrow.matches) { setDrawer(false); }
      });
    });
  }

  /* The session panel is a real menu, so it behaves like one: it closes on
     Escape and on a click anywhere else, and the arrow keys, Home and End move
     between the rows. Tab is left alone on purpose — the panel sits directly
     after its trigger in the DOM, so letting Tab run is what carries the
     keyboard out of the menu and into the page, and swallowing it here would
     trap focus in a menu that is not modal. */
  function wireUserMenu() {
    var pop = userPop();
    if (!pop) { return; }

    doc.addEventListener('click', function (evt) {
      if (!userMenuOpen) { return; }
      if (evt.target && evt.target.closest && evt.target.closest('.user-menu')) { return; }
      setUserMenu(false);
    });

    doc.addEventListener('keydown', function (evt) {
      if (evt.key !== 'Escape' || !userMenuOpen) { return; }
      setUserMenu(false);
      var trig = $('.side-user');
      if (trig) { trig.focus(); }
    });

    pop.addEventListener('keydown', function (evt) {
      var items = userMenuItems();
      var here = items.indexOf(evt.target);
      if (here < 0) { return; }
      var next = here;
      if (evt.key === 'ArrowDown') { next = (here + 1) % items.length; }
      else if (evt.key === 'ArrowUp') { next = (here - 1 + items.length) % items.length; }
      else if (evt.key === 'Home') { next = 0; }
      else if (evt.key === 'End') { next = items.length - 1; }
      else { return; }
      evt.preventDefault();
      evt.stopPropagation();
      items[next].focus();
    });
  }

  /* The lobby tablist uses a roving tabindex, which only behaves like a tablist
     if the arrow keys move between tabs. Left/Right wrap, Home/End jump, and
     the newly selected tab takes focus so the next Tab leaves the strip. */
  function wireLobby() {
    var strip = $('.lobby-tabs');
    if (!strip) { return; }
    strip.addEventListener('keydown', function (evt) {
      var tabs = Array.prototype.slice.call(strip.querySelectorAll('[data-lobby]'));
      if (!tabs.length) { return; }
      var here = tabs.indexOf(evt.target);
      if (here < 0) { return; }
      var next = here;
      if (evt.key === 'ArrowRight') { next = (here + 1) % tabs.length; }
      else if (evt.key === 'ArrowLeft') { next = (here - 1 + tabs.length) % tabs.length; }
      else if (evt.key === 'Home') { next = 0; }
      else if (evt.key === 'End') { next = tabs.length - 1; }
      else { return; }
      evt.preventDefault();
      evt.stopPropagation();
      setLobbyTab(tabs[next].getAttribute('data-lobby'));
      tabs[next].focus();
    });
  }

  /* ------------------------------------------------------------------- boot
     Boot either picks the game back up or starts a fresh one. The order is
     the same either way — prefs, look, mount, wire, paint — because the only
     thing that differs is where `state` comes from and which stage is left
     standing at the end.

     The restored path deliberately does NOT call newGame(): that function is
     the "a new game starts here" verb, and using it to resume would wipe the
     very state being resumed. It rebuilds only what a resume needs — the
     clocks, the stage, and the bot's turn if it was the bot's move. */
  function boot() {
    prefs = U.loadPrefs();
    account = U.loadAccount();
    /* Mute is applied before anything can make a noise, so a player who muted
       last session does not get a click out of the opening toast. */
    SND.setMuted(prefs.sound === false);
    U.applyLook(prefs);
    U.linkNav();
    U.route();

    var resumed = restoreSession();

    mountBoards();
    mountHero();
    refreshPickers();
    S.renderRanks($('#rank-list'));
    S.showWatch(watchFilter);
    syncModeButton();
    syncSettings();
    syncToggles();
    wireActions();
    wireShortcuts();
    wireSidebar();
    wireLobby();
    wireUserMenu();
    syncSidebar();
    syncAccount();
    syncUserMenu();
    setLobbyTab(lobbyTab);

    if (resumed) {
      /* Same fact the match bar is given when a game starts, rebuilt from the
         game that was actually resumed. */
      var tc = C.timeControl(prefs.timeControl);
      var mins = tc.base ? Math.round(tc.base / 60) + ' min' : 'No clock';
      var who = vsAI ? C.difficulty(prefs.difficulty).name : 'Hot seat';
      setText('#match-top-sub', mins + ' · ' + (roomCode ? 'Room ' + roomCode + ' · ' : '') + who);
      resumeClock();
      render();
      /* A game that was mid-flight when the tab closed still owes the bot a
         turn; one that was waiting on the human does not. */
      scheduleAI();
      /* The stage is restored too, but only into the arena: coming back to a
         live position behind the hero would show a board nobody can reach. */
      setStage('game');
      U.toast('Game restored', 'Move ' + state.moveNumber + ' · ' + R.statusText(state), 'move');
      return;
    }

    newGame('white');
    /* Boot opens a game so the arena is warm behind the hero — the still and the
       live board are then the same state until Play. The hero goes up last,
       because newGame() deliberately takes the view to the game stage. */
    showHero(false);
    U.toast('Fortress', 'Move 1, move 2, then Accept. Press ? on the rules, H for a hint.', 'move');
  }

  FT.app = {
    boot: boot,
    newGame: newGame,
    refresh: render,
    getState: function () { return state; },
    getPrefs: function () { return prefs; }
  };

  if (doc.readyState === 'loading') { doc.addEventListener('DOMContentLoaded', boot); }
  else { boot(); }
})(window);

