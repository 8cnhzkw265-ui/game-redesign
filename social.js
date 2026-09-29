/* ==========================================================================
   FT.social — the two audience-facing pages: Watch and Ranks.
   There is no server in this build, so the data below is a local fixture.
   The renderers write into that shape rather than into hard-coded markup, so
   swapping in a fetch() later means changing one function — the DOM each view
   produces stays exactly the same.
   ========================================================================== */
(function (global) {
  'use strict';
  var FT = global.FT = global.FT || {};
  var U = FT.ui, doc = global.document;

  /* ------------------------------------------------------------------ data
     Records are the reference's W-L-D triples. Ratings are integers so the
     rows can be sorted and compared without any formatting pass. */
  var LADDER = [
    { name: 'vaultwarden', elo: 1487, w: 38, l: 6, d: 3 },
    { name: 'hexwarden', elo: 1442, w: 31, l: 9, d: 5 },
    { name: 'Marrow', elo: 1401, w: 27, l: 11, d: 2 },
    { name: 'Kestrel', elo: 1366, w: 24, l: 13, d: 6 },
    { name: 'edapex', elo: 1310, w: 19, l: 12, d: 8 },
    { name: 'Tallow', elo: 1274, w: 16, l: 17, d: 1 },
    { name: 'Wigglins', elo: 1231, w: 12, l: 15, d: 3 },
    { name: 'guest43', elo: 1200, w: 0, l: 0, d: 0, self: true }
  ];

  /* Live matches, keyed by the filter that should reveal them. Deliberately
     empty by default: the honest answer for an offline build is the empty
     state, and the reference treats that as a first-class screen. */
  var LIVE = [];

  var MODE_LABEL = { ranked: 'Ranked', casual: 'Casual' };

  /* --------------------------------------------------------------- helpers */
  function el(tag, cls, text) { return U.el(tag, cls, text); }

  function record(entry) { return entry.w + '–' + entry.l + '–' + entry.d; }

  function initial(name) { return name.charAt(0).toUpperCase(); }

  function roundAvatar(name) {
    var a = el('span', 'avatar avatar-round', initial(name));
    a.setAttribute('aria-hidden', 'true');
    return a;
  }

  /* ----------------------------------------------------------------- ranks */
  function renderRanks(host) {
    if (!host) { return null; }
    U.clear(host);

    LADDER.slice().sort(function (a, b) { return b.elo - a.elo; })
      .forEach(function (entry, i) {
        var place = i + 1;
        var row = el('div', 'rank-row' + (place <= 3 ? ' is-podium' : ''));
        row.setAttribute('role', 'listitem');

        row.appendChild(el('span', 'rank-no tnum', String(place)));
        row.appendChild(roundAvatar(entry.name));

        var who = el('span', 'rank-who');
        who.appendChild(el('strong', 'rank-name', entry.name));
        if (entry.self) { who.appendChild(el('span', 'badge badge-accent', 'You')); }
        row.appendChild(who);

        row.appendChild(el('span', 'rank-elo tnum', String(entry.elo)));
        row.appendChild(el('span', 'rank-record mono', record(entry)));

        host.appendChild(row);
      });

    return host;
  }

  /* ----------------------------------------------------------------- watch */
  function renderWatch(host, filter) {
    if (!host) { return null; }
    U.clear(host);

    LIVE.filter(function (m) { return filter === 'all' || m.mode === filter; })
      .forEach(function (m) {
        var row = el('div', 'watch-row');
        row.setAttribute('role', 'listitem');

        var white = el('span', 'watch-side');
        white.appendChild(roundAvatar(m.white));
        white.appendChild(el('span', 'watch-name', m.white));
        row.appendChild(white);

        row.appendChild(el('span', 'badge badge-live', MODE_LABEL[m.mode] || m.mode));
        row.appendChild(el('span', 'meta watch-move', 'Move ' + m.move));

        var black = el('span', 'watch-side watch-side-right');
        black.appendChild(el('span', 'watch-name', m.black));
        black.appendChild(roundAvatar(m.black));
        row.appendChild(black);

        var go = el('button', 'btn btn-outline btn-sm', 'Watch');
        go.type = 'button';
        go.setAttribute('data-action', 'spectate');
        row.appendChild(go);

        host.appendChild(row);
      });

    return host;
  }
  /* One entry point so the view never has to know which page it is on: it
     reports what the current filter found, and the page owns the copy. */
  function showWatch(filter) {
    var list = doc.getElementById('watch-list');
    var empty = doc.getElementById('watch-empty');
    var count = doc.getElementById('watch-count');
    if (!list || !empty) { return null; }

    renderWatch(list, filter);

    var n = list.children.length;
    empty.hidden = n > 0;
    list.hidden = n === 0;

    if (count) {
      count.textContent = n === 0
        ? 'No matches in progress'
        : n + (n === 1 ? ' match in progress' : ' matches in progress');
    }

    var isAll = filter === 'all';
    var title = doc.getElementById('watch-empty-title');
    var body = doc.getElementById('watch-empty-body');
    if (title) {
      title.textContent = isAll ? 'Nothing live right now' : 'No ' + filter + ' games right now';
    }
    if (body) {
      body.textContent = isAll
        ? 'Check back during peak hours, or start a game yourself.'
        : 'Switch to All to see every board, or start a ' + filter + ' game.';
    }
    return n;
  }

  FT.social = {
    LADDER: LADDER,
    LIVE: LIVE,
    renderRanks: renderRanks,
    renderWatch: renderWatch,
    showWatch: showWatch
  };
})(window);
