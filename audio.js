'use strict';

const AudioManager = (() => {
  let ctx = null, masterGain, bgGain, sfxGain;
  // Classroom default: soundtrack stays off until a person turns it on.
  let bgOn = false, sfxOn = true;
  let userWantsBg = false;
  let bgSuspended = false;
  let bgTimer = null;
  const PREF_KEY = 'happyFarm_audioPrefs';

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(PREF_KEY);
      if (!raw) return;
      const prefs = JSON.parse(raw);
      if (typeof prefs.bg === 'boolean') { userWantsBg = prefs.bg; bgOn = prefs.bg; }
      if (typeof prefs.sfx === 'boolean') sfxOn = prefs.sfx;
    } catch (e) { /* keep the silent-music default */ }
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ bg: userWantsBg, sfx: sfxOn }));
    } catch (e) { /* private mode can block storage */ }
  }

  loadPrefs();

  const BPM = 128;
  const B = 60 / BPM;

  const N = {
    C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.00, A4: 440.00,
    C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.00,
    C6: 1046.50, E6: 1318.51, G6: 1567.98,
  };

  const MEL = [
    ['C5',1],['E5',.5],['G5',.5],['E5',1],['C5',1],
    ['E5',.5],['G5',.5],['A5',1],['G5',1],['E5',1],
    ['D5',.5],['E5',.5],['G5',1],['A5',.5],['G5',.5],['E5',1],
    ['C5',.5],['D5',.5],['E5',1],['C5',2],
  ];

  const BASS = [
    ['C4',2],['G4',2],
    ['E4',2],['A4',2],
    ['D4',2],['G4',2],
    ['C4',4],
  ];

  const LOOP_DUR = 16 * B;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain(); masterGain.gain.value = 1; masterGain.connect(ctx.destination);
    bgGain = ctx.createGain(); bgGain.gain.value = 0; bgGain.connect(masterGain);
    sfxGain = ctx.createGain(); sfxGain.gain.value = sfxOn ? 0.55 : 0; sfxGain.connect(masterGain);
  }

  function nt(freq, t, dur, vol, type, dest) {
    const osc = ctx.createOscillator(), env = ctx.createGain();
    osc.connect(env); env.connect(dest);
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    const attack = Math.min(0.02, dur * 0.1);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vol, t + attack);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  function play(seq) {
    if (!sfxOn) return;
    init();
    const t0 = ctx.currentTime + 0.01;
    seq.forEach(([freq, delay, dur, vol, type]) =>
      nt(freq, t0 + (delay || 0), dur || 0.15, vol || 0.3, type || 'sine', sfxGain)
    );
  }

  const sfxPlant     = () => play([[N.G4,0.00,0.10,0.35],[N.C5,0.10,0.18,0.30]]);
  const sfxHarvest   = () => play([[N.C5,0.00,0.18,0.30],[N.E5,0.08,0.18,0.30],[N.G5,0.16,0.18,0.30],[N.C6,0.24,0.30,0.32]]);
  const sfxWater     = () => play([[N.A5,0.00,0.10,0.22],[N.G5,0.07,0.10,0.20],[N.E5,0.14,0.12,0.18]]);
  const sfxFertilize = () => play([[N.C5,0.00,0.09,0.20,'triangle'],[N.E5,0.06,0.09,0.20,'triangle'],[N.G5,0.12,0.09,0.20,'triangle'],[N.C6,0.18,0.09,0.20,'triangle'],[N.E6,0.24,0.14,0.22,'triangle']]);
  const sfxSell      = () => play([[N.C5,0.00,0.11,0.30,'triangle'],[N.E5,0.07,0.11,0.30,'triangle'],[N.G5,0.14,0.11,0.30,'triangle'],[N.E5,0.21,0.11,0.28,'triangle'],[N.G5,0.28,0.11,0.28,'triangle'],[N.C6,0.35,0.28,0.34,'triangle']]);
  const sfxLevelUp   = () => play([[N.C5,0.00,0.20,0.30],[N.E5,0.10,0.20,0.30],[N.G5,0.20,0.20,0.30],[N.C6,0.30,0.20,0.30],[N.E6,0.40,0.20,0.30],[N.G6,0.50,0.40,0.35]]);
  const sfxWilt      = () => play([[N.G4,0.00,0.20,0.25],[N.E4,0.12,0.20,0.22],[N.C4,0.24,0.25,0.20]]);
  const sfxDead      = () => play([[220,0.00,0.15,0.25,'sawtooth'],[150,0.13,0.40,0.18]]);
  const sfxRemove    = () => play([[N.G5,0.00,0.06,0.20,'square'],[N.D5,0.06,0.08,0.15,'square']]);

  function scheduleLoop(t0) {
    let t = t0;
    MEL.forEach(([name, beats]) => { nt(N[name], t, beats*B*0.85, 0.50, 'sine', bgGain); t += beats*B; });
    t = t0;
    BASS.forEach(([name, beats]) => { nt(N[name], t, beats*B*0.70, 0.32, 'triangle', bgGain); t += beats*B; });
  }

  function loop(t0) {
    if (!bgOn || !ctx) return;
    scheduleLoop(t0);
    bgTimer = setTimeout(() => loop(t0 + LOOP_DUR), (LOOP_DUR - 0.3) * 1000);
  }

  function stopBg() {
    clearTimeout(bgTimer);
    bgTimer = null;
  }

  function startBg() {
    if (!(bgOn && ctx) || bgTimer) return;
    loop(ctx.currentTime + 0.15);
  }

  function applyBg() {
    bgOn = userWantsBg && !bgSuspended;
    if (!ctx) return;
    if (bgOn) {
      bgGain.gain.setTargetAtTime(0.18, ctx.currentTime, 0.45);
      startBg();
    } else {
      bgGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      stopBg();
    }
  }

  // Unlock / resume. Music plays only when the saved choice is on, and fades in.
  function start() { init(); applyBg(); }

  function toggleBg() {
    userWantsBg = !userWantsBg;
    if (userWantsBg) init();
    applyBg();
    savePrefs();
    return userWantsBg;
  }

  function toggleSfx() {
    sfxOn = !sfxOn;
    if (ctx) sfxGain.gain.setTargetAtTime(sfxOn ? 0.55 : 0, ctx.currentTime, 0.1);
    savePrefs();
    return sfxOn;
  }

  // Pause silences the soundtrack without flipping the saved preference.
  function setBgSuspended(suspended) {
    bgSuspended = !!suspended;
    if (!suspended && userWantsBg) init();
    applyBg();
  }

  return {
    start, toggleBg, toggleSfx, setBgSuspended,
    isBgOn: () => userWantsBg, isSfxOn: () => sfxOn,
    sfxPlant, sfxHarvest, sfxWater, sfxFertilize,
    sfxSell, sfxLevelUp, sfxWilt, sfxDead, sfxRemove,
  };
})();
