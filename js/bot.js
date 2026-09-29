/* ==========================================================================
   FT.bot — the opponent
   Fortress turns are *two* moves resolved in one simultaneous combat step, so
   a greedy one-move lookahead is not enough to see a trade. The bot therefore
   plans a whole turn: it enumerates every legal first move, every legal second
   move, then asks the engine what pressing Accept would actually do, and scores
   the resulting position with the same maths a human uses (material, current
   strength, pressure on the enemy Keep, danger to its own).
   ========================================================================== */
(function (global) {
  'use strict';
  var FT = global.FT = global.FT || {};
  var H = FT.hex, R = FT.rules;

  var VALUE = { keep: 900, tower: 16, bastion: 13, turret: 11, wall: 5 };
  var WIN = 100000;

  function other(color) { return color === 'white' ? 'black' : 'white'; }

  function keepHexOf(state, color) {
    var ids = Object.keys(state.pieces);
    for (var i = 0; i < ids.length; i++) {
      var p = state.pieces[ids[i]];
      if (p.kind === 'keep' && p.color === color) return state.positions[ids[i]];
    }
    return null;
  }

  /* How far a piece has pushed toward the enemy back rank (rank = 2q + r). */
  function progress(state, id, color) {
    var pos = state.positions[id];
    if (!pos) return 0;
    return color === 'white' ? H.rank(pos) + 8 : 6 - H.rank(pos);
  }

  function evalState(state, color, cfg) {
    if (state.result) {
      if (state.result === color) return WIN;
      if (state.result === 'draw') return -12;
      return -WIN;
    }
    var ownMat = 0, oppMat = 0, ownProg = 0, oppProg = 0;
    var myKeep = keepHexOf(state, color), foeKeep = keepHexOf(state, other(color));
    var pressure = 0, danger = 0;
    var ids = Object.keys(state.pieces);

    for (var i = 0; i < ids.length; i++) {
      var id = ids[i], p = state.pieces[id], pos = state.positions[id];
      if (!p || !pos) continue;
      var str = R.strength(state, id);
      var v = VALUE[p.kind] + str * 2;
      if (p.color === color) {
        ownMat += v;
        ownProg += progress(state, id, color) * (p.kind === 'wall' ? 0.6 : 0.35);
        if (foeKeep) {
          var d = H.distance(pos, foeKeep);
          if (d <= 2) pressure += (p.kind === 'keep' ? 0.5 : (d === 1 ? 3 : 1.4));
        }
      } else {
        oppMat += v;
        oppProg += progress(state, id, other(color)) * (p.kind === 'wall' ? 0.6 : 0.35);
        if (myKeep) {
          var md = H.distance(pos, myKeep);
          if (md <= 2) danger += (p.kind === 'keep' ? 0.5 : (md === 1 ? 3 : 1.4));
        }
      }
    }
    if (!myKeep) return -WIN;
    if (!foeKeep) return WIN;

    return (ownMat - oppMat)
      + 1.1 * (ownProg - oppProg)
      + 1.5 * pressure
      - cfg.keepWatch * 1.7 * danger;
  }

  /* Score one completed turn: apply what the engine would do on Accept. */
  function scoreLeaf(state, color, cfg) {
    if (state.result) return evalState(state, color, cfg);
    if (state.phase === 'preview') {
      var after = R.accept(state);
      if (after) return evalState(after, color, cfg);
    }
    return evalState(state, color, cfg);
  }

  /* Contested promotion squares get the jumping piece; open ones get the
     slider. Exported because the UI has to make the same call when it plays
     a plan move by move. */
  function promotionChoice(state, hex) {
    var ids = Object.keys(state.pieces);
    for (var i = 0; i < ids.length; i++) {
      var p = state.pieces[ids[i]];
      if (!p || p.color === state.turn) continue;
      if (H.distance(state.positions[ids[i]], hex) === 2) return 'turret';
    }
    return 'tower';
  }

  /* Apply one sub-move and settle any promotion the engine raises. */
  function step(state, mv) {
    var s = R.applyMove(state, mv.pieceId, mv.to);
    if (!s) return null;
    if (s.pendingPromotion) {
      s = R.choosePromotion(s, promotionChoice(s, s.pendingPromotion.hex)) || s;
    }
    return s;
  }

  /* Best second move of the turn (null when the turn is already over). */
  function pickSecond(state, color, cfg) {
    var moves = R.allLegalMoves(state);
    if (!moves.length) return null;
    var best = null;
    for (var i = 0; i < moves.length; i++) {
      var s2 = step(state, moves[i]);
      if (!s2) continue;
      var score = cfg.depth >= 2 ? scoreLeaf(s2, color, cfg) : evalState(s2, color, cfg);
      score += (Math.random() - 0.5) * cfg.noise;
      if (!best || score > best.score) best = { moves: [moves[i]], score: score };
    }
    return best;
  }

  /* The beam. Ranking every legal opening costs one engine step and one static
     eval per move, which is cheap next to the second-move search each survivor
     then pays for. So the cheap pass is unconditional and the expensive pass
     runs on the best `width` survivors only. Width 0 means "no beam" — every
     opening is searched in full, which is what the top of the ladder buys.

     This is why a narrow beam is genuinely weaker rather than merely faster:
     an opening that scores well after one move but badly after a planned second
     one is exactly the move a narrow bot never gets to reconsider. */
  function shortlist(state, firsts, color, cfg) {
    if (cfg.width <= 0 || firsts.length <= cfg.width) { return firsts; }
    var scored = [];
    for (var i = 0; i < firsts.length; i++) {
      var s1 = step(state, firsts[i]);
      if (!s1) { continue; }
      scored.push({ mv: firsts[i], rank: evalState(s1, color, cfg) });
    }
    /* Stable and deterministic: ties break on the move's own index, so the same
       position always produces the same shortlist and the same opening. */
    scored.sort(function (a, b) { return (b.rank - a.rank) || (firsts.indexOf(a.mv) - firsts.indexOf(b.mv)); });
    return scored.slice(0, cfg.width).map(function (row) { return row.mv; });
  }

  /* Plan a whole turn for the side to move. Returns the sub-moves in order. */
  function plan(state, difficulty) {
    var cfg = {
      depth: difficulty && difficulty.depth !== undefined ? difficulty.depth : 2,
      width: difficulty && difficulty.width !== undefined ? difficulty.width : 0,
      noise: (difficulty && difficulty.noise) || 0,
      keepWatch: difficulty && difficulty.keepWatch !== undefined ? difficulty.keepWatch : 1
    };
    var color = state.turn;
    var firsts = R.allLegalMoves(state);
    if (!firsts.length) return { moves: [], score: 0 };
    firsts = shortlist(state, firsts, color, cfg);

    var best = null;
    for (var i = 0; i < firsts.length; i++) {
      var mv1 = firsts[i];
      var s1 = step(state, mv1);
      if (!s1) continue;

      var chain = [mv1], score;
      if (s1.phase === 'awaiting_move2') {
        var second = pickSecond(s1, color, cfg);
        if (second) { chain.push(second.moves[0]); score = second.score; }
        else { score = cfg.depth >= 2 ? scoreLeaf(s1, color, cfg) : evalState(s1, color, cfg); }
      } else {
        score = cfg.depth >= 2 ? scoreLeaf(s1, color, cfg) : evalState(s1, color, cfg);
      }
      score += (Math.random() - 0.5) * cfg.noise;

      if (!best || score > best.score) best = { moves: chain, score: score };
    }
    return best || { moves: [], score: 0 };
  }

  FT.bot = {
    VALUE: VALUE,
    evalState: evalState,
    promotionChoice: promotionChoice,
    step: step,
    plan: plan,
    /* Convenience for callers that only want one legal move right now. */
    bestSingleMove: function (state, difficulty) {
      var moves = R.allLegalMoves(state);
      if (!moves.length) return null;
      var color = state.turn, best = null;
      for (var i = 0; i < moves.length; i++) {
        var s = step(state, moves[i]);
        if (!s) continue;
        var score = scoreLeaf(s, color, { depth: 2, noise: 0, keepWatch: 1 });
        if (!best || score > best.score) best = { move: moves[i], score: score };
      }
      return best;
    }
  };
})(window);
