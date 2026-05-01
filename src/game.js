(() => {
  'use strict';

  /**
   * RoadsSplash.io
   * A tiny canvas/WebRTC territory game. It is intentionally dependency-free for
   * GitHub Pages. Signaling uses the RuneVale HTTP long-poll room mailbox only
   * to exchange WebRTC SDP/ICE messages; gameplay runs over DataChannels.
   */

  const CONFIG = {
    VERSION: '0.6.2-feedback-polish',
    SIGNALING_URL: 'https://runevalesignaling.onrender.com',
    SIGNALING_MODE: 'http', // RuneVale HTTP long-poll signaling mailbox
    SIGNALING_GAME_VERSION: 'roads-splash-io-v1',
    SIGNALING_CONTENT_HASH: 'roads-splash-io-v1',

    WORLD_W: 1680,
    WORLD_H: 1050,
    GRID_W: 280,
    GRID_H: 175,
    ROUND_SECONDS: 90,
    MAX_PLAYERS: 14,
    MAX_BOTS: 10,

    ROOM_CODE_LENGTH: 3,
    LOBBY_REFRESH_MS: 5000,
    SIGNALING_HEARTBEAT_MS: 15000,
    RIPPLE_CAP_MEDIUM: 36,
    RIPPLE_CAP_HIGH: 64,
    CONVERT_FLECK_CAP_MEDIUM: 3,
    CONVERT_FLECK_CAP_HIGH: 5,
    CAMERA_BOOST_ZOOM: 0.975,
    CAMERA_SPLAT_ZOOM: 0.96,
    MUSIC_DUCK_SPLAT: 0.42,
    MUSIC_DUCK_ROUND: 0.56,

    BASE_RADIUS: 19,
    MAX_RADIUS_BONUS: 14,
    BASE_SPEED: 218,
    MAX_AREA_SPEED_BONUS: 72,
    ACCEL: 1300,
    STEER_RESPONSE: 17,
    FRICTION: 7.8,
    BOOST_MULT: 1.55,
    BOOST_DRAIN: 0.52,
    BOOST_REGEN: 0.08,
    BOOST_PAINT_REWARD: 0.00025,
    STREAK_MAX: 135,
    STREAK_TIER: 45,
    STREAK_DECAY: 16,
    LOW_TIME_SECONDS: 10,
    LEAD_CHANGE_SHAKE: 2.2,

    PAINT_POWER: 470,
    CONVERT_POWER: 260,
    OVERPAINT_CENTER: 0.52,
    TRAIL_DEPOSIT_STEP: 6,
    COLLISION_PUSH: 0.56,
    COLLISION_BOUNCE: 0.16,
    REINFORCE_POWER: 260,
    SPLAT_CONTACT_PADDING: 4,
    SPLAT_MIN_IMPACT: 92,
    SPLAT_POWER_RATIO: 1.12,
    SPLAT_RADIUS_WEIGHT: 4.8,
    SPLAT_SPEED_WEIGHT: 0.22,
    BUMP_FEEDBACK_MS: 180,
    JELLO_STIFFNESS: 44,
    JELLO_DAMPING: 10.5,
    JELLO_SPEED_SQUASH: 0.22,
    JELLO_IMPACT_SCALE: 0.017,
    BLOB_SPRING: 34,
    BLOB_DAMPING: 9.5,
    BLOB_BREATH: 0.014,
    INK_WET_GAIN: 0.34,
    BOOST_SHAKE: 1.25,
    SPLAT_SHAKE: 13,
    OWN_SPLAT_SHAKE: 18,
    HOST_SNAPSHOT_HZ: 12,
    PAINT_SNAPSHOT_HZ: 5,
    CLIENT_INPUT_HZ: 30,
    FULL_GRID_SECONDS: 5,
    NET_SNAPSHOT_BUFFER_LIMIT: 90000,
    NET_INPUT_BUFFER_LIMIT: 180000,

    ICE_SERVERS: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ],

    COLORS: [
      '#2ee6b8', '#ff5c8a', '#4bb3ff', '#ffd166', '#9b7bff', '#ff8a3d',
      '#67e8f9', '#b7f35b', '#f06cff', '#66f29b', '#ffef5c', '#72a6ff'
    ]
  };

  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const EPS = 0.00001;

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function invLerp(a, b, v) { return clamp((v - a) / (b - a), 0, 1); }
  function smoothstep(a, b, v) {
    const t = invLerp(a, b, v);
    return t * t * (3 - 2 * t);
  }
  function easeOutCubic(t) {
    t = clamp(t, 0, 1);
    return 1 - Math.pow(1 - t, 3);
  }
  function easeInOutSine(t) {
    t = clamp(t, 0, 1);
    return -(Math.cos(Math.PI * t) - 1) / 2;
  }
  function hash01(n) {
    const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return s - Math.floor(s);
  }
  function rand(min, max) { return min + Math.random() * (max - min); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function now() { return performance.now(); }
  function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  function normalize(x, y) {
    const d = Math.hypot(x, y);
    return d > EPS ? { x: x / d, y: y / d, d } : { x: 0, y: 0, d: 0 };
  }
  function uid(prefix = 'p') {
    const bytes = new Uint8Array(6);
    if (crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = (Math.random() * 255) | 0;
    return prefix + Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').slice(0, 10);
  }
  function safeName(raw, fallback = 'Painter') {
    const s = String(raw || '').replace(/[^\p{L}\p{N}_ .-]/gu, '').trim().slice(0, 16);
    return s || fallback;
  }
  function hexToRgb(hex) {
    const v = hex.replace('#', '');
    const n = parseInt(v.length === 3 ? v.split('').map(c => c + c).join('') : v, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgba(hex, a) {
    const c = hexToRgb(hex);
    return `rgba(${c.r},${c.g},${c.b},${a})`;
  }
  function alphaColor(color, a) {
    if (String(color).startsWith('#')) return rgba(color, a);
    const m = String(color).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return m ? `rgba(${m[1]},${m[2]},${m[3]},${a})` : color;
  }
  function rgbToHex(c) {
    const h = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
    return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
  }
  function mixColor(a, b, t) {
    const ca = hexToRgb(a);
    const cb = hexToRgb(b);
    const r = Math.round(lerp(ca.r, cb.r, t));
    const g = Math.round(lerp(ca.g, cb.g, t));
    const bl = Math.round(lerp(ca.b, cb.b, t));
    return `rgb(${r},${g},${bl})`;
  }
  function lighten(hex, amount) {
    const c = hexToRgb(hex);
    const r = Math.round(lerp(c.r, 255, amount));
    const g = Math.round(lerp(c.g, 255, amount));
    const b = Math.round(lerp(c.b, 255, amount));
    return `rgb(${r},${g},${b})`;
  }
  function darken(hex, amount) {
    const c = hexToRgb(hex);
    const r = Math.round(c.r * (1 - amount));
    const g = Math.round(c.g * (1 - amount));
    const b = Math.round(c.b * (1 - amount));
    return `rgb(${r},${g},${b})`;
  }
  function formatTime(seconds) {
    seconds = Math.max(0, Math.ceil(seconds));
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  class Emitter {
    constructor() { this.listeners = new Map(); }
    on(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(fn);
      return () => this.off(type, fn);
    }
    off(type, fn) { this.listeners.get(type)?.delete(fn); }
    emit(type, data) { this.listeners.get(type)?.forEach(fn => fn(data)); }
  }

  class Toasts {
    constructor(root) { this.root = root; }
    clear(match = null) {
      for (const el of Array.from(this.root.children)) {
        if (!match || match.test(el.textContent || '')) el.remove();
      }
    }
    show(text, ms = 2500) {
      const el = document.createElement('div');
      el.className = 'toast';
      el.textContent = text;
      this.root.appendChild(el);
      setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(-8px) scale(0.98)';
        setTimeout(() => el.remove(), 220);
      }, ms);
    }
  }

  class Juice {
    constructor() {
      this.enabled = localStorage.getItem('paintRush.sound') !== 'off';
      this.ctx = null;
      this.masterGain = null;
      this.compressor = null;
      this.duckGain = null;
      this.musicGain = null;
      this.sfxGain = null;
      this.noiseBuffer = null;
      this.nextMusicAt = 0;
      this.musicStep = 0;
      this.lastPaintSound = 0;
      this.lastConvertSound = 0;
      this.lastComboSound = 0;
      this.lastWallSound = 0;
      this.boostOsc = null;
      this.boostGain = null;
      this.boostNoise = null;
      this.boostNoiseGain = null;
      this.boostFilter = null;
      this.shake = 0;
      this.boostShake = 0;
      this.flash = 0;
    }
    unlock() {
      if (!this.enabled) return false;
      try {
        if (!this.ctx) {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (!AudioContext) return false;
          this.ctx = new AudioContext();

          this.masterGain = this.ctx.createGain();
          this.masterGain.gain.value = 0.86;
          this.compressor = this.ctx.createDynamicsCompressor();
          this.compressor.threshold.value = -17;
          this.compressor.knee.value = 16;
          this.compressor.ratio.value = 4;
          this.compressor.attack.value = 0.006;
          this.compressor.release.value = 0.18;
          this.masterGain.connect(this.compressor).connect(this.ctx.destination);

          this.musicGain = this.ctx.createGain();
          this.musicGain.gain.value = 0.2;
          this.duckGain = this.ctx.createGain();
          this.duckGain.gain.value = 1;
          this.duckGain.connect(this.musicGain).connect(this.masterGain);
          this.sfxGain = this.ctx.createGain();
          this.sfxGain.gain.value = 0.95;
          this.sfxGain.connect(this.masterGain);

          this.createNoiseBuffer();
          this.nextMusicAt = this.ctx.currentTime + 0.16;
        }
        if (this.ctx.state === 'suspended') this.ctx.resume?.().catch(() => {});
        if (!this.nextMusicAt || this.nextMusicAt < this.ctx.currentTime - 1) this.nextMusicAt = this.ctx.currentTime + 0.05;
        return true;
      } catch (_) {
        return false;
      }
    }
    createNoiseBuffer() {
      if (!this.ctx || this.noiseBuffer) return;
      const length = this.ctx.sampleRate;
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < length; i++) {
        // Slightly softened noise; it reads as paint/splash instead of harsh static.
        last = last * 0.78 + (Math.random() * 2 - 1) * 0.22;
        data[i] = last;
      }
      this.noiseBuffer = buffer;
    }
    toggle() {
      this.enabled = !this.enabled;
      localStorage.setItem('paintRush.sound', this.enabled ? 'on' : 'off');
      if (this.enabled) {
        this.unlock();
        setTimeout(() => this.join(), 60);
      } else {
        this.stopBoost();
      }
      return this.enabled;
    }
    tone(freq = 420, dur = 0.08, type = 'sine', vol = 0.035, dest = this.sfxGain, at = null, opts = {}) {
      if (!this.enabled) return;
      this.unlock();
      const ctx = this.ctx;
      if (!ctx || ctx.state === 'suspended') return;
      const t = at ?? ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const attack = opts.attack ?? 0.012;
      const releaseAt = Math.max(t + attack + 0.01, t + dur);
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, freq), t);
      if (opts.detune) osc.detune.setValueAtTime(opts.detune, t);
      if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(24, freq * opts.slide), releaseAt);
      else osc.frequency.exponentialRampToValueAtTime(Math.max(24, freq * 0.985), releaseAt);
      let out = osc;
      if (opts.filter) {
        const filter = ctx.createBiquadFilter();
        filter.type = opts.filter.type || 'lowpass';
        filter.frequency.setValueAtTime(opts.filter.freq || 1200, t);
        filter.Q.value = opts.filter.q || 0.7;
        if (opts.filter.to) filter.frequency.exponentialRampToValueAtTime(Math.max(30, opts.filter.to), releaseAt);
        out.connect(filter);
        out = filter;
      }
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
      if (opts.sustain !== undefined) {
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * opts.sustain), t + dur * 0.55);
      }
      gain.gain.exponentialRampToValueAtTime(0.0001, releaseAt);
      out.connect(gain).connect(dest || this.sfxGain || ctx.destination);
      osc.start(t);
      osc.stop(releaseAt + 0.04);
    }
    noiseBurst(dur = 0.1, vol = 0.035, freq = 1600, type = 'bandpass', dest = this.sfxGain, at = null, opts = {}) {
      if (!this.enabled) return;
      this.unlock();
      const ctx = this.ctx;
      if (!ctx || ctx.state === 'suspended' || !this.noiseBuffer) return;
      const t = at ?? ctx.currentTime;
      const source = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      source.buffer = this.noiseBuffer;
      source.loop = true;
      filter.type = type;
      filter.frequency.setValueAtTime(freq, t);
      filter.Q.value = opts.q || 0.9;
      if (opts.to) filter.frequency.exponentialRampToValueAtTime(Math.max(30, opts.to), t + dur);
      const attack = opts.attack ?? 0.008;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      source.connect(filter).connect(gain).connect(dest || this.sfxGain || ctx.destination);
      source.start(t);
      source.stop(t + dur + 0.035);
    }
    duckMusic(amount = CONFIG.MUSIC_DUCK_SPLAT, seconds = 0.42) {
      if (!this.enabled) return;
      this.unlock();
      const ctx = this.ctx;
      if (!ctx || !this.duckGain) return;
      const t = ctx.currentTime;
      const floor = clamp(amount, 0.28, 0.92);
      this.duckGain.gain.cancelScheduledValues(t);
      this.duckGain.gain.setValueAtTime(Math.max(0.0001, floor), t);
      this.duckGain.gain.exponentialRampToValueAtTime(1, t + seconds);
    }
    beep(freq = 420, dur = 0.055, type = 'sine', vol = 0.035) { this.tone(freq, dur, type, vol); }
    paint(amount = 1) {
      if (!this.enabled || !this.ctx) return;
      const t = this.ctx.currentTime;
      if (t - this.lastPaintSound < 0.075) return;
      this.lastPaintSound = t;
      const m = Math.min(1, amount / 18);
      this.tone(430 + m * 220 + Math.random() * 35, 0.055, 'triangle', 0.014 + m * 0.009, this.sfxGain, t, {
        attack: 0.006,
        slide: 0.86,
        filter: { type: 'lowpass', freq: 2200, to: 900, q: 0.8 }
      });
      this.noiseBurst(0.05 + m * 0.03, 0.01 + m * 0.006, 1900 + m * 900, 'bandpass', this.sfxGain, t, { q: 1.4, to: 950 });
    }
    boost(on) {
      this.boostShake = on ? CONFIG.BOOST_SHAKE : 0;
      if (!this.enabled) return;
      this.unlock();
      const ctx = this.ctx;
      if (!ctx) return;
      if (on && !this.boostOsc) {
        this.boostOsc = ctx.createOscillator();
        this.boostGain = ctx.createGain();
        this.boostOsc.type = 'triangle';
        this.boostOsc.frequency.value = 92;
        this.boostGain.gain.value = 0.0001;
        this.boostOsc.connect(this.boostGain).connect(this.sfxGain);
        this.boostOsc.start();
        if (this.noiseBuffer) {
          this.boostNoise = ctx.createBufferSource();
          this.boostNoise.buffer = this.noiseBuffer;
          this.boostNoise.loop = true;
          this.boostFilter = ctx.createBiquadFilter();
          this.boostFilter.type = 'bandpass';
          this.boostFilter.frequency.value = 780;
          this.boostFilter.Q.value = 0.55;
          this.boostNoiseGain = ctx.createGain();
          this.boostNoiseGain.gain.value = 0.0001;
          this.boostNoise.connect(this.boostFilter).connect(this.boostNoiseGain).connect(this.sfxGain);
          this.boostNoise.start();
        }
        this.tone(210, 0.08, 'triangle', 0.018, this.sfxGain, ctx.currentTime, { slide: 1.45, attack: 0.005 });
      }
      if (this.boostGain) this.boostGain.gain.setTargetAtTime(on ? 0.007 : 0.0001, ctx.currentTime, 0.055);
      if (this.boostNoiseGain) this.boostNoiseGain.gain.setTargetAtTime(on ? 0.01 : 0.0001, ctx.currentTime, 0.055);
      if (!on && this.boostOsc) this.stopBoost(180);
    }
    stopBoost(delayMs = 120) {
      this.boostShake = 0;
      const ctx = this.ctx;
      const osc = this.boostOsc;
      const gain = this.boostGain;
      const noise = this.boostNoise;
      const noiseGain = this.boostNoiseGain;
      const filter = this.boostFilter;
      this.boostOsc = this.boostGain = this.boostNoise = this.boostNoiseGain = this.boostFilter = null;
      try { gain?.gain?.setTargetAtTime(0.0001, ctx?.currentTime || 0, 0.03); } catch (_) {}
      try { noiseGain?.gain?.setTargetAtTime(0.0001, ctx?.currentTime || 0, 0.03); } catch (_) {}
      setTimeout(() => {
        try { osc?.stop(); osc?.disconnect(); gain?.disconnect(); } catch (_) {}
        try { noise?.stop(); noise?.disconnect(); noiseGain?.disconnect(); filter?.disconnect(); } catch (_) {}
      }, delayMs);
    }
    pop() { this.splat(); }
    vibrate(pattern) {
      try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (_) {}
    }
    hit(force = 1) {
      const f = clamp(force, 0.35, 1.8);
      this.noiseBurst(0.08 + f * 0.02, 0.028 + f * 0.01, 190, 'lowpass', this.sfxGain, null, { q: 0.6, to: 70 });
      this.tone(150 + f * 32, 0.11, 'triangle', 0.032, this.sfxGain, null, { slide: 0.65, attack: 0.004 });
      this.tone(390 + f * 80, 0.055, 'sine', 0.018, this.sfxGain, this.ctx ? this.ctx.currentTime + 0.015 : null, { slide: 1.18 });
      this.shake = Math.max(this.shake, 5 + f * 3);
      this.vibrate(18);
    }
    convert(amount = 1) {
      if (!this.enabled || !this.ctx) return;
      const t = this.ctx.currentTime;
      if (t - this.lastConvertSound < 0.12) return;
      this.lastConvertSound = t;
      const m = Math.min(1, amount / 24);
      this.tone(310 + m * 190, 0.07, 'triangle', 0.023, this.sfxGain, t, { slide: 1.32, attack: 0.006 });
      this.noiseBurst(0.065, 0.011 + m * 0.01, 1250 + m * 900, 'bandpass', this.sfxGain, t, { q: 1.1, to: 2200 });
    }
    combo(amount = 1) {
      if (!this.enabled) return;
      this.unlock();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      if (t - this.lastComboSound < 0.16) return;
      this.lastComboSound = t;
      const m = clamp(amount / 120, 0, 1);
      this.tone(588 + m * 160, 0.075, 'triangle', 0.026 + m * 0.01, this.sfxGain, t, { slide: 1.18, attack: 0.004 });
      this.tone(882 + m * 220, 0.1, 'sine', 0.018 + m * 0.008, this.sfxGain, t + 0.04, { slide: 1.05, attack: 0.006 });
      this.noiseBurst(0.07, 0.009 + m * 0.006, 3600 + m * 900, 'highpass', this.sfxGain, t + 0.02, { q: 0.45 });
      this.flash = Math.max(this.flash, 0.045 + m * 0.055);
    }
    streak(amount = 1) {
      if (!this.enabled) return;
      this.unlock();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const m = clamp(amount / CONFIG.STREAK_MAX, 0, 1);
      this.tone(520 + m * 240, 0.07, 'triangle', 0.026 + m * 0.012, this.sfxGain, t, { slide: 1.32, attack: 0.004 });
      this.tone(780 + m * 320, 0.08, 'sine', 0.018 + m * 0.01, this.sfxGain, t + 0.035, { slide: 1.16, attack: 0.004 });
      this.noiseBurst(0.06, 0.012 + m * 0.01, 4200, 'highpass', this.sfxGain, t + 0.012, { q: 0.35 });
      this.flash = Math.max(this.flash, 0.065 + m * 0.075);
      this.shake = Math.max(this.shake, 2.5 + m * 3.5);
      this.vibrate(m > 0.65 ? [12, 18, 12] : 12);
    }
    leadChange(own = false) {
      if (!this.enabled) return;
      this.unlock();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const base = own ? 660 : 494;
      this.tone(base, 0.09, 'triangle', 0.032, this.sfxGain, t, { slide: 1.18, attack: 0.005 });
      this.tone(base * 1.5, 0.12, 'sine', 0.026, this.sfxGain, t + 0.06, { slide: 1.04, attack: 0.008 });
      this.noiseBurst(0.085, 0.014, 3200, 'highpass', this.sfxGain, t + 0.025, { q: 0.4 });
      this.flash = Math.max(this.flash, own ? 0.16 : 0.1);
      this.shake = Math.max(this.shake, own ? CONFIG.LEAD_CHANGE_SHAKE : CONFIG.LEAD_CHANGE_SHAKE * 0.62);
    }
    countdown(second = 3) {
      if (!this.enabled) return;
      this.unlock();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const urgent = second <= 3;
      const f = urgent ? 880 + (3 - second) * 110 : 520 + (CONFIG.LOW_TIME_SECONDS - second) * 18;
      this.tone(f, urgent ? 0.12 : 0.075, urgent ? 'square' : 'triangle', urgent ? 0.028 : 0.018, this.sfxGain, t, { slide: urgent ? 0.82 : 1.04, attack: 0.004, filter: { type: 'lowpass', freq: urgent ? 1800 : 2400, to: urgent ? 780 : 1500, q: 0.7 } });
      if (urgent) {
        this.noiseBurst(0.055, 0.012, 5200, 'highpass', this.sfxGain, t + 0.015, { q: 0.3 });
        this.flash = Math.max(this.flash, 0.08);
        this.shake = Math.max(this.shake, 2.5);
        this.vibrate(10);
      }
    }
    wall(force = 1) {
      if (!this.enabled) return;
      this.unlock();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      if (t - this.lastWallSound < 0.18) return;
      this.lastWallSound = t;
      const f = clamp(force, 0.25, 1.35);
      this.tone(132 + f * 45, 0.085, 'triangle', 0.018 + f * 0.012, this.sfxGain, t, { slide: 0.68, attack: 0.004 });
      this.noiseBurst(0.055 + f * 0.015, 0.012 + f * 0.009, 420, 'lowpass', this.sfxGain, t, { q: 0.5, to: 105 });
      this.shake = Math.max(this.shake, 2.8 + f * 2.2);
    }
    roundStart() {
      if (!this.enabled) return;
      this.unlock();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.tone(392, 0.11, 'triangle', 0.03, this.sfxGain, t, { slide: 1.08, attack: 0.006 });
      this.tone(523, 0.12, 'triangle', 0.031, this.sfxGain, t + 0.06, { slide: 1.1, attack: 0.006 });
      this.tone(784, 0.16, 'sine', 0.032, this.sfxGain, t + 0.12, { slide: 1.02, attack: 0.012 });
      this.noiseBurst(0.12, 0.018, 2600, 'highpass', this.sfxGain, t + 0.1, { q: 0.35 });
      this.flash = Math.max(this.flash, 0.12);
      this.vibrate(16);
    }
    join() {
      if (!this.enabled) return;
      this.unlock();
      const t = this.ctx ? this.ctx.currentTime : null;
      this.tone(392, 0.11, 'triangle', 0.032, this.sfxGain, t, { slide: 1.08, attack: 0.008 });
      this.tone(523, 0.12, 'triangle', 0.03, this.sfxGain, this.ctx ? t + 0.07 : null, { slide: 1.06, attack: 0.008 });
      this.tone(784, 0.18, 'sine', 0.027, this.sfxGain, this.ctx ? t + 0.14 : null, { slide: 1.02, attack: 0.012 });
    }
    splat(strength = 1, own = false) {
      const s = clamp(strength, 0.65, 1.7);
      const t = this.ctx ? this.ctx.currentTime : null;
      this.duckMusic(CONFIG.MUSIC_DUCK_SPLAT, 0.42);
      this.noiseBurst(0.18 * s, 0.075 * s, 620, 'lowpass', this.sfxGain, t, { q: 0.5, to: 150 });
      this.noiseBurst(0.13 * s, 0.038 * s, 2400, 'bandpass', this.sfxGain, t, { q: 1.2, to: 900 });
      this.tone(82, 0.19, 'triangle', 0.076 * s, this.sfxGain, t, { slide: 0.48, attack: 0.004 });
      this.tone(245, 0.11, 'sawtooth', 0.03 * s, this.sfxGain, this.ctx ? t + 0.025 : null, {
        slide: 0.72,
        attack: 0.004,
        filter: { type: 'lowpass', freq: 1200, to: 420, q: 0.8 }
      });
      this.tone(690, 0.08, 'sine', 0.026, this.sfxGain, this.ctx ? t + 0.045 : null, { slide: 1.2 });
      this.shake = Math.max(this.shake, (own ? CONFIG.OWN_SPLAT_SHAKE : CONFIG.SPLAT_SHAKE) * s);
      // Keep splats satisfying after the shake reduction by leaning on a softer flash.
      this.flash = Math.max(this.flash, own ? 0.34 : 0.25);
      this.vibrate(own ? [30, 20, 45] : 28);
    }
    roundEnd() {
      if (!this.enabled) return;
      this.unlock();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.duckMusic(CONFIG.MUSIC_DUCK_ROUND, 0.58);
      const notes = [392, 494, 587, 740, 784];
      notes.forEach((f, i) => this.tone(f, 0.24, i === notes.length - 1 ? 'sine' : 'triangle', 0.034, this.sfxGain, t + i * 0.095, { slide: i === notes.length - 1 ? 1.01 : 1.08, attack: 0.01 }));
      this.tone(196, 0.72, 'sine', 0.045, this.sfxGain, t, { sustain: 0.35, attack: 0.02 });
      this.noiseBurst(0.18, 0.025, 3600, 'highpass', this.sfxGain, t + 0.3, { q: 0.4 });
      this.flash = Math.max(this.flash, 0.28);
      this.vibrate([20, 35, 20]);
    }
    musicChord(root, at, dur = 0.9) {
      const intervals = [0, 3, 7, 10];
      intervals.forEach((semi, i) => {
        const f = root * Math.pow(2, semi / 12);
        this.tone(f, dur, i === 0 ? 'sine' : 'triangle', 0.014 / (i ? 1 : 0.8), this.duckGain, at + i * 0.006, {
          attack: 0.045,
          sustain: 0.36,
          filter: { type: 'lowpass', freq: 1450, to: 650, q: 0.5 }
        });
      });
    }
    tick(dt) {
      this.shake = Math.max(0, this.shake - dt * 42);
      this.boostShake = Math.max(0, this.boostShake - dt * 4);
      this.flash = Math.max(0, this.flash - dt);
      if (!this.enabled || !this.ctx || !this.musicGain) return;
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      const ctx = this.ctx;
      const roots = [196, 174.61, 220, 164.81]; // G, F, A, E: simple moody arcade loop.
      const leadScale = [0, 3, 5, 7, 10, 12, 15, 17];
      const stepDur = 0.24;
      while (this.nextMusicAt < ctx.currentTime + 0.38) {
        const step = this.musicStep++;
        const beat = step % 16;
        const bar = Math.floor(step / 16) % roots.length;
        const t = this.nextMusicAt;
        const root = roots[bar];

        if (beat === 0 || beat === 8) this.musicChord(root, t, beat === 0 ? 1.18 : 0.74);
        if (beat % 4 === 0) {
          this.tone(root / 2, 0.22, 'triangle', 0.034, this.duckGain, t, { slide: 0.86, attack: 0.006, filter: { type: 'lowpass', freq: 480, to: 220, q: 0.5 } });
          this.noiseBurst(0.052, 0.018, 95, 'lowpass', this.duckGain, t, { q: 0.6, to: 55, attack: 0.002 });
        }
        if (beat === 6 || beat === 14) this.noiseBurst(0.048, 0.0075, 3200, 'highpass', this.duckGain, t, { q: 0.3 });
        if (beat % 2 === 1) this.noiseBurst(0.028, 0.0038, 5200, 'highpass', this.duckGain, t, { q: 0.3 });
        if (beat === 3 || beat === 7 || beat === 11 || beat === 15) {
          const idx = (step * 3 + bar * 2) % leadScale.length;
          const f = root * Math.pow(2, (leadScale[idx] + 12) / 12);
          this.tone(f, 0.12, 'triangle', 0.011, this.duckGain, t, { slide: 0.92, attack: 0.006, filter: { type: 'lowpass', freq: 2500, to: 1250, q: 0.7 } });
        }
        this.nextMusicAt += stepDur;
      }
    }
  }

  class InputManager {
    constructor(canvas, boostButton, stick, nub, juice) {
      this.canvas = canvas;
      this.boostButton = boostButton;
      this.stick = stick;
      this.nub = nub;
      this.juice = juice;
      this.keys = new Set();
      this.pointer = { active: false, ox: 0, oy: 0, x: 0, y: 0 };
      this.pointerOriginProvider = null;
      this.touchStick = { active: false, ox: 0, oy: 0, x: 0, y: 0, startedAt: 0, source: '', vectorUntil: 0, pointerId: null, touchId: null };
      this.boostDown = false;
      this.lastState = { x: 0, y: 0, boost: false };
      this.bind();
    }
    setPointerOriginProvider(fn) {
      this.pointerOriginProvider = typeof fn === 'function' ? fn : null;
    }
    bind() {
      window.addEventListener('keydown', (e) => {
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Spacebar','Shift'].includes(e.key)) e.preventDefault();
        this.keys.add(e.key.toLowerCase());
        this.juice.unlock();
      }, { passive: false });
      window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));

      const beginDrag = (e) => {
        if (e.pointerType === 'touch') return;
        const origin = this.pointerOrigin();
        this.pointer.active = true;
        this.pointer.ox = origin.x;
        this.pointer.oy = origin.y;
        this.pointer.x = e.clientX;
        this.pointer.y = e.clientY;
        try { this.canvas.setPointerCapture?.(e.pointerId); } catch (_) {}
        this.juice.unlock();
      };
      const moveDrag = (e) => {
        if (this.pointer.active) { this.pointer.x = e.clientX; this.pointer.y = e.clientY; }
      };
      const endDrag = () => { this.pointer.active = false; };
      this.canvas.addEventListener('pointerdown', beginDrag);
      this.canvas.addEventListener('pointermove', moveDrag);
      this.canvas.addEventListener('pointerup', endDrag);
      this.canvas.addEventListener('pointercancel', endDrag);
      this.canvas.addEventListener('pointerleave', endDrag);
      this.canvas.addEventListener('lostpointercapture', endDrag);

      const startStickAt = (clientX, clientY, e = null, source = 'touch', touchId = null) => {
        e?.preventDefault?.();
        const rect = this.stick.getBoundingClientRect();
        this.touchStick.active = true;
        this.touchStick.source = source;
        this.touchStick.touchId = touchId;
        this.touchStick.pointerId = e?.pointerId ?? null;
        this.touchStick.ox = rect.left + rect.width / 2;
        this.touchStick.oy = rect.top + rect.height / 2;
        this.touchStick.x = clientX;
        this.touchStick.y = clientY;
        this.touchStick.startedAt = performance.now();
        this.touchStick.vectorUntil = performance.now() + 220;
        this.stick.classList.add('dragging');
        if (e?.pointerId !== undefined) {
          try { this.stick.setPointerCapture?.(e.pointerId); } catch (_) {}
        }
        this.updateNub();
        this.juice.unlock();
      };
      const moveStickAt = (clientX, clientY) => {
        this.touchStick.x = clientX;
        this.touchStick.y = clientY;
        this.touchStick.vectorUntil = performance.now() + 220;
        this.updateNub();
      };
      const endStick = (e = null) => {
        if (e?.type?.startsWith('pointer') && this.touchStick.source === 'touch' && this.touchStick.touchId != null) return;
        if (e?.type?.startsWith('mouse') && this.touchStick.source === 'touch') return;
        if (e?.type?.startsWith('touch') && this.touchStick.source === 'mouse') return;
        if (this.touchStick.active && e && performance.now() - this.touchStick.startedAt < 120) return;
        this.touchStick.active = false;
        this.touchStick.source = '';
        this.touchStick.vectorUntil = 0;
        this.touchStick.touchId = null;
        this.touchStick.pointerId = null;
        this.nub.style.transform = 'translate(0px, 0px)';
        this.stick.classList.remove('dragging');
        this.stick.style.setProperty('--stick-x', '0px');
        this.stick.style.setProperty('--stick-y', '0px');
      };
      const startStick = (e) => startStickAt(e.clientX, e.clientY, e, e.pointerType === 'mouse' ? 'mouse' : 'touch');
      const moveStick = (e) => { if (this.touchStick.active) moveStickAt(e.clientX, e.clientY); };
      const touchControlsVisible = () => {
        const root = this.stick.closest('.touch-controls');
        return !!root && !root.classList.contains('hidden') && getComputedStyle(root).display !== 'none';
      };
      const inStickFallbackZone = (clientX, clientY) => {
        const rect = this.stick.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const radius = Math.max(rect.width, rect.height) * 0.72;
        return dist2(clientX, clientY, cx, cy) <= radius * radius;
      };
      this.stick.addEventListener('pointerdown', startStick, { passive: false });
      this.nub.addEventListener('pointerdown', startStick, { passive: false });
      this.stick.addEventListener('pointermove', moveStick, { passive: false });
      window.addEventListener('pointermove', moveStick, { passive: false });
      this.stick.addEventListener('pointerup', endStick);
      window.addEventListener('pointerup', endStick);
      this.stick.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        if (t) startStickAt(t.clientX, t.clientY, e, 'touch', t.identifier);
      }, { passive: false });
      this.nub.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        if (t) startStickAt(t.clientX, t.clientY, e, 'touch', t.identifier);
      }, { passive: false });
      const trackedTouch = (touches) => {
        if (this.touchStick.touchId == null) return touches[0] || null;
        for (const t of touches) if (t.identifier === this.touchStick.touchId) return t;
        return null;
      };
      document.addEventListener('touchstart', (e) => {
        if (this.touchStick.active || !touchControlsVisible()) return;
        const t = trackedTouch(e.changedTouches);
        if (t && inStickFallbackZone(t.clientX, t.clientY)) startStickAt(t.clientX, t.clientY, e, 'touch', t.identifier);
      }, { passive: false, capture: true });
      document.addEventListener('touchmove', (e) => {
        if (!this.touchStick.active && this.touchStick.vectorUntil <= performance.now()) return;
        const t = trackedTouch(e.touches);
        if (t) {
          e.preventDefault();
          moveStickAt(t.clientX, t.clientY);
        }
      }, { passive: false, capture: true });
      const maybeEndTouch = (e) => {
        if (this.touchStick.touchId == null) { endStick(e); return; }
        for (const t of e.changedTouches) {
          if (t.identifier === this.touchStick.touchId) {
            this.touchStick.touchId = null;
            endStick(e);
            return;
          }
        }
      };
      document.addEventListener('touchend', maybeEndTouch, { passive: true, capture: true });
      document.addEventListener('touchcancel', maybeEndTouch, { passive: true, capture: true });
      this.stick.addEventListener('mousedown', (e) => startStickAt(e.clientX, e.clientY, e, 'mouse'));
      this.nub.addEventListener('mousedown', (e) => startStickAt(e.clientX, e.clientY, e, 'mouse'));
      window.addEventListener('mousemove', (e) => { if (this.touchStick.active) moveStickAt(e.clientX, e.clientY); });
      window.addEventListener('mouseup', endStick);

      const boostOn = (e) => { e.preventDefault(); this.boostDown = true; this.boostButton.classList.add('down'); this.juice.unlock(); };
      const boostOff = () => { this.boostDown = false; this.boostButton.classList.remove('down'); };
      this.boostButton.addEventListener('pointerdown', boostOn, { passive: false });
      this.boostButton.addEventListener('pointerup', boostOff);
      this.boostButton.addEventListener('pointercancel', boostOff);
      this.boostButton.addEventListener('lostpointercapture', boostOff);
      this.boostButton.addEventListener('touchstart', boostOn, { passive: false });
      this.boostButton.addEventListener('touchend', boostOff, { passive: true });
      this.boostButton.addEventListener('touchcancel', boostOff, { passive: true });
      this.boostButton.addEventListener('mousedown', boostOn);
      window.addEventListener('mouseup', boostOff);

      window.addEventListener('blur', () => this.reset());
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
    }
    reset() {
      this.keys.clear();
      this.pointer.active = false;
      this.touchStick.active = false;
      this.touchStick.touchId = null;
      this.touchStick.pointerId = null;
      this.touchStick.source = '';
      this.touchStick.vectorUntil = 0;
      this.boostDown = false;
      this.boostButton.classList.remove('down');
      this.nub.style.transform = 'translate(0px, 0px)';
      this.stick.classList.remove('dragging');
      this.stick.style.setProperty('--stick-x', '0px');
      this.stick.style.setProperty('--stick-y', '0px');
      this.lastState = { x: 0, y: 0, boost: false };
      this.juice.boost(false);
    }
    updateNub() {
      const dx = this.touchStick.x - this.touchStick.ox;
      const dy = this.touchStick.y - this.touchStick.oy;
      const n = normalize(dx, dy);
      const mag = Math.min(42, n.d);
      this.nub.style.transform = `translate(${n.x * mag}px, ${n.y * mag}px)`;
      this.stick.style.setProperty('--stick-x', `${n.x * mag}px`);
      this.stick.style.setProperty('--stick-y', `${n.y * mag}px`);
    }
    pointerOrigin() {
      if (!this.pointerOriginProvider) return { x: this.pointer.ox || innerWidth / 2, y: this.pointer.oy || innerHeight / 2 };
      const point = this.pointerOriginProvider();
      return {
        x: Number.isFinite(point?.x) ? point.x : innerWidth / 2,
        y: Number.isFinite(point?.y) ? point.y : innerHeight / 2
      };
    }
    getState() {
      let x = 0, y = 0;
      let analog = 1;
      if (this.keys.has('arrowleft') || this.keys.has('a')) x -= 1;
      if (this.keys.has('arrowright') || this.keys.has('d')) x += 1;
      if (this.keys.has('arrowup') || this.keys.has('w')) y -= 1;
      if (this.keys.has('arrowdown') || this.keys.has('s')) y += 1;

      if (Math.abs(x) < EPS && Math.abs(y) < EPS) {
        const usingTouchStick = this.touchStick.active || this.touchStick.vectorUntil > performance.now();
        const source = usingTouchStick ? this.touchStick : this.pointer;
        if (usingTouchStick || source.active) {
          const origin = usingTouchStick ? { x: source.ox, y: source.oy } : this.pointerOrigin();
          x = source.x - origin.x;
          y = source.y - origin.y;
          analog = clamp(Math.hypot(x, y) / (usingTouchStick ? 46 : 72), 0, 1);
        }
      }
      const n = normalize(x, y);
      const state = {
        x: n.x * analog,
        y: n.y * analog,
        boost: this.boostDown || this.keys.has(' ') || this.keys.has('spacebar') || this.keys.has('shift')
      };
      this.lastState = state;
      return state;
    }
  }

  class PaintField {
    constructor() {
      this.w = CONFIG.GRID_W;
      this.h = CONFIG.GRID_H;
      this.size = this.w * this.h;
      this.cellW = CONFIG.WORLD_W / this.w;
      this.cellH = CONFIG.WORLD_H / this.h;
      this.owner = new Uint16Array(this.size); // 0 = neutral; player codes start at 1
      this.strength = new Uint8Array(this.size);
      this.dirty = [];
      this.dirtyCursor = 0;
      this.dirtyFlag = new Uint8Array(this.size);
      this.netDirty = [];
      this.netDirtyCursor = 0;
      this.netDirtyFlag = new Uint8Array(this.size);
      this.counts = new Map();
      this.detail = new Uint8Array(this.size);
      this.detail2 = new Uint8Array(this.size);
      this.grain = new Float32Array(this.size);
      this.grain2 = new Float32Array(this.size);
      this.sparkle = new Uint8Array(this.size);
      this.worldX = new Float32Array(this.w);
      this.worldY = new Float32Array(this.h);
      this.falloffLut = new Float32Array(1025);
      this.wetLut = new Float32Array(256);
      this.deepLut = new Float32Array(256);
      this.glossLut = new Float32Array(256);
      for (let cx = 0; cx < this.w; cx++) this.worldX[cx] = (cx + 0.5) * this.cellW;
      for (let cy = 0; cy < this.h; cy++) this.worldY[cy] = (cy + 0.5) * this.cellH;
      for (let i = 0; i < this.falloffLut.length; i++) this.falloffLut[i] = 0.48 + (1 - Math.sqrt(i / 1024)) * 0.72;
      for (let i = 0; i < 256; i++) {
        const s = i / 255;
        this.wetLut[i] = 0.68 + s * 0.32;
        this.deepLut[i] = 1 - smoothstep(0.58, 1, s);
        this.glossLut[i] = smoothstep(0.62, 1, s);
      }
      for (let i = 0; i < this.size; i++) {
        const n = Math.sin(i * 12.9898 + (i % this.w) * 78.233) * 43758.5453;
        const m = Math.sin((i + 17) * 9.173 + (i % this.w) * 19.191) * 12515.873;
        this.detail[i] = Math.floor((n - Math.floor(n)) * 255);
        this.detail2[i] = Math.floor((m - Math.floor(m)) * 255);
        this.grain[i] = (this.detail[i] - 128) / 128;
        this.grain2[i] = (this.detail2[i] - 128) / 128;
      }
      for (let i = 0; i < this.size; i++) this.sparkle[i] = this.detail[(i * 17 + 13) % this.size] > 220 ? 16 : 0;
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.w;
      this.canvas.height = this.h;
      this.ctx = this.canvas.getContext('2d');
      this.imageData = this.ctx.createImageData(this.w, this.h);
      this.palette = [{ r: 42, g: 46, b: 76 }];
      for (const hex of CONFIG.COLORS) this.palette.push(hexToRgb(hex));
      this.clear(true);
    }
    clear(silent = false) {
      this.owner.fill(0);
      this.strength.fill(0);
      this.counts.clear();
      this.dirty.length = 0;
      this.dirtyCursor = 0;
      this.dirtyFlag.fill(0);
      this.netDirty.length = 0;
      this.netDirtyCursor = 0;
      this.netDirtyFlag.fill(0);
      this.redrawAll();
      if (!silent) for (let i = 0; i < this.size; i++) this.markDirty(i);
    }
    ensurePalette(code, hex) {
      if (!this.palette[code]) this.palette[code] = hexToRgb(hex || CONFIG.COLORS[code % CONFIG.COLORS.length]);
    }
    markRenderDirty(i) {
      if (!this.dirtyFlag[i]) {
        this.dirtyFlag[i] = 1;
        this.dirty.push(i);
      }
    }
    markDirty(i) {
      this.markRenderDirty(i);
      if (!this.netDirtyFlag[i]) {
        this.netDirtyFlag[i] = 1;
        this.netDirty.push(i);
      }
    }
    markEdgeDirty(i) {
      const cx = i % this.w;
      if (cx > 0) this.markRenderDirty(i - 1);
      if (cx < this.w - 1) this.markRenderDirty(i + 1);
      if (i >= this.w) this.markRenderDirty(i - this.w);
      if (i < this.size - this.w) this.markRenderDirty(i + this.w);
    }
    setOwner(i, code, strength = 96) {
      const old = this.owner[i];
      if (old === code) {
        this.strength[i] = strength;
        this.markDirty(i);
        return old;
      }
      if (old) this.counts.set(old, Math.max(0, (this.counts.get(old) || 0) - 1));
      if (code) this.counts.set(code, (this.counts.get(code) || 0) + 1);
      this.owner[i] = code;
      this.strength[i] = strength;
      this.markDirty(i);
      this.markEdgeDirty(i);
      return old;
    }
    cellIndex(cx, cy) { return cy * this.w + cx; }
    paintCircle(x, y, radius, code, dt, powerScale = 1, convertedSamples = null, sampleLimit = 5) {
      if (!code) return 0;
      const minX = clamp(Math.floor((x - radius) / this.cellW), 0, this.w - 1);
      const maxX = clamp(Math.floor((x + radius) / this.cellW), 0, this.w - 1);
      const minY = clamp(Math.floor((y - radius) / this.cellH), 0, this.h - 1);
      const maxY = clamp(Math.floor((y + radius) / this.cellH), 0, this.h - 1);
      const r2 = radius * radius;
      const invR2 = 1 / Math.max(EPS, r2);
      let gained = 0;
      for (let cy = minY; cy <= maxY; cy++) {
        const dy = this.worldY[cy] - y;
        const dy2 = dy * dy;
        const row = cy * this.w;
        for (let cx = minX; cx <= maxX; cx++) {
          const dx = this.worldX[cx] - x;
          const d2 = dx * dx + dy2;
          if (d2 > r2) continue;
          const i = row + cx;
          const old = this.owner[i];
          const falloff = this.falloffLut[Math.min(1024, (d2 * invR2 * 1024) | 0)];
          if (old === code) {
            const next = clamp(this.strength[i] + CONFIG.REINFORCE_POWER * dt * falloff * powerScale, 0, 255);
            if (next !== this.strength[i]) { this.strength[i] = next; this.markDirty(i); }
          } else {
            const centerClaim = falloff >= CONFIG.OVERPAINT_CENTER;
            const strength = old === 0
              ? 78 + falloff * 94 * powerScale
              : (centerClaim ? 112 + falloff * 92 * powerScale : 76 + falloff * 76 * powerScale);
            if (old && convertedSamples && convertedSamples.length < sampleLimit) {
              convertedSamples.push({ x: this.worldX[cx], y: this.worldY[cy], oldCode: old, oldColor: rgbToHex(this.palette[old] || this.palette[0]) });
            }
            this.setOwner(i, code, clamp(strength, 72, centerClaim ? 235 : 188));
            gained++;
          }
        }
      }
      return gained;
    }
    eraseCircle(x, y, radius, dtPower = 1) {
      const minX = clamp(Math.floor((x - radius) / this.cellW), 0, this.w - 1);
      const maxX = clamp(Math.floor((x + radius) / this.cellW), 0, this.w - 1);
      const minY = clamp(Math.floor((y - radius) / this.cellH), 0, this.h - 1);
      const maxY = clamp(Math.floor((y + radius) / this.cellH), 0, this.h - 1);
      const r2 = radius * radius;
      for (let cy = minY; cy <= maxY; cy++) {
        const dy = this.worldY[cy] - y;
        const dy2 = dy * dy;
        const row = cy * this.w;
        for (let cx = minX; cx <= maxX; cx++) {
          const dx = this.worldX[cx] - x;
          if (dx * dx + dy2 > r2) continue;
          const i = row + cx;
          const next = this.strength[i] - 190 * dtPower;
          if (next <= 0) this.setOwner(i, 0, 0);
          else { this.strength[i] = next; this.markDirty(i); }
        }
      }
    }
    getCells(code) { return this.counts.get(code) || 0; }
    redrawAll() {
      const data = this.imageData.data;
      for (let i = 0; i < this.size; i++) this.writePixel(data, i);
      this.ctx.putImageData(this.imageData, 0, 0);
    }
    updateCanvas(maxCells = 5000) {
      if (this.dirtyCursor >= this.dirty.length) {
        this.dirty.length = 0;
        this.dirtyCursor = 0;
        return;
      }
      const data = this.imageData.data;
      const start = this.dirtyCursor;
      const end = Math.min(start + maxCells, this.dirty.length);
      for (let k = start; k < end; k++) {
        const i = this.dirty[k];
        this.dirtyFlag[i] = 0;
        this.writePixel(data, i);
      }
      this.dirtyCursor = end;
      if (this.dirtyCursor >= this.dirty.length) {
        this.dirty.length = 0;
        this.dirtyCursor = 0;
      } else if (this.dirtyCursor > 8192) {
        this.dirty = this.dirty.slice(this.dirtyCursor);
        this.dirtyCursor = 0;
      }
      this.ctx.putImageData(this.imageData, 0, 0);
    }
    edgeCount(i, code) {
      let n = 0;
      const cx = i % this.w;
      if (cx > 0 && this.owner[i - 1] !== code) n++;
      if (cx < this.w - 1 && this.owner[i + 1] !== code) n++;
      if (i >= this.w && this.owner[i - this.w] !== code) n++;
      if (i < this.size - this.w && this.owner[i + this.w] !== code) n++;
      return n;
    }
    writePixel(data, i) {
      const code = this.owner[i];
      const c = this.palette[code] || this.palette[0];
      const strength = this.strength[i];
      const grain = this.grain[i];
      const grain2 = this.grain2[i];
      const p = i * 4;
      if (code === 0) {
        const cloud = grain * 4 + grain2 * 2;
        data[p] = clamp(Math.round(22 + cloud), 0, 255);
        data[p + 1] = clamp(Math.round(26 + cloud), 0, 255);
        data[p + 2] = clamp(Math.round(46 + cloud * 1.6), 0, 255);
        data[p + 3] = 255;
      } else {
        const edges = this.edgeCount(i, code);
        const cx = i % this.w;
        const leftEdge = cx === 0 || this.owner[i - 1] !== code;
        const rightEdge = cx === this.w - 1 || this.owner[i + 1] !== code;
        const topEdge = i < this.w || this.owner[i - this.w] !== code;
        const bottomEdge = i >= this.size - this.w || this.owner[i + this.w] !== code;
        const wet = this.wetLut[strength];
        const marble = grain * 8 + grain2 * 5;
        const bodyShade = edges ? -1.5 : 5.5;
        const rim = edges ? edges * 3 + (topEdge ? 10 : 0) + (leftEdge ? 6 : 0) : -2;
        const underside = (bottomEdge ? 8 : 0) + (rightEdge ? 5 : 0);
        const sparkle = this.sparkle[i];
        const deep = this.deepLut[strength];
        const gloss = this.glossLut[strength] * (edges ? 7 : 4.5 + Math.max(0, grain2) * 5);
        data[p] = clamp(Math.round(lerp(18, c.r, wet) + marble + rim + sparkle + gloss - underside - deep * 14 + bodyShade), 0, 255);
        data[p + 1] = clamp(Math.round(lerp(20, c.g, wet) + marble + rim + sparkle + gloss * 0.82 - underside * 0.9 - deep * 12 + bodyShade), 0, 255);
        data[p + 2] = clamp(Math.round(lerp(33, c.b, wet) + marble * 0.6 + rim * 0.72 + sparkle * 0.6 + gloss * 0.45 - underside * 0.62 - deep * 8 + bodyShade), 0, 255);
        data[p + 3] = 255;
      }
    }
    isPaintEdge(i, code) {
      const cx = i % this.w;
      return (cx > 0 && this.owner[i - 1] !== code)
        || (cx < this.w - 1 && this.owner[i + 1] !== code)
        || (i >= this.w && this.owner[i - this.w] !== code)
        || (i < this.size - this.w && this.owner[i + this.w] !== code);
    }
    consumeNetworkDeltas(limit = 28000) {
      if (this.netDirtyCursor >= this.netDirty.length) {
        this.netDirty.length = 0;
        this.netDirtyCursor = 0;
        return [];
      }
      const start = this.netDirtyCursor;
      const end = Math.min(start + limit, this.netDirty.length);
      const out = new Array(end - start);
      let oi = 0;
      for (let k = start; k < end; k++) {
        const i = this.netDirty[k];
        this.netDirtyFlag[i] = 0;
        out[oi++] = [i, this.owner[i], this.strength[i]];
      }
      this.netDirtyCursor = end;
      if (this.netDirtyCursor >= this.netDirty.length) {
        this.netDirty.length = 0;
        this.netDirtyCursor = 0;
      } else if (this.netDirtyCursor > 12000) {
        this.netDirty = this.netDirty.slice(this.netDirtyCursor);
        this.netDirtyCursor = 0;
      }
      return out;
    }
    clearOutgoingDeltas() {
      for (let k = this.netDirtyCursor; k < this.netDirty.length; k++) this.netDirtyFlag[this.netDirty[k]] = 0;
      this.netDirty.length = 0;
      this.netDirtyCursor = 0;
    }
    fullSnapshot() {
      return {
        owner: Array.from(this.owner),
        strength: Array.from(this.strength)
      };
    }
    applyFull(grid) {
      if (!grid || !grid.owner || !grid.strength) return;
      this.owner.set(grid.owner.slice(0, this.size));
      this.strength.set(grid.strength.slice(0, this.size));
      this.counts.clear();
      this.dirty.length = 0;
      this.dirtyCursor = 0;
      this.dirtyFlag.fill(0);
      this.netDirty.length = 0;
      this.netDirtyCursor = 0;
      this.netDirtyFlag.fill(0);
      for (let i = 0; i < this.size; i++) {
        const code = this.owner[i];
        if (code) this.counts.set(code, (this.counts.get(code) || 0) + 1);
      }
      this.redrawAll();
    }
    applyDeltas(deltas) {
      if (!Array.isArray(deltas)) return;
      for (const d of deltas) {
        const i = d[0] | 0;
        if (i < 0 || i >= this.size) continue;
        const old = this.owner[i];
        const code = d[1] | 0;
        if (old !== code) {
          if (old) this.counts.set(old, Math.max(0, (this.counts.get(old) || 0) - 1));
          if (code) this.counts.set(code, (this.counts.get(code) || 0) + 1);
        }
        this.owner[i] = code;
        this.strength[i] = d[2] | 0;
        // Network deltas received by clients should only dirty the renderer,
        // not get re-queued for outgoing network deltas.
        this.markRenderDirty(i);
        this.markEdgeDirty(i);
      }
    }
  }

  class BotBrain {
    constructor(player) {
      this.player = player;
      this.tx = player.x;
      this.ty = player.y;
      this.rethink = 0;
      this.personality = rand(0.25, 0.9);
      // Keep bots closer to the calmer territory-first behaviour: they should
      // pressure space, not hard tunnel the player every few seconds.
      this.aggression = rand(0.04, 0.32);
      this.wander = rand(0.25, 0.85);
    }
    update(dt, game) {
      const p = this.player;
      this.rethink -= dt;
      if (this.rethink <= 0 || dist2(p.x, p.y, this.tx, this.ty) < 85 * 85) {
        this.rethink = rand(0.75, 1.65);
        const enemy = game.closestEnemy(p);
        const enemyDist2 = enemy ? dist2(p.x, p.y, enemy.x, enemy.y) : Infinity;
        const clearlyFavored = enemy && p.r > enemy.r * 1.18;
        const shouldHunt = clearlyFavored
          && enemyDist2 < 300 * 300
          && Math.random() < this.aggression * 0.45;
        if (shouldHunt) {
          // Aim near, not directly through, enemies so bot pressure feels less
          // like a homing missile while preserving the same splat rules.
          const side = rand(-1, 1);
          const dx = enemy.x - p.x, dy = enemy.y - p.y;
          const n = normalize(dx, dy);
          this.tx = enemy.x - n.x * rand(45, 90) - n.y * side * rand(35, 90);
          this.ty = enemy.y - n.y * rand(45, 90) + n.x * side * rand(35, 90);
        } else {
          const target = game.findPaintTarget(p.code, p.x, p.y, this.personality);
          this.tx = target.x + rand(-45, 45) * this.wander;
          this.ty = target.y + rand(-45, 45) * this.wander;
        }
      }

      const avoid = game.closestThreat(p);
      let ax = this.tx - p.x, ay = this.ty - p.y;
      if (avoid && dist2(p.x, p.y, avoid.x, avoid.y) < 230 * 230 && avoid.r > p.r * 1.04) {
        ax += (p.x - avoid.x) * 3.1;
        ay += (p.y - avoid.y) * 3.1;
      }
      const n = normalize(ax, ay);
      const farFromGoal = dist2(p.x, p.y, this.tx, this.ty) > 260 * 260;
      const escaping = avoid && avoid.r > p.r * 1.04 && dist2(p.x, p.y, avoid.x, avoid.y) < 210 * 210;
      const boost = p.boost > 0.52 && (escaping || (farFromGoal && Math.random() < 0.18));
      return { x: n.x, y: n.y, boost };
    }
  }

  class FlexibleSignal extends Emitter {
    constructor(url, id, name, toasts) {
      super();
      this.url = url.replace(/\/$/, '');
      this.id = id;
      this.name = name;
      this.room = null;
      this.hostPeerId = null;
      this.mode = 'http';
      this.connected = false;
      this.toasts = toasts;
      this.status = 'idle';
      this.cancelled = false;
      this.cursor = 0;
      this.polling = false;
      this.pollAbort = null;
      this.heartbeatTimer = null;
    }
    async connect(room, isHost = false) {
      this.room = room ? String(room).toUpperCase() : null;
      this.cancelled = false;
      this.emit('status', { title: 'Connecting…', text: 'Opening the HTTP signaling mailbox.', details: '' });
      const wakeTimer = setTimeout(() => {
        if (!this.connected && !this.cancelled) {
          this.emit('status', {
            title: 'Waking signaling server…',
            text: 'This Render free server may have spun down. It usually wakes after the first request.',
            details: 'Keep this tab open. Multiplayer starts once the signaling mailbox responds.'
          });
        }
      }, 1800);
      try {
        this.wakeSignalingServer();
        if (isHost) await this.createHttpRoom();
        else await this.joinHttpRoom(this.room);
        this.startHeartbeat();
        clearTimeout(wakeTimer);
        return this.room;
      } catch (err) {
        clearTimeout(wakeTimer);
        this.emit('status', {
          title: 'Signaling failed',
          text: 'Could not connect to the HTTP signaling server. You can still play solo with bots.',
          details: String(err.message || err)
        });
        throw err;
      }
    }
    close() {
      this.stopHeartbeat();
      if (this.connected && this.room) {
        this.sendSignal(this.hostPeerId || '*', 'bye', { peerId: this.id }).catch(() => {});
      }
      this.cancelled = true;
      try { this.pollAbort?.abort(); } catch (_) {}
      this.connected = false;
      this.polling = false;
      this.pollAbort = null;
    }
    startHeartbeat() {
      this.stopHeartbeat();
      const beat = () => {
        if (!this.connected || this.cancelled || !this.room) return;
        this.fetchJson(`/rooms/${encodeURIComponent(this.room)}/heartbeat`, {
          method: 'POST',
          body: { peerId: this.id, hostName: this.name }
        }).catch(() => {});
      };
      this.heartbeatTimer = setInterval(beat, CONFIG.SIGNALING_HEARTBEAT_MS);
      setTimeout(beat, 1200);
    }
    stopHeartbeat() {
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    wakeSignalingServer() {
      if (!window.fetch) return;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      fetch(this.url + '/healthz', { mode: 'cors', cache: 'no-store', signal: controller.signal })
        .catch(() => {})
        .finally(() => clearTimeout(timer));
    }
    async createHttpRoom() {
      const data = await this.fetchJson('/rooms', {
        method: 'POST',
        body: {
          hostPeerId: this.id,
          hostName: this.name,
          visibility: 'public',
          maxPeers: Math.min(8, CONFIG.MAX_PLAYERS),
          gameVersion: CONFIG.SIGNALING_GAME_VERSION,
          contentHash: CONFIG.SIGNALING_CONTENT_HASH
        }
      });
      this.room = String(data.roomCode || '').toUpperCase();
      if (!this.room) throw new Error('Signaling server did not return a room code.');
      this.hostPeerId = this.id;
      this.cursor = 0;
      this.connected = true;
      this.emit('status', { title: 'Connected', text: `Created signaling room ${this.room}.`, details: 'Mode: HTTP long-poll mailbox' });
    }
    async joinHttpRoom(room) {
      if (!room) throw new Error('Room code required.');
      const data = await this.fetchJson(`/rooms/${encodeURIComponent(room)}/join`, {
        method: 'POST',
        body: {
          peerId: this.id,
          displayName: this.name,
          gameVersion: CONFIG.SIGNALING_GAME_VERSION,
          contentHash: CONFIG.SIGNALING_CONTENT_HASH
        }
      });
      this.room = String(data.roomCode || room).toUpperCase();
      this.hostPeerId = data.hostPeerId || null;
      this.cursor = Number(data.messageCursor || 0);
      this.connected = true;
      this.emit('status', { title: 'Connected', text: `Joined signaling room ${this.room}.`, details: 'Mode: HTTP long-poll mailbox' });
    }
    async refreshHttpJoin() {
      if (!this.connected || !this.room) return false;
      const data = await this.fetchJson(`/rooms/${encodeURIComponent(this.room)}/join`, {
        method: 'POST',
        body: {
          peerId: this.id,
          displayName: this.name,
          gameVersion: CONFIG.SIGNALING_GAME_VERSION,
          contentHash: CONFIG.SIGNALING_CONTENT_HASH
        }
      });
      if (data.hostPeerId) this.hostPeerId = data.hostPeerId;
      return true;
    }
    async fetchJson(path, options = {}) {
      const init = {
        method: options.method || 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: options.signal
      };
      if (options.body !== undefined) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(options.body);
      }
      const res = await fetch(this.url + path, init);
      let data = null;
      try { data = await res.json(); } catch (_) {}
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || `${res.status} ${res.statusText || 'signaling error'}`);
      }
      return data || {};
    }
    startPolling() {
      if (!this.connected || this.polling) return;
      this.polling = true;
      this.pollLoop();
    }
    async pollLoop() {
      while (this.connected && !this.cancelled) {
        this.pollAbort = new AbortController();
        try {
          const qs = `peerId=${encodeURIComponent(this.id)}&since=${encodeURIComponent(this.cursor)}&timeoutMs=25000`;
          const data = await this.fetchJson(`/rooms/${encodeURIComponent(this.room)}/signals?${qs}`, { signal: this.pollAbort.signal });
          if (Number.isFinite(Number(data.next))) this.cursor = Math.max(this.cursor, Number(data.next));
          if (Array.isArray(data.messages)) {
            for (const msg of data.messages) this.handleMailboxMessage(msg);
          }
        } catch (err) {
          if (this.cancelled) break;
          this.emit('status', {
            title: 'Signaling reconnecting…',
            text: 'The HTTP mailbox poll failed. Retrying.',
            details: String(err.message || err)
          });
          await delay(1200);
        } finally {
          this.pollAbort = null;
        }
      }
      this.polling = false;
    }
    sendSignal(to, signalType, data) {
      if (!this.connected || !this.room) return Promise.resolve(false);
      return this.fetchJson(`/rooms/${encodeURIComponent(this.room)}/signals`, {
        method: 'POST',
        body: { from: this.id, to, kind: signalType, payload: data }
      })
        .then(() => true)
        .catch((err) => {
          this.emit('status', { title: 'Signaling send failed', text: `Could not send ${signalType}.`, details: String(err.message || err) });
          return false;
        });
    }
    handleMailboxMessage(msg) {
      if (!msg || msg.from === this.id) return;
      const kind = msg.kind || msg.type;
      const payload = parsePayload(msg.payload);
      if (kind === 'join') {
        const id = payload.peerId || msg.from;
        if (id && id !== this.id) this.emit('peer', { id, name: payload.displayName || payload.name || 'Friend' });
      } else if (kind === 'bye') {
        if (msg.from) this.emit('peer-left', { id: msg.from });
      } else if (kind === 'reject') {
        this.emit('status', { title: 'Connection rejected', text: 'The host rejected the connection.', details: String(payload.reason || '') });
      } else if (kind === 'renegotiate') {
        const id = payload.peerId || msg.from;
        if (id && id !== this.id) this.emit('peer', { id, name: payload.displayName || payload.name || 'Friend', force: true });
      } else if (kind === 'offer' || kind === 'answer' || kind === 'ice') {
        this.emit('signal', { from: msg.from, type: kind, data: payload });
      }
    }
    handleSignalMessage(msg) {
      if (!msg || typeof msg !== 'object') return;
      const type = msg.type || msg.event;
      if (msg.room && msg.room !== this.room) return;
      if (msg.to && msg.to !== this.id && msg.to !== '*' && msg.to !== 'all') return;
      if (msg.from === this.id || msg.id === this.id) return;

      if (type === 'welcome' || type === 'joined' || type === 'hello') {
        const peers = msg.peers || msg.clients || [];
        if (Array.isArray(peers)) peers.forEach(peer => {
          const id = peer.id || peer.peerId || peer;
          if (id && id !== this.id) this.emit('peer', { id, name: peer.name || 'Friend' });
        });
        if (msg.id && msg.id !== this.id) this.emit('peer', { id: msg.id, name: msg.name || 'Friend' });
      } else if (type === 'peers') {
        const peers = msg.peers || msg.clients || msg.data || [];
        if (Array.isArray(peers)) peers.forEach(peer => {
          const id = peer.id || peer.peerId || peer;
          if (id && id !== this.id) this.emit('peer', { id, name: peer.name || 'Friend' });
        });
      } else if (type === 'peer-joined' || type === 'peerJoined' || type === 'user-joined' || type === 'user-connected' || type === 'join') {
        const id = msg.id || msg.peerId || msg.userId || msg.from;
        if (id && id !== this.id) this.emit('peer', { id, name: msg.name || 'Friend' });
      } else if (type === 'peer-left' || type === 'user-left' || type === 'disconnect') {
        const id = msg.id || msg.peerId || msg.userId || msg.from;
        if (id) this.emit('peer-left', { id });
      } else if (type === 'signal') {
        const signal = msg.signal || msg.data || {};
        this.emit('signal', { from: msg.from || msg.id, type: signal.type || msg.signalType, data: signal.data || signal.sdp || signal.candidate || signal });
      } else if (type === 'offer' || type === 'answer' || type === 'ice' || type === 'candidate' || type === 'ice-candidate') {
        const signalType = type === 'candidate' || type === 'ice-candidate' ? 'ice' : type;
        this.emit('signal', { from: msg.from || msg.id || msg.peerId, type: signalType, data: msg.data || msg.sdp || msg.candidate || msg });
      }
    }
  }

  function safeJson(data) {
    try { return JSON.parse(data); } catch (_) { return null; }
  }
  function parsePayload(data) {
    if (typeof data !== 'string') return data || {};
    try { return JSON.parse(data); } catch (_) { return data; }
  }
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  class PeerMesh extends Emitter {
    constructor(game, signal, isHost) {
      super();
      this.game = game;
      this.signal = signal;
      this.isHost = isHost;
      this.peers = new Map();
      this.signal.on('peer', (peer) => this.onPeer(peer));
      this.signal.on('signal', (msg) => this.onSignal(msg));
      this.signal.on('peer-left', ({ id }) => this.removePeer(id));
    }
    close() {
      for (const peer of this.peers.values()) {
        try { peer.dc?.close(); } catch (_) {}
        try { peer.stateDc?.close(); } catch (_) {}
        try { peer.pc?.close(); } catch (_) {}
      }
      this.peers.clear();
    }
    onPeer(peer) {
      if (!peer.id || peer.id === this.signal.id) return;
      if (this.peers.has(peer.id)) {
        const existing = this.peers.get(peer.id);
        const t = now();
        if (!this.isHost) return;
        const age = t - (existing?.createdAt || 0);
        if (age < 2600) {
          if (existing?.pc?.localDescription?.type === 'offer' && t - (existing.lastOfferAt || 0) > 900) {
            existing.lastOfferAt = t;
            this.signal.sendSignal(peer.id, 'offer', existing.pc.localDescription);
          }
          return;
        }
        if (existing?.open && !peer.force) return;
        this.removePeer(peer.id, true);
      }
      if (this.isHost) this.createPeer(peer.id, true);
    }
    createPeer(id, makeOffer) {
      const pc = new RTCPeerConnection({ iceServers: CONFIG.ICE_SERVERS });
      const state = { id, pc, dc: null, stateDc: null, open: false, openEmitted: false, lastInputAt: 0, pendingIce: [], disconnectTimer: null, createdAt: now() };
      this.peers.set(id, state);
      pc.onicecandidate = (ev) => { if (ev.candidate) this.signal.sendSignal(id, 'ice', ev.candidate); };
      pc.onconnectionstatechange = () => {
        const stateNow = pc.connectionState;
        if (stateNow === 'connected') {
          if (state.disconnectTimer) clearTimeout(state.disconnectTimer);
          state.disconnectTimer = null;
        } else if (stateNow === 'disconnected') {
          state.open = state.dc?.readyState === 'open';
          this.emit('soft-disconnect', id);
        } else if (stateNow === 'failed' || stateNow === 'closed') {
          this.removePeer(id, false);
        }
      };
      pc.ondatachannel = (ev) => this.attachDataChannel(state, ev.channel);
      if (makeOffer) {
        const dc = pc.createDataChannel('roads-control');
        this.attachDataChannel(state, dc);
        const stateDc = pc.createDataChannel('roads-state', { ordered: false, maxRetransmits: 0 });
        this.attachDataChannel(state, stateDc);
        pc.createOffer()
          .then(offer => pc.setLocalDescription(offer))
          .then(() => {
            state.lastOfferAt = now();
            return this.signal.sendSignal(id, 'offer', pc.localDescription);
          })
          .catch(err => this.game.toast(`Offer failed: ${err.message || err}`));
      }
      return state;
    }
    maintainHostNegotiations() {
      if (!this.isHost) return;
      const t = now();
      for (const [id, peer] of Array.from(this.peers.entries())) {
        if (!peer || peer.open) continue;
        const age = t - (peer.createdAt || t);
        if (peer.pc?.localDescription?.type === 'offer' && t - (peer.lastOfferAt || 0) > 1200) {
          peer.lastOfferAt = t;
          this.signal.sendSignal(id, 'offer', peer.pc.localDescription);
        }
        if (age > 7600) {
          this.removePeer(id, true);
          this.createPeer(id, true);
        }
      }
    }
    attachDataChannel(peer, dc) {
      const isState = dc.label === 'roads-state';
      if (isState) peer.stateDc = dc;
      else peer.dc = dc;
      dc.onopen = () => {
        if (peer.disconnectTimer) clearTimeout(peer.disconnectTimer);
        peer.disconnectTimer = null;
        if (isState) return;
        peer.open = true;
        if (peer.openEmitted) return;
        peer.openEmitted = true;
        this.emit('open', peer.id);
        if (!this.isHost) {
          this.game.sendClientHello(true);
        } else {
          this.send(peer.id, { type: 'host-hello', id: this.game.myId, room: this.game.roomCode });
          this.game.sendFullSnapshotTo(peer.id);
        }
      };
      dc.onclose = () => {
        if (isState) return;
        peer.open = false;
        peer.openEmitted = false;
        this.emit('close', peer.id);
      };
      dc.onmessage = (ev) => {
        const msg = safeJson(ev.data);
        if (msg) this.emit('message', { from: peer.id, msg });
      };
    }
    async onSignal({ from, type, data }) {
      if (!from) return;
      let peer = this.peers.get(from);
      if (!peer) peer = this.createPeer(from, false);
      let pc = peer.pc;
      try {
        if (type === 'offer') {
          const sameOffer = pc.remoteDescription?.type === 'offer' && pc.remoteDescription.sdp === data?.sdp;
          if (pc.signalingState === 'stable' && sameOffer && pc.localDescription?.type === 'answer') {
            this.signal.sendSignal(from, 'answer', pc.localDescription);
            return;
          }
          if (!peer.open && pc.remoteDescription && !sameOffer) {
            this.removePeer(from, true);
            peer = this.createPeer(from, false);
            pc = peer.pc;
          }
          await pc.setRemoteDescription(new RTCSessionDescription(data));
          await this.flushPendingIce(peer);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          this.signal.sendSignal(from, 'answer', pc.localDescription);
        } else if (type === 'answer') {
          if (!pc.remoteDescription) await pc.setRemoteDescription(new RTCSessionDescription(data));
          await this.flushPendingIce(peer);
        } else if (type === 'ice') {
          const candidate = new RTCIceCandidate(data);
          if (!pc.remoteDescription) {
            peer.pendingIce.push(candidate);
            return;
          }
          await pc.addIceCandidate(candidate);
        }
      } catch (err) {
        if (type !== 'ice' || !peer.open) this.game.toast(`WebRTC ${type} failed: ${err.message || err}`);
      }
    }
    async flushPendingIce(peer) {
      if (!peer?.pc?.remoteDescription || !peer.pendingIce?.length) return;
      const pending = peer.pendingIce.splice(0);
      for (const candidate of pending) await peer.pc.addIceCandidate(candidate);
    }
    send(id, msg, channel = 'control') {
      const peer = this.peers.get(id);
      const useState = channel === 'state';
      let dc = useState ? peer?.stateDc : peer?.dc;
      if (useState && (!dc || dc.readyState !== 'open') && msg?.type === 'paint' && !msg.full) dc = peer?.dc;
      if (!dc || dc.readyState !== 'open') return false;
      if ((msg?.type === 'paint' || msg?.type === 'snapshot') && dc.bufferedAmount > CONFIG.NET_SNAPSHOT_BUFFER_LIMIT) return false;
      if (msg?.type === 'input' && dc.bufferedAmount > CONFIG.NET_INPUT_BUFFER_LIMIT) return false;
      try { dc.send(JSON.stringify(msg)); return true; } catch (_) { return false; }
    }
    broadcast(msg, channel = 'control') {
      let sent = 0;
      for (const id of this.peers.keys()) if (this.send(id, msg, channel)) sent++;
      return sent;
    }
    resetUnopenedPeers() {
      for (const [id, peer] of Array.from(this.peers.entries())) {
        if (peer.open) continue;
        try { peer.dc?.close(); } catch (_) {}
        try { peer.stateDc?.close(); } catch (_) {}
        try { peer.pc?.close(); } catch (_) {}
        if (peer.disconnectTimer) clearTimeout(peer.disconnectTimer);
        this.peers.delete(id);
      }
    }
    removePeer(id, close = true) {
      const peer = this.peers.get(id);
      if (!peer) return;
      if (close) {
        try { peer.dc?.close(); } catch (_) {}
        try { peer.stateDc?.close(); } catch (_) {}
        try { peer.pc?.close(); } catch (_) {}
      }
      if (peer.disconnectTimer) clearTimeout(peer.disconnectTimer);
      this.peers.delete(id);
      this.emit('close', id);
    }
    countOpen() {
      let n = 0;
      for (const p of this.peers.values()) if (p.open) n++;
      return n;
    }
  }

  class Game {
    constructor() {
      this.canvas = $('game');
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      this.minimap = $('minimap');
      this.minictx = this.minimap.getContext('2d');
      this.toasts = new Toasts($('toastRoot'));
      this.juice = new Juice();
      this.input = new InputManager(this.canvas, $('boostBtn'), $('stick'), $('nub'), this.juice);
      this.input.setPointerOriginProvider(() => this.getPlayerScreenPoint());
      this.paint = new PaintField();

      this.mode = 'menu';
      this.isHost = false;
      this.myId = uid('me');
      this.hostId = null;
      this.roomCode = null;
      this.playerName = safeName(localStorage.getItem('paintRush.name'), 'Painter');
      this.players = new Map();
      this.bots = new Map();
      this.nextCode = 1;
      this.matchTime = CONFIG.ROUND_SECONDS;
      this.roundActive = false;
      this.roundOver = false;
      this.roundId = 0;
      this.paintRoundId = 0;
      this.paintResetRoundId = 0;
      this.winner = null;
      this.roundOverTimer = 0;
      this.centerBanner = null;
      this.roundFlash = null;
      this.particles = [];
      this.floaters = [];
      this.shockwaves = [];
      this.ripples = [];
      this.confetti = [];
      this.speedLines = [];
      this.menuOrbs = Array.from({ length: 24 }, (_, i) => ({
        x: hash01(i * 3 + 1),
        y: hash01(i * 3 + 2),
        r: 44 + hash01(i * 3 + 3) * 130,
        color: CONFIG.COLORS[i % CONFIG.COLORS.length],
        phase: hash01(i * 3 + 4) * TAU,
        drift: 0.55 + hash01(i * 3 + 5) * 1.2
      }));
      this.leaderCode = 0;
      this.camera = { x: CONFIG.WORLD_W / 2, y: CONFIG.WORLD_H / 2, zoom: 1 };
      this.cameraPulse = 0;
      this.view = null;
      this.quality = localStorage.getItem('paintRush.quality') || 'auto';
      this.pixelRatio = 1;
      this.lastTick = now();
      this.frameNow = this.lastTick;
      this.dprCheckTimer = 0;
      this.accumNet = 0;
      this.accumPaintNet = 0;
      this.accumInput = 0;
      this.accumFullGrid = 0;
      this.lastHostJoinNudgeAt = 0;
      this.lastHostJoinRefreshAt = 0;
      this.lastHostRenegotiateAt = 0;
      this.joinWaitStartedAt = 0;
      this.fps = 60;
      this.frameCounter = 0;
      this.netBytes = 0;
      this.lastHudAt = 0;
      this.lastRoomOverlayAt = 0;
      this.lastTimerText = '';
      this.lastRoundStateText = '';
      this.lastBoostPct = -1;
      this.lastBoosting = false;
      this.lastLeaderboardHtml = '';
      this.lastMinimapAt = 0;
      this.lastRoomOverlayKey = '';
      this.lastLeaderCode = 0;
      this.lastLeadAnnounceAt = 0;
      this.lastCountdownSecond = null;
      this.lastStreakText = '';
      this.lastLowTimeClass = false;
      this.reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      this.saveData = !!(navigator.connection && navigator.connection.saveData);
      this.worldBackdrop = document.createElement('canvas');
      this.worldBackdrop.width = CONFIG.WORLD_W;
      this.worldBackdrop.height = CONFIG.WORLD_H;
      this.worldBackdropCtx = this.worldBackdrop.getContext('2d', { alpha: false });
      this.worldBackdropReady = false;
      this.screenOverlay = document.createElement('canvas');
      this.screenOverlayCtx = this.screenOverlay.getContext('2d');

      this.signal = null;
      this.mesh = null;
      this.networkAttempt = 0;
      this.reconnectTimer = null;
      this.reconnecting = false;
      this.lastClientHelloAt = 0;
      this.lobbyRooms = [];
      this.lobbyLoading = false;
      this.lastLobbyAt = 0;

      this.setupUi();
      this.setupAudioGuards();
      this.resize();
      window.addEventListener('resize', () => this.resize());
      window.addEventListener('pagehide', () => {
        if (this.isHost) this.closeHostedRoom();
        else this.closeClientRoomPeer();
      });
      requestAnimationFrame((t) => this.loop(t));
    }
    setupUi() {
      if (!$('streakBadge')) {
        const badge = document.createElement('div');
        badge.id = 'streakBadge';
        badge.className = 'streak-badge hidden';
        badge.innerHTML = 'RUSH <strong>0</strong>';
        $('hud')?.querySelector('.hud-left')?.appendChild(badge);
      }
      if (!$('startRoundBtn')) {
        const btn = document.createElement('button');
        btn.id = 'startRoundBtn';
        btn.className = 'round-btn host-only hidden';
        btn.title = 'Start round';
        btn.setAttribute('aria-label', 'Start round');
        btn.textContent = 'Start';
        $('controls').insertBefore(btn, $('addBotBtn'));
      }
      $('nameInput').value = this.playerName;
      $('qualitySelect').value = this.quality;
      $('soloBtn').onclick = () => this.startLocal();
      $('hostBtn').onclick = () => this.startHost();
      $('joinBtn').onclick = () => this.joinRoom();
      $('lobbyRefreshBtn').onclick = () => this.refreshLobby(true);
      $('modalCancel').onclick = () => { this.hideModal(); this.leaveToMenu(); };
      $('fullscreenBtn').onclick = () => this.toggleFullscreen();
      $('soundBtn').onclick = () => {
        const on = this.juice.toggle();
        $('soundBtn').textContent = on ? '♪' : '×';
        this.toast(on ? 'Sound on' : 'Sound off');
      };
      $('soundBtn').textContent = this.juice.enabled ? '♪' : '×';
      $('startRoundBtn').onclick = () => this.startHostedRound();
      $('lobbyStartBtn').onclick = () => this.startHostedRound();
      $('addBotBtn').onclick = () => this.addBotButton();
      $('menuBtn').onclick = () => this.leaveToMenu();
      $('qualitySelect').onchange = () => {
        this.quality = $('qualitySelect').value;
        localStorage.setItem('paintRush.quality', this.quality);
        this.resize();
      };
      $('roomInput').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CONFIG.ROOM_CODE_LENGTH); });
      this.refreshLobby(false);
      setInterval(() => {
        if (this.mode === 'menu' && !document.hidden) this.refreshLobby(false);
      }, CONFIG.LOBBY_REFRESH_MS);
    }
    setupAudioGuards() {
      const resume = () => {
        if (this.juice.enabled) this.juice.unlock();
      };
      ['pointerdown', 'touchstart', 'click', 'keydown'].forEach(type => {
        window.addEventListener(type, resume, { capture: true, passive: true });
      });
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) resume();
      });
    }
    toast(text, ms) { this.toasts.show(text, ms); }
    resize() {
      const dpr = this.getTargetDpr();
      this.pixelRatio = dpr;
      const w = Math.floor(innerWidth * dpr);
      const h = Math.floor(innerHeight * dpr);
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
        this.canvas.style.width = innerWidth + 'px';
        this.canvas.style.height = innerHeight + 'px';
      }
      this.rebuildScreenOverlay(w, h);
    }
    getTargetDpr() {
      const raw = window.devicePixelRatio || 1;
      if (this.quality === 'low' || this.saveData) return Math.min(1, raw);
      if (this.quality === 'medium') return Math.min(1.25, raw);
      if (this.quality === 'high') return Math.min(2, raw);
      const small = innerWidth < 720 || innerHeight < 520;
      // Auto favors a steady arcade frame rate over maximum pixel density.
      // Hysteresis avoids DPR bouncing after one noisy frame.
      const slow = this.fps < 48 || (this.pixelRatio <= 1.05 && this.fps < 57);
      return Math.min(small || slow ? 1 : 1.35, raw);
    }
    rebuildScreenOverlay(w = this.canvas.width, h = this.canvas.height) {
      if (!this.screenOverlay || !this.screenOverlayCtx || !w || !h) return;
      if (this.screenOverlay.width !== w) this.screenOverlay.width = w;
      if (this.screenOverlay.height !== h) this.screenOverlay.height = h;
      const ctx = this.screenOverlayCtx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const overlay = ctx.createRadialGradient(w * 0.5, h * 0.46, Math.min(w, h) * 0.12, w * 0.5, h * 0.5, Math.max(w, h) * 0.65);
      overlay.addColorStop(0, 'rgba(255,255,255,0)');
      overlay.addColorStop(1, 'rgba(0,0,0,0.2)');
      ctx.fillStyle = overlay;
      ctx.fillRect(0, 0, w, h);
    }
    readMenuName() {
      this.juice.unlock();
      this.playerName = safeName($('nameInput').value, 'Painter');
      localStorage.setItem('paintRush.name', this.playerName);
      return this.playerName;
    }
    selectedBotCount() { return clamp(parseInt($('botSelect').value || '4', 10) || 0, 0, CONFIG.MAX_BOTS); }
    getPlayerScreenPoint() {
      const p = this.players.get(this.myId) || Array.from(this.players.values())[0];
      const view = this.view;
      if (!p || !view) return { x: innerWidth / 2, y: innerHeight / 2 };
      return {
        x: (p.x * view.zoom + view.tx) / view.dpr,
        y: (p.y * view.zoom + view.ty) / view.dpr
      };
    }

    async refreshLobby(force = false) {
      if (this.mode !== 'menu' || this.lobbyLoading) return;
      const t = now();
      if (!force && t - this.lastLobbyAt < CONFIG.LOBBY_REFRESH_MS - 250) return;
      this.lobbyLoading = true;
      this.lastLobbyAt = t;
      this.renderLobby('loading');
      const url = `${CONFIG.SIGNALING_URL}/rooms?gameVersion=${encodeURIComponent(CONFIG.SIGNALING_GAME_VERSION)}&contentHash=${encodeURIComponent(CONFIG.SIGNALING_CONTENT_HASH)}&limit=20`;
      try {
        const res = await fetch(url, { cache: 'no-store', mode: 'cors' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok === false) throw new Error(data?.error || `${res.status} ${res.statusText || 'lobby error'}`);
        this.lobbyRooms = Array.isArray(data.rooms) ? data.rooms : [];
        this.renderLobby(this.lobbyRooms.length ? 'ready' : 'empty');
      } catch (err) {
        this.lobbyRooms = [];
        this.renderLobby('error', String(err?.message || err));
      } finally {
        this.lobbyLoading = false;
      }
    }
    renderLobby(state = 'ready', details = '') {
      const status = $('lobbyStatus');
      const list = $('lobbyList');
      if (!status || !list) return;
      if (state === 'loading') status.textContent = 'Finding rooms...';
      else if (state === 'empty') status.textContent = 'No public rooms right now.';
      else if (state === 'error') status.textContent = `Lobby unavailable: ${details}`;
      else status.textContent = `${this.lobbyRooms.length} room${this.lobbyRooms.length === 1 ? '' : 's'} online`;
      list.innerHTML = '';
      if (state !== 'ready') return;
      for (const room of this.lobbyRooms) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lobby-room';
        const code = String(room.roomCode || '').toUpperCase().slice(0, CONFIG.ROOM_CODE_LENGTH);
        const host = escapeHtml(room.hostName || 'Host');
        const peerCount = Number(room.peerCount || 0);
        const maxPeers = Number(room.maxPeers || 0);
        btn.innerHTML = `<span>${host}</span><strong>${escapeHtml(code)}</strong><em>${peerCount}/${maxPeers || '?'} players</em>`;
        btn.onclick = () => this.joinRoom(code);
        list.appendChild(btn);
      }
    }

    startLocal() {
      this.readMenuName();
      this.closeNetwork();
      this.mode = 'local';
      this.isHost = true;
      this.roomCode = null;
      this.resetGame();
      this.createHuman(this.myId, this.playerName, CONFIG.COLORS[0]);
      const bots = this.selectedBotCount();
      for (let i = 0; i < bots; i++) this.addBot();
      this.startRound();
      this.showGameUi();
      this.toast('Paint the most tiles before time runs out.');
    }
    resetNetworkIdentity() {
      this.myId = uid('me');
      this.hostId = null;
      this.lastClientHelloAt = 0;
    }
    async startHost() {
      this.readMenuName();
      this.closeNetwork();
      this.resetNetworkIdentity();
      const attempt = ++this.networkAttempt;
      this.isHost = true;
      this.roomCode = null;
      this.resetGame();
      this.showModal('Connecting…', 'Creating a room on the signaling server.', 'The match and bots will start after signaling connects.');
      try {
        await this.openNetwork(null, true);
        if (attempt !== this.networkAttempt) return;
        this.mode = 'host';
        this.isHost = true;
        this.resetGame();
        this.createHuman(this.myId, this.playerName, CONFIG.COLORS[0]);
        this.roundActive = false;
        this.showGameUi();
        this.showRoomBadge(this.roomCode);
        this.showRoomFlash(this.roomCode);
        this.hideModal();
        this.showWaitingBanner();
        this.sendFullSnapshot();
        this.toast(`Room ${this.roomCode} is ready. Press Start when everyone is in.`, 5200);
      } catch (err) {
        if (attempt !== this.networkAttempt || /cancel/i.test(String(err?.message || err))) return;
        this.closeNetwork();
        this.mode = 'menu';
        this.isHost = false;
        this.roomCode = null;
        this.players.clear();
        this.bots.clear();
        this.paint.clear(true);
        this.hideRoomBadge();
        $('menu').classList.remove('hidden');
        $('hud').classList.add('hidden');
        $('controls').classList.add('hidden');
        $('minimap').classList.add('hidden');
        $('touchControls').classList.add('hidden');
        this.showModal(
          'Signaling unavailable',
          'Could not start a hosted room. No bots were started.',
          `${String(err?.message || err)}\n\nCheck that the Render signaling service is deployed and its /healthz endpoint is healthy.`,
          'Back to menu'
        );
      }
    }
    startHostedRound() {
      if (!this.isHost || this.mode !== 'host') return;
      if (this.roundActive && !this.roundOver) return;
      if (this.bots.size === 0) {
        for (let i = 0; i < this.selectedBotCount(); i++) this.addBot();
      }
      this.startRound();
      this.sendRoundStartSnapshot();
      this.updateHostControls();
    }
    async joinRoom(codeOverride = null) {
      this.readMenuName();
      const code = String(codeOverride || $('roomInput').value).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CONFIG.ROOM_CODE_LENGTH);
      if (!code) { this.toast('Enter a room code first.'); return; }
      $('roomInput').value = code;
      this.closeNetwork();
      this.resetNetworkIdentity();
      this.mode = 'client';
      this.isHost = false;
      this.roomCode = code;
      this.lastHostJoinNudgeAt = 0;
      this.lastHostJoinRefreshAt = 0;
      this.lastHostRenegotiateAt = 0;
      this.joinWaitStartedAt = now();
      this.players.clear();
      this.bots.clear();
      this.paint.clear(true);
      this.showGameUi();
      this.showRoomBadge(code);
      this.showModal('Connecting…', `Joining room ${code}.`, '');
      try {
        await this.openNetwork(code, false);
        this.toast('Connected to signaling. Waiting for host WebRTC data channel…', 4200);
      } catch (err) {
        this.hideModal();
        this.toast(`Could not join ${code}: ${String(err?.message || err)}`, 5200);
        this.leaveToMenu(false);
      }
    }
    async openNetwork(room, isHost) {
      this.signal = new FlexibleSignal(CONFIG.SIGNALING_URL, this.myId, this.playerName, this.toasts);
      this.signal.on('status', (s) => this.updateModal(s.title, s.text, s.details));
      const connectedRoom = await this.signal.connect(room, isHost);
      this.roomCode = connectedRoom || this.signal.room || room;
      this.mesh = new PeerMesh(this, this.signal, isHost);
      this.mesh.on('message', ({ from, msg }) => this.onPeerMessage(from, msg));
      this.mesh.on('open', (id) => {
        this.toasts.clear(/Connected to signaling|Waiting for host|WebRTC/i);
        this.toast(isHost ? 'Friend connected!' : 'Connected to host.');
        this.juice.join();
        if (!isHost) this.hideModal();
        this.updateNetStatus();
      });
      this.mesh.on('close', (id) => {
        if (isHost) this.removePlayer(id);
        else this.scheduleClientReconnect();
        this.updateNetStatus();
      });
      this.signal.startPolling();
      if (!isHost) this.nudgeHostJoin(true);
      this.updateNetStatus();
    }
    closeNetwork() {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      if (!this.isHost) this.closeClientRoomPeer();
      this.closeHostedRoom();
      this.mesh?.close();
      this.mesh = null;
      this.signal?.close();
      this.signal = null;
    }
    closeHostedRoom() {
      if (!this.isHost || !this.roomCode || !this.myId || !window.fetch) return;
      try {
        fetch(`${CONFIG.SIGNALING_URL}/rooms/${encodeURIComponent(this.roomCode)}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hostPeerId: this.myId }),
          keepalive: true
        }).catch(() => {});
      } catch (_) {}
    }
    closeClientRoomPeer() {
      if (this.isHost || !this.roomCode || !this.myId || !window.fetch) return;
      try {
        fetch(`${CONFIG.SIGNALING_URL}/rooms/${encodeURIComponent(this.roomCode)}/signals`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: this.myId,
            to: this.signal?.hostPeerId || '*',
            kind: 'bye',
            payload: { peerId: this.myId }
          }),
          keepalive: true
        }).catch(() => {});
      } catch (_) {}
    }
    sendClientHello(force = false) {
      if (this.isHost || this.mode !== 'client' || !this.mesh) return;
      const t = now();
      if (!force && t - this.lastClientHelloAt < 900) return;
      this.lastClientHelloAt = t;
      this.mesh.broadcast({ type: 'hello', id: this.myId, name: this.playerName });
      this.mesh.broadcast({ type: 'request-full' });
    }
    nudgeHostJoin(force = false) {
      if (this.isHost || this.mode !== 'client' || !this.signal?.connected || !this.signal.hostPeerId) return;
      const t = now();
      if (!force && t - this.lastHostJoinNudgeAt < 1400) return;
      this.lastHostJoinNudgeAt = t;
      const payload = {
        peerId: this.myId,
        displayName: this.playerName,
        name: this.playerName
      };
      this.signal.sendSignal(this.signal.hostPeerId, 'join', payload);
      if (force || t - this.lastHostJoinRefreshAt > 3200) {
        this.lastHostJoinRefreshAt = t;
        this.signal.refreshHttpJoin()
          .then(() => {
            if (this.mode === 'client' && this.mesh?.countOpen() === 0) {
              this.signal.sendSignal('*', 'join', payload);
            }
          })
          .catch(() => {});
      }
      const stuckFor = t - (this.joinWaitStartedAt || t);
      if (stuckFor > 4200 && t - this.lastHostRenegotiateAt > 4200) {
        this.lastHostRenegotiateAt = t;
        this.mesh?.resetUnopenedPeers();
        this.signal.sendSignal(this.signal.hostPeerId, 'renegotiate', payload);
        this.signal.sendSignal('*', 'renegotiate', payload);
      }
    }
    scheduleClientReconnect() {
      if (this.isHost || this.mode !== 'client' || !this.roomCode || this.reconnectTimer || this.reconnecting) return;
      const room = this.roomCode;
      this.showModal('Reconnecting...', `Trying to rejoin room ${room}.`, 'The game is keeping your place while WebRTC recovers.');
      this.reconnectTimer = setTimeout(async () => {
        this.reconnectTimer = null;
        if (this.mode !== 'client' || this.isHost || this.roomCode !== room) return;
        this.reconnecting = true;
        try {
          this.closeNetwork();
          this.mode = 'client';
          this.isHost = false;
          this.roomCode = room;
          this.showRoomBadge(room);
          await this.openNetwork(room, false);
          this.toast('Reconnected to host.', 2200);
        } catch (err) {
          this.updateModal('Reconnect failed', `Could not rejoin room ${room}.`, String(err?.message || err));
        } finally {
          this.reconnecting = false;
        }
      }, 1400);
    }
    leaveToMenu(close = true) {
      this.networkAttempt++;
      if (close) this.closeNetwork();
      this.mode = 'menu';
      this.isHost = false;
      this.roomCode = null;
      this.hostId = null;
      $('menu').classList.remove('hidden');
      $('hud').classList.add('hidden');
      $('controls').classList.add('hidden');
      $('minimap').classList.add('hidden');
      $('touchControls').classList.add('hidden');
      this.hideModal();
      this.hideRoomBadge();
      this.hideRoomLobbyOverlay();
      this.players.clear();
      this.bots.clear();
      this.particles = [];
      this.floaters = [];
      this.shockwaves = [];
      this.ripples = [];
      this.confetti = [];
      this.speedLines = [];
      this.paint.clear(true);
      this.refreshLobby(false);
    }
    showGameUi() {
      $('menu').classList.add('hidden');
      $('hud').classList.remove('hidden');
      $('controls').classList.remove('hidden');
      $('minimap').classList.remove('hidden');
      $('touchControls').classList.remove('hidden');
      $('addBotBtn').classList.toggle('hidden', !this.isHost);
      this.updateHostControls();
      this.updateNetStatus();
      this.updateHud(true);
      this.updateRoomLobbyOverlay();
    }
    updateHostControls() {
      const start = $('startRoundBtn');
      if (start) start.classList.add('hidden');
      $('addBotBtn').classList.toggle('hidden', !(this.isHost && this.mode === 'host' && !this.roundActive && !this.roundOver));
      this.updateRoomLobbyOverlay();
    }
    showRoomBadge(code) {
      const el = $('roomBadge');
      el.classList.remove('hidden');
      el.parentElement?.classList.add('room-visible');
      el.querySelector('span').textContent = code;
    }
    showRoomFlash(code) {
      const el = $('roomFlash');
      el.querySelector('strong').textContent = code;
      el.classList.remove('hidden');
      el.querySelector('.room-flash-card').style.animation = 'none';
      void el.offsetWidth;
      el.querySelector('.room-flash-card').style.animation = '';
      setTimeout(() => el.classList.add('hidden'), 2900);
    }
    hideRoomBadge() {
      const el = $('roomBadge');
      el.classList.add('hidden');
      el.parentElement?.classList.remove('room-visible');
    }
    showModal(title, text, details, cancelLabel = 'Cancel') {
      $('modal').classList.remove('hidden');
      $('modalCancel').textContent = cancelLabel;
      this.updateModal(title, text, details);
    }
    updateModal(title, text, details = '') {
      $('modalTitle').textContent = title || '';
      $('modalText').textContent = text || '';
      $('modalDetails').textContent = details || '';
    }
    hideModal() {
      $('modal').classList.add('hidden');
      $('modalCancel').textContent = 'Cancel';
    }
    toggleFullscreen() {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    }
    updateNetStatus() {
      let text = 'Local';
      if (this.mode === 'host') text = `Host · ${this.mesh?.countOpen() || 0} friend${(this.mesh?.countOpen() || 0) === 1 ? '' : 's'}`;
      if (this.mode === 'client') text = this.mesh?.countOpen() ? 'Connected · WebRTC' : 'Waiting for host';
      if (this.mode === 'host') {
        const open = this.mesh?.countOpen() || 0;
        text = `${this.roundActive ? 'Live' : 'Lobby'} - ${open} friend${open === 1 ? '' : 's'}`;
      }
      if (this.mode === 'client') text = this.mesh?.countOpen() ? (this.roundActive ? 'Connected - WebRTC' : 'Waiting for start') : 'Reconnecting...';
      $('netStatus').textContent = text;
      if (this.roomCode && this.mode !== 'menu' && this.mode !== 'local') this.showRoomBadge(this.roomCode);
      else if (!this.roomCode || this.mode === 'local') this.hideRoomBadge();
      this.updateRoomLobbyOverlay();
    }

    resetGame() {
      this.players.clear();
      this.bots.clear();
      this.nextCode = 1;
      this.matchTime = CONFIG.ROUND_SECONDS;
      this.roundActive = false;
      this.roundOver = false;
      this.roundId = 0;
      this.paintRoundId = 0;
      this.paintResetRoundId = 0;
      this.roundOverTimer = 0;
      this.winner = null;
      this.particles = [];
      this.floaters = [];
      this.shockwaves = [];
      this.ripples = [];
      this.roundFlash = null;
      this.cameraPulse = 0;
      this.confetti = [];
      this.speedLines = [];
      this.lastLeaderCode = 0;
      this.lastLeadAnnounceAt = 0;
      this.lastCountdownSecond = null;
      this.lastStreakText = '';
      this.paint.clear(false);
    }
    startRound() {
      this.roundId = (this.roundId || 0) + 1;
      this.paint.clear(true);
      this.paintRoundId = this.roundId;
      this.paintResetRoundId = this.roundId;
      this.accumPaintNet = 0;
      this.accumFullGrid = 0;
      this.matchTime = CONFIG.ROUND_SECONDS;
      this.roundActive = true;
      this.roundOver = false;
      this.roundOverTimer = 0;
      this.winner = null;
      this.centerBanner = null;
      this.roundFlash = null;
      this.cameraPulse = 0;
      this.particles = [];
      this.floaters = [];
      this.shockwaves = [];
      this.ripples = [];
      this.confetti = [];
      this.speedLines = [];
      this.hideRoomLobbyOverlay();
      let i = 0;
      for (const p of this.players.values()) {
        this.spawnPlayer(p, i++);
        p.alive = true;
        p.respawn = 0;
        p.boost = 0.75;
        p.combo = 0;
        p.streak = 0;
        p.splatStreak = 0;
        p.lastSplatAt = 0;
        this.paint.paintCircle(p.x, p.y, 88, p.code, 1, 2.6);
      }
      this.announceRoundStart(true);
      this.toast('Round start! Claim everything.', 1800);
      this.updateHostControls();
    }
    announceRoundStart(localHost = false) {
      this.lastCountdownSecond = null;
      this.centerBanner = {
        title: 'GO!',
        subtitle: localHost ? 'Paint everything' : 'Round live',
        color: '#2ee6b8',
        life: 1.15,
        maxLife: 1.15,
        kind: 'go'
      };
      this.juice.roundStart();
    }
    showWaitingBanner() {
      if (this.centerBanner?.title === 'Room ready') this.centerBanner = null;
      this.updateRoomLobbyOverlay();
    }
    shouldShowRoomLobby() {
      return this.mode !== 'menu' && this.mode !== 'local' && !!this.roomCode && !this.roundActive && !this.roundOver;
    }
    updateRoomLobbyOverlay() {
      const overlay = $('roomLobbyOverlay');
      if (!overlay) return;
      const show = this.shouldShowRoomLobby();
      const humanCount = Math.max(1, Array.from(this.players.values()).filter(p => !p.isBot).length);
      const winnerName = this.winner?.name || 'Winner';
      const key = [show, this.roomCode || '', humanCount, this.isHost, this.mode, this.roundOver, winnerName].join('|');
      if (key === this.lastRoomOverlayKey) return;
      this.lastRoomOverlayKey = key;
      overlay.classList.toggle('hidden', !show);
      const touch = $('touchControls');
      if (touch && this.mode !== 'menu') touch.classList.toggle('hidden', show);
      if (!show) return;

      $('lobbyRoomCode').textContent = this.roomCode || '---';
      $('lobbyPlayerCount').textContent = `${humanCount} player${humanCount === 1 ? '' : 's'} connected`;
      $('lobbyStartBtn').classList.toggle('hidden', !(this.isHost && this.mode === 'host'));
      if (this.roundOver) {
        $('lobbyRoomText').textContent = this.isHost
          ? `${winnerName} wins. Next round starts automatically.`
          : `${winnerName} wins. Next round starts automatically.`;
      } else {
        $('lobbyRoomText').textContent = this.isHost
          ? 'Press Start when everyone has joined.'
          : 'You are in the room. Waiting for the host to start.';
      }
    }
    hideRoomLobbyOverlay() {
      this.lastRoomOverlayKey = '';
      $('roomLobbyOverlay')?.classList.add('hidden');
      if (this.mode !== 'menu') $('touchControls')?.classList.remove('hidden');
    }
    createHuman(id, name, color) {
      const p = this.makePlayer(id, name, color, false);
      this.players.set(id, p);
      this.spawnPlayer(p, this.players.size - 1);
      return p;
    }
    makePlayer(id, name, color, isBot = false) {
      const code = this.nextCode++;
      this.paint.ensurePalette(code, color);
      return {
        id, code, name: safeName(name, isBot ? 'Bot' : 'Painter'), color,
        x: CONFIG.WORLD_W / 2, y: CONFIG.WORLD_H / 2,
        vx: 0, vy: 0, r: CONFIG.BASE_RADIUS, targetR: CONFIG.BASE_RADIUS,
        maxSpeed: CONFIG.BASE_SPEED, boost: 0.85, alive: true, respawn: 0,
        input: { x: 0, y: 0, boost: false }, isBot, score: 0, combo: 0,
        streak: 0, momentum: 0, splatStreak: 0, lastSplatAt: 0, lastStreakTier: 0, lastStreakPopAt: 0,
        lastPaintX: 0, lastPaintY: 0, noInputTimer: 0, lastBumpAt: 0,
        wobble: 0, wobbleV: 0, squash: 0, stretch: 0, impactSquash: 0,
        impactX: 0, impactY: 0, impactLife: 0, boostPulse: 0, lastSpeed: 0, hitFlash: 0, roundEndFade: 0,
        blob: null, blobAura: 0, facing: 0, trail: [],
        cosmeticSeed: Math.random() * 1000, lastSparkAt: 0, lastWallAt: 0
      };
    }
    spawnPlayer(p, index = 0) {
      const cols = Math.ceil(Math.sqrt(Math.max(4, this.players.size || 4)));
      const rows = cols;
      const gx = index % cols;
      const gy = Math.floor(index / cols) % rows;
      p.x = (gx + 0.5) * CONFIG.WORLD_W / cols + rand(-70, 70);
      p.y = (gy + 0.5) * CONFIG.WORLD_H / rows + rand(-55, 55);
      p.x = clamp(p.x, 80, CONFIG.WORLD_W - 80);
      p.y = clamp(p.y, 80, CONFIG.WORLD_H - 80);
      p.vx = p.vy = 0;
      p.lastPaintX = p.x;
      p.lastPaintY = p.y;
      p.wobble = p.wobbleV = p.squash = p.stretch = p.impactSquash = p.boostPulse = p.lastSpeed = p.hitFlash = 0;
      p.impactX = p.impactY = p.impactLife = p.roundEndFade = 0;
      p.momentum = 0;
      p.streak = Math.min(p.streak || 0, CONFIG.STREAK_TIER);
      p.blob = null;
      p.blobAura = 0;
      p.facing = 0;
      p.trail = [{ x: p.x, y: p.y, r: p.r, t: this.frameNow || now(), life: 260, boost: 0 }];
    }
    addBotButton() {
      if (!this.isHost) return;
      if (this.roundActive || this.roundOver) { this.toast('Bots can join before a round starts.'); return; }
      if (this.bots.size >= CONFIG.MAX_BOTS) { this.toast('Bot cap reached.'); return; }
      this.addBot();
      this.toast('Bot added.');
      this.sendFullSnapshot();
    }
    addBot() {
      const names = ['Splotch', 'Rollio', 'Blobert', 'Inky', 'Zoomi', 'Bumper', 'Dotty', 'Huey', 'Splash', 'Mango'];
      const id = uid('bot');
      const color = CONFIG.COLORS[(this.players.size) % CONFIG.COLORS.length];
      const p = this.makePlayer(id, pick(names), color, true);
      this.players.set(id, p);
      this.spawnPlayer(p, this.players.size - 1);
      this.bots.set(id, new BotBrain(p));
      this.paint.paintCircle(p.x, p.y, 74, p.code, 1, 2.1);
      return p;
    }
    removePlayer(id) {
      const p = this.players.get(id);
      if (!p) return;
      this.players.delete(id);
      this.bots.delete(id);
      this.removeRoomPeer(id);
      this.toast(`${p.name} left the room.`);
      this.sendFullSnapshot();
    }
    removeRoomPeer(id) {
      if (!this.isHost || !this.roomCode || !id || id === this.myId || !window.fetch) return;
      try {
        fetch(`${CONFIG.SIGNALING_URL}/rooms/${encodeURIComponent(this.roomCode)}/peers/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hostPeerId: this.myId }),
          keepalive: true
        }).catch(() => {});
      } catch (_) {}
    }

    onPeerMessage(from, msg) {
      if (this.isHost) {
        if (msg.type === 'hello') {
          if (!this.players.has(from) && this.players.size < CONFIG.MAX_PLAYERS) {
            const color = CONFIG.COLORS[(this.players.size) % CONFIG.COLORS.length];
            const p = this.createHuman(from, msg.name || 'Friend', color);
            if (this.roundActive) this.paint.paintCircle(p.x, p.y, 92, p.code, 1, 2.5);
            this.toast(`${p.name} joined!`);
            this.sendFullSnapshot();
          } else {
            this.sendFullSnapshotTo(from);
          }
        } else if (msg.type === 'input') {
          const p = this.players.get(from);
          if (p && !p.isBot) {
            p.input = {
              x: clamp(Number(msg.x) || 0, -1, 1),
              y: clamp(Number(msg.y) || 0, -1, 1),
              boost: !!msg.boost
            };
          }
        } else if (msg.type === 'request-full') {
          this.sendFullSnapshotTo(from);
        }
      } else {
        if (msg.type === 'snapshot') this.applySnapshot(msg);
        else if (msg.type === 'paint') this.applyPaintSnapshot(msg);
        else if (msg.type === 'event') this.applyEvent(msg.event);
        else if (msg.type === 'host-hello') this.hostId = msg.id;
      }
    }
    sendFullSnapshotTo(id) {
      if (!this.mesh) return;
      this.mesh.send(id, this.buildSnapshot(true));
      this.mesh.send(id, this.buildPaintSnapshot(true, false), 'state');
    }
    sendFullSnapshot() {
      if (!this.mesh) return;
      this.mesh.broadcast(this.buildSnapshot(true));
    }
    sendRoundStartSnapshot() {
      if (!this.mesh) return;
      this.mesh.broadcast(this.buildSnapshot(true));
      this.mesh.broadcast(this.buildPaintSnapshot(false), 'control');
      this.broadcastEventSafe({ type: 'round-start', roundId: this.roundId });
    }
    broadcastEventSafe(event) {
      if (!this.mesh || !event || typeof event !== 'object') return;
      try {
        this.mesh.broadcast({ type: 'event', event });
      } catch (err) {
        console.warn('Dropped visual event', err);
      }
    }
    buildSnapshot(full = false) {
      const players = Array.from(this.players.values()).map(p => ({
        id: p.id, code: p.code, name: p.name, color: p.color,
        x: Math.round(p.x), y: Math.round(p.y), vx: Math.round(p.vx), vy: Math.round(p.vy),
        r: Math.round(p.r * 10) / 10, boost: Math.round(p.boost * 100) / 100,
        alive: p.alive, respawn: Math.round(p.respawn * 100) / 100,
        isBot: p.isBot, score: this.paint.getCells(p.code),
        boosting: !!(p.input?.boost && p.boost > 0.05),
        streak: Math.round(p.streak || 0), splatStreak: p.splatStreak || 0
      }));
      return {
        type: 'snapshot',
        version: CONFIG.VERSION,
        t: Math.round(performance.now()),
        full,
        room: this.roomCode,
        roundId: this.roundId,
        matchTime: Math.round(this.matchTime * 100) / 100,
        roundActive: this.roundActive,
        roundOver: this.roundOver,
        winner: this.winner ? { code: this.winner.code, name: this.winner.name } : null,
        players
      };
    }
    buildPaintSnapshot(full = false, consume = true) {
      const grid = full ? this.paint.fullSnapshot() : undefined;
      const deltas = full ? undefined : this.paint.consumeNetworkDeltas();
      if (full && consume) this.paint.consumeNetworkDeltas();
      return {
        type: 'paint',
        version: CONFIG.VERSION,
        t: Math.round(performance.now()),
        full,
        room: this.roomCode,
        roundId: this.roundId,
        grid,
        deltas
      };
    }
    clearClientPaintForRound(roundId) {
      if (!roundId || this.paintRoundId === roundId || this.paintResetRoundId === roundId) return;
      this.paint.clear(true);
      this.paintRoundId = roundId;
      this.paintResetRoundId = roundId;
      this.particles = [];
      this.floaters = [];
      this.shockwaves = [];
      this.ripples = [];
      this.speedLines = [];
      for (const p of this.players.values()) p.trail = [];
    }
    applySnapshot(msg) {
      const wasRoundActive = this.roundActive;
      const wasRoundOver = this.roundOver;
      const incomingRoundId = Number.isFinite(Number(msg.roundId)) ? Number(msg.roundId) : this.roundId;
      const startsFreshRound = !!msg.roundActive && !msg.roundOver
        && (incomingRoundId !== this.roundId || (!wasRoundActive && wasRoundOver));
      if (startsFreshRound) {
        this.clearClientPaintForRound(incomingRoundId);
        this.announceRoundStart(false);
      }
      const becameRoundOver = !wasRoundOver && !!msg.roundOver;
      this.roundId = incomingRoundId;
      this.matchTime = msg.matchTime ?? this.matchTime;
      this.roundActive = !!msg.roundActive;
      this.roundOver = !!msg.roundOver;
      this.winner = msg.winner;
      const seen = new Set();
      if (Array.isArray(msg.players)) {
        for (const sp of msg.players) {
          seen.add(sp.id);
          let p = this.players.get(sp.id);
          let firstNetworkState = false;
          if (!p) {
            p = this.makePlayer(sp.id, sp.name, sp.color, !!sp.isBot);
            p.code = sp.code;
            this.nextCode = Math.max(this.nextCode, p.code + 1);
            this.paint.ensurePalette(p.code, p.color);
            this.players.set(sp.id, p);
            firstNetworkState = true;
          }
          firstNetworkState = firstNetworkState || p.netSeenAt === undefined;
          const wasAlive = p.alive;
          p.code = sp.code;
          p.name = sp.name;
          p.color = sp.color;
          p.targetX = sp.x; p.targetY = sp.y; p.targetVx = sp.vx; p.targetVy = sp.vy;
          p.netSeenAt = performance.now();
          if (firstNetworkState || wasAlive !== sp.alive || (!sp.alive && p.id === this.myId)) {
            p.x = sp.x; p.y = sp.y; p.vx = sp.vx; p.vy = sp.vy;
          } else if (p.id === this.myId) {
            const error = dist2(p.x, p.y, sp.x, sp.y);
            const correction = error > 360 * 360 ? 0.42 : error > 32 * 32 ? 0.035 : 0.01;
            p.x = lerp(p.x, sp.x, correction);
            p.y = lerp(p.y, sp.y, correction);
            p.vx = lerp(p.vx, sp.vx, 0.08);
            p.vy = lerp(p.vy, sp.vy, 0.08);
          } else {
            p.vx = lerp(p.vx, sp.vx, 0.2);
            p.vy = lerp(p.vy, sp.vy, 0.2);
          }
          p.r = sp.r; p.boost = sp.boost;
          p.alive = sp.alive; p.respawn = sp.respawn; p.isBot = sp.isBot; p.score = sp.score || 0;
          if (!p.alive) p.trail = [];
          p.streak = Number.isFinite(Number(sp.streak)) ? Number(sp.streak) : Math.max(0, (p.streak || 0) * 0.94);
          p.splatStreak = sp.splatStreak || 0;
          p.input = { ...(p.input || { x: 0, y: 0, boost: false }), boost: !!sp.boosting };
        }
      }
      for (const id of Array.from(this.players.keys())) if (!seen.has(id)) this.players.delete(id);
      if (this.mode === 'client' && !this.players.has(this.myId)) this.sendClientHello();
      if (becameRoundOver && this.winner) {
        this.showRoundBanner(this.winner);
        this.juice.roundEnd();
        for (const p of this.players.values()) {
          if (p.code !== this.winner.code && p.name !== this.winner.name) p.roundEndFade = 1;
        }
      } else if (!this.roundActive && !this.roundOver && this.mode !== 'menu') {
        this.showWaitingBanner();
      }
      if (this.roundActive && !this.roundOver) {
        if (!['go'].includes(this.centerBanner?.kind)) this.centerBanner = null;
        this.hideRoomLobbyOverlay();
      } else {
        this.updateRoomLobbyOverlay();
      }
      this.hideModal();
    }
    applyPaintSnapshot(msg) {
      const paintRoundId = Number.isFinite(Number(msg?.roundId)) ? Number(msg.roundId) : this.roundId;
      const knownPaintRoundId = Math.max(this.roundId || 0, this.paintRoundId || 0);
      if (paintRoundId < knownPaintRoundId) return;
      if (paintRoundId > knownPaintRoundId && !msg?.full) return;
      if (msg?.full && msg.grid) {
        this.paint.applyFull(msg.grid);
        this.paintRoundId = paintRoundId;
        this.paintResetRoundId = Math.max(this.paintResetRoundId || 0, paintRoundId);
      }
      if (msg?.deltas) {
        this.paint.applyDeltas(msg.deltas);
        this.paintRoundId = paintRoundId;
      }
    }
    applyEvent(event) {
      if (!event) return;
      if (event.type === 'round-start') {
        this.announceRoundStart(false);
      } else if (event.type === 'splat') {
        const p = this.players.get(event.victim) || { x: event.x, y: event.y, color: '#fff' };
        const victim = this.players.get(event.victim);
        if (victim) {
          victim.alive = false;
          victim.respawn = Math.max(victim.respawn || 0, 1.35);
          victim.vx = 0;
          victim.vy = 0;
          victim.trail = [];
          victim.impactSquash = Math.max(victim.impactSquash || 0, 0.34);
        }
        const killer = this.players.get(event.killer);
        if (killer) killer.hitFlash = Math.max(killer.hitFlash || 0, 0.32);
        const x = Number(event.x) || p.x || CONFIG.WORLD_W / 2;
        const y = Number(event.y) || p.y || CONFIG.WORLD_H / 2;
        this.burst(x, y, event.color || p.color, 42, 1.35);
        this.sparkBurst(x, y, event.killerColor || event.color || p.color, this.useLowFx() ? 10 : 18, 1.1);
        this.shockwave(x, y, event.killerColor || event.color || p.color, 92);
        const own = event.victim === this.myId || event.killer === this.myId;
        const killerName = event.killerName || this.players.get(event.killer)?.name || 'Painter';
        const victimName = event.victimName || this.players.get(event.victim)?.name || 'Painter';
        if (event.streak >= 2) this.floatText(x, y - 48, `${event.streak}x SPLAT!`, event.killerColor || event.color || '#ffd166', 1.15);
        if (own) this.toast(event.victim === this.myId ? `You got splatted by ${killerName}.` : `You splatted ${victimName}!`, 1500);
        this.juice.splat(own ? 1 : 0.65, event.victim === this.myId);
        this.cameraPulse = Math.max(this.cameraPulse, own ? 1 : 0.72);
      }
    }

    loop(t) {
      const rawDt = Math.min(0.05, (t - this.lastTick) / 1000 || 0.016);
      this.lastTick = t;
      this.frameNow = t;
      this.fps = lerp(this.fps, 1 / Math.max(0.001, rawDt), 0.04);
      this.dprCheckTimer += rawDt;
      if (this.quality === 'auto' && this.dprCheckTimer >= 1.4) {
        this.dprCheckTimer = 0;
        const targetDpr = this.getTargetDpr();
        if (Math.abs(targetDpr - this.pixelRatio) > 0.05) this.resize();
      }
      this.juice.tick(rawDt);
      this.cameraPulse = Math.max(0, this.cameraPulse - rawDt * 4);
      if (this.centerBanner) {
        this.centerBanner.life -= rawDt;
        if (this.centerBanner.life <= 0) this.centerBanner = null;
      }
      if (this.roundFlash) {
        this.roundFlash.life -= rawDt;
        if (this.roundFlash.life <= 0) this.roundFlash = null;
      }

      if (this.mode !== 'menu') {
        if (this.isHost) this.tickHost(rawDt);
        else this.tickClient(rawDt);
        this.tickRoundDrama(rawDt);
        this.tickParticles(rawDt);
      } else {
        this.juice.boost(false);
      }
      const paintBudget = this.quality === 'low' ? 12000 : this.quality === 'medium' ? 26000 : 52000;
      this.paint.updateCanvas(paintBudget);
      this.render(rawDt);
      this.updateHud();
      requestAnimationFrame((nt) => this.loop(nt));
    }
    tickRoundDrama(dt) {
      if (!this.roundActive || this.roundOver || this.mode === 'menu') return;
      const leader = this.getLeaderCode();
      if (leader) {
        if (!this.lastLeaderCode) {
          this.lastLeaderCode = leader;
        } else if (leader !== this.lastLeaderCode && now() - this.lastLeadAnnounceAt > 1300) {
          const p = Array.from(this.players.values()).find(x => x.code === leader);
          if (p) this.announceLeadChange(p);
          this.lastLeaderCode = leader;
        }
      }
      const sec = Math.ceil(this.matchTime);
      if (sec > 0 && sec <= CONFIG.LOW_TIME_SECONDS && sec !== this.lastCountdownSecond) {
        // The HUD timer already communicates urgency; avoid center-screen
        // countdown cards and shake that obscure late-round movement.
        this.lastCountdownSecond = sec;
      }
    }
    announceLeadChange(p) {
      if (!p || !this.roundActive || this.roundOver) return;
      this.lastLeadAnnounceAt = now();
      this.floatText(p.x, p.y - p.r - 40, p.id === this.myId ? 'YOU LEAD' : 'LEAD', '#ffd166', 0.95);
      if (!this.useLowFx()) {
        this.shockwave(p.x, p.y, '#ffd166', p.r * 2.15);
        this.sparkBurst(p.x, p.y - p.r * 0.45, '#ffd166', this.useMediumFx() ? 4 : 8, 0.55);
      }
      this.juice.leadChange(p.id === this.myId);
      this.toast(p.id === this.myId ? 'You took the lead!' : `${p.name} took the lead!`, 950);
    }
    tickHost(dt) {
      const myInput = this.input.getState();
      const me = this.players.get(this.myId);
      if (me) me.input = myInput;

      if (this.roundOver) {
        this.juice.boost(false);
        this.roundOverTimer = Math.max(0, (this.roundOverTimer || 0) - dt);
        if (this.roundOverTimer <= 0) {
          this.startRound();
          this.sendRoundStartSnapshot();
        } else {
          this.networkHost(dt);
          this.updateHostControls();
          return;
        }
      }

      if (!this.roundActive) {
        this.juice.boost(false);
        this.networkHost(dt);
        this.updateHostControls();
        return;
      }

      this.matchTime -= dt;
      if (this.matchTime <= 0) {
        this.endRound();
        return;
      }

      for (const brain of this.bots.values()) brain.player.input = brain.update(dt, this);
      for (const p of this.players.values()) this.updatePlayer(p, dt);
      this.resolveCollisions(dt);
      this.networkHost(dt);
    }
    tickClient(dt) {
      const s = this.input.getState();
      const me = this.players.get(this.myId);
      if (!me) this.sendClientHello();
      if (me && this.roundActive && !this.roundOver) {
        me.input = s;
        if (me.alive) {
          this.updatePlayer(me, dt);
          this.paint.clearOutgoingDeltas();
        } else {
          this.juice.boost(false);
        }
      }
      this.accumInput += dt;
      if (this.accumInput >= 1 / CONFIG.CLIENT_INPUT_HZ) {
        this.accumInput = 0;
        this.juice.boost(this.roundActive && !this.roundOver && s.boost && Math.hypot(s.x, s.y) > 0.1);
        this.mesh?.broadcast({ type: 'input', x: s.x, y: s.y, boost: s.boost });
      }
      for (const p of this.players.values()) {
        if (p.id !== this.myId) this.smoothNetworkPlayer(p, dt);
      }
      if (this.mesh && this.mesh.countOpen() === 0 && this.mode === 'client') {
        this.nudgeHostJoin();
        // Keep the modal friendly if WebRTC takes longer than signaling.
        this.updateModal('Waiting for host…', 'Signaling is connected. Waiting for the host to create the WebRTC data channel.', 'If this never changes, the signaling server protocol may differ from this prototype. See docs/NETWORKING.md.');
        $('modal').classList.remove('hidden');
      }
    }
    smoothNetworkPlayer(p, dt) {
      if (p.targetX === undefined || !p.alive) return;
      const age = clamp((performance.now() - (p.netSeenAt || performance.now())) / 1000, 0, 0.18);
      const px = clamp(p.targetX + (p.targetVx || 0) * age * 0.72, p.r, CONFIG.WORLD_W - p.r);
      const py = clamp(p.targetY + (p.targetVy || 0) * age * 0.72, p.r, CONFIG.WORLD_H - p.r);
      const blend = 1 - Math.pow(0.00018, dt);
      p.x = lerp(p.x, px, blend);
      p.y = lerp(p.y, py, blend);
      p.vx = lerp(p.vx, p.targetVx || 0, blend);
      p.vy = lerp(p.vy, p.targetVy || 0, blend);
      this.updateJello(p, dt, p.input?.boost && p.boost > 0.05);
      this.updateMotionTrail(p, dt, p.input?.boost && p.boost > 0.05, Math.hypot(p.vx || 0, p.vy || 0));
    }
    updatePlayer(p, dt) {
      if (!p.alive) {
        if (p.id === this.myId) this.juice.boost(false);
        p.respawn -= dt;
        if (p.respawn <= 0) {
          p.alive = true;
          this.spawnPlayer(p, Math.floor(Math.random() * 12));
          p.boost = 0.62;
          this.paint.paintCircle(p.x, p.y, 64, p.code, 1, 1.8);
          this.burst(p.x, p.y, p.color, 20, 0.85);
        }
        return;
      }
      const cells = this.paint.getCells(p.code);
      p.targetR = CONFIG.BASE_RADIUS + Math.min(CONFIG.MAX_RADIUS_BONUS, Math.pow(Math.max(0, cells), 0.43) * 0.25);
      p.r = lerp(p.r, p.targetR, 1 - Math.pow(0.0008, dt));
      p.maxSpeed = CONFIG.BASE_SPEED + Math.min(CONFIG.MAX_AREA_SPEED_BONUS, cells * 0.032) - Math.max(0, p.r - CONFIG.BASE_RADIUS) * 3.6;

      let ix = p.input?.x || 0, iy = p.input?.y || 0;
      const inputMag = Math.hypot(ix, iy);
      p.noInputTimer = inputMag > 0.05 ? 0 : p.noInputTimer + dt;
      const wantsBoost = p.input?.boost && p.boost > 0.05 && inputMag > 0.1;
      const boostMul = wantsBoost ? CONFIG.BOOST_MULT : 1;
      if (wantsBoost) p.boost = Math.max(0, p.boost - CONFIG.BOOST_DRAIN * dt);
      else p.boost = Math.min(1, p.boost + CONFIG.BOOST_REGEN * dt);

      const beforeX = p.x;
      const beforeY = p.y;
      const max = p.maxSpeed * boostMul;
      if (inputMag >= 0.08) {
        const steer = 1 - Math.exp(-CONFIG.STEER_RESPONSE * dt);
        p.vx = lerp(p.vx, ix * max, steer);
        p.vy = lerp(p.vy, iy * max, steer);
      } else {
        const friction = Math.exp(-CONFIG.FRICTION * dt);
        p.vx *= friction;
        p.vy *= friction;
      }
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > max) {
        p.vx = p.vx / speed * max;
        p.vy = p.vy / speed * max;
      }
      p.momentum = lerp(p.momentum || 0, clamp(speed / Math.max(1, max), 0, 1), 1 - Math.exp(-6 * dt));
      const streakDrain = CONFIG.STREAK_DECAY + (inputMag < 0.05 ? 18 : 0) + (this.roundActive ? 0 : 30);
      p.streak = Math.max(0, (p.streak || 0) - streakDrain * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      let wallHit = 0;
      if (p.x < p.r) { p.x = p.r; p.vx = Math.abs(p.vx) * 0.28; wallHit = 1; }
      if (p.y < p.r) { p.y = p.r; p.vy = Math.abs(p.vy) * 0.28; wallHit = 1; }
      if (p.x > CONFIG.WORLD_W - p.r) { p.x = CONFIG.WORLD_W - p.r; p.vx = -Math.abs(p.vx) * 0.28; wallHit = 1; }
      if (p.y > CONFIG.WORLD_H - p.r) { p.y = CONFIG.WORLD_H - p.r; p.vy = -Math.abs(p.vy) * 0.28; wallHit = 1; }
      if (wallHit) {
        const wallForce = Math.max(0.08, speed / 900);
        p.impactSquash = Math.min(0.32, p.impactSquash + wallForce);
        if (p.id === this.myId && speed > 120 && now() - (p.lastWallAt || 0) > 170) {
          p.lastWallAt = now();
          this.juice.wall(wallForce);
          this.sparkBurst(p.x, p.y, p.color, this.useLowFx() ? 5 : 9, clamp(speed / 320, 0.45, 1.2));
        }
      }

      this.updateJello(p, dt, wantsBoost);
      this.updateMotionTrail(p, dt, wantsBoost, speed);

      const paintRadius = p.r * (wantsBoost ? 1.22 : 1.08);
      const gained = this.depositPaintTrail(p, beforeX, beforeY, p.x, p.y, paintRadius, dt, wantsBoost ? 2.05 : 1.55);
      if (p.id === this.myId) {
        this.juice.boost(wantsBoost);
        if (gained > 0) this.juice.paint(gained);
        if (gained > 10) this.juice.convert(gained);
      }
      if (gained > 0) {
        p.boost = Math.min(1, p.boost + gained * CONFIG.BOOST_PAINT_REWARD);
        p.combo += gained;
        const beforeStreak = p.streak || 0;
        p.streak = clamp(beforeStreak + gained * (wantsBoost ? 0.86 : 0.62), 0, CONFIG.STREAK_MAX);
        const tier = Math.floor(p.streak / CONFIG.STREAK_TIER);
        const prevTier = Math.floor(beforeStreak / CONFIG.STREAK_TIER);
        if (p.id === this.myId && tier > prevTier && now() - (p.lastStreakPopAt || 0) > 550) {
          p.lastStreakPopAt = now();
          const labels = ['RUSH', 'SPLASH RUSH', 'MEGA SPLASH'];
          const label = labels[Math.min(labels.length - 1, tier - 1)] || 'RUSH';
          this.floatText(p.x, p.y - p.r - 28, label, p.color, 1 + tier * 0.08);
          this.juice.streak(p.streak);
          if (!this.useLowFx()) {
            this.shockwave(p.x, p.y, p.color, p.r * (1.9 + tier * 0.18));
            this.sparkBurst(p.x, p.y - p.r * 0.3, p.color, 6 + tier * 3, 0.55 + tier * 0.18);
          }
        }
        if (p.id === this.myId && p.combo > 28) {
          this.floatText(p.x, p.y - p.r - 18, `+${p.combo}`, p.color);
          this.juice.combo(p.combo);
          this.sparkBurst(p.x, p.y - p.r * 0.35, p.color, this.useLowFx() ? 5 : 10, clamp(p.combo / 70, 0.55, 1.35));
          p.combo = 0;
        }
      }
      if (wantsBoost && speed > 145 && !this.useLowFx() && Math.random() < (this.useMediumFx() ? 0.16 : 0.28)) {
        this.speedLine(
          p.x - p.vx * rand(0.045, 0.075) + rand(-p.r * 0.22, p.r * 0.22),
          p.y - p.vy * rand(0.045, 0.075) + rand(-p.r * 0.22, p.r * 0.22),
          p.vx,
          p.vy,
          p.color,
          rand(2.2, 5.6),
          rand(0.16, 0.26)
        );
      }
      const movedPaint = Math.hypot(p.x - p.lastPaintX, p.y - p.lastPaintY);
      if (movedPaint > 32 && speed > 40) {
        const droplet = wantsBoost || Math.random() < 0.42;
        this.addParticle(
          p.x - p.vx * 0.03,
          p.y - p.vy * 0.03,
          -p.vx * rand(0.07, 0.11) + rand(-22, 22),
          -p.vy * rand(0.07, 0.11) + rand(-22, 22),
          p.color,
          rand(0.22, 0.48),
          rand(3, p.r * 0.24),
          0.9,
          droplet ? { shape: 'droplet', stretch: rand(1.35, 2.4), glow: 0.2 } : { shape: 'dot', glow: 0.08 }
        );
        if (gained > 0 && !this.useLowFx()) {
          this.addInkRipple(p.x, p.y, p.color, p.r * rand(0.92, wantsBoost ? 1.45 : 1.18), wantsBoost ? 0.52 : 0.38);
          if (wantsBoost || gained > 12) this.sparkBurst(p.x, p.y, p.color, wantsBoost ? 3 : 2, wantsBoost ? 0.75 : 0.45);
        }
        p.lastPaintX = p.x; p.lastPaintY = p.y;
      }
    }
    useLowFx() {
      return this.quality === 'low' || this.reducedMotion || this.saveData || (this.quality === 'auto' && this.fps < 48);
    }
    cosmeticBudget() {
      if (this.quality === 'low') return 0;
      if (this.quality === 'medium') return 1;
      if (this.quality === 'high') return 2;
      return this.fps < 48 ? 1 : 2;
    }
    spawnConversionFlecks(p, samples) {
      const budget = this.cosmeticBudget();
      if (!budget || !Array.isArray(samples) || !samples.length) return;
      const cap = budget === 1 ? CONFIG.CONVERT_FLECK_CAP_MEDIUM : CONFIG.CONVERT_FLECK_CAP_HIGH;
      const count = Math.min(cap, samples.length);
      const speed = Math.hypot(p.vx || 0, p.vy || 0);
      const bx = speed > 12 ? -p.vx / speed : rand(-1, 1);
      const by = speed > 12 ? -p.vy / speed : rand(-1, 1);
      for (let i = 0; i < count; i++) {
        const s = samples[(Math.random() * samples.length) | 0];
        const side = rand(-1, 1);
        const push = rand(36, 96);
        this.addParticle(
          s.x + rand(-7, 7),
          s.y + rand(-7, 7),
          bx * push + side * by * 38 + rand(-18, 18),
          by * push - side * bx * 38 + rand(-18, 18),
          s.oldColor || p.color,
          rand(0.28, 0.48),
          rand(3, 7),
          0.88,
          { shape: 'droplet', stretch: rand(1.3, 2.1), glow: 0.1, gravity: 36, fromColor: s.oldColor || p.color, toColor: p.color, colorMixLife: 0.34 }
        );
      }
    }
    ensureBlobMesh(p) {
      const targetCount = this.useLowFx() ? 8 : this.useMediumFx() ? 10 : 12;
      if (Array.isArray(p.blob) && p.blob.length === targetCount) return;
      p.blob = Array.from({ length: targetCount }, (_, i) => ({
        a: i / targetCount * TAU,
        r: 1,
        v: 0,
        seed: Math.random() * TAU
      }));
    }
    updateBlobMesh(p, dt, boosting) {
      this.ensureBlobMesh(p);
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > 4) p.facing = Math.atan2(p.vy, p.vx);
      const facing = p.facing || 0;
      const impactAngle = Math.atan2(p.impactY || 0, p.impactX || 0);
      const impactLife = p.impactLife || 0;
      const t = now() * 0.0016 + p.code * 0.43;
      for (const node of p.blob) {
        const diff = Math.cos(node.a - facing);
        const side = Math.sin(node.a - facing);
        const impactSide = impactLife ? Math.max(0, Math.cos(node.a - impactAngle - Math.PI)) * impactLife * 0.24 : 0;
        const undulate = Math.sin(t * 2.6 + node.seed) * (CONFIG.BLOB_BREATH + (p.wobble || 0) * 0.045)
          + Math.sin(t * 3.7 - node.seed * 1.4 + node.a * 2) * (0.008 + (boosting ? 0.012 : 0.006));
        const frontStretch = Math.max(0, diff) * ((p.stretch || 0) * 0.46 + (boosting ? 0.04 : 0));
        const rearCompress = Math.max(0, -diff) * ((p.squash || 0) * 0.22 + (p.impactSquash || 0) * 0.2);
        const sidePlump = (1 - diff * diff) * ((p.squash || 0) * 0.08 + (p.wobble || 0) * 0.03);
        const impactKick = Math.max(0, Math.cos(node.a - facing - Math.PI)) * (p.impactSquash || 0) * 0.16;
        const target = clamp(1 + undulate + frontStretch + sidePlump + impactSide - rearCompress - impactKick + side * (p.wobble || 0) * 0.012, 0.76, 1.38);
        node.v += (target - node.r) * CONFIG.BLOB_SPRING * dt;
        node.v *= Math.exp(-CONFIG.BLOB_DAMPING * dt);
        node.r = clamp(node.r + node.v * dt, 0.72, 1.38);
      }
      p.blobAura = lerp(p.blobAura || 0, boosting ? 1 : 0, 1 - Math.exp(-7 * dt));
    }
    traceBlobPath(ctx, p, scale = 1) {
      this.ensureBlobMesh(p);
      const pts = p.blob.map(node => ({
        x: Math.cos(node.a) * p.r * node.r * scale,
        y: Math.sin(node.a) * p.r * node.r * scale
      }));
      const first = pts[0];
      const last = pts[pts.length - 1];
      ctx.beginPath();
      ctx.moveTo((last.x + first.x) * 0.5, (last.y + first.y) * 0.5);
      for (let i = 0; i < pts.length; i++) {
        const cur = pts[i];
        const next = pts[(i + 1) % pts.length];
        ctx.quadraticCurveTo(cur.x, cur.y, (cur.x + next.x) * 0.5, (cur.y + next.y) * 0.5);
      }
      ctx.closePath();
    }
    updateJello(p, dt, boosting) {
      const speed = Math.hypot(p.vx, p.vy);
      const speedDelta = Math.abs(speed - (p.lastSpeed || 0));
      const targetSquash = clamp(speed / 520 * CONFIG.JELLO_SPEED_SQUASH + p.impactSquash, 0, 0.42);
      const targetStretch = clamp(speed / 640 * 0.18 + (boosting ? 0.08 : 0), 0, 0.34);
      p.squash = lerp(p.squash || 0, targetSquash, 1 - Math.exp(-CONFIG.JELLO_STIFFNESS * dt));
      p.stretch = lerp(p.stretch || 0, targetStretch, 1 - Math.exp(-CONFIG.JELLO_STIFFNESS * 0.65 * dt));
      p.impactSquash = Math.max(0, (p.impactSquash || 0) - dt * 2.6);
      p.impactLife = Math.max(0, (p.impactLife || 0) - dt * 3.8);
      p.roundEndFade = Math.max(0, (p.roundEndFade || 0) - dt * 2);
      p.boostPulse = boosting ? Math.min(1, (p.boostPulse || 0) + dt * 5) : Math.max(0, (p.boostPulse || 0) - dt * 4);
      const wobbleTarget = clamp((speedDelta / 320) + p.impactSquash * 1.2 + p.boostPulse * 0.08, 0, 0.7);
      p.wobbleV = (p.wobbleV || 0) + (wobbleTarget - (p.wobble || 0)) * CONFIG.JELLO_STIFFNESS * dt;
      p.wobbleV *= Math.exp(-CONFIG.JELLO_DAMPING * dt);
      p.wobble = clamp((p.wobble || 0) + p.wobbleV * dt, 0, 0.8);
      p.hitFlash = Math.max(0, (p.hitFlash || 0) - dt * 3.2);
      this.updateBlobMesh(p, dt, boosting);
      p.lastSpeed = speed;
    }
    updateMotionTrail(p, dt, boosting = false, speed = 0) {
      if (!p || !p.alive || this.useLowFx()) {
        if (p) p.trail = [];
        return;
      }
      if (!Array.isArray(p.trail)) p.trail = [];
      const t = this.frameNow || now();
      const maxAge = boosting ? 560 : 380;
      while (p.trail.length && t - p.trail[0].t > Math.max(maxAge, p.trail[0].life || maxAge)) p.trail.shift();
      const minDist = boosting ? 6 : 10;
      const last = p.trail[p.trail.length - 1];
      if (!last || dist2(p.x, p.y, last.x, last.y) >= minDist * minDist) {
        p.trail.push({
          x: p.x,
          y: p.y,
          r: p.r,
          t,
          life: boosting ? 520 : 340,
          boost: boosting ? 1 : 0,
          speed: clamp(speed / 460, 0, 1)
        });
      }
      const cap = this.useMediumFx() ? 9 : 14;
      if (p.trail.length > cap) p.trail.splice(0, p.trail.length - cap);
    }

    depositPaintTrail(p, x0, y0, x1, y1, radius, dt, powerScale) {
      const d = Math.hypot(x1 - x0, y1 - y0);
      const steps = clamp(Math.ceil(d / CONFIG.TRAIL_DEPOSIT_STEP), 1, 14);
      const stampDt = Math.max(dt / Math.min(steps, 3), 1 / 75);
      const budget = this.cosmeticBudget();
      const conversionSamples = budget ? [] : null;
      const sampleLimit = budget === 1 ? CONFIG.CONVERT_FLECK_CAP_MEDIUM : CONFIG.CONVERT_FLECK_CAP_HIGH;
      let gained = 0;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        gained += this.paint.paintCircle(lerp(x0, x1, t), lerp(y0, y1, t), radius, p.code, stampDt, powerScale, conversionSamples, sampleLimit);
      }
      this.spawnConversionFlecks(p, conversionSamples);
      return gained;
    }
    resolveCollisions(dt) {
      const arr = Array.from(this.players.values()).filter(p => p.alive);
      for (let i = 0; i < arr.length; i++) {
        const a = arr[i];
        for (let j = i + 1; j < arr.length; j++) {
          const b = arr[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 1;
          const min = a.r + b.r;
          const padding = CONFIG.SPLAT_CONTACT_PADDING || 0;
          if (d >= min + padding) continue;
          const nx = dx / d, ny = dy / d;
          const av = a.vx * nx + a.vy * ny;
          const bv = b.vx * nx + b.vy * ny;
          const closing = Math.max(0, av - bv);
          const impact = closing;

          if (!this.roundOver && impact > CONFIG.SPLAT_MIN_IMPACT) {
            const aPower = this.splatPower(a);
            const bPower = this.splatPower(b);
            let didSplat = false;
            if (aPower > bPower * CONFIG.SPLAT_POWER_RATIO) didSplat = this.splat(b, a, impact, aPower, bPower, nx, ny);
            else if (bPower > aPower * CONFIG.SPLAT_POWER_RATIO) didSplat = this.splat(a, b, impact, bPower, aPower, -nx, -ny);
            if (didSplat) continue;
          }

          const overlap = Math.max(0, min - d);
          if (overlap > 0) {
            const push = Math.min(16, overlap * CONFIG.COLLISION_PUSH + 0.35);
            a.x = clamp(a.x - nx * push, a.r, CONFIG.WORLD_W - a.r);
            a.y = clamp(a.y - ny * push, a.r, CONFIG.WORLD_H - a.r);
            b.x = clamp(b.x + nx * push, b.r, CONFIG.WORLD_W - b.r);
            b.y = clamp(b.y + ny * push, b.r, CONFIG.WORLD_H - b.r);
            if (closing > 0 && CONFIG.COLLISION_BOUNCE > 0) {
              const impulse = Math.min(85, closing * CONFIG.COLLISION_BOUNCE);
              a.vx -= nx * impulse; a.vy -= ny * impulse;
              b.vx += nx * impulse; b.vy += ny * impulse;
            }
          }
          if (impact > 18 || overlap > 1.5) this.bumpPlayers(a, b, Math.max(impact, overlap * 10), nx, ny);
        }
      }
    }
    splatPower(p) {
      return p.r * CONFIG.SPLAT_RADIUS_WEIGHT + Math.hypot(p.vx, p.vy) * CONFIG.SPLAT_SPEED_WEIGHT;
    }
    bumpPlayers(a, b, impact = 0, nx = 0, ny = 0) {
      const t = now();
      if (t - Math.max(a.lastBumpAt || 0, b.lastBumpAt || 0) < CONFIG.BUMP_FEEDBACK_MS) return;
      a.lastBumpAt = b.lastBumpAt = t;
      const force = clamp(impact / 260, 0.35, 1.4);
      a.impactSquash = Math.min(0.32, (a.impactSquash || 0) + force * CONFIG.JELLO_IMPACT_SCALE * 10);
      b.impactSquash = Math.min(0.32, (b.impactSquash || 0) + force * CONFIG.JELLO_IMPACT_SCALE * 10);
      a.impactX = -nx; a.impactY = -ny; a.impactLife = Math.max(a.impactLife || 0, 0.22);
      b.impactX = nx; b.impactY = ny; b.impactLife = Math.max(b.impactLife || 0, 0.22);
      a.hitFlash = b.hitFlash = 0.35;
      this.burst((a.x + b.x) / 2, (a.y + b.y) / 2, impact % 2 ? a.color : b.color, 12, 0.55);
      if (a.id === this.myId || b.id === this.myId) this.juice.hit(force);
    }
    splat(victim, killer, impact = 0, winnerPower = 0, loserPower = 0, nx = 0, ny = 0) {
      if (!victim.alive || victim.respawn > 0) return false;
      victim.alive = false;
      victim.respawn = 1.9;
      victim.vx = victim.vy = 0;
      victim.impactSquash = 0.42;
      victim.impactX = nx; victim.impactY = ny; victim.impactLife = 0.32;
      victim.streak = 0;
      victim.splatStreak = 0;
      victim.trail = [];
      const t = now();
      killer.splatStreak = (t - (killer.lastSplatAt || 0) < 6500 ? (killer.splatStreak || 0) : 0) + 1;
      killer.lastSplatAt = t;
      killer.streak = clamp((killer.streak || 0) + 58, 0, CONFIG.STREAK_MAX);
      killer.impactSquash = Math.min(0.36, (killer.impactSquash || 0) + 0.24);
      killer.impactX = -nx; killer.impactY = -ny; killer.impactLife = Math.max(killer.impactLife || 0, 0.22);
      killer.hitFlash = 0.42;
      killer.boost = Math.min(1, killer.boost + 0.38);
      this.paint.paintCircle(victim.x, victim.y, victim.r * 2.7, killer.code, 0.5, 2.8);
      this.paint.eraseCircle(victim.x, victim.y, victim.r * 1.2, 0.45);
      this.burst(victim.x, victim.y, victim.color, 64, 1.8);
      this.sparkBurst(victim.x, victim.y, killer.color, this.useLowFx() ? 14 : 28, 1.5);
      this.shockwave(victim.x, victim.y, killer.color, victim.r * 3.2);
      const reason = winnerPower && loserPower ? ` ${Math.round(winnerPower - loserPower)} power` : '';
      const streakText = killer.splatStreak >= 2 ? ` - ${killer.splatStreak}x` : '';
      this.floatText(victim.x, victim.y - victim.r, `${killer.name} splatted ${victim.name}!${reason}${streakText}`, killer.color, 1.25);
      if (killer.splatStreak >= 2) this.floatText(victim.x, victim.y - victim.r - 38, `${killer.splatStreak}x SPLAT!`, '#ffd166', 1.15);
      if (victim.id === this.myId || killer.id === this.myId) {
        this.toast(victim.id === this.myId ? `You got splatted by ${killer.name}.` : `You splatted ${victim.name}!`, 1600);
        this.juice.splat(1, victim.id === this.myId);
      }
      this.cameraPulse = Math.max(this.cameraPulse, 1);
      this.broadcastEventSafe({ type: 'splat', victim: victim.id, victimName: victim.name, killer: killer.id, killerName: killer.name, streak: killer.splatStreak, x: victim.x, y: victim.y, color: victim.color, killerColor: killer.color, impact });
      return true;
    }
    endRound() {
      const live = Array.from(this.players.values());
      live.sort((a, b) => this.paint.getCells(b.code) - this.paint.getCells(a.code));
      this.winner = live[0] || null;
      this.roundOver = true;
      this.roundActive = false;
      this.roundOverTimer = 5;
      if (this.winner) {
        this.showRoundBanner(this.winner);
        this.juice.roundEnd();
        this.juice.flash = Math.max(this.juice.flash, 0.36);
        for (const p of this.players.values()) if (p !== this.winner) p.roundEndFade = 1;
        this.burst(this.winner.x, this.winner.y, this.winner.color, 80, 2);
        this.winnerConfetti(this.winner);
        this.sparkBurst(this.winner.x, this.winner.y, this.winner.color, this.useLowFx() ? 20 : 42, 1.7);
        this.launchConfetti(this.winner.color);
      }
      this.sendFullSnapshot();
      this.updateHostControls();
      this.updateRoomLobbyOverlay();
    }
    showRoundBanner(winner) {
      if (!winner) return;
      const player = Array.from(this.players.values()).find(p => p.code === winner.code || p.name === winner.name);
      const name = winner.name || player?.name || 'Winner';
      this.centerBanner = {
        title: `${name} wins!`,
        subtitle: 'Next round soon',
        color: player?.color || '#ffd166',
        life: 5.4,
        maxLife: 5.4
      };
      this.roundFlash = { color: player?.color || '#ffd166', life: 0.7, maxLife: 0.7 };
    }
    winnerConfetti(winner) {
      const budget = this.cosmeticBudget();
      if (!budget || !winner) return;
      const count = budget === 1 ? 22 : 38;
      for (let i = 0; i < count; i++) {
        const a = rand(-Math.PI, 0);
        const s = rand(120, 420);
        this.addParticle(
          winner.x + rand(-winner.r, winner.r),
          winner.y + rand(-winner.r, winner.r),
          Math.cos(a) * s + rand(-80, 80),
          Math.sin(a) * s - rand(60, 180),
          pick(CONFIG.COLORS),
          rand(0.65, 1.2),
          rand(4, 11),
          0.95,
          { shape: Math.random() < 0.6 ? 'droplet' : 'dot', stretch: rand(1.1, 2.2), glow: 0.12, gravity: 130 }
        );
      }
    }
    closestEnemy(p) {
      let best = null, bestD = Infinity;
      for (const o of this.players.values()) {
        if (o === p || !o.alive) continue;
        const d = dist2(p.x, p.y, o.x, o.y);
        if (d < bestD) { bestD = d; best = o; }
      }
      return best;
    }
    closestThreat(p) {
      let best = null, bestD = Infinity;
      for (const o of this.players.values()) {
        if (o === p || !o.alive || o.r < p.r * 1.04) continue;
        const d = dist2(p.x, p.y, o.x, o.y);
        if (d < bestD) { bestD = d; best = o; }
      }
      return best;
    }
    findPaintTarget(code, px, py, personality) {
      let best = { x: rand(80, CONFIG.WORLD_W - 80), y: rand(80, CONFIG.WORLD_H - 80), score: -Infinity };
      const samples = 22;
      for (let k = 0; k < samples; k++) {
        const cx = (Math.random() * this.paint.w) | 0;
        const cy = (Math.random() * this.paint.h) | 0;
        const i = this.paint.cellIndex(cx, cy);
        const owner = this.paint.owner[i];
        const wx = (cx + 0.5) * this.paint.cellW;
        const wy = (cy + 0.5) * this.paint.cellH;
        const d = Math.hypot(wx - px, wy - py);
        const desirability = (owner === 0 ? 220 : owner === code ? -80 : 290) - d * (0.19 + personality * 0.15) + Math.random() * 80;
        if (desirability > best.score) best = { x: wx, y: wy, score: desirability };
      }
      return best;
    }
    networkHost(dt) {
      if (!this.mesh) return;
      this.mesh.maintainHostNegotiations();
      this.accumNet += dt;
      this.accumPaintNet += dt;
      this.accumFullGrid += dt;
      if (this.accumNet >= 1 / CONFIG.HOST_SNAPSHOT_HZ) {
        this.accumNet = 0;
        this.mesh.broadcast(this.buildSnapshot(false));
      }
      if (this.accumPaintNet >= 1 / CONFIG.PAINT_SNAPSHOT_HZ) {
        this.accumPaintNet = 0;
        this.mesh.broadcast(this.buildPaintSnapshot(false), 'state');
      }
    }

    addInkRipple(x, y, color, radius = 24, life = 0.4) {
      const budget = this.cosmeticBudget();
      if (!budget) return;
      const cap = budget === 1 ? CONFIG.RIPPLE_CAP_MEDIUM : CONFIG.RIPPLE_CAP_HIGH;
      if (this.ripples.length > cap) this.ripples.splice(0, this.ripples.length - cap);
      this.ripples.push({
        x, y, color, radius,
        life, maxLife: life,
        rot: rand(0, TAU),
        sx: rand(0.75, 1.35),
        sy: rand(0.7, 1.25),
        depthAlpha: rand(0.1, 0.18),
        shineAlpha: rand(0.16, 0.28),
        wobble: rand(0, TAU)
      });
    }
    addParticle(x, y, vx, vy, color, life = 0.5, size = 8, alpha = 1, options = null) {
      const budget = this.cosmeticBudget();
      const cap = budget === 0 ? 120 : budget === 1 ? 220 : 340;
      if (this.particles.length >= cap) this.particles.splice(0, this.particles.length - cap + 1);
      this.particles.push({
        x, y, vx, vy, color, life, maxLife: life, size, alpha,
        shape: options?.shape || 'dot',
        stretch: options?.stretch || 1,
        spin: options?.spin ?? rand(-6, 6),
        rot: options?.rot ?? rand(0, TAU),
        glow: options?.glow || 0,
        gravity: options?.gravity ?? 80,
        highlight: options?.highlight !== false,
        fromColor: options?.fromColor || null,
        toColor: options?.toColor || null,
        colorMixLife: options?.colorMixLife || 0
      });
    }
    burst(x, y, color, count = 24, force = 1) {
      const cap = this.useLowFx() ? Math.min(count, 20) : this.useMediumFx() ? Math.min(count, 38) : count;
      for (let i = 0; i < cap; i++) {
        const a = rand(0, TAU), s = rand(80, 370) * force;
        const droplet = this.useLowFx() ? Math.random() < 0.35 : Math.random() < 0.68;
        this.addParticle(
          x, y,
          Math.cos(a) * s,
          Math.sin(a) * s,
          color,
          rand(0.35, 0.95),
          rand(4, 14),
          1,
          droplet ? { shape: 'droplet', stretch: rand(1.25, 2.8), glow: 0.2 } : { shape: 'dot', glow: 0.12 }
        );
      }
    }
    floatText(x, y, text, color, scale = 1) {
      this.floaters.push({ x, y, text, color, life: 1.3 * scale, maxLife: 1.3 * scale, vy: -42 * scale, scale });
    }
    shockwave(x, y, color, radius = 90) {
      this.shockwaves.push({ x, y, color, radius, life: 0.42, maxLife: 0.42 });
    }
    speedLine(x, y, vx, vy, color, width = 10, life = 0.28) {
      if (this.useLowFx()) return;
      const cap = this.useMediumFx() ? 18 : 34;
      if (this.speedLines.length > cap) this.speedLines.splice(0, this.speedLines.length - cap);
      const speed = Math.hypot(vx, vy) || 1;
      this.speedLines.push({
        x, y,
        vx: -vx * 0.08 + rand(-18, 18),
        vy: -vy * 0.08 + rand(-18, 18),
        nx: vx / speed,
        ny: vy / speed,
        color,
        w: width,
        life,
        maxLife: life,
        len: clamp(speed * rand(0.045, 0.085), 10, 42)
      });
    }
    sparkBurst(x, y, color, count = 12, force = 1) {
      if (this.useLowFx()) count = Math.min(count, 8);
      else if (this.useMediumFx()) count = Math.min(count, 16);
      for (let i = 0; i < count; i++) {
        const a = rand(0, TAU);
        const s = rand(120, 420) * force;
        this.addParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, color, rand(0.28, 0.7), rand(3, 9), 0.95, {
          shape: 'spark',
          stretch: rand(1.4, 2.8),
          glow: 0.45,
          gravity: rand(20, 90)
        });
      }
    }
    launchConfetti(color = '#ffd166') {
      const count = this.useLowFx() ? 34 : this.useMediumFx() ? 58 : 88;
      const palette = [color, '#ffd166', '#2ee6b8', '#4bb3ff', '#ff5c8a', '#ffffff'];
      for (let i = 0; i < count; i++) {
        this.confetti.push({
          x: rand(-40, innerWidth + 40),
          y: rand(-90, -8),
          vx: rand(-80, 80),
          vy: rand(110, 280),
          rot: rand(0, TAU),
          spin: rand(-9, 9),
          size: rand(5, 11),
          color: pick(palette),
          life: rand(2.2, 3.8),
          maxLife: 3.8
        });
      }
    }
    compactLiveFx(list) {
      let n = 0;
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (item.life > 0) list[n++] = item;
      }
      list.length = n;
    }
    tickParticles(dt) {
      for (const p of this.players.values()) {
        p.roundEndFade = Math.max(0, (p.roundEndFade || 0) - dt * 2);
        p.impactLife = Math.max(0, (p.impactLife || 0) - dt * 3.8);
      }
      for (const p of this.particles) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= Math.exp(-3.4 * dt);
        p.vy *= Math.exp(-3.4 * dt);
        p.vy += (p.gravity ?? 80) * dt;
        p.rot += (p.spin || 0) * dt;
      }
      this.compactLiveFx(this.particles);
      for (const f of this.floaters) { f.life -= dt; f.y += f.vy * dt; }
      this.compactLiveFx(this.floaters);
      for (const r of this.ripples) r.life -= dt;
      this.compactLiveFx(this.ripples);
      for (const s of this.shockwaves) s.life -= dt;
      this.compactLiveFx(this.shockwaves);
      for (const l of this.speedLines) {
        l.life -= dt;
        l.x += l.vx * dt;
        l.y += l.vy * dt;
        l.w *= Math.exp(-1.8 * dt);
      }
      this.compactLiveFx(this.speedLines);
      for (const c of this.confetti) {
        c.life -= dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.vy += 260 * dt;
        c.vx *= Math.exp(-0.55 * dt);
        c.rot += c.spin * dt;
      }
      this.compactLiveFx(this.confetti);
    }

    render(dt) {
      const ctx = this.ctx;
      const w = this.canvas.width, h = this.canvas.height, dpr = this.pixelRatio;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#101322';
      ctx.fillRect(0, 0, w, h);

      if (this.mode === 'menu') {
        this.drawMenuBackground(ctx, w, h);
        return;
      }

      const target = this.players.get(this.myId) || Array.from(this.players.values())[0];
      if (target) {
        const speed = Math.hypot(target.vx || 0, target.vy || 0);
        const lead = clamp(speed / 420, 0, 1);
        const aimX = clamp(target.x + (target.vx || 0) * 0.16 * lead, target.r || CONFIG.BASE_RADIUS, CONFIG.WORLD_W - (target.r || CONFIG.BASE_RADIUS));
        const aimY = clamp(target.y + (target.vy || 0) * 0.16 * lead, target.r || CONFIG.BASE_RADIUS, CONFIG.WORLD_H - (target.r || CONFIG.BASE_RADIUS));
        this.camera.x = lerp(this.camera.x, aimX, 1 - Math.pow(0.002, dt));
        this.camera.y = lerp(this.camera.y, aimY, 1 - Math.pow(0.002, dt));
      } else {
        this.camera.x = lerp(this.camera.x, CONFIG.WORLD_W / 2, 0.02);
        this.camera.y = lerp(this.camera.y, CONFIG.WORLD_H / 2, 0.02);
      }
      const viewTarget = Math.min(w / dpr / 880, h / dpr / 560);
      const mobileBoost = innerWidth < 720 ? 0.82 : 1;
      const boostZoom = target?.boostPulse ? lerp(1, CONFIG.CAMERA_BOOST_ZOOM, clamp(target.boostPulse, 0, 1)) : 1;
      const splatZoom = this.cameraPulse ? lerp(1, CONFIG.CAMERA_SPLAT_ZOOM, clamp(this.cameraPulse, 0, 1)) : 1;
      this.camera.zoom = clamp(viewTarget * mobileBoost * boostZoom * splatZoom, 0.42, 1.18) * dpr;
      const shake = (this.juice.shake + this.juice.boostShake) * dpr;
      const sx = shake ? rand(-shake, shake) : 0;
      const sy = shake ? rand(-shake, shake) : 0;
      const tx = w / 2 - this.camera.x * this.camera.zoom + sx;
      const ty = h / 2 - this.camera.y * this.camera.zoom + sy;
      this.view = { zoom: this.camera.zoom, tx, ty, dpr };
      ctx.setTransform(this.camera.zoom, 0, 0, this.camera.zoom, tx, ty);
      this.leaderCode = this.getLeaderCode();

      this.drawWorld(ctx);
      this.drawInkRipples(ctx);
      this.drawPlayerTrails(ctx);
      this.drawSpeedLines(ctx);
      this.drawParticles(ctx, false);
      this.drawShockwaves(ctx);
      this.drawCombatHints(ctx);
      for (const p of this.players.values()) if (this.isWorldVisible(p.x, p.y, (p.r || CONFIG.BASE_RADIUS) + 120)) this.drawPlayer(ctx, p);
      this.drawParticles(ctx, true);
      this.drawFloaters(ctx);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (this.screenOverlay?.width === w && this.screenOverlay?.height === h) ctx.drawImage(this.screenOverlay, 0, 0);
      if (this.juice.flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${this.juice.flash * 0.35})`;
        ctx.fillRect(0, 0, w, h);
      }
      if (this.roundFlash) {
        const a = clamp(this.roundFlash.life / this.roundFlash.maxLife, 0, 1);
        const flash = ctx.createRadialGradient(w * 0.5, h * 0.46, Math.min(w, h) * 0.05, w * 0.5, h * 0.48, Math.max(w, h) * 0.58);
        flash.addColorStop(0, rgba(this.roundFlash.color, 0.24 * a));
        flash.addColorStop(0.42, rgba(this.roundFlash.color, 0.12 * a));
        flash.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = flash;
        ctx.fillRect(0, 0, w, h);
      }
      if (this.mode === 'menu') this.drawMenuBackground(ctx, w, h);
      this.drawScreenRush(ctx, w, h, dpr, target);
      this.drawThreatArrows(ctx, w, h, dpr, target);
      this.drawScreenConfetti(ctx, w, h, dpr);
      this.drawCenterBanner(ctx, w, h, dpr);
      this.drawMinimap();
    }
    drawCenterBanner(ctx, w, h, dpr) {
      const b = this.centerBanner;
      if (!b || this.mode === 'menu') return;
      const lifeRatio = clamp(b.life / b.maxLife, 0, 1);
      const intro = clamp((b.maxLife - b.life) / 0.35, 0, 1);
      const alpha = Math.min(1, intro, lifeRatio * 1.7);
      const cx = w / 2;
      const cy = h * 0.47;
      const scale = Math.min(dpr, (w * 0.88) / 620) * (0.92 + intro * 0.08);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(7,10,22,0.72)';
      ctx.strokeStyle = rgba(b.color, 0.55);
      ctx.lineWidth = 2 * dpr;
      roundRect(ctx, cx - 310 * scale, cy - 92 * scale, 620 * scale, 184 * scale, 28 * scale);
      ctx.fill();
      ctx.stroke();
      ctx.shadowColor = rgba(b.color, 0.8);
      ctx.shadowBlur = 28 * dpr;
      ctx.font = `900 ${Math.round(62 * scale)}px ui-rounded, system-ui, sans-serif`;
      ctx.lineWidth = 8 * dpr;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.fillStyle = '#fff';
      ctx.strokeText(b.title, cx, cy - 22 * scale);
      ctx.fillText(b.title, cx, cy - 22 * scale);
      ctx.shadowBlur = 0;
      ctx.font = `800 ${Math.round(22 * scale)}px ui-rounded, system-ui, sans-serif`;
      ctx.fillStyle = lighten(b.color, 0.45);
      ctx.fillText(b.subtitle, cx, cy + 48 * scale);
      const barW = 380 * scale;
      const barY = cy + 78 * scale;
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      roundRect(ctx, cx - barW / 2, barY, barW, 8 * scale, 999);
      ctx.fill();
      ctx.fillStyle = rgba(b.color, 0.72);
      roundRect(ctx, cx - barW / 2, barY, barW * easeOutCubic(lifeRatio), 8 * scale, 999);
      ctx.fill();
      ctx.restore();
    }
    getLeaderCode() {
      let bestCode = 0;
      let best = -1;
      for (const p of this.players.values()) {
        const score = this.isHost ? this.paint.getCells(p.code) : p.score || this.paint.getCells(p.code);
        if (score > best) { best = score; bestCode = p.code; }
      }
      return bestCode;
    }
    useMediumFx() {
      return this.quality === 'medium' || this.saveData || (this.quality === 'auto' && this.fps < 56);
    }
    isWorldVisible(x, y, radius = 0) {
      const v = this.view;
      if (!v || !v.zoom) return true;
      const pad = radius + 40;
      const left = (-v.tx) / v.zoom - pad;
      const top = (-v.ty) / v.zoom - pad;
      const right = (this.canvas.width - v.tx) / v.zoom + pad;
      const bottom = (this.canvas.height - v.ty) / v.zoom + pad;
      return x >= left && x <= right && y >= top && y <= bottom;
    }
    rebuildWorldBackdrop() {
      const ctx = this.worldBackdropCtx;
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, CONFIG.WORLD_W, CONFIG.WORLD_H);

      const bg = ctx.createLinearGradient(0, 0, CONFIG.WORLD_W, CONFIG.WORLD_H);
      bg.addColorStop(0, '#20264a');
      bg.addColorStop(0.45, '#181d34');
      bg.addColorStop(1, '#111424');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, CONFIG.WORLD_W, CONFIG.WORLD_H);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 28; i++) {
        const h = hash01(i * 4 + 1);
        const x = h * CONFIG.WORLD_W;
        const y = hash01(i * 4 + 2) * CONFIG.WORLD_H;
        const r = 22 + hash01(i * 4 + 3) * 72;
        ctx.fillStyle = rgba(CONFIG.COLORS[i % CONFIG.COLORS.length], 0.018 + hash01(i * 4 + 4) * 0.024);
        ctx.beginPath();
        ctx.ellipse(x, y, r * 1.25, r * 0.72, h * TAU, 0, TAU);
        ctx.fill();
      }

      const shimmer = ctx.createLinearGradient(0, 0, CONFIG.WORLD_W, CONFIG.WORLD_H);
      shimmer.addColorStop(0, 'rgba(255,255,255,0.052)');
      shimmer.addColorStop(0.25, 'rgba(255,255,255,0.013)');
      shimmer.addColorStop(0.5, 'rgba(255,255,255,0.088)');
      shimmer.addColorStop(0.75, 'rgba(255,255,255,0.018)');
      shimmer.addColorStop(1, 'rgba(255,255,255,0.064)');
      ctx.fillStyle = shimmer;
      ctx.fillRect(0, 0, CONFIG.WORLD_W, CONFIG.WORLD_H);
      ctx.restore();

      const vignette = ctx.createRadialGradient(CONFIG.WORLD_W * 0.5, CONFIG.WORLD_H * 0.46, CONFIG.WORLD_H * 0.12, CONFIG.WORLD_W * 0.5, CONFIG.WORLD_H * 0.5, CONFIG.WORLD_W * 0.72);
      vignette.addColorStop(0, 'rgba(255,255,255,0.012)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.24)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, CONFIG.WORLD_W, CONFIG.WORLD_H);

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= CONFIG.WORLD_W; x += 140) { ctx.moveTo(x, 0); ctx.lineTo(x, CONFIG.WORLD_H); }
      for (let y = 0; y <= CONFIG.WORLD_H; y += 140) { ctx.moveTo(0, y); ctx.lineTo(CONFIG.WORLD_W, y); }
      ctx.stroke();

      this.worldBackdropReady = true;
    }
    drawWorldGlint(ctx) {
      if (this.useLowFx()) return;
      const alpha = this.useMediumFx() ? 0.09 : 0.14;
      const glintX = ((this.frameNow || now()) * 0.045) % (CONFIG.WORLD_W * 1.8) - CONFIG.WORLD_W * 0.45;
      const glint = ctx.createLinearGradient(glintX, 0, glintX + CONFIG.WORLD_W * 0.32, CONFIG.WORLD_H);
      glint.addColorStop(0, 'rgba(255,255,255,0)');
      glint.addColorStop(0.48, `rgba(255,255,255,${alpha * 0.45})`);
      glint.addColorStop(0.56, `rgba(255,255,255,${alpha})`);
      glint.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = glint;
      ctx.fillRect(0, 0, CONFIG.WORLD_W, CONFIG.WORLD_H);
      ctx.restore();
    }
    drawArenaTexture(ctx) {
      if (this.useLowFx()) return;
      const t = now() * 0.00008;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 34; i++) {
        const h = hash01(i * 4 + 1);
        const x = (h * CONFIG.WORLD_W + Math.sin(t * (0.4 + h) + i) * 18 + CONFIG.WORLD_W) % CONFIG.WORLD_W;
        const y = (hash01(i * 4 + 2) * CONFIG.WORLD_H + Math.cos(t * (0.5 + h) + i * 1.7) * 16 + CONFIG.WORLD_H) % CONFIG.WORLD_H;
        const r = 22 + hash01(i * 4 + 3) * 72;
        ctx.fillStyle = rgba(CONFIG.COLORS[i % CONFIG.COLORS.length], 0.018 + hash01(i * 4 + 4) * 0.028);
        ctx.beginPath();
        ctx.ellipse(x, y, r * 1.25, r * 0.72, h * TAU, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    drawSpeedLines(ctx) {
      if (!this.speedLines.length || this.useLowFx()) return;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.lineCap = 'round';
      for (const l of this.speedLines) {
        if (!this.isWorldVisible(l.x, l.y, l.len + l.w)) continue;
        const a = clamp(l.life / l.maxLife, 0, 1);
        const tail = l.len * (0.7 + (1 - a) * 0.65);
        ctx.globalAlpha = a * 0.28;
        ctx.strokeStyle = rgba(l.color, 0.9);
        ctx.lineWidth = Math.max(1, l.w * a);
        ctx.beginPath();
        ctx.moveTo(l.x, l.y);
        ctx.lineTo(l.x - l.nx * tail, l.y - l.ny * tail);
        ctx.stroke();
        ctx.globalAlpha = a * 0.12;
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = Math.max(1, l.w * 0.22 * a);
        ctx.beginPath();
        ctx.moveTo(l.x + l.ny * 3, l.y - l.nx * 3);
        ctx.lineTo(l.x - l.nx * tail * 0.62 + l.ny * 3, l.y - l.ny * tail * 0.62 - l.nx * 3);
        ctx.stroke();
      }
      ctx.restore();
    }
    drawPlayerTrails(ctx) {
      if (this.useLowFx()) return;
      const t = this.frameNow || now();
      const mediumFx = this.useMediumFx();
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const p of this.players.values()) {
        const trail = p.trail;
        if (!p.alive || !Array.isArray(trail) || trail.length < 2) continue;
        if (!this.isWorldVisible(p.x, p.y, (p.r || CONFIG.BASE_RADIUS) + 130)) continue;
        const maxSegments = mediumFx ? 6 : 10;
        const start = Math.max(1, trail.length - maxSegments);
        for (let i = start; i < trail.length; i++) {
          const a = trail[i - 1];
          const b = trail[i];
          const age = t - b.t;
          const life = b.life || 360;
          if (age > life) continue;
          const fade = clamp(1 - age / life, 0, 1);
          const order = i / Math.max(1, trail.length - 1);
          const width = Math.max(2, (b.r || p.r) * (0.32 + b.speed * 0.28 + b.boost * 0.16) * fade * (0.5 + order * 0.5));
          const midX = (a.x + b.x) * 0.5;
          const midY = (a.y + b.y) * 0.5;
          ctx.globalAlpha = fade * (0.13 + b.boost * 0.06);
          ctx.strokeStyle = rgba(p.color, 0.72);
          ctx.lineWidth = width;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.quadraticCurveTo(midX, midY, b.x, b.y);
          ctx.stroke();
          if (!mediumFx && b.boost) {
            ctx.globalAlpha = fade * 0.1;
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth = Math.max(1, width * 0.28);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.quadraticCurveTo(midX, midY, b.x, b.y);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    }

    drawCombatHints(ctx) {
      if (!this.roundActive || this.roundOver || this.useLowFx()) return;
      const me = this.players.get(this.myId);
      if (!me || !me.alive) return;
      const myPower = this.splatPower(me);
      const mediumFx = this.useMediumFx();
      const t = (this.frameNow || now()) * 0.001;
      let drawn = 0;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const p of this.players.values()) {
        if (p === me || !p.alive) continue;
        const d2 = dist2(me.x, me.y, p.x, p.y);
        if (d2 > 430 * 430) continue;
        const otherPower = this.splatPower(p);
        const canSplat = myPower > otherPower * (CONFIG.SPLAT_POWER_RATIO * 0.96);
        const danger = otherPower > myPower * (CONFIG.SPLAT_POWER_RATIO * 0.96);
        if (!canSplat && !danger) continue;
        const d = Math.sqrt(d2);
        const alpha = clamp(1 - d / 430, 0, 1);
        const pulse = 0.5 + Math.sin(t * (danger ? 9 : 6) + p.code) * 0.5;
        ctx.globalAlpha = 0.22 + alpha * 0.42;
        ctx.strokeStyle = danger ? 'rgba(255,92,138,0.95)' : 'rgba(255,209,102,0.95)';
        ctx.lineWidth = danger ? 3.4 : 2.6;
        const r = p.r * (1.6 + pulse * 0.14 + alpha * 0.18);
        ctx.beginPath();
        if (canSplat) {
          ctx.arc(p.x, p.y, r, -0.9 + pulse * 0.25, 0.9 + pulse * 0.25);
          ctx.arc(p.x, p.y, r, Math.PI - 0.9 - pulse * 0.25, Math.PI + 0.9 - pulse * 0.25);
        } else {
          ctx.arc(p.x, p.y, r, 0, TAU);
        }
        ctx.stroke();
        if (!mediumFx && canSplat && me.input?.boost) {
          ctx.globalAlpha *= 0.42;
          ctx.lineWidth = 8;
          ctx.stroke();
        }
        if (++drawn >= (mediumFx ? 3 : 5)) break;
      }
      ctx.restore();
    }
    drawWorld(ctx) {
      const lowFx = this.useLowFx();
      const mediumFx = this.useMediumFx();
      ctx.save();
      if (!lowFx) {
        ctx.shadowColor = 'rgba(0,0,0,0.36)';
        ctx.shadowBlur = mediumFx ? 18 : 32;
      }
      roundRect(ctx, -16, -16, CONFIG.WORLD_W + 32, CONFIG.WORLD_H + 32, 36);
      ctx.fillStyle = '#171b30';
      ctx.fill();
      ctx.shadowBlur = 0;

      roundRect(ctx, 0, 0, CONFIG.WORLD_W, CONFIG.WORLD_H, 22);
      ctx.save();
      ctx.clip();

      if (!this.worldBackdropReady) this.rebuildWorldBackdrop();
      if (this.worldBackdropReady) ctx.drawImage(this.worldBackdrop, 0, 0);
      else {
        ctx.fillStyle = '#181d34';
        ctx.fillRect(0, 0, CONFIG.WORLD_W, CONFIG.WORLD_H);
      }

      if (!lowFx) {
        ctx.globalAlpha = mediumFx ? 0.14 : 0.22;
        ctx.drawImage(this.paint.canvas, 4, 7, CONFIG.WORLD_W, CONFIG.WORLD_H);
      }
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.paint.canvas, 0, 0, CONFIG.WORLD_W, CONFIG.WORLD_H);
      this.drawWorldGlint(ctx);
      ctx.restore();

      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 5;
      roundRect(ctx, 0, 0, CONFIG.WORLD_W, CONFIG.WORLD_H, 22);
      ctx.stroke();
      ctx.restore();
    }
    drawPlayer(ctx, p) {
      const lowFx = this.useLowFx();
      const mediumFx = this.useMediumFx();
      if (!p.alive) {
        const t = Math.max(0, p.respawn || 0);
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = rgba(p.color, 0.7);
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, CONFIG.BASE_RADIUS + 18 * (1 + Math.sin(now() * 0.01) * 0.25), 0, TAU);
        ctx.stroke();
        ctx.restore();
        return;
      }
      const speed = Math.hypot(p.vx, p.vy);
      const angle = speed > 10 ? Math.atan2(p.vy, p.vx) : (p.facing || 0);
      const t = now() * 0.001;
      const pulse = 1 + Math.sin(t * 5.2 + p.code) * ((p.wobble || 0) * 0.02 + 0.01);
      const roundFade = p.roundEndFade || 0;
      const shadowSpeed = clamp(speed / 520, 0, 1);
      const streakJuice = clamp((p.streak || 0) / CONFIG.STREAK_MAX, 0, 1);
      const aura = Math.max(p.blobAura || 0, streakJuice * 0.58);
      const speedJuice = clamp(speed / 440, 0, 1);

      if (p.id === this.myId) {
        ctx.save();
        ctx.globalAlpha = 0.18 + Math.sin(t * 5) * 0.035;
        ctx.strokeStyle = rgba(p.color, 0.92);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (1.55 + speedJuice * 0.12), 0, TAU);
        ctx.stroke();
        ctx.globalAlpha *= 0.32;
        ctx.lineWidth = 9;
        ctx.stroke();
        ctx.restore();
      }

      if (!lowFx && this.leaderCode === p.code && this.players.size > 1) {
        ctx.save();
        const leaderPulse = 0.5 + Math.sin(t * 4.2 + p.code) * 0.5;
        ctx.globalAlpha = 0.16 + leaderPulse * 0.08;
        ctx.strokeStyle = 'rgba(255,209,102,0.9)';
        ctx.lineWidth = mediumFx ? 2 : 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (1.9 + leaderPulse * 0.16), 0, TAU);
        ctx.stroke();
        ctx.globalAlpha *= 0.45;
        ctx.lineWidth = mediumFx ? 6 : 9;
        ctx.stroke();
        ctx.restore();
      }

      if (!lowFx && speedJuice > 0.08) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const smearCount = mediumFx ? 1 : 3;
        for (let i = smearCount; i >= 1; i--) {
          const back = i * (7 + speedJuice * 18);
          ctx.save();
          ctx.translate(p.x - Math.cos(angle) * back, p.y - Math.sin(angle) * back);
          ctx.rotate(angle);
          ctx.scale(1 + speedJuice * 0.18, 1 - speedJuice * 0.08);
          ctx.globalAlpha = (0.075 / i) * speedJuice;
          this.traceBlobPath(ctx, p, 1 + i * 0.035);
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
      }

      ctx.save();
      ctx.globalAlpha = 1 - roundFade * 0.18;
      ctx.fillStyle = 'rgba(0,0,0,0.24)';
      ctx.beginPath();
      ctx.ellipse(
        p.x + 5,
        p.y + p.r * 0.82,
        p.r * (1.08 + aura * 0.24 + shadowSpeed * 0.18 + (p.impactSquash || 0) * 0.65),
        p.r * (0.34 + shadowSpeed * 0.04),
        0,
        0,
        TAU
      );
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 1 - roundFade * 0.28;
      ctx.translate(p.x, p.y);
      // Lighting stays anchored instead of spinning with movement; the blob
      // mesh itself already stretches toward p.facing.
      ctx.scale(pulse * (1 + roundFade * 0.08), pulse * (1 - roundFade * 0.16));

      if (aura > 0.02) {
        ctx.save();
        this.traceBlobPath(ctx, p, 1.2 + aura * 0.06);
        ctx.fillStyle = rgba(p.color, 0.1 + aura * 0.12);
        if (!mediumFx) {
          ctx.shadowColor = rgba(p.color, 0.42 + aura * 0.18);
          ctx.shadowBlur = 16 + aura * 16;
        }
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      this.traceBlobPath(ctx, p, 1);
      const grad = ctx.createRadialGradient(-p.r * 0.42, -p.r * 0.48, p.r * 0.1, 0, 0, p.r * 1.22);
      grad.addColorStop(0, lighten(p.color, 0.72));
      grad.addColorStop(0.22, lighten(p.color, 0.26));
      grad.addColorStop(0.68, p.color);
      grad.addColorStop(1, darken(p.color, 0.42));
      ctx.fillStyle = grad;
      ctx.shadowColor = rgba(p.color, 0.34 + aura * 0.18);
      ctx.shadowBlur = mediumFx ? 6 + aura * 4 : 14 + aura * 12;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.clip();

      const shine = ctx.createLinearGradient(-p.r * 0.95, -p.r * 0.95, p.r * 0.9, p.r * 0.9);
      shine.addColorStop(0, 'rgba(255,255,255,0.46)');
      shine.addColorStop(0.32, 'rgba(255,255,255,0.12)');
      shine.addColorStop(0.55, 'rgba(255,255,255,0)');
      shine.addColorStop(0.82, 'rgba(255,255,255,0.08)');
      shine.addColorStop(1, 'rgba(255,255,255,0.18)');
      ctx.fillStyle = shine;
      ctx.fillRect(-p.r * 1.25, -p.r * 1.2, p.r * 2.5, p.r * 2.4);

      ctx.globalCompositeOperation = 'multiply';
      const underside = ctx.createLinearGradient(0, -p.r * 0.2, 0, p.r * 1.25);
      underside.addColorStop(0, 'rgba(0,0,0,0)');
      underside.addColorStop(1, 'rgba(0,0,0,0.22)');
      ctx.fillStyle = underside;
      ctx.fillRect(-p.r * 1.2, -p.r * 1.2, p.r * 2.4, p.r * 2.4);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.ellipse(-p.r * 0.3, -p.r * 0.42, p.r * 0.36, p.r * 0.14, -0.52, 0, TAU);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(p.r * 0.08, -p.r * 0.08, p.r * 0.16, p.r * 0.06, -0.2, 0, TAU);
      ctx.fill();
      const budget = this.cosmeticBudget();
      if (budget) {
        ctx.globalAlpha = 0.16 + budget * 0.04;
        ctx.lineWidth = Math.max(2, p.r * 0.08);
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        const caustics = mediumFx ? 1 : budget + 1;
        for (let i = 0; i < caustics; i++) {
          const y = -p.r * (0.22 - i * 0.18);
          ctx.beginPath();
          ctx.ellipse(-p.r * (0.02 + i * 0.08), y, p.r * (0.58 - i * 0.1), p.r * (0.16 - i * 0.025), -0.22 - i * 0.16, -2.65, -0.42);
          ctx.stroke();
        }
      }
      ctx.restore();

      ctx.save();
      this.traceBlobPath(ctx, p, 1);
      ctx.strokeStyle = (p.hitFlash || 0) > 0 ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.42)';
      ctx.lineWidth = 2.5 + (p.hitFlash || 0) * 5;
      ctx.stroke();
      ctx.restore();

      if (aura > 0.02) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.24 + aura * 0.36;
        this.traceBlobPath(ctx, p, 1.05 + aura * 0.04);
        ctx.strokeStyle = 'rgba(255,255,255,0.72)';
        ctx.lineWidth = Math.max(2, p.r * 0.08);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.18 + aura * 0.18;
        ctx.strokeStyle = rgba(p.color, 0.88);
        ctx.lineWidth = Math.max(2, p.r * 0.08);
        const rings = mediumFx ? 1 : 3;
        for (let i = 0; i < rings; i++) {
          const r = p.r * (1.12 + i * 0.14 + Math.sin(t * 7 + i) * 0.02);
          ctx.beginPath();
          ctx.arc(0, 0, r, -0.8, 0.75);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();

      ctx.save();
      ctx.translate(p.x, p.y - p.r - 14);
      ctx.font = '700 18px ui-rounded, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const name = p.id === this.myId ? `${p.name} *` : p.name;
      const width = ctx.measureText(name).width + 18;
      ctx.fillStyle = 'rgba(6,8,18,0.48)';
      roundRect(ctx, -width / 2, -12, width, 24, 12);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(name, 0, 0);
      if (this.leaderCode === p.code && this.players.size > 1) {
        ctx.save();
        ctx.translate(0, -27);
        ctx.globalAlpha = 0.86;
        ctx.fillStyle = 'rgba(255,209,102,0.18)';
        ctx.strokeStyle = 'rgba(255,209,102,0.58)';
        ctx.lineWidth = 1.4;
        roundRect(ctx, -19, -8, 38, 16, 8);
        ctx.fill();
        ctx.stroke();
        ctx.font = '900 9px ui-rounded, system-ui, sans-serif';
        ctx.fillStyle = '#fff7cc';
        ctx.fillText('LEAD', 0, 0);
        ctx.restore();
      }
      ctx.restore();
    }
    drawInkRipples(ctx) {
      if (!this.ripples.length || !this.cosmeticBudget()) return;
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      for (const r of this.ripples) {
        const a = clamp(r.life / r.maxLife, 0, 1);
        const grow = 1 + (1 - a) * 0.42;
        ctx.globalAlpha = a * (r.depthAlpha || 0.13);
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = Math.max(1.5, r.radius * 0.09) * a;
        ctx.save();
        ctx.translate(r.x, r.y);
        ctx.rotate(r.rot + Math.sin(now() * 0.004 + r.wobble) * 0.08);
        ctx.beginPath();
        ctx.ellipse(0, 0, r.radius * r.sx * grow, r.radius * r.sy * grow, 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'screen';
      for (const r of this.ripples) {
        if (!this.isWorldVisible(r.x, r.y, r.radius * 2)) continue;
        const a = clamp(r.life / r.maxLife, 0, 1);
        const grow = 1 + (1 - a) * 0.48;
        ctx.globalAlpha = a * (r.shineAlpha || 0.22);
        ctx.strokeStyle = rgba(r.color, 0.72);
        ctx.lineWidth = 2.2 * a;
        ctx.save();
        ctx.translate(r.x, r.y);
        ctx.rotate(r.rot + Math.sin(now() * 0.004 + r.wobble) * 0.08);
        ctx.beginPath();
        ctx.ellipse(0, 0, r.radius * r.sx * grow, r.radius * r.sy * grow, 0, 0, TAU);
        ctx.stroke();
        const rr = r.radius * (0.5 + grow * 0.35);
        const grad = ctx.createRadialGradient(0, 0, rr * 0.08, 0, 0, rr);
        grad.addColorStop(0, 'rgba(255,255,255,0.18)');
        grad.addColorStop(0.42, rgba(r.color, 0.2));
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = a * 0.42;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(0, 0, rr * r.sx, rr * r.sy, 0, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = a * 0.08;
        ctx.fillStyle = rgba(r.color, 0.5);
        ctx.beginPath();
        ctx.ellipse(0, 0, r.radius * r.sx * (0.65 + grow * 0.25), r.radius * r.sy * (0.65 + grow * 0.25), 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
    drawParticles(ctx, foreground) {
      ctx.save();
      const allowGlow = !this.useLowFx() && this.fps >= 50;
      for (const p of this.particles) {
        const a = p.life / p.maxLife;
        if (foreground !== (p.size > 9)) continue;
        if (!this.isWorldVisible(p.x, p.y, p.size * 5)) continue;
        const mixT = p.fromColor && p.toColor ? clamp(1 - p.life / (p.colorMixLife || p.maxLife), 0, 1) : 0;
        const displayColor = p.fromColor && p.toColor ? mixColor(p.fromColor, p.toColor, mixT) : p.color;
        ctx.globalAlpha = a * p.alpha;
        if (allowGlow && p.glow) {
          ctx.shadowColor = alphaColor(displayColor, 0.55);
          ctx.shadowBlur = p.size * (0.9 + p.glow * 1.8);
        }
        ctx.fillStyle = displayColor;
        if (p.shape === 'spark') {
          const ang = Math.atan2(p.vy || 0, p.vx || 0) + (p.rot || 0) * 0.08;
          const len = p.size * (p.stretch || 2.1) * (0.85 + (1 - a) * 0.7);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(ang);
          ctx.lineCap = 'round';
          ctx.strokeStyle = displayColor;
          ctx.lineWidth = Math.max(1.2, p.size * 0.28 * a);
          ctx.beginPath();
          ctx.moveTo(-len * 0.5, 0);
          ctx.lineTo(len * 0.5, 0);
          ctx.stroke();
          ctx.globalAlpha *= 0.5;
          ctx.strokeStyle = 'rgba(255,255,255,0.95)';
          ctx.lineWidth = Math.max(1, p.size * 0.12 * a);
          ctx.beginPath();
          ctx.moveTo(-len * 0.18, 0);
          ctx.lineTo(len * 0.35, 0);
          ctx.stroke();
          ctx.restore();
        } else if (p.shape === 'droplet') {
          const ang = Math.atan2(p.vy || 0, p.vx || 0) + (p.rot || 0) * 0.12;
          const len = p.size * (p.stretch || 1.7) * (0.65 + (1 - a) * 0.65);
          const wid = p.size * (0.6 + a * 0.25);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.moveTo(len * 0.55, 0);
          ctx.quadraticCurveTo(len * 0.12, wid * 0.9, -len * 0.55, 0);
          ctx.quadraticCurveTo(len * 0.12, -wid * 0.9, len * 0.55, 0);
          ctx.fill();
          if (p.highlight) {
            ctx.globalAlpha *= 0.45;
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.beginPath();
            ctx.ellipse(len * 0.08, -wid * 0.18, len * 0.2, wid * 0.16, 0, 0, TAU);
            ctx.fill();
          }
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.45 + a * 0.8), 0, TAU);
          ctx.fill();
          if (p.highlight) {
            ctx.globalAlpha *= 0.33;
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.beginPath();
            ctx.arc(p.x - p.size * 0.16, p.y - p.size * 0.18, p.size * 0.22, 0, TAU);
            ctx.fill();
          }
        }
        if (allowGlow && p.glow) ctx.shadowBlur = 0;
      }
      ctx.restore();
    }
    drawShockwaves(ctx) {
      ctx.save();
      for (const s of this.shockwaves) {
        if (!this.isWorldVisible(s.x, s.y, s.radius + 20)) continue;
        const a = clamp(s.life / s.maxLife, 0, 1);
        ctx.globalAlpha = a * 0.82;
        ctx.strokeStyle = rgba(s.color, 0.92);
        ctx.lineWidth = 4 + 4 * a;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius * (1.1 - a * 0.58), 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = a * 0.22;
        ctx.lineWidth = 10 * a;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius * (0.72 + (1 - a) * 0.4), 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }
    drawFloaters(ctx) {
      ctx.save();
      for (const f of this.floaters) {
        if (!this.isWorldVisible(f.x, f.y, 120 * (f.scale || 1))) continue;
        const a = f.life / f.maxLife;
        ctx.globalAlpha = Math.min(1, a * 1.5);
        ctx.font = `${Math.round(18 * f.scale)}px ui-rounded, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.fillStyle = f.color;
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.restore();
    }
    drawScreenRush(ctx, w, h, dpr, target) {
      if (!target || !target.alive || this.useLowFx()) return;
      const speed = Math.hypot(target.vx || 0, target.vy || 0);
      const streak = clamp((target.streak || 0) / CONFIG.STREAK_MAX, 0, 1);
      const lowTime = this.roundActive && !this.roundOver && this.matchTime <= CONFIG.LOW_TIME_SECONDS ? 0.12 : 0;
      const rush = clamp((speed - 220) / 520 + streak * 0.26 + lowTime, 0, 1);
      if (rush <= 0.18) return;
      // Keep high-speed feedback out of the playfield center. The old screen
      // streaks read as a rigid striped box; the real trail now follows the
      // player in world space via drawPlayerTrails().
      const cx = w * 0.5, cy = h * 0.5;
      const vignette = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.28, cx, cy, Math.max(w, h) * 0.72);
      vignette.addColorStop(0, 'rgba(255,255,255,0)');
      vignette.addColorStop(1, rgba(target.color || '#ffffff', 0.025 + rush * 0.035));
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    drawThreatArrows(ctx, w, h, dpr, target) {
      if (!target || !target.alive || this.useLowFx() || !this.view) return;
      const me = target;
      const maxDist2 = 1050 * 1050;
      let drawn = 0;
      ctx.save();
      for (const p of this.players.values()) {
        if (p === me || !p.alive) continue;
        const d2 = dist2(me.x, me.y, p.x, p.y);
        if (d2 > maxDist2 || this.isWorldVisible(p.x, p.y, p.r + 80)) continue;
        const sx = p.x * this.view.zoom + this.view.tx;
        const sy = p.y * this.view.zoom + this.view.ty;
        const cx = w * 0.5, cy = h * 0.5;
        const a = Math.atan2(sy - cy, sx - cx);
        const dx = Math.cos(a), dy = Math.sin(a);
        const margin = 30 * dpr;
        const scale = Math.min((w * 0.5 - margin) / Math.max(0.001, Math.abs(dx)), (h * 0.5 - margin) / Math.max(0.001, Math.abs(dy)));
        const x = cx + dx * scale;
        const y = cy + dy * scale;
        const threat = this.splatPower(p) > this.splatPower(me) * CONFIG.SPLAT_POWER_RATIO;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        ctx.globalAlpha = threat ? 0.88 : 0.62;
        ctx.fillStyle = threat ? 'rgba(255,92,138,0.92)' : rgba(p.color, 0.9);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.moveTo(14 * dpr, 0);
        ctx.lineTo(-10 * dpr, -9 * dpr);
        ctx.lineTo(-6 * dpr, 0);
        ctx.lineTo(-10 * dpr, 9 * dpr);
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
        ctx.restore();
        if (++drawn >= 4) break;
      }
      ctx.restore();
    }
    drawScreenConfetti(ctx, w, h, dpr) {
      if (!this.confetti.length) return;
      ctx.save();
      for (const c of this.confetti) {
        const a = clamp(c.life / c.maxLife, 0, 1);
        ctx.globalAlpha = Math.min(1, a * 1.35);
        ctx.translate(c.x * dpr, c.y * dpr);
        ctx.rotate(c.rot);
        ctx.fillStyle = c.color;
        const s = c.size * dpr;
        roundRect(ctx, -s * 0.5, -s * 0.18, s, s * 0.36, s * 0.12);
        ctx.fill();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      ctx.restore();
    }
    drawMenuBackground(ctx, w, h) {
      // The DOM menu is on top; this just keeps the canvas alive behind it.
      const t = now() * 0.0003;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const orb of this.menuOrbs) {
        const x = (orb.x + Math.sin(t * orb.drift + orb.phase) * 0.035) * w;
        const y = (orb.y + Math.cos(t * (orb.drift + 0.2) + orb.phase * 1.7) * 0.04) * h;
        const pulse = 0.82 + easeInOutSine((Math.sin(t * 2.2 + orb.phase) + 1) * 0.5) * 0.32;
        ctx.fillStyle = rgba(orb.color, 0.055);
        ctx.beginPath();
        ctx.arc(x, y, orb.r * pulse * this.pixelRatio, 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.42;
      for (let i = 0; i < 22; i++) {
        const color = CONFIG.COLORS[i % CONFIG.COLORS.length];
        const x = (Math.sin(t * (0.8 + i * 0.07) + i) * 0.45 + 0.5) * w;
        const y = (Math.cos(t * (0.9 + i * 0.05) + i * 1.7) * 0.45 + 0.5) * h;
        ctx.fillStyle = rgba(color, 0.09);
        ctx.beginPath();
        ctx.arc(x, y, (80 + (i % 5) * 22) * this.pixelRatio, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    drawMinimap() {
      if (this.mode === 'menu' || $('minimap').classList.contains('hidden')) return;
      const t = this.frameNow || now();
      const interval = this.useLowFx() ? 180 : this.useMediumFx() ? 130 : 95;
      if (t - this.lastMinimapAt < interval) return;
      this.lastMinimapAt = t;
      const ctx = this.minictx;
      const w = this.minimap.width, h = this.minimap.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#121629';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(this.paint.canvas, 0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, w - 2, h - 2);
      if (this.view?.zoom) {
        const screenW = innerWidth / (this.view.zoom / this.view.dpr);
        const screenH = innerHeight / (this.view.zoom / this.view.dpr);
        const vx = clamp(this.camera.x - screenW / 2, 0, CONFIG.WORLD_W);
        const vy = clamp(this.camera.y - screenH / 2, 0, CONFIG.WORLD_H);
        const vw = clamp(screenW, 0, CONFIG.WORLD_W);
        const vh = clamp(screenH, 0, CONFIG.WORLD_H);
        ctx.strokeStyle = 'rgba(255,255,255,0.82)';
        ctx.lineWidth = 1.25;
        ctx.strokeRect(vx / CONFIG.WORLD_W * w, vy / CONFIG.WORLD_H * h, vw / CONFIG.WORLD_W * w, vh / CONFIG.WORLD_H * h);
      }
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x / CONFIG.WORLD_W * w, p.y / CONFIG.WORLD_H * h, p.id === this.myId ? 5 : 3.5, 0, TAU);
        ctx.fill();
      }
    }
    updateHud(force = false) {
      if (this.mode === 'menu') return;
      const t = this.frameNow || now();

      const timerText = formatTime(this.matchTime);
      if (force || timerText !== this.lastTimerText) {
        $('timer').textContent = timerText;
        this.lastTimerText = timerText;
      }
      const lowTime = this.roundActive && !this.roundOver && this.matchTime <= CONFIG.LOW_TIME_SECONDS;
      if (force || lowTime !== this.lastLowTimeClass) {
        $('timer').classList.toggle('low-time', lowTime);
        this.lastLowTimeClass = lowTime;
      }

      let roundState;
      if (!this.roundActive && !this.roundOver) roundState = this.isHost ? 'Waiting - press Start' : 'Waiting for host';
      else if (this.roundOver && this.winner) roundState = `${this.winner.name || 'Winner'} wins - next round soon`;
      else roundState = this.isHost ? 'Paint, boost, splat' : 'Connected to host';
      if (force || roundState !== this.lastRoundStateText) {
        $('roundState').textContent = roundState;
        this.lastRoundStateText = roundState;
      }

      const me = this.players.get(this.myId);
      const boostPct = Math.round((me?.boost ?? 0) * 100);
      if (force || boostPct !== this.lastBoostPct) {
        $('boostFill').style.width = `${boostPct}%`;
        this.lastBoostPct = boostPct;
      }
      const boosting = !!(me?.input?.boost && me?.boost > 0.03);
      if (force || boosting !== this.lastBoosting) {
        $('boostFill').parentElement.classList.toggle('boosting', boosting);
        this.lastBoosting = boosting;
      }
      const streakValue = Math.round(me?.streak || 0);
      const streakText = streakValue >= 18 ? `${streakValue}` : '';
      if (force || streakText !== this.lastStreakText) {
        const badge = $('streakBadge');
        if (badge) {
          badge.classList.toggle('hidden', !streakText);
          const strong = badge.querySelector('strong');
          if (strong) strong.textContent = streakText || '0';
          badge.classList.toggle('hot', streakValue >= CONFIG.STREAK_TIER * 2);
        }
        this.lastStreakText = streakText;
      }

      if (!force && t - this.lastHudAt < 120) {
        if (t - this.lastRoomOverlayAt > 300) {
          this.lastRoomOverlayAt = t;
          this.updateRoomLobbyOverlay();
        }
        return;
      }
      this.lastHudAt = t;

      const rows = Array.from(this.players.values()).map(p => ({
        name: p.name,
        color: p.color,
        score: this.isHost ? this.paint.getCells(p.code) : p.score || this.paint.getCells(p.code),
        me: p.id === this.myId,
        bot: p.isBot
      })).sort((a, b) => b.score - a.score).slice(0, 6);
      const total = this.paint.size;
      const html = rows.map((r, i) => {
        const pct = (r.score / total * 100).toFixed(1);
        const rowClass = r.me ? 'leader-row me' : 'leader-row';
        return `<div class="${rowClass}" style="--leader-color:${r.color}"><span class="swatch" style="background:${r.color};color:${r.color}"></span><span class="leader-name">${i + 1}. ${escapeHtml(r.name)}${r.me ? ' *' : ''}${r.bot ? ' bot' : ''}</span><span class="leader-score">${pct}%</span></div>`;
      }).join('');
      if (force || html !== this.lastLeaderboardHtml) {
        $('leaderboard').innerHTML = html;
        this.lastLeaderboardHtml = html;
      }

      if (force || t - this.lastRoomOverlayAt > 300) {
        this.lastRoomOverlayAt = t;
        this.updateRoomLobbyOverlay();
      }
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function escapeHtml(str) {
    return String(str).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  }

  window.PaintRushConfig = CONFIG;
  window.addEventListener('DOMContentLoaded', () => { window.paintRush = new Game(); });
})();
