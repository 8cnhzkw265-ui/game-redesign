/* ==========================================================================
   FT.catalog — the 20 website backgrounds, the 20 board themes and the
   settings the game exposes. Every id here matches a [data-...] selector in
   css/backgrounds.css and css/themes.css exactly; the ids are the contract
   between this file and the paint.
   ========================================================================== */
(function (global) {
  'use strict';
  var FT = global.FT = global.FT || {};

  var BACKGROUNDS = [
    { id: 't01-brushed-graphite', name: 'Brushed Graphite', group: 'Industrial', sub: '360-grit brush, cool and even' },
    { id: 't02-cold-rolled-steel', name: 'Cold-Rolled Steel', group: 'Industrial', sub: 'Mill roll lines, seam every 320px' },
    { id: 't03-basalt-columns', name: 'Basalt Columns', group: 'Industrial', sub: 'Hexagonal cooling cracks' },
    { id: 't04-honed-slate', name: 'Honed Slate', group: 'Industrial', sub: 'Striations, matte, no specular' },
    { id: 't05-micro-cement', name: 'Micro-Cement', group: 'Industrial', sub: 'Trowelled blotches, quietest surface' },
    { id: 't06-carbon-weave', name: 'Carbon Weave', group: 'Industrial', sub: '2x2 twill with a wet gloss' },
    { id: 't07-copper-patina', name: 'Copper Patina', group: 'Industrial', sub: 'Verdigris bloom, warm accent host' },
    { id: 't08-board-concrete', name: 'Board Concrete', group: 'Industrial', sub: 'Formwork joints and tie holes' },
    { id: 't09-diamond-tread', name: 'Diamond Tread', group: 'Industrial', sub: 'Alt-diamond relief plate' },
    { id: 't10-cast-iron', name: 'Cast Iron', group: 'Industrial', sub: 'Orange-peel pitting, warm dark' },
    { id: 'n01-granite', name: 'Granite Highland', group: 'Natural', sub: 'Grey speckle, three grain scales' },
    { id: 'n02-obsidian', name: 'Obsidian Ridge', group: 'Natural', sub: 'Volcanic glass, hard reflections' },
    { id: 'n03-sandstone', name: 'Sandstone Mesa', group: 'Natural', sub: 'Bedding planes, warm and dry' },
    { id: 'n04-marble', name: 'Marble Vein', group: 'Natural', sub: 'Two-tone veining on a lit face' },
    { id: 'n05-limestone', name: 'Limestone Cliff', group: 'Natural', sub: 'Deep courses, chalk-soft' },
    { id: 'n06-onyx', name: 'Black Onyx', group: 'Natural', sub: 'Polished, near-black, high gloss' },
    { id: 'n07-ironstone', name: 'Ironstone Strata', group: 'Natural', sub: 'Oxide bands, rust sediment' },
    { id: 'n08-glacier', name: 'Glacier Ice Core', group: 'Natural', sub: 'Fracture lines, cold blue' },
    { id: 'n09-ash', name: 'Volcanic Ash', group: 'Natural', sub: 'Fine fallout, almost flat' },
    { id: 'n10-aurora', name: 'Aurora Basalt', group: 'Natural', sub: 'Night sky over cold stone' }
  ];

  /* Board themes: each row is one material input set. The light-mode palette
     and every interaction colour are derived from these five values. */
  var BOARDS = [
    { id: 'tex01-forged-steel', name: 'Forged Steel', group: 'Industrial', sub: 'Shop-floor default', a: '#23272d', b: '#2d333b', line: '#3d444e', coord: '#8f96a1' },
    { id: 'tex02-cold-rolled', name: 'Cold-Rolled', group: 'Industrial', sub: 'Coarser grain, harder seam', a: '#1f2429', b: '#2a3037', line: '#39414a', coord: '#8792a0' },
    { id: 'tex03-basalt-column', name: 'Basalt Column', group: 'Industrial', sub: 'Darkest industrial plate', a: '#191c20', b: '#23272c', line: '#33383f', coord: '#7d858e' },
    { id: 'tex04-honed-slate', name: 'Honed Slate', group: 'Industrial', sub: 'Neutral grey, low contrast', a: '#262a2e', b: '#2f3439', line: '#3f454b', coord: '#939aa1' },
    { id: 'tex05-micro-cement', name: 'Micro-Cement', group: 'Industrial', sub: 'Lightest industrial plate', a: '#2b2e31', b: '#34383c', line: '#43484d', coord: '#999fa5' },
    { id: 'tex06-carbon-weave', name: 'Carbon Weave', group: 'Industrial', sub: 'Competition black', a: '#14161a', b: '#1e2126', line: '#2c3037', coord: '#79808a' },
    { id: 'tex07-copper-patina', name: 'Copper Patina', group: 'Industrial', sub: 'Warm board, remapped selection', a: '#6d4526', b: '#7c5230', line: '#8f6338', coord: '#dcb68c' },
    { id: 'tex08-board-concrete', name: 'Board Concrete', group: 'Industrial', sub: 'Poured slab, mid grey', a: '#3a3d40', b: '#44484c', line: '#54595e', coord: '#a3a8ad' },
    { id: 'tex09-diamond-tread', name: 'Diamond Tread', group: 'Industrial', sub: 'Blue-steel tread plate', a: '#232830', b: '#2e343d', line: '#414852', coord: '#8b93a0' },
    { id: 'tex10-cast-iron', name: 'Cast Iron', group: 'Industrial', sub: 'Warm dark, sand-cast', a: '#2a2624', b: '#332e2b', line: '#443d38', coord: '#9a918a' },
    { id: 'nat01-granite', name: 'Granite', group: 'Natural', sub: 'Speckled field stone', a: '#2f3235', b: '#3a3d41', line: '#4a4e53', coord: '#a0a5aa' },
    { id: 'nat02-obsidian', name: 'Obsidian', group: 'Natural', sub: 'Glass-black, max contrast', a: '#131519', b: '#1c1f24', line: '#2a2e34', coord: '#7c848e' },
    { id: 'nat03-sandstone', name: 'Sandstone', group: 'Natural', sub: 'Warm stone, remapped selection', a: '#7a5f3c', b: '#8a6c45', line: '#9d7c51', coord: '#e6d0ab' },
    { id: 'nat04-marble', name: 'Marble', group: 'Natural', sub: 'High key, most legible light', a: '#3c4046', b: '#484d54', line: '#585e66', coord: '#aeb5bd' },
    { id: 'nat05-limestone', name: 'Limestone', group: 'Natural', sub: 'Brightest board in the set', a: '#55585a', b: '#606365', line: '#717477', coord: '#c2c5c8' },
    { id: 'nat06-onyx', name: 'Onyx', group: 'Natural', sub: 'Deep gloss, subtle grain', a: '#17181c', b: '#212227', line: '#33343a', coord: '#8a8b93' },
    { id: 'nat07-ironstone', name: 'Ironstone', group: 'Natural', sub: 'Oxide red, remapped selection', a: '#4a2f28', b: '#573a30', line: '#6a473a', coord: '#d3a795' },
    { id: 'nat08-glacier', name: 'Glacier', group: 'Natural', sub: 'Cold blue cast', a: '#2b3842', b: '#35434e', line: '#465663', coord: '#a8bac7' },
    { id: 'nat09-volcanic-ash', name: 'Volcanic Ash', group: 'Natural', sub: 'Flat neutral grey', a: '#2c2d2e', b: '#363738', line: '#464748', coord: '#9b9c9d' },
    { id: 'nat10-aurora', name: 'Aurora', group: 'Natural', sub: 'Board carries its own colour cast', a: '#1a1e2a', b: '#242a38', line: '#343c4d', coord: '#8f9ab2' }
  ];

  /* The seven rungs of the opponent ladder, weakest first. Every level plays
     the same rules and reads the same board; they differ only in how much of
     the turn they actually search:

       depth      1 scores a single sub-move, 2 plans the whole turn. Fortress
                  resolves two moves at once, so 2 is the only depth that can
                  see a trade — and it costs a second full move enumeration.
       width      the beam. 0 searches every legal opening; a small number
                  ranks them all cheaply and carries only the best few into the
                  expensive two-move search. This is the main strength axis: a
                  narrow beam is not a slower strong bot, it is a weaker one.
       noise      random score jitter, in eval points. This is what turns a
                  narrow beam into a human-looking opponent rather than a
                  predictable one — it will take a free capture now and then.
       keepWatch  how much it pays to shield its own Keep from enemy pressure.
                  0 walks into contact it should refuse.

     The order is deliberate: Recruit and Scout never see a trade, Veteran is
     the first rung that plans the turn, and Sovereign is the only level that
     searches every opening with no jitter at all. */
  var DIFFICULTIES = [
    { id: 'recruit', name: 'Recruit', level: 1, sub: 'One move ahead, takes the free shot', depth: 1, width: 3, noise: 34, keepWatch: 0.1 },
    { id: 'scout', name: 'Scout', level: 2, sub: 'Cautious, but rarely finds the trade', depth: 1, width: 5, noise: 26, keepWatch: 0.3 },
    { id: 'veteran', name: 'Veteran', level: 3, sub: 'Plans the turn, trades evenly', depth: 2, width: 4, noise: 18, keepWatch: 0.5 },
    { id: 'captain', name: 'Captain', level: 4, sub: 'Reads the contact before it happens', depth: 2, width: 6, noise: 12, keepWatch: 0.7 },
    { id: 'marshal', name: 'Marshal', level: 5, sub: 'Hunts the Keep behind the ranks', depth: 2, width: 9, noise: 6, keepWatch: 0.9 },
    { id: 'warden', name: 'Warden', level: 6, sub: 'Almost nothing gets through', depth: 2, width: 14, noise: 2, keepWatch: 1.2 },
    { id: 'sovereign', name: 'Sovereign', level: 7, sub: 'Searches every opening, never errs', depth: 2, width: 0, noise: 0, keepWatch: 1.5 }
  ];

  var TIME_CONTROLS = [
    { id: 'untimed', name: 'No clock', sub: 'Think as long as you like', base: 0, inc: 0 },
    { id: 'blitz', name: 'Blitz', sub: '3 minutes + 2s per turn', base: 180, inc: 2 },
    { id: 'rapid', name: 'Rapid', sub: '10 minutes + 5s per turn', base: 600, inc: 5 },
    { id: 'classic', name: 'Classic', sub: '30 minutes + 10s per turn', base: 1800, inc: 10 }
  ];

  var DEFAULTS = {
    mode: 'dark',
    board: 'tex01-forged-steel',
    background: 't01-brushed-graphite',
    difficulty: 'veteran',
    timeControl: 'untimed',
    flip: false,
    coords: true,
    hints: true,
    sound: true,
    rail: 'full'
  };

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i]; }
    return null;
  }

  FT.catalog = {
    BACKGROUNDS: BACKGROUNDS,
    BOARDS: BOARDS,
    DIFFICULTIES: DIFFICULTIES,
    TIME_CONTROLS: TIME_CONTROLS,
    DEFAULTS: DEFAULTS,
    PREF_KEY: 'fortress.prefs.v1',
    ACCOUNT_KEY: 'fortress.account.v1',
    /* The live game — position, side, opponent, clocks, view. Separate from
       the prefs because it is a fact about what is on the board RIGHT NOW,
       and because it must be discardable without touching a preference. */
    SESSION_KEY: 'fortress.session.v1',
    board: function (id) { return byId(BOARDS, id) || BOARDS[0]; },
    background: function (id) { return byId(BACKGROUNDS, id) || BACKGROUNDS[0]; },
    /* An unknown id (a stale save, a typo, an id retired from the ladder)
       falls back to the shipped default rather than to a hardcoded index —
       with seven levels, "index 1" would silently mean Scout. */
    difficulty: function (id) {
      return byId(DIFFICULTIES, id) || byId(DIFFICULTIES, DEFAULTS.difficulty) || DIFFICULTIES[0];
    },
    timeControl: function (id) { return byId(TIME_CONTROLS, id) || TIME_CONTROLS[0]; }
  };
})(window);
