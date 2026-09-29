/* ==========================================================================
   FT.sound — the game's audio, synthesised rather than sampled
   No files ship with this build: every cue is a short stack of oscillators and
   a filtered noise burst, which keeps the game offline-safe and lets a cue be
   tuned by a number instead of by an audio edit. Muting is a pref rather than a
   second code path, so a muted player is genuinely silent, not merely quiet.
   ========================================================================== */
(function (global) {
  'use strict';
  var FT = global.FT = global.FT || {};

  var ctx = null;
  var master = null;
  var muted = false;

  /* Browsers refuse to start audio before a real gesture, and an AudioContext
     built on load would sit suspended forever. So the context is built by the
     first cue instead — which is, by definition, always after a gesture. */
  function audio() {
    if (ctx) { return ctx; }
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) { return null; }
    try { ctx = new AC(); } catch (err) { ctx = null; return null; }
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    return ctx;
  }

  /* One pitched voice: a short exponential glide into a percussive tail. A hard
     stop on a tone is what makes cheap interface sounds click, so the release
     is always a ramp back to silence rather than a cut. */
  function voice(spec) {
    var c = ctx;
    var t0 = c.currentTime + (spec.delay || 0);
    var dur = spec.dur || 0.12;
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = spec.type || 'sine';
    osc.frequency.setValueAtTime(spec.freq, t0);
    if (spec.to) { osc.frequency.exponentialRampToValueAtTime(spec.to, t0 + dur); }
    var peak = spec.gain === undefined ? 0.16 : spec.gain;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.012, dur * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /* Combat is the one cue that should not be a tone: a struck wall is broadband
     and decays fast, so it is a band-passed noise burst instead. */
  function noise(spec) {
    var c = ctx;
    var t0 = c.currentTime + (spec.delay || 0);
    var dur = spec.dur || 0.18;
    var frames = Math.max(1, Math.floor(c.sampleRate * dur));
    var buffer = c.createBuffer(1, frames, c.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }
    var src = c.createBufferSource();
    src.buffer = buffer;
    var band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(spec.hz || 900, t0);
    band.Q.value = 0.8;
    var gain = c.createGain();
    gain.gain.setValueAtTime(spec.gain === undefined ? 0.2 : spec.gain, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(band);
    band.connect(gain);
    gain.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /* Each cue is a list of steps, so a sound with a shape (a rising arpeggio on a
     promotion, a falling one on a loss) is written the way it is heard. */
  var CUES = {
    click:   [{ freq: 520, to: 380, dur: 0.05, type: 'triangle', gain: 0.10 }],
    select:  [{ freq: 620, dur: 0.05, type: 'triangle', gain: 0.12 },
              { freq: 930, dur: 0.07, type: 'sine', gain: 0.07, delay: 0.04 }],
    move:    [{ freq: 340, to: 480, dur: 0.10, type: 'triangle', gain: 0.14 }],
    turn:    [{ freq: 300, to: 420, dur: 0.09, type: 'sine', gain: 0.10 }],
    illegal: [{ freq: 180, to: 120, dur: 0.16, type: 'sawtooth', gain: 0.10 }],
    promote: [{ freq: 480, to: 720, dur: 0.12, type: 'triangle', gain: 0.13 },
              { freq: 720, to: 960, dur: 0.14, type: 'sine', gain: 0.10, delay: 0.09 }],
    strike:  [{ noise: true, dur: 0.18, hz: 900, gain: 0.22 },
              { freq: 150, to: 60, dur: 0.16, type: 'square', gain: 0.10 }],
    capture: [{ noise: true, dur: 0.24, hz: 420, gain: 0.18 }],
    newgame: [{ freq: 392, dur: 0.10, type: 'triangle', gain: 0.12 },
              { freq: 523, dur: 0.10, type: 'triangle', gain: 0.12, delay: 0.08 },
              { freq: 659, dur: 0.22, type: 'sine', gain: 0.11, delay: 0.16 }],
    signin:  [{ freq: 523, dur: 0.12, type: 'triangle', gain: 0.13 },
              { freq: 784, dur: 0.26, type: 'sine', gain: 0.12, delay: 0.10 }],
    win:     [{ freq: 523, dur: 0.16, type: 'triangle', gain: 0.14 },
              { freq: 659, dur: 0.16, type: 'triangle', gain: 0.14, delay: 0.11 },
              { freq: 784, dur: 0.30, type: 'sine', gain: 0.14, delay: 0.22 }],
    lose:    [{ freq: 392, dur: 0.18, type: 'triangle', gain: 0.13 },
              { freq: 330, dur: 0.20, type: 'triangle', gain: 0.12, delay: 0.14 },
              { freq: 247, dur: 0.36, type: 'sine', gain: 0.12, delay: 0.28 }],
    draw:    [{ freq: 440, dur: 0.20, type: 'sine', gain: 0.12 },
              { freq: 415, dur: 0.34, type: 'sine', gain: 0.11, delay: 0.16 }]
  };

  function play(name) {
    if (muted) { return false; }
    var cue = CUES[name];
    if (!cue) { return false; }
    var c = audio();
    if (!c) { return false; }
    /* A cue fired while the tab was backgrounded lands on a suspended context
       and would be lost anyway; resuming here keeps the first one audible. */
    if (c.state === 'suspended' && c.resume) { c.resume(); }
    cue.forEach(function (step) {
      if (step.noise) { noise(step); } else { voice(step); }
    });
    return true;
  }

  function setMuted(on) {
    muted = !!on;
    if (!muted) { audio(); }
    return muted;
  }

  function isMuted() { return muted; }

  FT.sound = { play: play, setMuted: setMuted, isMuted: isMuted, CUES: CUES };
})(window);
