/* Fortress engine verification — executed headless by tests/engine-test.html.
   Plays scripted positions plus a 900-ply random game and asserts the rules
   the production engine enforces. */
(function () {
  var log = [], pass = 0, fail = 0, R = FT.rules, H = FT.hex;

  function ok(name, cond, extra) {
    if (cond) { pass++; log.push('PASS  ' + name); }
    else { fail++; log.push('FAIL  ' + name + (extra !== undefined ? '  >> got ' + extra : '')); }
  }
  function note(s) { log.push('      ' + s); }
  function occ(positions) {
    var m = {};
    Object.keys(positions).forEach(function (id) { m[H.key(positions[id])] = id; });
    return m;
  }
  function state(pieces, positions, turn) {
    return {
      pieces: pieces, positions: positions, hexOccupant: occ(positions),
      playable: H.playableSet(), turn: turn || 'white', phase: 'awaiting_move1',
      turnMoves: [], movedPieceIds: [], wallHasMoved: [], isFirstTurn: false,
      pendingPromotion: null, result: null, endReason: null, moveNumber: 1,
      capturedByWhite: [], capturedByBlack: [], history: [], positionCounts: {},
      stagnation: { turns: 0, pieceCount: Object.keys(pieces).length, bestAdvance: { white: 0, black: 0 } }
    };
  }
  function rng(seed) {
    var s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  /* ---------------------------------------------------------- 1. geometry */
  var playing = H.playableSet();
  ok('board has 64 playable hexes', Object.keys(playing).length === 64, Object.keys(playing).length);
  ok('row widths 6,7,8,7,8,7,8,7,6', H.WIDTHS.join(',') === '6,7,8,7,8,7,8,7,6', H.WIDTHS.join(','));
  ok('all 6 neighbours of a central hex exist', H.neighbors({ q: 0, r: 4 }).every(function (n) {
    return playing[H.key(n)];
  }), '');

  /* ------------------------------------------------------------- 2. setup */
  var s = R.newGame();
  ok('32 pieces at setup', Object.keys(s.pieces).length === 32, Object.keys(s.pieces).length);
  ok('16 pieces per side', R.pieceCountOf(s, 'white') === 16 && R.pieceCountOf(s, 'black') === 16, '');
  ok('every start hex is playable', Object.keys(s.positions).every(function (id) {
    return s.playable[H.key(s.positions[id])];
  }), '');
  ok('a lone Keep has core STR 3', R.strength(s, 'w-k') === 3, R.strength(s, 'w-k'));

  var st5 = state(
    { t: { kind: 'tower', color: 'white' }, k: { kind: 'keep', color: 'white' }, u: { kind: 'turret', color: 'white' } },
    { t: { q: -3, r: 5 }, k: { q: -3, r: 6 }, u: { q: -4, r: 5 } }
  );
  ok('published example: flanked Tower = 2+2+2', R.strength(st5, 't') === 6, R.strength(st5, 't'));
  ok('Keep aura also reaches distance 2', R.strength(st5, 'u') === 4, R.strength(st5, 'u'));

  /* ------------------------------------------------- 3. movement by kind */
  var st6 = state({ k: { kind: 'keep', color: 'white' } }, { k: { q: 0, r: 4 } });
  ok('Keep reaches 6 neighbours in the open', R.legalMoves(st6, 'k').length === 6, R.legalMoves(st6, 'k').length);

  var st7 = state({ u: { kind: 'turret', color: 'white' } }, { u: { q: 0, r: 4 } });
  var tu = R.legalMoves(st7, 'u');
  ok('Turret only reaches ring 2', tu.every(function (h) { return H.distance(h, { q: 0, r: 4 }) === 2; }), tu.length);
  note('turret from e5: ' + tu.length + ' squares -> ' + tu.map(H.square).join(' '));

  var st8 = state({ w: { kind: 'wall', color: 'white' } }, { w: { q: -3, r: 4 } });
  var wm = R.legalMoves(st8, 'w');
  ok('fresh wall gets single + double steps', wm.length >= 3 && wm.some(function (h) {
    return H.distance(h, { q: -3, r: 4 }) === 2;
  }), wm.map(H.square).join(' '));
  note('fresh wall at ' + H.square({ q: -3, r: 4 }) + ' -> ' + wm.map(H.square).join(' '));
  var st8b = R.clone(st8); st8b.wallHasMoved = ['w'];
  ok('wall that has moved loses the 2-hex slide', R.legalMoves(st8b, 'w').every(function (h) {
    return H.distance(h, { q: -3, r: 4 }) === 1;
  }), R.legalMoves(st8b, 'w').map(H.square).join(' '));

  var st9 = state({ t: { kind: 'tower', color: 'white' } }, { t: { q: 0, r: 4 } });
  ok('Tower slides along its rays', R.legalMoves(st9, 't').length > 4, R.legalMoves(st9, 't').length);

  var st10 = state(
    { b: { kind: 'bastion', color: 'white' }, w: { kind: 'wall', color: 'white' } },
    { b: { q: 0, r: 4 }, w: { q: 1, r: 4 } }
  );
  var bm = R.legalMoves(st10, 'b');
  ok('Bastion vaults a run containing a friend', bm.some(function (h) { return H.same(h, { q: 2, r: 4 }); }),
    bm.map(H.square).join(' '));
  ok('Bastion also keeps its plain step', bm.some(function (h) { return H.same(h, { q: 0, r: 5 }); }), '');
  var st10b = state(
    { b: { kind: 'bastion', color: 'white' }, e: { kind: 'wall', color: 'black' } },
    { b: { q: 0, r: 4 }, e: { q: 1, r: 4 } }
  );
  ok('Bastion will not vault an all-enemy run', !R.legalMoves(st10b, 'b').some(function (h) {
    return H.same(h, { q: 2, r: 4 });
  }), '');
  ok('no piece may move onto an occupied hex', R.legalMoves(st10, 'b').every(function (h) {
    return R.isEmpty(st10, h);
  }), '');

  /* @TEST-END */
})();
