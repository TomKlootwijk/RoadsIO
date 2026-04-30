(() => {
  'use strict';

  /**
   * RoadsSplash.io
   * A tiny canvas/WebRTC territory game. It is intentionally dependency-free for
   * GitHub Pages. Signaling uses the RuneVale HTTP long-poll room mailbox only
   * to exchange WebRTC SDP/ICE messages; gameplay runs over DataChannels.
   */

  const CONFIG = {
    VERSION: '0.2.13-retry-stuck-join',
    SIGNALING_URL: 'https://runevalesignaling.onrender.com',
    SIGNALING_MODE: 'http', // RuneVale HTTP long-poll signaling mailbox
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

    PAINT_POWER: 470,
    CONVERT_POWER: 260,
    OVERPAINT_CENTER: 0.52,
    TRAIL_DEPOSIT_STEP: 6,
    COLLISION_PUSH: 0,
    COLLISION_BOUNCE: 0,
    REINFORCE_POWER: 260,
    SPLAT_MIN_IMPACT: 105,
    SPLAT_POWER_RATIO: 1.12,
    SPLAT_RADIUS_WEIGHT: 4.8,
    SPLAT_SPEED_WEIGHT: 0.22,
    BUMP_FEEDBACK_MS: 180,
    JELLO_STIFFNESS: 44,
    JELLO_DAMPING: 10.5,
    JELLO_SPEED_SQUASH: 0.22,
    JELLO_IMPACT_SCALE: 0.017,
    BOOST_SHAKE: 1.25,
    SPLAT_SHAKE: 22,
    OWN_SPLAT_SHAKE: 30,
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
      this.musicGain = null;
      this.sfxGain = null;
      this.nextMusicAt = 0;
      this.musicStep = 0;
      this.lastPaintSound = 0;
      this.lastConvertSound = 0;
      this.boostOsc = null;
      this.boostGain = null;
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
          const master = this.ctx.createGain();
          master.gain.value = 1;
          master.connect(this.ctx.destination);
          this.musicGain = this.ctx.createGain();
          this.musicGain.gain.value = 0.5;
          this.musicGain.connect(master);
          this.sfxGain = this.ctx.createGain();
          this.sfxGain.gain.value = 0.95;
          this.sfxGain.connect(master);
          this.nextMusicAt = this.ctx.currentTime + 0.08;
        }
        if (this.ctx.state === 'suspended') this.ctx.resume?.().catch(() => {});
        this.nextMusicAt = Math.max(this.nextMusicAt || 0, this.ctx.currentTime + 0.06);
        return true;
      } catch (_) {
        return false;
      }
    }
    toggle() {
      this.enabled = !this.enabled;
      localStorage.setItem('paintRush.sound', this.enabled ? 'on' : 'off');
      if (this.enabled) {
        this.unlock();
        setTimeout(() => this.beep(660, 0.1, 'triangle', 0.08), 60);
      } else {
        this.stopBoost();
      }
      return this.enabled;
    }
    tone(freq = 420, dur = 0.08, type = 'sine', vol = 0.035, dest = this.sfxGain, at = null) {
      if (!this.enabled) return;
      this.unlock();
      const ctx = this.ctx;
      if (!ctx) return;
      if (ctx.state === 'suspended') return;
      const t = at ?? ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(50, freq * 0.86), t + dur);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(dest || ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
    beep(freq = 420, dur = 0.055, type = 'sine', vol = 0.035) { this.tone(freq, dur, type, vol); }
    paint(amount = 1) {
      if (!this.enabled || !this.ctx) return;
      const t = this.ctx.currentTime;
      if (t - this.lastPaintSound < 0.085) return;
      this.lastPaintSound = t;
      this.tone(520 + Math.min(18, amount) * 12, 0.05, 'triangle', 0.032);
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
        this.boostOsc.frequency.value = 72;
        this.boostGain.gain.value = 0.0001;
        this.boostOsc.connect(this.boostGain).connect(this.sfxGain);
        this.boostOsc.start();
        this.tone(180, 0.08, 'triangle', 0.035);
      }
      if (this.boostGain) this.boostGain.gain.setTargetAtTime(on ? 0.018 : 0.0001, ctx.currentTime, 0.055);
      if (!on && this.boostOsc) {
        const osc = this.boostOsc;
        const gain = this.boostGain;
        this.boostOsc = null;
        this.boostGain = null;
        setTimeout(() => {
          try { osc.stop(); osc.disconnect(); gain.disconnect(); } catch (_) {}
        }, 180);
      }
    }
    stopBoost() {
      this.boostShake = 0;
      if (!this.boostOsc) return;
      const osc = this.boostOsc;
      const gain = this.boostGain;
      this.boostOsc = null;
      this.boostGain = null;
      try { gain.gain.setTargetAtTime(0.0001, this.ctx?.currentTime || 0, 0.03); } catch (_) {}
      setTimeout(() => {
        try { osc.stop(); osc.disconnect(); gain.disconnect(); } catch (_) {}
      }, 120);
    }
    pop() {
      this.splat();
    }
    hit(force = 1) {
      this.tone(160 + force * 24, 0.09, 'triangle', 0.045);
      this.tone(320 + force * 55, 0.06, 'sine', 0.035);
      this.shake = Math.max(this.shake, 5 + force * 3);
    }
    convert(amount = 1) {
      if (!this.enabled || !this.ctx) return;
      const t = this.ctx.currentTime;
      if (t - this.lastConvertSound < 0.13) return;
      this.lastConvertSound = t;
      this.tone(360 + Math.min(20, amount) * 8, 0.07, 'triangle', 0.028);
    }
    join() {
      this.tone(523, 0.08, 'triangle', 0.04);
      this.tone(784, 0.1, 'sine', 0.035, this.sfxGain, this.ctx ? this.ctx.currentTime + 0.07 : null);
    }
    splat(strength = 1, own = false) {
      this.tone(105, 0.16, 'triangle', 0.105);
      this.tone(260, 0.11, 'sawtooth', 0.055);
      this.tone(620, 0.08, 'sine', 0.04, this.sfxGain, this.ctx ? this.ctx.currentTime + 0.04 : null);
      this.shake = Math.max(this.shake, (own ? CONFIG.OWN_SPLAT_SHAKE : CONFIG.SPLAT_SHAKE) * strength);
      this.flash = Math.max(this.flash, own ? 0.3 : 0.22);
    }
    roundEnd() {
      if (!this.enabled) return;
      this.unlock();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      [392, 494, 587, 784].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.04, this.sfxGain, t + i * 0.12));
      this.tone(196, 0.55, 'sine', 0.05, this.sfxGain, t);
      this.flash = Math.max(this.flash, 0.28);
    }
    tick(dt) {
      this.shake = Math.max(0, this.shake - dt * 42);
      this.boostShake = Math.max(0, this.boostShake - dt * 4);
      this.flash = Math.max(0, this.flash - dt);
      if (!this.enabled || !this.ctx || !this.musicGain) return;
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      const notes = [0, 3, 5, 7, 10, 7, 5, 3];
      while (this.nextMusicAt < this.ctx.currentTime + 0.22) {
        const step = this.musicStep++;
        const note = notes[step % notes.length] + (step % 16 >= 8 ? 12 : 0);
        const freq = 220 * Math.pow(2, note / 12);
        this.tone(freq, 0.2, 'triangle', 0.07, this.musicGain, this.nextMusicAt);
        if (step % 4 === 0) this.tone(freq / 2, 0.42, 'sine', 0.08, this.musicGain, this.nextMusicAt);
        this.nextMusicAt += 0.32;
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
      this.lastState = { x: 0, y: 0, boost: false };
      this.juice.boost(false);
    }
    updateNub() {
      const dx = this.touchStick.x - this.touchStick.ox;
      const dy = this.touchStick.y - this.touchStick.oy;
      const n = normalize(dx, dy);
      const mag = Math.min(42, n.d);
      this.nub.style.transform = `translate(${n.x * mag}px, ${n.y * mag}px)`;
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
      this.dirtyFlag = new Uint8Array(this.size);
      this.netDirty = [];
      this.netDirtyFlag = new Uint8Array(this.size);
      this.counts = new Map();
      this.detail = new Uint8Array(this.size);
      for (let i = 0; i < this.size; i++) {
        const n = Math.sin(i * 12.9898 + (i % this.w) * 78.233) * 43758.5453;
        this.detail[i] = Math.floor((n - Math.floor(n)) * 255);
      }
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
      this.dirty = [];
      this.dirtyFlag.fill(0);
      this.netDirty = [];
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
    paintCircle(x, y, radius, code, dt, powerScale = 1) {
      if (!code) return 0;
      const minX = clamp(Math.floor((x - radius) / this.cellW), 0, this.w - 1);
      const maxX = clamp(Math.floor((x + radius) / this.cellW), 0, this.w - 1);
      const minY = clamp(Math.floor((y - radius) / this.cellH), 0, this.h - 1);
      const maxY = clamp(Math.floor((y + radius) / this.cellH), 0, this.h - 1);
      const r2 = radius * radius;
      let gained = 0;
      for (let cy = minY; cy <= maxY; cy++) {
        const wy = (cy + 0.5) * this.cellH;
        for (let cx = minX; cx <= maxX; cx++) {
          const wx = (cx + 0.5) * this.cellW;
          const dx = wx - x, dy = wy - y;
          if (dx * dx + dy * dy > r2) continue;
          const i = this.cellIndex(cx, cy);
          const old = this.owner[i];
          const edge = Math.sqrt(dx * dx + dy * dy) / radius;
          const falloff = 0.48 + (1 - edge) * 0.72;
          if (old === code) {
            const next = clamp(this.strength[i] + CONFIG.REINFORCE_POWER * dt * falloff * powerScale, 0, 255);
            if (next !== this.strength[i]) { this.strength[i] = next; this.markDirty(i); }
          } else {
            const centerClaim = falloff >= CONFIG.OVERPAINT_CENTER;
            const strength = old === 0
              ? 78 + falloff * 94 * powerScale
              : (centerClaim ? 112 + falloff * 92 * powerScale : 76 + falloff * 76 * powerScale);
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
        const wy = (cy + 0.5) * this.cellH;
        for (let cx = minX; cx <= maxX; cx++) {
          const wx = (cx + 0.5) * this.cellW;
          const dx = wx - x, dy = wy - y;
          if (dx * dx + dy * dy > r2) continue;
          const i = this.cellIndex(cx, cy);
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
      if (this.dirty.length === 0) return;
      const data = this.imageData.data;
      const n = Math.min(maxCells, this.dirty.length);
      for (let k = 0; k < n; k++) {
        const i = this.dirty[k];
        this.dirtyFlag[i] = 0;
        this.writePixel(data, i);
      }
      this.dirty.splice(0, n);
      this.ctx.putImageData(this.imageData, 0, 0);
    }
    writePixel(data, i) {
      const code = this.owner[i];
      const c = this.palette[code] || this.palette[0];
      const s = this.strength[i] / 255;
      const grain = (this.detail[i] - 128) / 128;
      const p = i * 4;
      if (code === 0) {
        const shade = grain * 5;
        data[p] = Math.round(23 + shade);
        data[p + 1] = Math.round(27 + shade);
        data[p + 2] = Math.round(48 + shade * 1.4);
        data[p + 3] = 255;
      } else {
        const edge = this.isPaintEdge(i, code) ? 18 : 0;
        const sheen = this.detail[(i * 17 + 13) % this.size] > 218 ? 13 : 0;
        const shade = grain * 5 + edge + sheen;
        const mix = 0.68 + s * 0.32;
        data[p] = clamp(Math.round(lerp(20, c.r, mix) + shade), 0, 255);
        data[p + 1] = clamp(Math.round(lerp(22, c.g, mix) + shade), 0, 255);
        data[p + 2] = clamp(Math.round(lerp(38, c.b, mix) + shade * 0.65), 0, 255);
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
      const out = [];
      const n = Math.min(limit, this.netDirty.length);
      for (let k = 0; k < n; k++) {
        const i = this.netDirty[k];
        this.netDirtyFlag[i] = 0;
        out.push([i, this.owner[i], this.strength[i]]);
      }
      this.netDirty.splice(0, n);
      return out;
    }
    clearOutgoingDeltas() {
      for (const i of this.netDirty) this.netDirtyFlag[i] = 0;
      this.netDirty = [];
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
      this.dirty = [];
      this.dirtyFlag.fill(0);
      this.netDirty = [];
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
      this.personality = rand(0.2, 1);
      this.aggression = rand(0.15, 0.78);
    }
    update(dt, game) {
      const p = this.player;
      this.rethink -= dt;
      if (this.rethink <= 0 || dist2(p.x, p.y, this.tx, this.ty) < 90 * 90) {
        this.rethink = rand(0.45, 1.2);
        const enemy = game.closestEnemy(p);
        const shouldHunt = enemy && Math.random() < this.aggression && p.r > enemy.r * 0.92 && dist2(p.x, p.y, enemy.x, enemy.y) < 420 * 420;
        if (shouldHunt) {
          this.tx = enemy.x + rand(-60, 60);
          this.ty = enemy.y + rand(-60, 60);
        } else {
          const target = game.findPaintTarget(p.code, p.x, p.y, this.personality);
          this.tx = target.x;
          this.ty = target.y;
        }
      }

      const avoid = game.closestThreat(p);
      let ax = this.tx - p.x, ay = this.ty - p.y;
      if (avoid && dist2(p.x, p.y, avoid.x, avoid.y) < 190 * 190 && avoid.r > p.r * 1.05) {
        ax += (p.x - avoid.x) * 2.4;
        ay += (p.y - avoid.y) * 2.4;
      }
      const n = normalize(ax, ay);
      const boost = p.boost > 0.35 && (this.aggression > 0.52 || (avoid && avoid.r > p.r));
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
      if (this.connected && this.room) {
        this.sendSignal(this.hostPeerId || '*', 'bye', { peerId: this.id }).catch(() => {});
      }
      this.cancelled = true;
      try { this.pollAbort?.abort(); } catch (_) {}
      this.connected = false;
      this.polling = false;
      this.pollAbort = null;
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
          gameVersion: CONFIG.VERSION,
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
          gameVersion: CONFIG.VERSION,
          contentHash: CONFIG.SIGNALING_CONTENT_HASH
        }
      });
      this.room = String(data.roomCode || room).toUpperCase();
      this.hostPeerId = data.hostPeerId || null;
      this.cursor = Number(data.messageCursor || 0);
      this.connected = true;
      this.emit('status', { title: 'Connected', text: `Joined signaling room ${this.room}.`, details: 'Mode: HTTP long-poll mailbox' });
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
        const stateNow = existing?.pc?.connectionState || '';
        const t = now();
        if (this.isHost && !existing?.open && existing?.pc?.localDescription?.type === 'offer' && t - (existing.lastOfferAt || 0) > 1200) {
          existing.lastOfferAt = t;
          this.signal.sendSignal(peer.id, 'offer', existing.pc.localDescription);
        }
        const staleUnopened = this.isHost && !existing?.open && t - (existing?.createdAt || 0) > 10000;
        const stillNegotiating = !staleUnopened && ((t - (existing?.createdAt || 0) < 8000)
          || stateNow === 'new'
          || stateNow === 'connecting'
          || stateNow === 'connected');
        if (existing?.open || !this.isHost || stillNegotiating) return;
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
      const pc = peer.pc;
      try {
        if (type === 'offer') {
          if (pc.signalingState === 'stable' && pc.remoteDescription?.type === 'offer' && pc.localDescription?.type === 'answer') {
            this.signal.sendSignal(from, 'answer', pc.localDescription);
            return;
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
      const dc = useState ? peer?.stateDc : peer?.dc;
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
      this.particles = [];
      this.floaters = [];
      this.shockwaves = [];
      this.camera = { x: CONFIG.WORLD_W / 2, y: CONFIG.WORLD_H / 2, zoom: 1 };
      this.view = null;
      this.quality = localStorage.getItem('paintRush.quality') || 'auto';
      this.pixelRatio = 1;
      this.lastTick = now();
      this.accumNet = 0;
      this.accumPaintNet = 0;
      this.accumInput = 0;
      this.accumFullGrid = 0;
      this.lastHostJoinNudgeAt = 0;
      this.joinWaitStartedAt = 0;
      this.fps = 60;
      this.frameCounter = 0;
      this.netBytes = 0;

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
    }
    getTargetDpr() {
      const raw = window.devicePixelRatio || 1;
      if (this.quality === 'low') return Math.min(1, raw);
      if (this.quality === 'medium') return Math.min(1.35, raw);
      if (this.quality === 'high') return Math.min(2, raw);
      const small = innerWidth < 720 || innerHeight < 520;
      const slow = this.fps < 45;
      return Math.min(small || slow ? 1 : 1.5, raw);
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
      const url = `${CONFIG.SIGNALING_URL}/rooms?gameVersion=${encodeURIComponent(CONFIG.VERSION)}&contentHash=${encodeURIComponent(CONFIG.SIGNALING_CONTENT_HASH)}&limit=20`;
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
    async startHost() {
      this.readMenuName();
      this.closeNetwork();
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
      this.sendFullSnapshot();
      this.updateHostControls();
    }
    async joinRoom(codeOverride = null) {
      this.readMenuName();
      const code = String(codeOverride || $('roomInput').value).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CONFIG.ROOM_CODE_LENGTH);
      if (!code) { this.toast('Enter a room code first.'); return; }
      $('roomInput').value = code;
      this.closeNetwork();
      this.mode = 'client';
      this.isHost = false;
      this.roomCode = code;
      this.lastHostJoinNudgeAt = 0;
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
        this.toast('Could not join. Try again after the Render server wakes up.');
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
      this.signal.sendSignal(this.signal.hostPeerId, 'join', {
        peerId: this.myId,
        displayName: this.playerName,
        name: this.playerName
      });
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
      this.updateRoomLobbyOverlay();
    }
    updateHostControls() {
      const start = $('startRoundBtn');
      if (start) start.classList.add('hidden');
      $('addBotBtn').classList.toggle('hidden', !(this.isHost && this.mode === 'host' && !this.roundActive));
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
      this.hideRoomLobbyOverlay();
      let i = 0;
      for (const p of this.players.values()) {
        this.spawnPlayer(p, i++);
        p.alive = true;
        p.respawn = 0;
        p.boost = 0.75;
        this.paint.paintCircle(p.x, p.y, 88, p.code, 1, 2.6);
      }
      this.juice.beep(523, 0.07, 'triangle', 0.04);
      this.juice.beep(784, 0.08, 'triangle', 0.035);
      this.toast('Round start! Claim everything.', 1800);
      this.updateHostControls();
    }
    showWaitingBanner() {
      if (this.centerBanner?.title === 'Room ready') this.centerBanner = null;
      this.updateRoomLobbyOverlay();
    }
    shouldShowRoomLobby() {
      return this.mode !== 'menu' && this.mode !== 'local' && !!this.roomCode && !this.roundActive;
    }
    updateRoomLobbyOverlay() {
      const overlay = $('roomLobbyOverlay');
      if (!overlay) return;
      const show = this.shouldShowRoomLobby();
      overlay.classList.toggle('hidden', !show);
      const touch = $('touchControls');
      if (touch && this.mode !== 'menu') touch.classList.toggle('hidden', show);
      if (!show) return;

      const count = Math.max(1, Array.from(this.players.values()).filter(p => !p.isBot).length);
      const winnerName = this.winner?.name || 'Winner';
      $('lobbyRoomCode').textContent = this.roomCode || '---';
      $('lobbyPlayerCount').textContent = `${count} player${count === 1 ? '' : 's'} connected`;
      $('lobbyStartBtn').classList.toggle('hidden', !(this.isHost && this.mode === 'host'));
      if (this.roundOver) {
        $('lobbyRoomText').textContent = this.isHost
          ? `${winnerName} wins. Start the next round when everyone is ready.`
          : `${winnerName} wins. Waiting for the host to start the next round.`;
      } else {
        $('lobbyRoomText').textContent = this.isHost
          ? 'Press Start when everyone has joined.'
          : 'You are in the room. Waiting for the host to start.';
      }
    }
    hideRoomLobbyOverlay() {
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
        lastPaintX: 0, lastPaintY: 0, noInputTimer: 0, lastBumpAt: 0,
        wobble: 0, wobbleV: 0, squash: 0, stretch: 0, impactSquash: 0,
        boostPulse: 0, lastSpeed: 0, hitFlash: 0
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
    }
    addBotButton() {
      if (!this.isHost) return;
      if (this.roundActive) { this.toast('Bots can join before the round starts.'); return; }
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
      this.mesh.broadcast(this.buildPaintSnapshot(true), 'state');
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
        isBot: p.isBot, score: this.paint.getCells(p.code)
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
    }
    applySnapshot(msg) {
      const wasRoundActive = this.roundActive;
      const wasRoundOver = this.roundOver;
      const incomingRoundId = Number.isFinite(Number(msg.roundId)) ? Number(msg.roundId) : this.roundId;
      const startsFreshRound = !!msg.roundActive && !msg.roundOver
        && (incomingRoundId !== this.roundId || (!wasRoundActive && wasRoundOver));
      if (startsFreshRound) this.clearClientPaintForRound(incomingRoundId);
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
        }
      }
      for (const id of Array.from(this.players.keys())) if (!seen.has(id)) this.players.delete(id);
      if (this.mode === 'client' && !this.players.has(this.myId)) this.sendClientHello();
      if (becameRoundOver && this.winner) {
        this.showRoundBanner(this.winner);
        this.juice.roundEnd();
      } else if (!this.roundActive && !this.roundOver && this.mode !== 'menu') {
        this.showWaitingBanner();
      }
      if (this.roundActive && !this.roundOver) {
        this.centerBanner = null;
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
      if (event.type === 'splat') {
        const p = this.players.get(event.victim) || { x: event.x, y: event.y, color: '#fff' };
        const x = Number(event.x) || p.x || CONFIG.WORLD_W / 2;
        const y = Number(event.y) || p.y || CONFIG.WORLD_H / 2;
        this.burst(x, y, event.color || p.color, 42, 1.35);
        this.shockwave(x, y, event.killerColor || event.color || p.color, 92);
        const own = event.victim === this.myId || event.killer === this.myId;
        this.juice.splat(own ? 1 : 0.65, event.victim === this.myId);
      }
    }

    loop(t) {
      const rawDt = Math.min(0.05, (t - this.lastTick) / 1000 || 0.016);
      this.lastTick = t;
      this.fps = lerp(this.fps, 1 / Math.max(0.001, rawDt), 0.04);
      this.juice.tick(rawDt);
      if (this.centerBanner) {
        this.centerBanner.life -= rawDt;
        if (this.centerBanner.life <= 0) this.centerBanner = null;
      }

      if (this.mode !== 'menu') {
        if (this.isHost) this.tickHost(rawDt);
        else this.tickClient(rawDt);
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
    tickHost(dt) {
      if (!this.roundActive) {
        const myInput = this.input.getState();
        const me = this.players.get(this.myId);
        if (me) me.input = myInput;
        this.juice.boost(false);
        this.networkHost(dt);
        this.updateHostControls();
        return;
      }
      if (this.roundOver) {
        this.networkHost(dt);
        this.updateHostControls();
        return;
      } else {
        this.matchTime -= dt;
        if (this.matchTime <= 0) this.endRound();
      }
      const myInput = this.input.getState();
      const me = this.players.get(this.myId);
      if (me) me.input = myInput;

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
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      let wallHit = 0;
      if (p.x < p.r) { p.x = p.r; p.vx = Math.abs(p.vx) * 0.28; wallHit = 1; }
      if (p.y < p.r) { p.y = p.r; p.vy = Math.abs(p.vy) * 0.28; wallHit = 1; }
      if (p.x > CONFIG.WORLD_W - p.r) { p.x = CONFIG.WORLD_W - p.r; p.vx = -Math.abs(p.vx) * 0.28; wallHit = 1; }
      if (p.y > CONFIG.WORLD_H - p.r) { p.y = CONFIG.WORLD_H - p.r; p.vy = -Math.abs(p.vy) * 0.28; wallHit = 1; }
      if (wallHit) p.impactSquash = Math.min(0.32, p.impactSquash + Math.max(0.08, speed / 900));

      this.updateJello(p, dt, wantsBoost);

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
        if (p.id === this.myId && p.combo > 28) {
          this.floatText(p.x, p.y - p.r - 18, `+${p.combo}`, p.color);
          p.combo = 0;
        }
      }
      const movedPaint = Math.hypot(p.x - p.lastPaintX, p.y - p.lastPaintY);
      if (movedPaint > 32 && speed > 40) {
        this.addParticle(p.x - p.vx * 0.03, p.y - p.vy * 0.03, -p.vx * 0.08 + rand(-20, 20), -p.vy * 0.08 + rand(-20, 20), p.color, rand(0.22, 0.45), rand(3, p.r * 0.25), 0.9);
        p.lastPaintX = p.x; p.lastPaintY = p.y;
      }
    }
    updateJello(p, dt, boosting) {
      const speed = Math.hypot(p.vx, p.vy);
      const speedDelta = Math.abs(speed - (p.lastSpeed || 0));
      const targetSquash = clamp(speed / 520 * CONFIG.JELLO_SPEED_SQUASH + p.impactSquash, 0, 0.42);
      const targetStretch = clamp(speed / 640 * 0.18 + (boosting ? 0.08 : 0), 0, 0.34);
      p.squash = lerp(p.squash || 0, targetSquash, 1 - Math.exp(-CONFIG.JELLO_STIFFNESS * dt));
      p.stretch = lerp(p.stretch || 0, targetStretch, 1 - Math.exp(-CONFIG.JELLO_STIFFNESS * 0.65 * dt));
      p.impactSquash = Math.max(0, (p.impactSquash || 0) - dt * 2.6);
      p.boostPulse = boosting ? Math.min(1, (p.boostPulse || 0) + dt * 5) : Math.max(0, (p.boostPulse || 0) - dt * 4);
      const wobbleTarget = clamp((speedDelta / 320) + p.impactSquash * 1.2 + p.boostPulse * 0.08, 0, 0.7);
      p.wobbleV = (p.wobbleV || 0) + (wobbleTarget - (p.wobble || 0)) * CONFIG.JELLO_STIFFNESS * dt;
      p.wobbleV *= Math.exp(-CONFIG.JELLO_DAMPING * dt);
      p.wobble = clamp((p.wobble || 0) + p.wobbleV * dt, 0, 0.8);
      p.hitFlash = Math.max(0, (p.hitFlash || 0) - dt * 3.2);
      p.lastSpeed = speed;
    }
    depositPaintTrail(p, x0, y0, x1, y1, radius, dt, powerScale) {
      const d = Math.hypot(x1 - x0, y1 - y0);
      const steps = clamp(Math.ceil(d / CONFIG.TRAIL_DEPOSIT_STEP), 1, 14);
      const stampDt = Math.max(dt / Math.min(steps, 3), 1 / 75);
      let gained = 0;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        gained += this.paint.paintCircle(lerp(x0, x1, t), lerp(y0, y1, t), radius, p.code, stampDt, powerScale);
      }
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
          if (d >= min) continue;
          const nx = dx / d, ny = dy / d;
          const av = a.vx * nx + a.vy * ny;
          const bv = b.vx * nx + b.vy * ny;
          const rel = av - bv;
          const impact = Math.abs(rel);
          if (!this.roundOver && impact > 24) {
            const aPower = this.splatPower(a);
            const bPower = this.splatPower(b);
            if (impact > CONFIG.SPLAT_MIN_IMPACT && aPower > bPower * CONFIG.SPLAT_POWER_RATIO) this.splat(b, a, impact, aPower, bPower);
            else if (impact > CONFIG.SPLAT_MIN_IMPACT && bPower > aPower * CONFIG.SPLAT_POWER_RATIO) this.splat(a, b, impact, bPower, aPower);
            else this.bumpPlayers(a, b, impact);
          }
        }
      }
    }
    splatPower(p) {
      return p.r * CONFIG.SPLAT_RADIUS_WEIGHT + Math.hypot(p.vx, p.vy) * CONFIG.SPLAT_SPEED_WEIGHT;
    }
    bumpPlayers(a, b, impact = 0) {
      const t = now();
      if (t - Math.max(a.lastBumpAt || 0, b.lastBumpAt || 0) < CONFIG.BUMP_FEEDBACK_MS) return;
      a.lastBumpAt = b.lastBumpAt = t;
      const force = clamp(impact / 260, 0.35, 1.4);
      a.impactSquash = Math.min(0.32, (a.impactSquash || 0) + force * CONFIG.JELLO_IMPACT_SCALE * 10);
      b.impactSquash = Math.min(0.32, (b.impactSquash || 0) + force * CONFIG.JELLO_IMPACT_SCALE * 10);
      a.hitFlash = b.hitFlash = 0.35;
      this.burst((a.x + b.x) / 2, (a.y + b.y) / 2, impact % 2 ? a.color : b.color, 12, 0.55);
      if (a.id === this.myId || b.id === this.myId) this.juice.hit(force);
    }
    splat(victim, killer, impact = 0, winnerPower = 0, loserPower = 0) {
      if (!victim.alive || victim.respawn > 0) return;
      victim.alive = false;
      victim.respawn = 1.9;
      victim.vx = victim.vy = 0;
      victim.impactSquash = 0.42;
      killer.impactSquash = Math.min(0.36, (killer.impactSquash || 0) + 0.24);
      killer.hitFlash = 0.42;
      killer.boost = Math.min(1, killer.boost + 0.38);
      this.paint.paintCircle(victim.x, victim.y, victim.r * 2.7, killer.code, 0.5, 2.8);
      this.paint.eraseCircle(victim.x, victim.y, victim.r * 1.2, 0.45);
      this.burst(victim.x, victim.y, victim.color, 64, 1.8);
      this.shockwave(victim.x, victim.y, killer.color, victim.r * 3.2);
      const reason = winnerPower && loserPower ? ` ${Math.round(winnerPower - loserPower)} power` : '';
      this.floatText(victim.x, victim.y - victim.r, `${killer.name} splatted ${victim.name}!${reason}`, killer.color, 1.25);
      if (victim.id === this.myId || killer.id === this.myId) this.juice.splat(1, victim.id === this.myId);
      this.broadcastEventSafe({ type: 'splat', victim: victim.id, killer: killer.id, x: victim.x, y: victim.y, color: victim.color, killerColor: killer.color, impact });
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
        this.burst(this.winner.x, this.winner.y, this.winner.color, 80, 2);
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
      this.accumNet += dt;
      this.accumPaintNet += dt;
      this.accumFullGrid += dt;
      if (this.accumNet >= 1 / CONFIG.HOST_SNAPSHOT_HZ) {
        this.accumNet = 0;
        this.mesh.broadcast(this.buildSnapshot(false));
      }
      if (this.accumPaintNet >= 1 / CONFIG.PAINT_SNAPSHOT_HZ) {
        this.accumPaintNet = 0;
        const full = !this.roundActive && this.accumFullGrid >= CONFIG.FULL_GRID_SECONDS;
        if (full) this.accumFullGrid = 0;
        this.mesh.broadcast(this.buildPaintSnapshot(full), 'state');
      }
    }

    addParticle(x, y, vx, vy, color, life = 0.5, size = 8, alpha = 1) {
      if (this.quality === 'low' && this.particles.length > 120) return;
      this.particles.push({ x, y, vx, vy, color, life, maxLife: life, size, alpha });
    }
    burst(x, y, color, count = 24, force = 1) {
      const cap = this.quality === 'low' ? Math.min(count, 22) : count;
      for (let i = 0; i < cap; i++) {
        const a = rand(0, TAU), s = rand(80, 370) * force;
        this.addParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, color, rand(0.35, 0.9), rand(4, 14), 1);
      }
    }
    floatText(x, y, text, color, scale = 1) {
      this.floaters.push({ x, y, text, color, life: 1.3 * scale, maxLife: 1.3 * scale, vy: -42 * scale, scale });
    }
    shockwave(x, y, color, radius = 90) {
      this.shockwaves.push({ x, y, color, radius, life: 0.42, maxLife: 0.42 });
    }
    tickParticles(dt) {
      for (const p of this.particles) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= Math.exp(-3.4 * dt);
        p.vy *= Math.exp(-3.4 * dt);
        p.vy += 80 * dt;
      }
      this.particles = this.particles.filter(p => p.life > 0);
      for (const f of this.floaters) { f.life -= dt; f.y += f.vy * dt; }
      this.floaters = this.floaters.filter(f => f.life > 0);
      for (const s of this.shockwaves) s.life -= dt;
      this.shockwaves = this.shockwaves.filter(s => s.life > 0);
    }

    render(dt) {
      const ctx = this.ctx;
      const w = this.canvas.width, h = this.canvas.height, dpr = this.pixelRatio;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#101322';
      ctx.fillRect(0, 0, w, h);

      const target = this.players.get(this.myId) || Array.from(this.players.values())[0];
      if (target) {
        this.camera.x = lerp(this.camera.x, target.x, 1 - Math.pow(0.002, dt));
        this.camera.y = lerp(this.camera.y, target.y, 1 - Math.pow(0.002, dt));
      } else {
        this.camera.x = lerp(this.camera.x, CONFIG.WORLD_W / 2, 0.02);
        this.camera.y = lerp(this.camera.y, CONFIG.WORLD_H / 2, 0.02);
      }
      const viewTarget = Math.min(w / dpr / 880, h / dpr / 560);
      const mobileBoost = innerWidth < 720 ? 0.82 : 1;
      this.camera.zoom = clamp(viewTarget * mobileBoost, 0.42, 1.18) * dpr;
      const shake = (this.juice.shake + this.juice.boostShake) * dpr;
      const sx = shake ? rand(-shake, shake) : 0;
      const sy = shake ? rand(-shake, shake) : 0;
      const tx = w / 2 - this.camera.x * this.camera.zoom + sx;
      const ty = h / 2 - this.camera.y * this.camera.zoom + sy;
      this.view = { zoom: this.camera.zoom, tx, ty, dpr };
      ctx.setTransform(this.camera.zoom, 0, 0, this.camera.zoom, tx, ty);

      this.drawWorld(ctx);
      this.drawParticles(ctx, false);
      this.drawShockwaves(ctx);
      for (const p of this.players.values()) this.drawPlayer(ctx, p);
      this.drawParticles(ctx, true);
      this.drawFloaters(ctx);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (this.juice.flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${this.juice.flash * 0.35})`;
        ctx.fillRect(0, 0, w, h);
      }
      if (this.mode === 'menu') this.drawMenuBackground(ctx, w, h);
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
      ctx.restore();
    }
    drawWorld(ctx) {
      ctx.save();
      ctx.fillStyle = '#171b30';
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 40;
      roundRect(ctx, -16, -16, CONFIG.WORLD_W + 32, CONFIG.WORLD_H + 32, 36);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.paint.canvas, 0, 0, CONFIG.WORLD_W, CONFIG.WORLD_H);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 5;
      roundRect(ctx, 0, 0, CONFIG.WORLD_W, CONFIG.WORLD_H, 22);
      ctx.stroke();
      // Subtle grid lines only on desktop/high enough zoom.
      if (this.camera.zoom > 0.68 && this.quality !== 'low') {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255,255,255,0.035)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= CONFIG.WORLD_W; x += 140) { ctx.moveTo(x, 0); ctx.lineTo(x, CONFIG.WORLD_H); }
        for (let y = 0; y <= CONFIG.WORLD_H; y += 140) { ctx.moveTo(0, y); ctx.lineTo(CONFIG.WORLD_W, y); }
        ctx.stroke();
      }
      ctx.restore();
    }
    drawPlayer(ctx, p) {
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
      const angle = speed > 10 ? Math.atan2(p.vy, p.vx) : 0;
      const t = now() * 0.006;
      const wobble = p.wobble || 0;
      const squash = clamp((p.squash || 0) + Math.sin(t * 1.7 + p.code) * wobble * 0.03, 0, 0.46);
      const stretch = clamp((p.stretch || 0) + (p.boostPulse || 0) * 0.08, 0, 0.38);
      const pulse = 1 + Math.sin(t * 2.6 + p.code) * wobble * 0.04;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.27)';
      ctx.beginPath();
      ctx.ellipse(p.x + 3, p.y + p.r * 0.72, p.r * (1.05 + stretch), p.r * 0.34, 0, 0, TAU);
      ctx.fill();
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);
      ctx.scale((1 + stretch + squash * 0.55) * pulse, Math.max(0.62, 1 - squash * 0.62));

      if ((p.boostPulse || 0) > 0.02) {
        ctx.save();
        ctx.globalAlpha = 0.22 + p.boostPulse * 0.28;
        ctx.strokeStyle = rgba(p.color, 0.8);
        ctx.lineWidth = Math.max(3, p.r * 0.16);
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(-p.r * (1.1 + i * 0.25), (i - 1) * p.r * 0.28);
          ctx.lineTo(-p.r * (2.1 + i * 0.3), (i - 1) * p.r * 0.36);
          ctx.stroke();
        }
        ctx.restore();
      }

      const grad = ctx.createRadialGradient(-p.r * 0.35, -p.r * 0.45, p.r * 0.15, 0, 0, p.r * 1.2);
      grad.addColorStop(0, lighten(p.color, 0.58));
      grad.addColorStop(0.45, p.color);
      grad.addColorStop(1, darken(p.color, 0.38));
      ctx.shadowColor = rgba(p.color, 0.35);
      ctx.shadowBlur = 16 + p.boostPulse * 16;
      ctx.fillStyle = grad;
      ctx.beginPath();
      const points = 30;
      for (let i = 0; i <= points; i++) {
        const a = i / points * TAU;
        const wave = Math.sin(a * 3 + t + p.code) * wobble * 0.08
          + Math.sin(a * 2 - t * 0.8) * wobble * 0.04
          + Math.cos(a - Math.PI) * (p.impactSquash || 0) * 0.08;
        const rr = p.r * (1 + wave);
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = (p.hitFlash || 0) > 0 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.38)';
      ctx.lineWidth = 2.5 + (p.hitFlash || 0) * 5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.58)';
      ctx.beginPath();
      ctx.ellipse(-p.r * 0.33, -p.r * 0.42, p.r * 0.24, p.r * 0.13, -0.55, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.ellipse(p.r * 0.18, p.r * 0.22, p.r * 0.46, p.r * 0.18, 0.4, 0, TAU);
      ctx.fill();
      if ((p.boostPulse || 0) > 0.02) {
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        for (let i = 0; i < 2; i++) {
          ctx.beginPath();
          ctx.arc(0, 0, p.r + 5 + i * 5 + Math.sin(t * 4) * 2, -0.8, 0.8);
          ctx.stroke();
        }
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
      ctx.restore();
    }
    drawParticles(ctx, foreground) {
      ctx.save();
      for (const p of this.particles) {
        const a = p.life / p.maxLife;
        if (foreground !== (p.size > 9)) continue;
        ctx.globalAlpha = a * p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.45 + a * 0.8), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    drawShockwaves(ctx) {
      ctx.save();
      for (const s of this.shockwaves) {
        const a = clamp(s.life / s.maxLife, 0, 1);
        ctx.globalAlpha = a * 0.82;
        ctx.strokeStyle = rgba(s.color, 0.9);
        ctx.lineWidth = 5 * a;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius * (1.1 - a * 0.6), 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }
    drawFloaters(ctx) {
      ctx.save();
      for (const f of this.floaters) {
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
    drawMenuBackground(ctx, w, h) {
      // The DOM menu is on top; this just keeps the canvas alive behind it.
      const t = now() * 0.0003;
      ctx.save();
      ctx.globalAlpha = 0.65;
      for (let i = 0; i < 16; i++) {
        const color = CONFIG.COLORS[i % CONFIG.COLORS.length];
        const x = (Math.sin(t * (0.8 + i * 0.07) + i) * 0.45 + 0.5) * w;
        const y = (Math.cos(t * (0.9 + i * 0.05) + i * 1.7) * 0.45 + 0.5) * h;
        ctx.fillStyle = rgba(color, 0.11);
        ctx.beginPath();
        ctx.arc(x, y, 90 + (i % 5) * 22, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    drawMinimap() {
      if (this.mode === 'menu' || $('minimap').classList.contains('hidden')) return;
      const ctx = this.minictx;
      const w = this.minimap.width, h = this.minimap.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#121629';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(this.paint.canvas, 0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, w - 2, h - 2);
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x / CONFIG.WORLD_W * w, p.y / CONFIG.WORLD_H * h, p.id === this.myId ? 5 : 3.5, 0, TAU);
        ctx.fill();
      }
    }
    updateHud() {
      if (this.mode === 'menu') return;
      $('timer').textContent = formatTime(this.matchTime);
      if (!this.roundActive && !this.roundOver) $('roundState').textContent = this.isHost ? 'Waiting - press Start' : 'Waiting for host';
      else if (this.roundOver && this.winner) $('roundState').textContent = `${this.winner.name || 'Winner'} wins - host starts next`;
      else $('roundState').textContent = this.isHost ? 'Paint, boost, splat' : 'Connected to host';
      const me = this.players.get(this.myId);
      $('boostFill').style.width = `${Math.round((me?.boost ?? 0) * 100)}%`;
      $('boostFill').parentElement.classList.toggle('boosting', !!(me?.input?.boost && me?.boost > 0.03));
      const rows = Array.from(this.players.values()).map(p => ({
        name: p.name,
        color: p.color,
        score: this.isHost ? this.paint.getCells(p.code) : p.score || this.paint.getCells(p.code),
        me: p.id === this.myId,
        bot: p.isBot
      })).sort((a, b) => b.score - a.score).slice(0, 6);
      const total = this.paint.size;
      $('leaderboard').innerHTML = rows.map((r, i) => {
        const pct = (r.score / total * 100).toFixed(1);
        return `<div class="leader-row"><span class="swatch" style="background:${r.color};color:${r.color}"></span><span class="leader-name">${i + 1}. ${escapeHtml(r.name)}${r.me ? ' ★' : ''}${r.bot ? ' 🤖' : ''}</span><span class="leader-score">${pct}%</span></div>`;
      }).join('');
      this.updateRoomLobbyOverlay();
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
