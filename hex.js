/* ==========================================================================
   FT.hex — board geometry for Fortress
   The lattice matches the production engine exactly:
     rows r = 0..8, widths 6,7,8,7,8,7,8,7,6
     rank = 2q + r        (the advance metric the rules adjudicate on)
   Nothing here decides what a MOVE is — that is js/rules.js, on the same
   axial maths. This module only decides where a hex is DRAWN. The board is
   drawn PORTRAIT: rank runs up the screen, so the player's back rank sits at
   the BOTTOM and the opponent's at the TOP, and the files a..i run left to
   right. That quarter turn turns the engine's pointy-top hexes into flat-top
   ones, so the drawn rims read E/NE/SE/SW/W/NW even though the engine still
   names its directions E/NE/NW/W/SW/SE. The distance-2 ring is copied from
   the shipped rules module, so moves generated here are the same moves the
   live game accepts.
   ========================================================================== */
(function (global) {
  'use strict';
  var FT = global.FT = global.FT || {};

  var ROWS = 9;
  var WIDTHS = [6, 7, 8, 7, 8, 7, 8, 7, 6];
  var SQRT3 = Math.sqrt(3);

  var DIRS = [
    { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
    { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
  ];
  var DIR_NAMES = ['E', 'NE', 'NW', 'W', 'SW', 'SE'];

  /* Every hex at cube-distance exactly 2 (12 of them, per the engine). */
  var RING2 = [
    [2, 0], [2, -1], [2, -2], [1, -2], [0, -2], [-1, -1],
    [-2, 0], [-2, 1], [-2, 2], [-1, 2], [0, 2], [1, 1]
  ];

  function rowWidth(r) { return WIDTHS[r] || 0; }

  /* Left-most q of a row: the board is sheared so each row shifts one step. */
  function rowStartQ(r) { return -Math.floor((rowWidth(r) + r) / 2); }

  function key(h) { return h.q + ',' + h.r; }

  function parse(k) { var p = String(k).split(','); return { q: +p[0], r: +p[1] }; }

  function same(a, b) { return !!a && !!b && a.q === b.q && a.r === b.r; }

  function add(a, b) { return { q: a.q + b.q, r: a.r + b.r }; }

  function clone(h) { return { q: h.q, r: h.r }; }

  function neighbors(h) {
    var out = [];
    for (var i = 0; i < DIRS.length; i++) { out.push(add(h, DIRS[i])); }
    return out;
  }

  /* Cube distance — identical to the shipped bs() helper. */
  function distance(a, b) {
    var dq = a.q - b.q, dr = a.r - b.r, ds = -dq - dr;
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2;
  }

  function allHexes() {
    var out = [];
    for (var r = 0; r < ROWS; r++) {
      var start = rowStartQ(r), n = rowWidth(r);
      for (var i = 0; i < n; i++) { out.push({ q: start + i, r: r }); }
    }
    return out;
  }

  function playableSet() {
    var set = {};
    allHexes().forEach(function (h) { set[key(h)] = true; });
    return set;
  }

  /* Advance metric used by the engine for adjudication: rank = 2q + r. */
  function rank(h) { return 2 * h.q + h.r; }

  /* Square name, e.g. column 1 -> file "a". The board is drawn portrait, so
     the engine's row index is now the COLUMN on screen: r = 0 is the leftmost
     file and the number counts upward from your own back rank, so the corner
     nearest you reads "a1". Display only — the rules never ask for it. */
  function square(h) {
    var file = String.fromCharCode(97 + h.r);
    return file + (h.q - rowStartQ(h.r) + 1);
  }

  /* Flat-top hexagon: vertices at 0 + 60*k degrees, so the cell has a flat
     top and bottom edge and points left and right. That is the engine's
     pointy-top hex turned a quarter turn along with the lattice below. */
  function points(radius, scale) {
    var k = (scale === undefined ? 1 : scale), out = [];
    for (var i = 0; i < 6; i++) {
      var a = Math.PI / 180 * (60 * i);
      out.push((radius * k * Math.cos(a)).toFixed(2) + ',' + (radius * k * Math.sin(a)).toFixed(2));
    }
    return out.join(' ');
  }

  /* Pixel centre. The board is drawn PORTRAIT: rank (2q + r) is the vertical
     axis and runs UP the screen, so the player's back rank sits at the
     bottom and the opponent's at the top; the row index is the horizontal
     axis. This is the engine's own lattice turned a quarter turn, which is
     why the drawn hexes are flat-top and why "E" now points straight up.

     flip mirrors the board across its HORIZONTAL axis so a player can sit on
     the black side without changing a single rule. */
  function toPixel(h, radius, flip) {
    var x = radius * 1.5 * h.r;
    var y = -radius * SQRT3 / 2 * (2 * h.q + h.r);
    return { x: x, y: flip ? -y : y };
  }

  function bounds(radius, flip) {
    var pad = radius * 0.12, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    allHexes().forEach(function (h) {
      var p = toPixel(h, radius, flip);
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });
    /* A flat-top hex is R wide and sqrt3*R tall. */
    var hw = radius, hh = radius * SQRT3 / 2;
    minX -= hw; maxX += hw; minY -= hh; maxY += hh;
    return {
      minX: minX, maxX: maxX, minY: minY, maxY: maxY,
      width: maxX - minX + pad * 2, height: maxY - minY + pad * 2,
      offsetX: -minX + pad, offsetY: -minY + pad
    };
  }

  /* Stable paint order — and the order Tab walks the board in: top of the
     board first, then left to right. On a portrait board that is descending
     rank (the opponent's end first), then ascending row index. */
  function paintOrder(hexes) {
    return hexes.slice().sort(function (a, b) {
      return (2 * b.q + b.r) - (2 * a.q + a.r) || (a.r - b.r);
    });
  }

  FT.hex = {
    ROWS: ROWS, WIDTHS: WIDTHS, DIRS: DIRS, DIR_NAMES: DIR_NAMES, RING2: RING2,
    rowWidth: rowWidth, rowStartQ: rowStartQ, key: key, parse: parse, same: same,
    add: add, clone: clone, neighbors: neighbors, distance: distance,
    allHexes: allHexes, playableSet: playableSet, rank: rank, square: square,
    points: points, toPixel: toPixel, bounds: bounds, paintOrder: paintOrder
  };
})(window);
