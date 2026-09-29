/* ==========================================================================
   FT.rules — a faithful port of the shipped Fortress rules engine
   Verified 1:1 against the production rules module:
     CORE    keep 3 | tower 2 | bastion 2 | turret 1 | wall 0
     SUPPORT keep +2 adj +1 @2 | tower +2 | bastion +1 | turret +2 | wall +1
     Turn    Move 1 -> Move 2 -> Preview -> Accept  (white's 1st turn: 1 move)
     Wall    steps 1 forward (diagonals) or slides 2 forward on its first move
     Turret  jumps to cube-distance exactly 2, over anything
     Bastion vaults a filled run holding >=1 friend, lands on first empty hex
     Tower   slides any distance along the 6 directions
     Combat  simultaneous; damage = current STR and stacks; damage >= STR kills;
             a wall left at STR 0 collapses; a dying piece still deals damage
     Ends    keep capture · mutual destruction (draw) · stalemate (draw) ·
             threefold repetition (draw) · 30 quiet turns -> advance
             adjudication · resignation · draw agreement
   ========================================================================== */
(function (global) {
  'use strict';
  var FT = global.FT = global.FT || {};
  var H = FT.hex;

  var CORE = { keep: 3, tower: 2, turret: 1, bastion: 2, wall: 0 };
  var SUPPORT = {
    wall: { adjacent: 1 }, turret: { adjacent: 2 }, bastion: { adjacent: 1 },
    tower: { adjacent: 2 }, keep: { adjacent: 2, distance2: 1 }
  };
  var KIND_LETTER = { keep: 'K', tower: 'T', turret: 'U', bastion: 'B', wall: 'W' };
  var ADV_BASE = { white: -8, black: 6 };   /* rank constant of each back rank */
  var STAGNATION_LIMIT = 30;                /* quiet turns before adjudication */
  var REPEAT_LIMIT = 3;                     /* threefold repetition = draw     */

  var PROMOTION_HEXES = {
    white: [{ q: 2, r: 2 }, { q: 1, r: 4 }, { q: 0, r: 6 }],
    black: [{ q: -5, r: 2 }, { q: -6, r: 4 }, { q: -7, r: 6 }]
  };

  var START = [
    ['b-u1', 'turret', 'black', 2, 1], ['b-t1', 'tower', 'black', 2, 2],
    ['b-b1', 'bastion', 'black', 1, 3], ['b-k', 'keep', 'black', 1, 4],
    ['b-b2', 'bastion', 'black', 0, 5], ['b-t2', 'tower', 'black', 0, 6],
    ['b-u4', 'turret', 'black', -1, 7], ['b-w1', 'wall', 'black', 2, 0],
    ['b-w2', 'wall', 'black', 1, 1], ['b-w3', 'wall', 'black', 1, 2],
    ['b-w4', 'wall', 'black', 0, 3], ['b-w5', 'wall', 'black', 0, 4],
    ['b-w6', 'wall', 'black', -1, 5], ['b-w7', 'wall', 'black', -1, 6],
    ['b-w8', 'wall', 'black', -2, 7], ['b-w9', 'wall', 'black', -2, 8],
    ['w-u1', 'turret', 'white', -4, 1], ['w-t1', 'tower', 'white', -5, 2],
    ['w-b1', 'bastion', 'white', -5, 3], ['w-k', 'keep', 'white', -6, 4],
    ['w-b2', 'bastion', 'white', -6, 5], ['w-t2', 'tower', 'white', -7, 6],
    ['w-u4', 'turret', 'white', -7, 7], ['w-w1', 'wall', 'white', -3, 0],
    ['w-w2', 'wall', 'white', -3, 1], ['w-w3', 'wall', 'white', -4, 2],
    ['w-w4', 'wall', 'white', -4, 3], ['w-w5', 'wall', 'white', -5, 4],
    ['w-w6', 'wall', 'white', -5, 5], ['w-w7', 'wall', 'white', -6, 6],
    ['w-w8', 'wall', 'white', -6, 7], ['w-w9', 'wall', 'white', -7, 8]
  ];

  function other(color) { return color === 'white' ? 'black' : 'white'; }

  /* Every mutation returns a NEW state, so undo, preview, hints and the bot
     can all fork the position safely. */
  function clone(state) {
    return {
      pieces: Object.assign({}, state.pieces),
      positions: Object.assign({}, state.positions),
      hexOccupant: Object.assign({}, state.hexOccupant),
      playable: state.playable,
      turn: state.turn,
      phase: state.phase,
      turnMoves: state.turnMoves.slice(),
      movedPieceIds: state.movedPieceIds.slice(),
      wallHasMoved: state.wallHasMoved.slice(),
      isFirstTurn: state.isFirstTurn,
      pendingPromotion: state.pendingPromotion ? Object.assign({}, state.pendingPromotion) : null,
      result: state.result,
      endReason: state.endReason,
      moveNumber: state.moveNumber,
      capturedByWhite: state.capturedByWhite.slice(),
      capturedByBlack: state.capturedByBlack.slice(),
      history: state.history.slice(),
      positionCounts: Object.assign({}, state.positionCounts),
      stagnation: {
        turns: state.stagnation.turns,
        pieceCount: state.stagnation.pieceCount,
        bestAdvance: Object.assign({}, state.stagnation.bestAdvance)
      }
    };
  }

  function occupant(state, hex) { return state.hexOccupant[H.key(hex)]; }
  function pieceAt(state, hex) { var id = occupant(state, hex); return id ? state.pieces[id] : null; }
  function isPlayable(state, hex) { return !!state.playable[H.key(hex)]; }
  function isEmpty(state, hex) { return isPlayable(state, hex) && !occupant(state, hex); }

  function promotionHexes(color) {
    return color === 'white' ? PROMOTION_HEXES.white : PROMOTION_HEXES.black;
  }
  function isPromotionSquare(hex, color) {
    return promotionHexes(color).some(function (h) { return H.same(h, hex); });
  }

  /* Current STR = core + every friendly neighbour's support + the Keep's
     distance-2 aura. Supports stack — that is the whole game. */
  function strength(state, id) {
    var p = state.pieces[id], pos = state.positions[id];
    if (!p || !pos) return 0;
    var total = CORE[p.kind] || 0, i, n, o;
    for (i = 0; i < H.DIRS.length; i++) {
      n = H.add(pos, H.DIRS[i]); o = occupant(state, n);
      if (o && state.pieces[o] && state.pieces[o].color === p.color) {
        total += SUPPORT[state.pieces[o].kind].adjacent || 0;
      }
    }
    for (i = 0; i < H.RING2.length; i++) {
      n = { q: pos.q + H.RING2[i][0], r: pos.r + H.RING2[i][1] }; o = occupant(state, n);
      if (o && state.pieces[o] && state.pieces[o].color === p.color) {
        total += SUPPORT[state.pieces[o].kind].distance2 || 0;
      }
    }
    return total;
  }

  /* Same number plus the receipts — drives the selection/support panel. */
  function supportBreakdown(state, id) {
    var p = state.pieces[id], pos = state.positions[id];
    if (!p || !pos) return null;
    var core = CORE[p.kind] || 0, contributors = [];
    Object.keys(state.pieces).forEach(function (otherId) {
      if (otherId === id) return;
      var q = state.pieces[otherId];
      if (q.color !== p.color) return;
      var d = H.distance(pos, state.positions[otherId]);
      if (d === 1 && SUPPORT[q.kind].adjacent) {
        contributors.push({ id: otherId, kind: q.kind, amount: SUPPORT[q.kind].adjacent, at: 1 });
      } else if (d === 2 && SUPPORT[q.kind].distance2) {
        contributors.push({ id: otherId, kind: q.kind, amount: SUPPORT[q.kind].distance2, at: 2 });
      }
    });
    return {
      total: core + contributors.reduce(function (a, c) { return a + c.amount; }, 0),
      core: core, contributors: contributors
    };
  }

  function pieceCountOf(state, color) {
    return Object.keys(state.pieces).filter(function (id) {
      return state.pieces[id].color === color;
    }).length;
  }

  function keepsAlive(state) {
    var w = false, b = false;
    Object.keys(state.pieces).forEach(function (id) {
      var p = state.pieces[id];
      if (p.kind !== 'keep') return;
      if (p.color === 'white') { w = true; } else { b = true; }
    });
    return { white: w, black: b };
  }

  function winnerByKeeps(state) {
    var k = keepsAlive(state);
    if (!k.white && !k.black) return 'draw';
    if (k.white && k.black) return null;
    return k.white ? 'white' : 'black';
  }

  function removePiece(state, id) {
    var pos = state.positions[id];
    if (!pos) return;
    delete state.hexOccupant[H.key(pos)];
    delete state.pieces[id];
    delete state.positions[id];
  }

  /* ------------------------------------------------------- move generation */
  function forwardDir(color) { return color === 'white' ? { q: 1, r: 0 } : { q: -1, r: 0 }; }

  function forwardDiagonals(color) {
    return color === 'black'
      ? [{ q: 0, r: -1 }, { q: -1, r: 1 }]
      : [{ q: 0, r: 1 }, { q: 1, r: -1 }];
  }

  function dedupe(moves) {
    var seen = {}, out = [];
    moves.forEach(function (h) {
      var k = H.key(h);
      if (seen[k]) return;
      seen[k] = true; out.push(h);
    });
    return out;
  }

  /* Wall: one step forward along any of its three forward lines, never
     straight ahead as a plain step (that is the separate "advance" hex), and
     a two-hex straight slide along any forward line on its first move. */
  function wallMoves(state, id, pos, color) {
    var out = [], rank = H.rank(pos), fwd = forwardDir(color), i, c, d;

    for (i = 0; i < H.DIRS.length; i++) {
      c = H.add(pos, H.DIRS[i]);
      if (!isEmpty(state, c)) continue;
      d = H.rank(c);
      if (color === 'white' ? !(d > rank) : !(d < rank)) continue;
      if (c.r === pos.r && (color === 'white' ? c.q === pos.q + 1 : c.q === pos.q - 1)) continue;
      out.push(c);
    }

    var straight = H.add(pos, fwd);
    if (isEmpty(state, straight)) out.push(straight);

    if (state.wallHasMoved.indexOf(id) === -1) {
      var lines = [fwd].concat(forwardDiagonals(color));
      for (i = 0; i < lines.length; i++) {
        var m = H.add(pos, lines[i]);
        if (!isEmpty(state, m)) continue;
        var u = H.add(m, lines[i]);
        if (isEmpty(state, u)) out.push(u);
      }
    }
    return dedupe(out);
  }

  /* Turret: jumps to any empty hex at cube-distance exactly 2 (ring 2). */
  function turretMoves(state, pos) {
    var out = [];
    for (var i = 0; i < H.RING2.length; i++) {
      var t = { q: pos.q + H.RING2[i][0], r: pos.r + H.RING2[i][1] };
      if (isEmpty(state, t)) out.push(t);
    }
    return out;
  }

  /* Bastion: vault a contiguous run of pieces that begins adjacent and holds
     at least one friend, landing on the first empty hex beyond. Plus the
     plain one-hex step it always keeps. */
  function bastionMoves(state, pos, color) {
    var out = [], i, j;
    for (i = 0; i < H.DIRS.length; i++) {
      var dir = H.DIRS[i], cur = H.add(pos, dir);
      if (!isPlayable(state, cur) || !occupant(state, cur)) continue;
      var friendly = false, guard = 0;
      while (isPlayable(state, cur) && occupant(state, cur) && guard++ < 40) {
        var pid = occupant(state, cur);
        if (state.pieces[pid] && state.pieces[pid].color === color) friendly = true;
        cur = H.add(cur, dir);
      }
      if (friendly && isEmpty(state, cur)) out.push(cur);
    }
    var n = H.neighbors(pos);
    for (j = 0; j < n.length; j++) { if (isEmpty(state, n[j])) out.push(n[j]); }
    return dedupe(out);
  }

  /* Tower: slide any number of hexes along one of the six directions. */
  function towerMoves(state, pos) {
    var out = [], i, s;
    for (i = 0; i < H.DIRS.length; i++) {
      for (s = 1; s <= 20; s++) {
        var t = { q: pos.q + H.DIRS[i].q * s, r: pos.r + H.DIRS[i].r * s };
        if (!isPlayable(state, t) || occupant(state, t)) break;
        out.push(t);
      }
    }
    return out;
  }

  /* Keep: one step in any direction; on its second move of the turn it may not
     step straight back to where it came from. */
  function keepMoves(state, id, pos) {
    var origin = null;
    if (state.phase === 'awaiting_move2' && state.movedPieceIds.indexOf(id) !== -1) {
      var prev = state.turnMoves.filter(function (m) { return m.pieceId === id; })[0];
      origin = prev ? prev.from : null;
    }
    return H.neighbors(pos).filter(function (n) {
      return isEmpty(state, n) && !(origin && H.same(n, origin));
    });
  }

  /* The single entry point: legal destinations for one piece, right now. */
  function legalMoves(state, id) {
    var p = state.pieces[id], pos = state.positions[id];
    if (!p || !pos) return [];
    if (p.color !== state.turn) return [];
    if (state.result) return [];
    if (state.movedPieceIds.indexOf(id) !== -1 && p.kind !== 'keep') return [];
    switch (p.kind) {
      case 'wall': return wallMoves(state, id, pos, p.color);
      case 'turret': return turretMoves(state, pos);
      case 'bastion': return bastionMoves(state, pos, p.color);
      case 'tower': return towerMoves(state, pos);
      case 'keep': return keepMoves(state, id, pos);
      default: return [];
    }
  }

  /* Every legal move for the side to move: [{pieceId, from, to}] */
  function allLegalMoves(state) {
    var out = [];
    Object.keys(state.pieces).forEach(function (id) {
      legalMoves(state, id).forEach(function (to) {
        out.push({ pieceId: id, from: state.positions[id], to: to });
      });
    });
    return out;
  }

  function hasAnyMove(state) { return allLegalMoves(state).length > 0; }

  /* The engine auto-advances to Preview when Move 2 has nothing to offer. */
  function refreshPhase(state) {
    if (state.phase !== 'awaiting_move2') return state;
    var s = clone(state);
    if (!hasAnyMove(s)) s.phase = 'preview';
    return s;
  }

  /* ------------------------------------------------------------ turn moves */
  function applyMove(state, pieceId, to) {
    if (!state || state.result) return null;
    if (state.phase !== 'awaiting_move1' && state.phase !== 'awaiting_move2') return null;
    var p = state.pieces[pieceId];
    if (!p || p.color !== state.turn) return null;
    var ok = legalMoves(state, pieceId).some(function (h) { return H.same(h, to); });
    if (!ok) return null;

    var s = clone(state), from = s.positions[pieceId];
    delete s.hexOccupant[H.key(from)];
    s.positions[pieceId] = H.clone(to);
    s.hexOccupant[H.key(to)] = pieceId;

    var mv = { pieceId: pieceId, from: from, to: H.clone(to), promoted: false, kind: p.kind };
    if (p.kind === 'wall' && isPromotionSquare(to, p.color)) {
      s.pieces[pieceId] = { kind: 'tower', color: p.color };
      mv.promoted = true;
      mv.promotedTo = 'tower';
      s.pendingPromotion = { hex: H.clone(to), color: p.color, pieceId: pieceId };
    }
    s.turnMoves.push(mv);
    s.movedPieceIds.push(pieceId);

    if (s.phase === 'awaiting_move1') {
      s.phase = (s.isFirstTurn && s.turn === 'white') ? 'preview' : 'awaiting_move2';
    } else {
      s.phase = 'preview';
    }
    return refreshPhase(s);
  }

  function undo(state) {
    if (!state || state.result) return null;
    if (state.phase === 'resolved' || state.turnMoves.length === 0) return null;
    var s = clone(state), move = s.turnMoves.pop();
    s.movedPieceIds.pop();
    if (move.promoted && s.pieces[move.pieceId]) {
      s.pieces[move.pieceId] = { kind: 'wall', color: s.pieces[move.pieceId].color };
    }
    delete s.hexOccupant[H.key(move.to)];
    s.positions[move.pieceId] = move.from;
    s.hexOccupant[H.key(move.from)] = move.pieceId;
    if (s.pendingPromotion && H.same(s.pendingPromotion.hex, move.to)) s.pendingPromotion = null;
    s.phase = s.turnMoves.length === 0 ? 'awaiting_move1' : 'awaiting_move2';
    return s;
  }

  /* A wall never becomes a Bastion or a Keep — only Tower or Turret. */
  function choosePromotion(state, kind) {
    if (!state || !state.pendingPromotion) return state;
    if (kind !== 'tower' && kind !== 'turret') return state;
    var s = clone(state), pp = s.pendingPromotion;
    var id = pp.pieceId || occupant(s, pp.hex);
    if (!id || !s.pieces[id] || s.pieces[id].kind === 'keep') return state;
    s.pieces[id] = { kind: kind, color: pp.color };
    s.pendingPromotion = null;
    s.turnMoves.forEach(function (m) { if (m.pieceId === id) m.promotedTo = kind; });
    return s;
  }

  function canUndo(state) {
    return !!state && !state.result && state.phase !== 'resolved' && state.turnMoves.length > 0;
  }
  function canAccept(state) {
    return !!state && !state.result && state.phase === 'preview';
  }

  /* ---------------------------------------------------------------- combat */
  /* Incoming damage: every piece deals its current STR to every adjacent
     enemy, simultaneously. Damage stacks across attackers. */
  function incomingDamage(state) {
    var dmg = {};
    Object.keys(state.pieces).forEach(function (id) {
      var p = state.pieces[id], pos = state.positions[id];
      if (!p || !pos) return;
      var str = strength(state, id);
      if (str <= 0) return;
      for (var i = 0; i < H.DIRS.length; i++) {
        var oid = occupant(state, H.add(pos, H.DIRS[i]));
        if (oid && state.pieces[oid] && state.pieces[oid].color !== p.color) {
          dmg[oid] = (dmg[oid] || 0) + str;
        }
      }
    });
    return dmg;
  }

  /* One call that answers "what happens if I press Accept?". */
  function resolveCombat(state) {
    var dmg = incomingDamage(state);
    var doomed = {}, deadList = [];
    Object.keys(state.pieces).forEach(function (id) {
      var str = strength(state, id), inc = dmg[id] || 0;
      if (str > 0 && inc >= str) { doomed[id] = true; deadList.push(id); }
    });

    var s = clone(state);
    deadList.forEach(function (id) { removePiece(s, id); });

    /* Walls only stand while supported: any wall left at STR 0 collapses,
       which can cascade to its neighbours. */
    var collapsed = {}, changed = true, guard = 0;
    while (changed && guard++ < 40) {
      changed = false;
      Object.keys(s.pieces).forEach(function (id) {
        if (collapsed[id] || s.pieces[id].kind !== 'wall') return;
        if (strength(s, id) !== 0) return;
        collapsed[id] = true;
        removePiece(s, id);
        changed = true;
      });
    }

    var captured = deadList.map(function (id) {
      return { id: id, kind: state.pieces[id].kind, color: state.pieces[id].color, how: 'killed' };
    }).concat(Object.keys(collapsed).map(function (id) {
      return { id: id, kind: 'wall', color: state.pieces[id].color, how: 'collapsed' };
    }));

    var hexes = Object.keys(state.pieces).map(function (id) {
      return {
        id: id, hex: state.positions[id], incoming: dmg[id] || 0,
        str: strength(state, id), willDie: !!doomed[id], willCollapse: !!collapsed[id]
      };
    });

    return { state: s, doomed: doomed, collapsed: collapsed, captured: captured, hexes: hexes, damage: dmg };
  }

  /* Cheap preview for the board overlay (no state mutation). */
  function preview(state) {
    if (!state || state.result) return null;
    return resolveCombat(state);
  }

  /* ------------------------------------------------------------ end of turn */
  /* Advance metric: how far each army has pushed up the rank axis (2q + r). */
  function advance(pieces, positions) {
    var white = 0, black = 0, count = 0;
    Object.keys(pieces).forEach(function (id) {
      var p = pieces[id], pos = positions[id];
      if (!p || !pos) return;
      count++;
      var k = 2 * pos.q + pos.r;
      if (p.color === 'white') { white += k - ADV_BASE.white; }
      else { black += ADV_BASE.black - k; }
    });
    return { white: white, black: black, count: count };
  }

  /* 30 turns with no capture and no new advance -> judged on ground taken. */
  function updateStagnation(prev, next) {
    var adv = advance(next.pieces, next.positions);
    var quiet = (adv.count < prev.pieceCount ||
      adv.white > prev.bestAdvance.white ||
      adv.black > prev.bestAdvance.black) ? 0 : prev.turns + 1;
    var st = {
      turns: quiet, pieceCount: adv.count,
      bestAdvance: {
        white: Math.max(prev.bestAdvance.white, adv.white),
        black: Math.max(prev.bestAdvance.black, adv.black)
      }
    };
    var adjudication = null;
    if (quiet >= STAGNATION_LIMIT) {
      adjudication = adv.white > adv.black ? 'white' : (adv.black > adv.white ? 'black' : 'draw');
    }
    return { stagnation: st, adjudication: adjudication, advance: adv };
  }

  function positionKey(state) {
    var rows = Object.keys(state.pieces).map(function (id) {
      var p = state.pieces[id], pos = state.positions[id];
      return (p.color === 'white' ? 'w' : 'b') + KIND_LETTER[p.kind] + pos.q + ',' + pos.r;
    }).sort();
    return state.turn + '|' + rows.join(';');
  }

  /* Wall arriving on (or standing on) a far back-rank square must promote. */
  function detectStandingPromotion(state) {
    var ids = Object.keys(state.pieces);
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i], p = state.pieces[id];
      if (p.kind !== 'wall') continue;
      if (isPromotionSquare(state.positions[id], p.color)) {
        return { hex: H.clone(state.positions[id]), color: p.color, pieceId: id };
      }
    }
    return null;
  }

  function nextTurn(state) {
    var s = clone(state);
    s.turn = other(state.turn);
    s.phase = 'awaiting_move1';
    s.turnMoves = [];
    s.movedPieceIds = [];
    s.pendingPromotion = null;
    s.isFirstTurn = false;
    s.moveNumber = state.moveNumber + 1;

    var k = positionKey(s);
    var count = (state.positionCounts[k] || 0) + 1;
    s.positionCounts[k] = count;

    var st = updateStagnation(state.stagnation, s);
    s.stagnation = st.stagnation;

    if (count >= REPEAT_LIMIT) {
      s.result = 'draw'; s.endReason = 'draw_repetition'; s.phase = 'resolved'; return s;
    }
    if (st.adjudication) {
      s.result = st.adjudication; s.endReason = 'stagnation'; s.phase = 'resolved'; return s;
    }
    if (!hasAnyMove(s)) {
      s.result = 'draw'; s.endReason = 'stalemate'; s.phase = 'resolved'; return s;
    }
    return s;
  }

  /* Accept = resolve combat, then hand the turn over. */
  function accept(state) {
    if (!canAccept(state)) return null;
    var pre = resolveCombat(state);
    var after = pre.state;

    var capW = after.capturedByWhite.slice(), capB = after.capturedByBlack.slice();
    pre.captured.forEach(function (c) {
      if (c.color === 'black') { capW.push(c); } else { capB.push(c); }
    });
    after.capturedByWhite = capW;
    after.capturedByBlack = capB;

    var entry = {
      moveNumber: state.moveNumber,
      color: state.turn,
      subMoves: state.turnMoves.slice(),
      captured: pre.captured.slice(),
      text: turnText(state, pre.captured)
    };

    var whiteKeepDies = Object.keys(pre.doomed).some(function (id) {
      var p = state.pieces[id]; return p && p.kind === 'keep' && p.color === 'white';
    });
    var blackKeepDies = Object.keys(pre.doomed).some(function (id) {
      var p = state.pieces[id]; return p && p.kind === 'keep' && p.color === 'black';
    });

    /* Walls that moved this turn lose their two-hex opener for good. */
    state.turnMoves.forEach(function (m) {
      var p = after.pieces[m.pieceId];
      if (p && p.kind === 'wall' && after.wallHasMoved.indexOf(m.pieceId) === -1) {
        after.wallHasMoved.push(m.pieceId);
      }
    });

    var result = null, endReason = null;
    if (whiteKeepDies && blackKeepDies) { result = 'draw'; endReason = 'mutual_destruction'; }
    else if (whiteKeepDies) { result = 'black'; endReason = 'keep_captured'; }
    else if (blackKeepDies) { result = 'white'; endReason = 'keep_captured'; }
    else { result = winnerByKeeps(after); if (result) { endReason = 'keep_captured'; } }

    after.history = after.history.concat([entry]);

    if (result) {
      after.result = result; after.endReason = endReason;
      after.phase = 'resolved'; after.pendingPromotion = null;
      return after;
    }

    var standing = detectStandingPromotion(after);
    if (standing) {
      after.pendingPromotion = standing;
      after.phase = 'preview';
      return after;
    }
    return nextTurn(after);
  }

  /* ------------------------------------------------ resignation / agreement */
  function resign(state, color) {
    if (state.result) return state;
    var s = clone(state);
    s.result = other(color); s.endReason = 'resignation'; s.phase = 'resolved';
    return s;
  }
  function agreeDraw(state) {
    if (state.result) return state;
    var s = clone(state);
    s.result = 'draw'; s.endReason = 'agreement'; s.phase = 'resolved';
    return s;
  }
  function flagFall(state, color) {
    if (state.result) return state;
    var s = clone(state);
    s.result = other(color); s.endReason = 'timeout'; s.phase = 'resolved';
    return s;
  }

  /* ------------------------------------------------------------- notation */
  /* Long algebraic in the engine's own square names (files a..i, left to right). */
  function subMoveText(mv) {
    var letter = KIND_LETTER[mv.kind || 'wall'] || 'W';
    return letter + H.square(mv.from) + '–' + H.square(mv.to) +
      (mv.promoted ? '=' + (KIND_LETTER[mv.promotedTo || 'tower']) : '');
  }

  function turnText(state, captured) {
    var text = state.turnMoves.map(subMoveText).join(', ');
    var n = (captured || []).length;
    return text + (n ? ' ×' + n : '');
  }

  function statusText(state) {
    if (!state) return '';
    if (state.result) return 'Game over';
    if (state.pendingPromotion) return 'Choose promotion';
    switch (state.phase) {
      case 'awaiting_move1': return (state.isFirstTurn && state.turn === 'white') ? 'Move 1 · first turn' : 'Move 1';
      case 'awaiting_move2': return 'Move 2';
      case 'preview': return 'Preview · Accept or Undo';
      case 'resolved': return 'Resolved';
      default: return '';
    }
  }

  function resultText(state) {
    if (!state || !state.result) return '';
    var reason = {
      keep_captured: 'Keep destroyed',
      mutual_destruction: 'Both Keeps fell in the same combat',
      stalemate: 'Stalemate — no legal moves',
      draw_repetition: 'Threefold repetition',
      stagnation: 'Adjudicated after ' + STAGNATION_LIMIT + ' quiet turns',
      resignation: 'Resignation',
      agreement: 'Draw agreed',
      timeout: 'Flag fell'
    }[state.endReason] || 'Game over';
    var who = state.result === 'draw' ? 'Draw' : (state.result === 'white' ? 'White wins' : 'Black wins');
    return who + ' — ' + reason;
  }

  function endReasonLabel(reason) {
    return ({
      keep_captured: 'Keep destroyed',
      mutual_destruction: 'Mutual destruction',
      stalemate: 'Stalemate',
      draw_repetition: 'Threefold repetition',
      stagnation: 'Adjudication',
      resignation: 'Resignation',
      agreement: 'Draw agreed',
      timeout: 'Flag fall'
    })[reason] || 'Game over';
  }

  /* --------------------------------------------------------------- new game */
  function newGame(turn) {
    var pieces = {}, positions = {}, hexOccupant = {};
    START.forEach(function (row) {
      var id = row[0], kind = row[1], color = row[2], pos = { q: row[3], r: row[4] };
      pieces[id] = { kind: kind, color: color };
      positions[id] = pos;
      hexOccupant[H.key(pos)] = id;
    });
    var adv = advance(pieces, positions);
    return {
      pieces: pieces,
      positions: positions,
      hexOccupant: hexOccupant,
      playable: H.playableSet(),
      turn: turn === 'black' ? 'black' : 'white',
      phase: 'awaiting_move1',
      turnMoves: [],
      movedPieceIds: [],
      wallHasMoved: [],
      isFirstTurn: true,
      pendingPromotion: null,
      result: null,
      endReason: null,
      moveNumber: 1,
      capturedByWhite: [],
      capturedByBlack: [],
      history: [],
      positionCounts: {},
      stagnation: {
        turns: 0, pieceCount: adv.count,
        bestAdvance: { white: adv.white, black: adv.black }
      }
    };
  }

  /* --------------------------------------------------------------- exports */
  FT.rules = Object.assign(FT.rules || {}, {
    CORE: CORE, SUPPORT: SUPPORT, KIND_LETTER: KIND_LETTER, START: START,
    PROMOTION_HEXES: PROMOTION_HEXES, ADV_BASE: ADV_BASE,
    STAGNATION_LIMIT: STAGNATION_LIMIT, REPEAT_LIMIT: REPEAT_LIMIT,

    other: other, clone: clone,
    occupant: occupant, pieceAt: pieceAt, isPlayable: isPlayable, isEmpty: isEmpty,
    strength: strength, supportBreakdown: supportBreakdown,
    pieceCountOf: pieceCountOf, keepsAlive: keepsAlive, winnerByKeeps: winnerByKeeps,
    isPromotionSquare: isPromotionSquare, promotionHexes: promotionHexes,

    legalMoves: legalMoves, allLegalMoves: allLegalMoves, hasAnyMove: hasAnyMove,
    applyMove: applyMove, undo: undo, choosePromotion: choosePromotion,
    canUndo: canUndo, canAccept: canAccept, refreshPhase: refreshPhase,

    incomingDamage: incomingDamage, resolveCombat: resolveCombat, preview: preview,
    accept: accept, nextTurn: nextTurn, advance: advance,

    resign: resign, agreeDraw: agreeDraw, flagFall: flagFall,

    subMoveText: subMoveText, turnText: turnText, statusText: statusText,
    resultText: resultText, endReasonLabel: endReasonLabel, newGame: newGame
  });
})(window);

