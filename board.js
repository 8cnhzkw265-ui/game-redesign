/* ==========================================================================
   FT.board — the arena renderer
   Builds the 63 cells once, then repaints state on top of them. Every colour
   comes from css/board.css + css/themes.css, so switching theme or mode is a
   data-attribute change on <html> — no re-render, no flash.
   Interaction: one delegated pointer listener (mouse, touch and pen all work
   through it) plus a roving keyboard cursor so the board is fully playable
   without a pointer.
   ========================================================================== */
(function (global) {
  'use strict';
  var FT = global.FT = global.FT || {};
  var H = FT.hex;
  var NS = 'http://www.w3.org/2000/svg';

  var PLATE = 0.62;    /* piece plate radius as a fraction of the cell radius */
  var INNER = 0.70;    /* inner plate as a fraction of the plate              */
  var CELL_IN = 0.78;  /* inner cell face                                     */
  var DOT = 0.10;      /* destination dot                                     */
  var STR_R = 0.19;    /* strength badge                                      */

  function node(name, attrs) {
    var e = document.createElementNS(NS, name);
    if (attrs) { Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); }); }
    return e;
  }

  function polygon(radius, scale) {
    var pts = H.points(radius, scale).split(' ');
    var d = 'M' + pts[0];
    for (var i = 1; i < pts.length; i++) { d += 'L' + pts[i]; }
    return d + 'Z';
  }

  function mount(svg, options) {
    var opts = options || {};
    var radius = opts.radius || 40;
    var flip = !!opts.flip;
    var showCoords = opts.coords !== false;
    var limit = opts.playable || null;          /* optional hex allow-list   */
    /* A decorative board is a picture of the arena, not a copy of it: it is
       never read by a screen reader, never takes focus and never listens for
       a click, so the hero it decorates cannot become a second playable board
       hiding behind the real one. */
    var decorative = !!opts.decorative;

    var bounds = H.bounds(radius, flip);
    svg.setAttribute('viewBox', '0 0 ' + bounds.width.toFixed(1) + ' ' + bounds.height.toFixed(1));
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (decorative) {
      svg.setAttribute('role', 'presentation');
      svg.setAttribute('aria-hidden', 'true');
    } else {
      svg.setAttribute('role', 'grid');
      svg.setAttribute('aria-label', 'Fortress board, 9 files of hexes');
    }
    svg.classList.add('stage-svg');
    while (svg.firstChild) { svg.removeChild(svg.firstChild); }

    /* The plate is the board's silhouette, so its corner radius is part of the
       arena's shape rather than a panel's. */
    var backdrop = node('rect', {
      class: 'board-backdrop', x: 0, y: 0,
      width: bounds.width.toFixed(1), height: bounds.height.toFixed(1), rx: 18
    });
    svg.appendChild(backdrop);

    var root = node('g', {
      transform: 'translate(' + bounds.offsetX.toFixed(1) + ',' + bounds.offsetY.toFixed(1) + ')'
    });
    var cellsLayer = node('g', { class: 'board-cells' });
    var piecesLayer = node('g', { class: 'board-pieces' });
    var overlayLayer = node('g', { class: 'board-overlay' });
    root.appendChild(cellsLayer); root.appendChild(overlayLayer); root.appendChild(piecesLayer);
    svg.appendChild(root);

    var cells = {}, order = [], pieces = {}, listeners = { select: [], move: [] };
    var cursor = null, tabbable = null;

    /* ------------------------------------------------------------ the cells */
    H.paintOrder(H.allHexes()).forEach(function (h) {
      var k = H.key(h);
      if (limit && !limit[k]) { return; }
      var pos = H.toPixel(h, radius, flip);
      /* A decorative cell carries no role and no tabindex: without a role it is
         not a gridcell, and without a tabindex it never joins the roving
         cursor, so Tab walks past the hero exactly as it walks past a picture. */
      var g = node('g', { class: 'b-hex', 'data-k': k });
      if (!decorative) {
        g.setAttribute('role', 'gridcell');
        g.setAttribute('tabindex', '-1');
      }
      g.setAttribute('transform', 'translate(' + pos.x.toFixed(2) + ',' + pos.y.toFixed(2) + ')');
      var cell = node('path', { class: 'cell', d: polygon(radius, 1) });
      var inner = node('path', { class: 'cell-inner', d: polygon(radius, CELL_IN) });
      /* The label sits between the piece plate and the cell's flat bottom edge,
         which is the same quiet gutter it used in the landscape layout. */
      var coord = node('text', { class: 'coord', x: 0, y: (radius * 0.68).toFixed(1), 'text-anchor': 'middle' });
      coord.textContent = H.square(h);
      coord.style.display = showCoords ? '' : 'none';
      g.appendChild(cell); g.appendChild(inner); g.appendChild(coord);
      cellsLayer.appendChild(g);

      var rec = { h: h, k: k, g: g, cell: cell, inner: inner, coord: coord, pos: pos };
      cells[k] = rec;
      order.push(rec);
    });

    /* ----------------------------------------------------------- the pieces */
    function createPiece(id) {
      var g = node('g', { class: 'p-piece' });
      var plate = node('path', { class: 'p-plate', d: polygon(radius * PLATE, 1) });
      var inner = node('path', { class: 'p-inner', d: polygon(radius * PLATE, INNER) });
      var glyph = node('text', {
        class: 'p-glyph', x: 0, y: (radius * 0.10).toFixed(1),
        'text-anchor': 'middle', 'font-size': (radius * 0.40).toFixed(1)
      });
      var strBg = node('circle', {
        class: 'p-str-bg', cx: 0, cy: (radius * 0.30).toFixed(1), r: (radius * STR_R).toFixed(1)
      });
      var str = node('text', {
        class: 'p-str', x: 0, y: (radius * 0.30 + radius * 0.10).toFixed(1),
        'font-size': (radius * 0.26).toFixed(1)
      });
      g.appendChild(plate); g.appendChild(inner);
      g.appendChild(glyph); g.appendChild(strBg); g.appendChild(str);
      g.style.transition = 'transform var(--dur-move) var(--ease)';
      piecesLayer.appendChild(g);
      return { g: g, plate: plate, inner: inner, glyph: glyph, strBg: strBg, str: str };
    }

    function clear(node) { while (node.firstChild) { node.removeChild(node.firstChild); } }

    function at(h) { return H.toPixel(h, radius, flip); }

    /* ------------------------------------------------------------- painting */
    function paint(view) {
      var v = view || {};
      var state = v.state;
      var legal = v.legal || [];
      var legalSet = {};
      legal.forEach(function (h) { legalSet[H.key(h)] = true; });
      var doomedSet = {}, collapseSet = {};
      if (v.preview) {
        doomedSet = v.preview.doomed || {};
        collapseSet = v.preview.collapsed || {};
      }

      order.forEach(function (rec) {
        rec.g.classList.remove('is-legal', 'is-last', 'is-selected', 'is-promo',
          'is-check', 'is-doomed', 'is-collapsing', 'is-hinted', 'is-clickable', 'is-cursor');
        var occ = state ? state.hexOccupant[rec.k] : null;
        var piece = occ ? state.pieces[occ] : null;
        /* "is-clickable" is a promise — a pointer cursor and a hover ring. The
           hero board makes no such promise, so it never gets the class. */
        if (!decorative && piece && piece.color === state.turn) { rec.g.classList.add('is-clickable'); }
        if (legalSet[rec.k]) { rec.g.classList.add('is-legal', 'is-clickable'); }
      });

      clear(overlayLayer);

      /* Last move trail — the two hexes a player must be able to name. */
      if (v.lastMove) {
        [v.lastMove.from, v.lastMove.to].forEach(function (h) {
          if (h && cells[H.key(h)]) { cells[H.key(h)].g.classList.add('is-last'); }
        });
      }
      /* Promotion squares announce themselves before anything lands on them. */
      if (state && !state.result && FT.rules) {
        FT.rules.promotionHexes(state.turn).forEach(function (h) {
          if (cells[H.key(h)]) { cells[H.key(h)].g.classList.add('is-promo'); }
        });
      }
      (v.hinted || []).forEach(function (h) {
        if (cells[H.key(h)]) { cells[H.key(h)].g.classList.add('is-hinted'); }
      });

      /* Pieces are matched by id, so a move is a transform transition. */
      var seen = {};
      if (state) {
        Object.keys(state.pieces).forEach(function (id) {
          var piece = state.pieces[id], pos = state.positions[id];
          if (!piece || !pos) { return; }
          seen[id] = true;
          var rec = pieces[id] || (pieces[id] = createPiece(id));
          var px = at(pos);
          rec.g.setAttribute('transform', 'translate(' + px.x.toFixed(2) + ',' + px.y.toFixed(2) + ')');
          rec.g.setAttribute('class', 'p-piece ' + (piece.color === 'white' ? 'p-light' : 'p-dark') +
            (doomedSet[id] ? ' is-doomed' : '') + (collapseSet[id] ? ' is-collapsing' : ''));
          rec.g.setAttribute('data-id', id);
          rec.glyph.textContent = FT.rules.KIND_LETTER[piece.kind] || '?';
          var ink = piece.color === 'white' ? 'var(--p-w-ink)' : 'var(--p-b-ink)';
          rec.glyph.setAttribute('fill', ink);
          rec.str.setAttribute('fill', ink);
          rec.str.textContent = FT.rules.strength(state, id);
        });
      }
      Object.keys(pieces).forEach(function (id) {
        if (!seen[id]) { piecesLayer.removeChild(pieces[id].g); delete pieces[id]; }
      });

      paintOverlay(v);

      if (v.selected && cells[H.key(v.selected)]) {
        cells[H.key(v.selected)].g.classList.add('is-selected');
      }
      if (v.cursor) { cursor = v.cursor; }
      if (!decorative) { paintCursor(); }

      if (!decorative) {
        svg.setAttribute('aria-label', state
          ? 'Fortress board. ' + FT.rules.statusText(state) + '. ' +
            (state.turn === 'white' ? 'White' : 'Black') + ' to move, move ' + state.moveNumber + '.'
          : 'Fortress board');
      }
    }

    /* Destinations, threat reticles, damage badges: rebuilt every paint. */
    function paintOverlay(view) {
      var v = view || {}, state = v.state, legal = v.legal || [];
      var doomedSet = v.preview ? (v.preview.doomed || {}) : {};
      legal.forEach(function (h) {
        var p = at(h);
        var occ = state ? state.hexOccupant[H.key(h)] : null;
        var enemy = occ && state.pieces[occ].color !== state.turn;
        if (enemy) {
          overlayLayer.appendChild(node('circle', {
            class: 'attack-reticle' + (doomedSet[occ] ? ' is-lethal' : ''),
            cx: p.x.toFixed(2), cy: p.y.toFixed(2), r: (radius * 0.55).toFixed(2)
          }));
        }
        overlayLayer.appendChild(node('circle', {
          class: 'move-dot' + (enemy ? ' is-captureish' : ''),
          cx: p.x.toFixed(2), cy: p.y.toFixed(2),
          r: (radius * (enemy ? DOT * 0.8 : DOT)).toFixed(2)
        }));
      });

      if (!v.preview || !state) { return; }
      (v.preview.hexes || []).forEach(function (row) {
        if (!row.incoming) { return; }
        var p = at(row.hex);
        var bx = p.x + radius * 0.40, by = p.y - radius * 0.56;
        overlayLayer.appendChild(node('circle', {
          class: 'dmg-badge', cx: bx.toFixed(2), cy: by.toFixed(2), r: (radius * 0.24).toFixed(2)
        }));
        var t = node('text', {
          class: 'dmg-text', x: bx.toFixed(2), y: (by + radius * 0.09).toFixed(2),
          'font-size': (radius * 0.26).toFixed(1)
        });
        t.textContent = '\u2212' + row.incoming;
        overlayLayer.appendChild(t);
        if (doomedSet[row.id] && cells[H.key(row.hex)]) {
          cells[H.key(row.hex)].g.classList.add('is-doomed');
        }
      });
      Object.keys(doomedSet).forEach(function (id) {
        var piece = state.pieces[id];
        if (!piece || piece.kind !== 'keep') { return; }
        var hex = state.positions[id];
        if (hex && cells[H.key(hex)]) { cells[H.key(hex)].g.classList.add('is-check'); }
      });
    }

    /* Combat flash: one short pulse per lost, collapsed or struck hex. */
    function flash(hexes, kind) {
      (hexes || []).forEach(function (h) {
        var p = at(h);
        var c = node('circle', {
          /* A flat-top cell is only sqrt3/2*R tall, so the pulse is sized to
             the shorter axis — at the old 0.95 it spilled onto its neighbours. */
          class: 'combat-flash' + (kind === 'collapse' ? ' is-warn' : ''),
          cx: p.x.toFixed(2), cy: p.y.toFixed(2), r: (radius * 0.80).toFixed(2)
        });
        overlayLayer.appendChild(c);
        global.setTimeout(function () {
          if (c.parentNode) { c.parentNode.removeChild(c); }
        }, 760);
      });
    }

    /* ------------------------------------------------- keyboard cursor (roving) */
    /* Which engine direction points where on a PORTRAIT board. Rank runs up
       the screen, so "E" is now due north and "W" due south; the other four
       are the diagonals. Each key prefers the exact heading first, then the
       two diagonals that share it, so the cursor never dead-ends on the rim. */
    var STEPS = { up: ['E'], down: ['W'], right: ['SE', 'SW'], left: ['NE', 'NW'] };

    function dirOffset(name) {
      var i = H.DIR_NAMES.indexOf(name);
      return i < 0 ? null : H.DIRS[i];
    }

    function paintCursor() {
      order.forEach(function (rec) {
        rec.g.classList.remove('is-cursor');
        rec.g.setAttribute('tabindex', '-1');
      });
      if (!cursor) { tabbable = order[0] || null; }
      var rec = cursor ? cells[H.key(cursor)] : null;
      if (rec) { rec.g.classList.add('is-cursor'); tabbable = rec; }
      if (tabbable) { tabbable.g.setAttribute('tabindex', '0'); }
    }

    function setCursor(h, focus) {
      cursor = h ? H.clone(h) : null;
      paintCursor();
      if (focus && tabbable) { tabbable.g.focus(); }
    }

    function stepCursor(dirName) {
      if (!cursor) { setCursor((order[0] || {}).h, true); return; }
      var tries = STEPS[dirName] || [];
      for (var i = 0; i < tries.length; i++) {
        var to = H.add(cursor, dirOffset(tries[i]));
        if (cells[H.key(to)]) { setCursor(to, true); return; }
      }
    }

    function emit(name, payload) {
      (listeners[name] || []).forEach(function (fn) { fn(payload); });
    }

    function on(name, fn) {
      (listeners[name] = listeners[name] || []).push(fn);
      return api;
    }

    /* Pointer plus touch plus pen, through one delegated listener. */
    function onClick(evt) {
      var target = evt.target;
      var g = target && target.closest ? target.closest('.b-hex') : null;
      if (!g || !svg.contains(g)) { return; }
      var h = H.parse(g.getAttribute('data-k'));
      setCursor(h, false);
      emit('select', h);
    }

    function onKey(evt) {
      var k = evt.key, handled = true;
      if (k === 'ArrowRight') { stepCursor('right'); }
      else if (k === 'ArrowLeft') { stepCursor('left'); }
      else if (k === 'ArrowUp') { stepCursor('up'); }
      else if (k === 'ArrowDown') { stepCursor('down'); }
      else if (k === 'Home') { setCursor(order[0].h, true); }
      else if (k === 'End') { setCursor(order[order.length - 1].h, true); }
      else if (k === 'Enter' || k === ' ') { emit('select', cursor); }
      else if (k === 'Escape') { emit('select', null); }
      else { handled = false; }
      if (handled) { evt.preventDefault(); }
    }

    /* A decorative board takes no input at all — no click, no keyboard, no
       roving cursor — so the hero cannot be played and cannot be reached. */
    if (!decorative) {
      svg.addEventListener('click', onClick);
      svg.addEventListener('keydown', onKey);
    }

    var api = {
      element: svg,
      paint: paint,
      flash: flash,
      on: on,
      setCursor: setCursor,
      hexes: function () {
        return order.map(function (rec) { return { q: rec.h.q, r: rec.h.r }; });
      },
      cellAt: function (h) { return h && cells[H.key(h)] ? cells[H.key(h)].g : null; },
      centerOf: function (h) { return h && cells[H.key(h)] ? cells[H.key(h)].pos : null; },
      setCoords: function (on) {
        order.forEach(function (rec) { rec.coord.style.display = on ? '' : 'none'; });
      },
      destroy: function () {
        svg.removeEventListener('click', onClick);
        svg.removeEventListener('keydown', onKey);
        while (svg.firstChild) { svg.removeChild(svg.firstChild); }
        cells = {}; pieces = {}; order = [];
      }
    };
    if (!decorative) { paintCursor(); }
    return api;
  }

  FT.board = { mount: mount };
})(window);

