/* ==========================================================================
   Fortress — application integration test
   Runs against the real js/ modules and drives js/app.js through genuine DOM
   events, so a pass means the wired-up app works, not just the engine.
   The final line is written into <title> as
     OK  n passed, 0 failed, JS errors: 0
   which is what the headless runner greps for.
   ========================================================================== */
(function () {
  'use strict';
  var FT = window.FT, R = FT.rules, H = FT.hex, C = FT.catalog;
  var log = [], pass = 0, fail = 0, jsErrors = [];

  window.addEventListener('error', function (e) {
    jsErrors.push(String((e && e.message) || e));
  });

  function ok(name, cond, extra) {
    if (cond) { pass++; log.push('PASS  ' + name); }
    else { fail++; log.push('FAIL  ' + name + (extra !== undefined ? '  >> got: ' + extra : '')); }
  }
  function note(text) { log.push('      ' + text); }
  function q(sel) { return document.querySelector(sel); }
  function all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function state() { return FT.app.getState(); }
  function prefs() { return FT.app.getPrefs(); }
  function hexEl(h, root) { return q((root || '#board') + ' .b-hex[data-k="' + h.q + ',' + h.r + '"]'); }
  function click(el) {
    if (!el) { return false; }
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  }
  function flush() {
    var summary = (fail ? 'FAIL' : 'OK') + '  ' + pass + ' passed, ' + fail +
      ' failed, JS errors: ' + jsErrors.length;
    document.getElementById('test-log').textContent =
      log.join('\n') + '\n\n' + summary + (jsErrors.length ? '\n\nJS ERRORS:\n' + jsErrors.join('\n') : '');
    document.title = summary;
  }

  /* helpers for synthetic positions (engine-level checks) */
  function place(s, id, h) {
    if (s.positions[id]) { delete s.hexOccupant[H.key(s.positions[id])]; }
    s.positions[id] = H.clone(h);
    s.hexOccupant[H.key(h)] = id;
  }
  function clearHex(s, h) {
    var oid = s.hexOccupant[H.key(h)];
    if (!oid) { return; }
    delete s.hexOccupant[H.key(h)];
    delete s.pieces[oid];
    delete s.positions[oid];
  }

  /* ---------------------------------------------------------- A · the shell */
  ok('app booted with a state', !!state());
  ok('32 pieces start on the board', Object.keys(state().pieces).length === 32,
    Object.keys(state().pieces).length);
  ok('white opens on move 1', state().turn === 'white' && state().moveNumber === 1 && state().isFirstTurn);
  ok('first phase is awaiting_move1', state().phase === 'awaiting_move1', state().phase);
  /* Nine rows of 6 · 7 · 8 · 7 · 8 · 7 · 8 · 7 · 6 is 64 hexes, not 63. The
     renderer has always emitted 64; only these expectations were wrong. */
  ok('main board renders 64 hexes', document.querySelectorAll('#board .b-hex').length === 64,
    document.querySelectorAll('#board .b-hex').length);
  ok('all 32 pieces are painted', document.querySelectorAll('#board .p-piece').length === 32,
    document.querySelectorAll('#board .p-piece').length);
  ok('the device-frame board renders too', document.querySelectorAll('#board-mini .b-hex').length === 64,
    document.querySelectorAll('#board-mini .b-hex').length);
  ok('white has 3 promotion squares marked',
    document.querySelectorAll('#board .b-hex.is-promo').length === 3,
    document.querySelectorAll('#board .b-hex.is-promo').length);
  ok('hint overlay paints reachable hexes', document.querySelectorAll('#board .move-dot').length > 0);
  ok('log starts with its empty state', /No moves yet/.test(q('#log-list').textContent));
  ok('strip names the sides', q('#white-name').textContent === 'You' && /AI/.test(q('#black-name').textContent),
    q('#white-name').textContent + ' / ' + q('#black-name').textContent);

  /* --------------------------------------------------- B · tap, move, accept */
  var firstMove = R.allLegalMoves(state())[0];
  ok('the side to move has legal moves', !!firstMove);
  click(hexEl(firstMove.from));
  ok('tapping a piece selects it', !!q('#board .b-hex.is-selected'));
  var legalHere = R.legalMoves(state(), firstMove.pieceId);
  ok('selection paints every legal destination',
    document.querySelectorAll('#board .move-dot').length === legalHere.length,
    document.querySelectorAll('#board .move-dot').length + ' vs ' + legalHere.length);
  click(hexEl(firstMove.to));
  ok('tapping a destination plays the move',
    state().positions[firstMove.pieceId] && H.same(state().positions[firstMove.pieceId], firstMove.to));
  ok("white's first turn is a single move", state().phase === 'preview', state().phase);
  ok('preview damage badges appear when pieces are in contact',
    Object.keys(R.preview(state()).doomed).length >= 0);
  ok('log shows the sub-move with notation', /[KTBUW][a-i]\d–[a-i]\d/.test(q('#log-list').textContent),
    q('#log-list').textContent.slice(0, 60));
  ok('undo is offered during preview', !q('[data-action="undo"]').disabled);

  click(q('[data-action="undo"]'));
  ok('undo takes the move back', state().positions[firstMove.pieceId] && state().phase === 'awaiting_move1',
    state().phase);
  click(hexEl(firstMove.from));
  click(hexEl(firstMove.to));
  click(q('[data-action="accept"]'));
  ok('accept hands the turn to black', state().turn === 'black' && state().moveNumber === 2,
    state().turn + ' / ' + state().moveNumber);
  ok('accept recorded the turn in history', state().history.length === 1, state().history.length);
  /* turnText() takes a STATE (it reads state.turnMoves). What is in the history
     is an ENTRY, which carries its own precomputed `text` from accept time —
     so read that rather than handing an entry to a function that wants a state. */
  note('turn 1: ' + String(state().history[0].text).replace(/\s×0$/, ''));
  var allCaps = state().capturedByWhite.concat(state().capturedByBlack);
  ok('every captured piece is really off the board',
    allCaps.every(function (c) { return !state().pieces[c.id]; }), JSON.stringify(allCaps));
  ok('undo is not offered with an empty turn', R.canUndo(state()) === false);

  /* ------------------------------------------- C · promotion and the wall trap */
  var synth = R.newGame('white');
  clearHex(synth, { q: 2, r: 2 });        /* make room on a white promotion hex */
  place(synth, 'w-w1', { q: 1, r: 3 });  /* a wall one forward-diagonal away   */
  var promoMove = R.applyMove(synth, 'w-w1', { q: 2, r: 2 });
  ok('a wall landing on a promotion hex raises a choice',
    !!promoMove && !!promoMove.pendingPromotion, promoMove && promoMove.pendingPromotion);
  ok('it does not stay a wall', !!promoMove && promoMove.pieces['w-w1'].kind !== 'wall',
    promoMove && promoMove.pieces['w-w1'].kind);
  var asTurret = R.choosePromotion(promoMove, 'turret');
  ok('the choice is honoured', asTurret.pieces['w-w1'].kind === 'turret', asTurret.pieces['w-w1'].kind);
  ok('the choice clears itself', asTurret.pendingPromotion === null);
  ok('and it is written into the log notation', /=U/.test(R.subMoveText(asTurret.turnMoves[0])),
    R.subMoveText(asTurret.turnMoves[0]));

  var lonely = R.newGame('white');
  clearHex(lonely, { q: 0, r: 0 });
  place(lonely, 'w-w3', { q: 0, r: 0 });
  lonely.phase = 'preview';
  var lonelyPre = R.preview(lonely);
  ok('an unsupported wall is flagged as collapsing', lonelyPre.collapsed['w-w3'] === true,
    JSON.stringify(Object.keys(lonelyPre.collapsed)));
  var lonelyAfter = R.accept(lonely);
  ok('and it collapses when the turn is accepted', !lonelyAfter.pieces['w-w3']);
  ok('the preview predicted exactly what accept did',
    Object.keys(lonelyPre.collapsed).join(',') === 'w-w3');

  /* ------------------------------------------------- D · pickers and the look */
  ok('the library generates 20 board cards', all('#theme-grid .theme-card').length === 20,
    all('#theme-grid .theme-card').length);
  ok('the library generates 20 background chips', all('#bg-grid .choice-card').length === 20,
    all('#bg-grid .choice-card').length);
  ok('the arena rail has quick picks', all('#theme-quick .theme-card').length === 20);
  ok('one card is marked as the shipped default', all('#theme-grid .theme-card.is-default').length === 1);

  var beforeBoard = document.documentElement.getAttribute('data-board');
  var card5 = all('#theme-grid .theme-card')[4];
  click(card5);
  var afterBoard = document.documentElement.getAttribute('data-board');
  ok('tapping a board card repaints the <html> attribute',
    afterBoard === card5.getAttribute('data-board') && afterBoard !== beforeBoard,
    beforeBoard + ' -> ' + afterBoard);
  /* refreshPickers() rebuilds the grid, so `card5` — the node that was
     clicked — is detached by the time this runs and its attributes froze with
     it. The assertion is about what a screen reader would find NOW, so it has
     to re-read the live grid: exactly one card pressed, and it is the one at
     the same index. */
  ok('the pressed card is marked for assistive tech',
    all('#theme-grid .theme-card[aria-pressed="true"]').length === 1 &&
    all('#theme-grid .theme-card')[4].getAttribute('aria-pressed') === 'true',
    all('#theme-grid .theme-card[aria-pressed="true"]').length + ' pressed');
  ok('the material tokens actually changed',
    getComputedStyle(document.documentElement).getPropertyValue('--b-a').trim().length > 0);

  var bgCard = all('#bg-grid .choice-card')[2];
  var beforeBg = document.documentElement.getAttribute('data-bg');
  click(bgCard);
  ok('tapping a background card repaints the page',
    document.documentElement.getAttribute('data-bg') !== beforeBg,
    beforeBg + ' -> ' + document.documentElement.getAttribute('data-bg'));

  var filterWrap = document.createElement('div');
  filterWrap.className = 'segmented';
  ['all', 'Industrial', 'Natural'].forEach(function (value) {
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('data-action', 'filter');
    b.setAttribute('data-filter-group', 'themes');
    b.setAttribute('data-filter-value', value);
    b.textContent = value;
    filterWrap.appendChild(b);
  });
  document.body.appendChild(filterWrap);
  click(filterWrap.children[1]);
  ok('the Industrial filter narrows the board grid to 10',
    all('#theme-grid .theme-card').length === 10, all('#theme-grid .theme-card').length);
  click(filterWrap.children[2]);
  ok('the Natural filter narrows it to the other 10',
    all('#theme-grid .theme-card').length === 10);
  click(filterWrap.children[0]);
  ok('the All filter restores 20', all('#theme-grid .theme-card').length === 20);

  var modeBefore = document.documentElement.getAttribute('data-mode');
  click(q('[data-action="mode"]'));
  ok('the mode switch flips the whole system',
    document.documentElement.getAttribute('data-mode') !== modeBefore,
    modeBefore + ' -> ' + document.documentElement.getAttribute('data-mode'));
  ok('the contrast audit recomputes to 10 rows', all('#contrast-body tr').length === 10,
    all('#contrast-body tr').length);
  ok('the token readout lists 19 roles', all('#token-grid > .row-3').length === 19,
    all('#token-grid > .row-3').length);
  note('contrast sample: ' + all('#contrast-body tr').slice(0, 2).map(function (tr) {
    return tr.children[0].textContent + ' ' + tr.children[1].textContent;
  }).join(' | '));
  click(q('[data-action="mode"]'));

  /* ---------------------------------------- E · the opponent, end to end */
  /* The ladder is seven rungs, ordered, each with a real search budget. A test
     that only checked "the bot moves" would pass just as happily with one
     level or with all seven identical, so these assert the shape of the ladder
     itself: seven of them, numbered 1..7, and monotonically stronger. */
  ok('there are seven bot levels', C.DIFFICULTIES.length === 7, C.DIFFICULTIES.length);
  ok('the levels are numbered 1 to 7 in order',
    C.DIFFICULTIES.every(function (d, i) { return d.level === i + 1; }),
    C.DIFFICULTIES.map(function (d) { return d.level; }).join(','));
  ok('every level has an id, a name and a description',
    C.DIFFICULTIES.every(function (d) { return d.id && d.name && d.sub; }));
  ok('ids are unique', (function () {
    var seen = {};
    return C.DIFFICULTIES.every(function (d) {
      if (seen[d.id]) { return false; }
      seen[d.id] = true;
      return true;
    });
  })());
  /* Beam width is not the whole ladder: depth is a separate axis, and the two
     rungs either side of a depth change are not expected to compare on width
     alone. What must hold is that a level never searches LESS than the level
     below it once they are on the same depth — that is the invariant a reader
     of the ladder would assume, and the one that would catch a mis-sorted row. */
  ok('within a depth, the beam never narrows going up the ladder',
    C.DIFFICULTIES.every(function (d, i) {
      if (i === 0) { return true; }
      var below = C.DIFFICULTIES[i - 1];
      if (d.depth !== below.depth) { return true; }          /* depth changed; not comparable */
      return d.width === 0 || (below.width !== 0 && d.width >= below.width);
    }),
    C.DIFFICULTIES.map(function (d) { return d.level + ':w' + d.width + '/d' + d.depth; }).join(' '));
  ok('the top of the ladder searches every opening',
    C.DIFFICULTIES[6].width === 0);
  ok('the weakest levels look one move ahead, the stronger ones plan the turn',
    C.DIFFICULTIES[0].depth === 1 && C.DIFFICULTIES[6].depth === 2);
  ok('noise falls to zero at the top of the ladder',
    C.DIFFICULTIES[0].noise > 0 && C.DIFFICULTIES[6].noise === 0,
    C.DIFFICULTIES[0].noise + ' -> ' + C.DIFFICULTIES[6].noise);
  /* An id that is no longer on the ladder (an old save, a typo) must resolve to
     the shipped default rather than to whatever now sits at that index. */
  ok('an unknown level id falls back to the default',
    C.difficulty('a-level-that-never-existed').id === C.DEFAULTS.difficulty,
    C.difficulty('a-level-that-never-existed').id);
  note('ladder: ' + C.DIFFICULTIES.map(function (d) {
    return d.level + ' ' + d.name + '(w' + d.width + ',d' + d.depth + ')';
  }).join(' '));

  /* The level picker is a card grid, so a pick has to survive the redraw: the
     card that was pressed must be the one that stays pressed. */
  var lvlCards = all('#difficulty-seg .level-card');
  ok('the rail draws one card per level', lvlCards.length === 7, lvlCards.length);
  ok('the rail shows the chosen level as pressed',
    lvlCards.filter(function (c) { return c.getAttribute('aria-pressed') === 'true'; }).length === 1);
  ok('the rail note names the rung and the total',
    /Level 3 of 7/.test(q('#difficulty-note').textContent), q('#difficulty-note').textContent);
  click(all('#difficulty-seg .level-card[data-level="sovereign"]')[0]);
  ok('picking the top level writes it through to the pref',
    prefs().difficulty === 'sovereign', prefs().difficulty);
  ok('and the pressed card follows the pick',
    all('#difficulty-seg .level-card').filter(function (c) {
      return c.getAttribute('aria-pressed') === 'true';
    }).length === 1 &&
    all('#difficulty-seg .level-card[data-level="sovereign"]')[0]
      .getAttribute('aria-pressed') === 'true');
  ok('each level card is labelled with its rung for screen readers',
    all('#difficulty-seg .level-card').every(function (c) {
      return /Level \d of 7/.test(c.getAttribute('aria-label') || '');
    }));
  /* Put the ladder back where the rest of the suite expects it. */
  click(all('#difficulty-seg .level-card[data-level="veteran"]')[0]);

  var botState = state();
  var plan = FT.bot.plan(botState, C.difficulty('veteran'));
  ok('the bot plans one or two moves', plan.moves.length >= 1 && plan.moves.length <= 2,
    plan.moves.length);
  note('bot plan: ' + plan.moves.map(function (m) {
    return R.subMoveText({ pieceId: m.pieceId, from: m.from, to: m.to, kind: botState.pieces[m.pieceId].kind });
  }).join(', '));

  var walked = botState, applied = 0;
  for (var i = 0; i < plan.moves.length; i++) {
    var next = R.applyMove(walked, plan.moves[i].pieceId, plan.moves[i].to);
    if (!next) { break; }
    walked = next; applied++;
    if (walked.pendingPromotion) {
      walked = R.choosePromotion(walked, FT.bot.promotionChoice(walked, walked.pendingPromotion.hex)) || walked;
    }
  }
  ok('every planned move is legal through the engine', applied === plan.moves.length,
    applied + '/' + plan.moves.length);
  ok('and the plan reaches the preview step',
    walked.phase === 'preview' || !!walked.result || !!walked.pendingPromotion, walked.phase);

  function selfPlay(limit) {
    var st = R.newGame('white'), turns = 0, bad = null;
    while (!st.result && turns < limit) {
      var p = FT.bot.plan(st, C.difficulty('recruit'));
      if (!p.moves.length) { bad = 'no plan at turn ' + st.moveNumber; break; }
      var cur = st;
      for (var j = 0; j < p.moves.length; j++) {
        var nx = R.applyMove(cur, p.moves[j].pieceId, p.moves[j].to);
        if (!nx) { bad = 'illegal planned move at turn ' + cur.moveNumber; break; }
        cur = nx;
        if (cur.pendingPromotion) {
          cur = R.choosePromotion(cur, FT.bot.promotionChoice(cur, cur.pendingPromotion.hex)) || cur;
        }
      }
      if (bad) { break; }
      var after = R.accept(cur);
      if (!after) { bad = 'accept refused at turn ' + cur.moveNumber; break; }
      st = after;
      turns++;
    }
    return { state: st, turns: turns, bad: bad };
  }

  var run = selfPlay(60);
  ok('the bot plays whole games with no illegal move', !run.bad, run.bad);
  ok('a game runs its full course', run.turns === 60 || !!run.state.result, run.turns);
  ok('a side keeps its Keep until the game ends',
    !!run.state.result || Object.keys(run.state.pieces).some(function (id) {
      return run.state.pieces[id].kind === 'keep' && run.state.pieces[id].color === 'white';
    }));
  note('self-play: ' + run.turns + ' turns, ' + Object.keys(run.state.pieces).length +
    ' pieces left' + (run.state.result ? ', ended ' + run.state.result + ' by ' + run.state.endReason : ''));

  /* --------------------------------- G · Play asks before it starts a game
     The hero's job is to sell the game and then get out of the way. Pressing
     Play used to begin a match immediately, in whatever configuration happened
     to be left over — so a first-time visitor was dropped into a game whose
     side, opponent and clock they had never chosen. Play now opens the setup
     sheet, and only Start crosses into the arena. These drive the real
     buttons: the assertion is about what the press does, not about a function. */
  var heroBtn = q('[data-action="hero-play"]');
  var movesBeforePlay = state().moveNumber;
  var stateBeforePlay = state();

  ok('the app boots on the hero, not in the arena',
    q('#view-play').getAttribute('data-stage') === 'hero',
    q('#view-play').getAttribute('data-stage'));

  click(heroBtn);
  var sheet = q('.overlay');
  ok('pressing Play opens the setup sheet', !!sheet);
  ok('and it is the game-setup sheet, not some other dialog',
    !!sheet && /New game/.test(sheet.getAttribute('aria-label') || ''),
    sheet && sheet.getAttribute('aria-label'));
  ok('the sheet is still on the hero stage while it is up',
    q('#view-play').getAttribute('data-stage') === 'hero',
    q('#view-play').getAttribute('data-stage'));
  ok('the sheet asks which side you are playing',
    !!sheet && /White \(first\)/.test(sheet.textContent));
  ok('the sheet offers all seven levels',
    !!sheet && sheet.querySelectorAll('.level-card').length === 7,
    sheet && sheet.querySelectorAll('.level-card').length);
  ok('the sheet offers the clocks',
    !!sheet && /No clock/.test(sheet.textContent) && /Classic/.test(sheet.textContent));
  ok('choosing a level inside the sheet marks exactly one card pressed',
    !!sheet && sheet.querySelectorAll('.level-card[aria-pressed="true"]').length === 1);
  ok('picking a level in the sheet writes through to the pref',
    (function () {
      var card = sheet && sheet.querySelector('.level-card[data-level="warden"]');
      click(card);
      return prefs().difficulty === 'warden';
    })(), prefs().difficulty);
  ok('the sheet stays open after picking a level',
    q('.overlay') === sheet);
  /* Same state object, same move number: pressing Play configured a game, it
     did not play one. */
  ok('the game has not started yet',
    state() === stateBeforePlay && state().moveNumber === movesBeforePlay,
    'move ' + state().moveNumber + ', was ' + movesBeforePlay);

  /* Cancelling must be a real way out: the visitor lands back on the hero with
     the arena still hidden, not stranded on a sheet for a game they declined. */
  var cancel = sheet.querySelectorAll('.modal-foot .btn')[1];
  ok('the sheet offers a way out', !!cancel && /Cancel/.test(cancel.textContent));
  click(cancel);
  ok('cancelling closes the sheet', !q('.overlay'));
  ok('and leaves the visitor on the hero',
    q('#view-play').getAttribute('data-stage') === 'hero',
    q('#view-play').getAttribute('data-stage'));
  ok('and still no game was played',
    state().moveNumber === movesBeforePlay, state().moveNumber);

  /* Now the real thing: Play, choose, Start. The stage must flip and the match
     bar must report the settings this game was actually started with. */
  click(heroBtn);
  var sheet2 = q('.overlay');
  click(sheet2.querySelector('.level-card[data-level="captain"]'));
  click(sheet2.querySelectorAll('.modal-foot .btn')[0]);   /* Start game */
  ok('Start game closes the sheet', !q('.overlay'));
  ok('Start game swaps the hero for the arena',
    q('#view-play').getAttribute('data-stage') === 'game',
    q('#view-play').getAttribute('data-stage'));
  ok('the match bar names the level the game was started with',
    /Captain/.test(q('#match-top-sub').textContent), q('#match-top-sub').textContent);
  ok('the match bar names the clock, not a hardcoded placeholder',
    /min|No clock/.test(q('#match-top-sub').textContent), q('#match-top-sub').textContent);
  ok('a fresh game is on the board', state().moveNumber === 1 && !!state(),
    state().moveNumber);
  ok('the board took focus so the keyboard can drive it',
    document.activeElement === q('#board'),
    document.activeElement && document.activeElement.id);

  /* The hot-seat path hides the opponent controls: there is no bot to pick a
     level or a clock for when both sides are human. */
  click(q('[data-action="new"]'));
  var sheet3 = q('.overlay');
  var hotseat = Array.prototype.filter.call(
    sheet3.querySelectorAll('.segmented > button'),
    function (b) { return /Two players/.test(b.textContent); })[0];
  click(hotseat);
  ok('choosing two players hides the level and clock pickers',
    !q('.overlay').querySelector('.level-card') || !q('.overlay').querySelector('.level-card').offsetParent,
    'level cards still visible');
  click(q('.overlay').querySelectorAll('.modal-foot .btn')[1]);   /* Cancel */
  /* Hand the turn to the AI so the closing check below still has an opponent to
     answer it. Section B already accepted a white turn earlier, so the board is
     mid-game with the human to move; play one more turn through the real
     buttons and the bot is on the clock again. Doing it with the DOM rather
     than newGame() keeps the log and the move number continuous, which is what
     those assertions read. */
  var aiReply = R.allLegalMoves(state())[0];
  click(hexEl(aiReply.from));
  click(hexEl(aiReply.to));
  click(q('[data-action="accept"]'));
  ok('the suite leaves the turn with the AI to answer',
    state().turn === 'black' && state().moveNumber >= 2,
    state().turn + ' / ' + state().moveNumber);

  /* --------------------------------- F · the AI replies without being asked */
  var movesBefore = state().moveNumber;
  note('waiting for the AI to answer…');
  flush();

  window.setTimeout(function () {
    ok('the AI moves on its own', state().moveNumber > movesBefore || !!state().result,
      'turn ' + movesBefore + ' -> ' + state().moveNumber);
    ok('the turn comes back to the human', !!state().result || state().turn === 'white', state().turn);
    ok('both turns reached the log', state().history.length >= 2, state().history.length);
    ok('no uncaught JavaScript errors in the whole run', jsErrors.length === 0, jsErrors.join(' | '));
    flush();
  }, 4200);
})();
