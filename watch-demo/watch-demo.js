/* Real wrist photography + the watch's own 240px firmware artwork. */
(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const canvas = document.getElementById('watch-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;
  const status = document.getElementById('demo-status');
  const toggle = document.getElementById('playback-toggle');
  const container = canvas.closest('[data-watch-animation]');
  const poster = container.querySelector('[data-watch-poster]');
  const assetBase = new URL(container.dataset.assets, document.baseURI);

  const SIZE = 240;
  const LOOP = 12;
  const HOLD_ANALOG = 5;
  const SWIPE = .8;
  const RETURN_START = LOOP - SWIPE;
  // Measured in the 1121 × 1403 photographic clean plate. The axes align the
  // firmware's display with the real LCD, including its tilt and foreshortening.
  const DISPLAY = { x: 535, y: 651, ux: 230, uy: -134, vx: 126, vy: 215 };
  const COLORS = { black: '#000000', white: '#ffffff', secondary: '#c0c0c0', mint: '#a0ebaa', divider: '#404040', red: '#c80000', brightRed: '#ff0000', blue: '#008cff' };
  const sample = { steps: 1957, battery: 79, charging: false };
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const FULL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const face = document.createElement('canvas');
  face.width = face.height = SIZE;
  const f = face.getContext('2d');
  const screen = document.createElement('canvas');
  screen.width = screen.height = SIZE;
  const s = screen.getContext('2d');
  let metadata, images, photograph;
  let playing = false;
  let inView = false;
  let request = 0;
  let origin = performance.now();
  let elapsed = 0;
  let lastFrame = -Infinity;
  // A short film with a visible minute change on digital and an invisible
  // reset while analog is offscreen. ?mode=live opts into the visitor's clock.
  let playbackMode = params.get('mode') === 'live' ? 'live' : 'fixed';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const tintCache = new Map();
  const markerCache = new Map();

  const image = url => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Unable to load watch artwork: ${url}`));
    img.src = url;
  });
  const circle = (c, x, y, radius, color) => {
    c.fillStyle = color;
    c.beginPath();
    c.arc(x, y, radius, 0, Math.PI * 2);
    c.fill();
  };

  function tint(name, color) {
    const key = `${name}:${color}`;
    if (tintCache.has(key)) return tintCache.get(key);
    const source = images[name];
    const result = document.createElement('canvas');
    result.width = source.width;
    result.height = source.height;
    const c = result.getContext('2d');
    c.drawImage(source, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = color;
    c.fillRect(0, 0, result.width, result.height);
    tintCache.set(key, result);
    return result;
  }

  // Each glyph is rasterized by the same LovyanGFX font used on the watch.
  function fontInfo(name) { return metadata.fonts[name]; }
  function glyph(font, char) { return font.glyphs[char.charCodeAt(0)] || font.glyphs[63]; }
  function width(text, fontName = 'font2') {
    const font = fontInfo(fontName);
    const chars = [...String(text)];
    if (!chars.length) return 0;
    const last = glyph(font, chars.pop());
    const start = glyph(font, String(text)[0]);
    return chars.reduce((sum, char) => sum + glyph(font, char).advance, 0) +
      Math.max(last.advance, last.inkWidth + last.xOffset) + Math.max(0, -start.xOffset);
  }
  function text(value, x, y, options = {}) {
    const str = String(value);
    if (!str) return 0;
    const name = options.font || 'font2';
    const font = fontInfo(name);
    const total = width(str, name);
    const align = options.align || 'left';
    const datum = options.datum || 'top';
    let cursor = x - (align === 'center' ? Math.floor(total / 2) : align === 'right' ? total : 0);
    let top = y - (datum === 'middle' ? Math.floor(font.height / 2) : datum === 'baseline' ? font.baseline : 0);
    const atlas = tint(font.image, options.color || COLORS.secondary);
    const first = glyph(font, str[0]);
    cursor += first.leadingAdjustment || 0;
    for (const char of str) {
      const item = glyph(font, char);
      f.drawImage(atlas, item.x, item.y, font.cellWidth, font.cellHeight,
        cursor - font.padding - (item.leadingAdjustment || 0), top - font.padding,
        font.cellWidth, font.cellHeight);
      cursor += item.advance;
    }
    return total;
  }

  function drawBattery() {
    const x = 145, y = 115;
    f.fillStyle = COLORS.secondary;
    f.fillRect(x, y, 16, 1);
    f.fillRect(x, y + 11, 16, 1);
    f.fillRect(x, y, 1, 12);
    f.fillRect(x + 15, y, 1, 12);
    f.fillRect(x + 16, y + 3, 3, 6);
    f.fillStyle = sample.battery > 20 ? COLORS.blue : COLORS.brightRed;
    f.fillRect(x + 2, y + 2, Math.floor(14 * sample.battery / 100), 8);
    if (sample.charging) {
      f.fillStyle = COLORS.white;
      f.beginPath(); f.moveTo(x + 7, y + 2); f.lineTo(x + 11, y + 2); f.lineTo(x + 8, y + 7); f.fill();
      f.beginPath(); f.moveTo(x + 8, y + 5); f.lineTo(x + 12, y + 5); f.lineTo(x + 9, y + 10); f.fill();
    }
    text(`${String(sample.battery).padStart(3, ' ')}%`, x + 20, y - 2);
  }

  function drawMarker(position, color) {
    const index = ((position % 60) + 60) % 60;
    const mask = metadata.analog.markerMasks[index];
    const key = `${index}:${color}`;
    if (!markerCache.has(key)) {
      const stamp = document.createElement('canvas');
      stamp.width = mask.width;
      stamp.height = mask.rows.length;
      const c = stamp.getContext('2d');
      // Replace the original glyph, including its background. Drawing a
      // floating-point circle over its integer firmware raster leaves white
      // edges, especially on the nine-pixel hour markers.
      c.fillStyle = COLORS.black;
      c.fillRect(0, 0, stamp.width, stamp.height);
      c.fillStyle = color;
      mask.rows.forEach((row, y) => {
        for (let x = 0; x < mask.width; x++) {
          if (row & (1 << x)) c.fillRect(x, y, 1, 1);
        }
      });
      markerCache.set(key, stamp);
    }
    f.drawImage(markerCache.get(key), mask.x, mask.y);
  }

  function analog(date) {
    f.clearRect(0, 0, SIZE, SIZE);
    f.drawImage(images['analog-dial.png'], 0, 0);
    const second = date.getSeconds() + date.getMilliseconds() / 1000;
    const minute = date.getMinutes() + second / 60;
    const hour = date.getHours() % 12 + minute / 60;
    text(`${DAYS[date.getDay()]} ${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]}`, 120, 74, { align: 'center', datum: 'middle' });
    drawBattery();
    const count = sample.steps.toLocaleString('en-US');
    const rowWidth = 17 + 4 + width(count);
    const rowX = 120 - Math.floor(rowWidth / 2);
    f.drawImage(tint('shoe-icon.png', COLORS.secondary), rowX, 165);
    text(count, rowX + 21, 170, { datum: 'middle' });
    drawMarker(date.getMinutes(), COLORS.brightRed);
    drawMarker(date.getHours() * 5 % 60, COLORS.brightRed);
    drawMarker(date.getSeconds(), COLORS.red);
    const hand = (name, degrees, pivotX, pivotY, scaleX = 1) => {
      f.save();
      f.translate(120, 120);
      f.rotate(degrees * Math.PI / 180);
      f.scale(scaleX, 1);
      f.drawImage(images[name], -pivotX, -pivotY);
      f.restore();
    };
    hand('hour-hand.png', hour * 30, 3, 100);
    hand('minute-hand.png', minute * 6, 3, 100);
    hand('second-hand.png', second * 6, 1, 100, .7);
    circle(f, 120, 120, 6, COLORS.red);
    f.strokeStyle = '#000';
    f.lineWidth = 1;
    f.beginPath(); f.arc(120, 120, 2, 0, Math.PI * 2); f.stroke();
  }

  function digits(value, x, y, color) {
    const atlas = tint('digital-digits.png', color);
    const str = String(value).padStart(2, '0');
    for (let i = 0; i < 2; i++) {
      f.drawImage(atlas, Number(str[i]) * 44, 0, 44, 68, x + i * 44, y, 44, 68);
    }
  }

  function digital(date) {
    f.fillStyle = COLORS.black;
    f.fillRect(0, 0, SIZE, SIZE);
    digits(date.getHours(), 28, 61, COLORS.white);
    digits(date.getMinutes(), 28, 133, COLORS.mint);
    const baselineText = (str, x, y, font = 'font2', color = COLORS.secondary) => text(str, x, y, { font, color, datum: 'baseline' });
    const right = 134;
    const dayWidth = baselineText(date.getDate(), right, 49, 'roboto-thin24', COLORS.mint);
    baselineText(MONTHS[date.getMonth()], right + dayWidth + 4, 49, 'font2', COLORS.white);
    baselineText(FULL_DAYS[date.getDay()], right, 69);
    f.fillStyle = COLORS.divider; f.fillRect(right, 78, 79, 1);
    baselineText(sample.steps, right, 103, 'roboto-thin24', COLORS.mint);
    baselineText('Steps', right, 121);
    f.fillStyle = COLORS.divider; f.fillRect(right, 128, 79, 1);
    baselineText(`${sample.battery}%`, right, 154, 'roboto-thin24', COLORS.mint);
    baselineText(sample.charging ? 'Charging' : 'Power', right, 172);
    f.fillStyle = COLORS.divider; f.fillRect(right, 179, 67, 1);
    baselineText((sample.steps * .747 / 1000).toFixed(1), right, 204, 'roboto-thin24', COLORS.mint);
    baselineText('km est.', right, 221);
  }

  function timeline(seconds) {
    const phase = ((seconds % LOOP) + LOOP) % LOOP;
    if (phase < HOLD_ANALOG) return { phase, face: 'analog', offset: 0 };
    if (phase < HOLD_ANALOG + SWIPE) return { phase, face: 'analog', next: 'digital', offset: -SIZE * swipeProgress((phase - HOLD_ANALOG) / SWIPE) };
    if (phase < RETURN_START) return { phase, face: 'digital', offset: 0 };
    return { phase, face: 'digital', next: 'analog', offset: SIZE * swipeProgress((phase - RETURN_START) / SWIPE) };
  }

  function swipeProgress(value) {
    // A deliberate finger-length drag followed by the watch's cubic settling.
    const t = Math.max(0, Math.min(1, value));
    const release = .75, distance = .72;
    if (t < release) return distance * (1 - Math.cos(Math.PI * t / release)) / 2;
    const rest = (t - release) / (1 - release);
    return distance + (1 - distance) * (1 - (1 - rest) ** 3);
  }

  function dateAt(seconds, mode, phase) {
    if (mode === 'live') return new Date();
    // Reset the incoming analog face while it is hidden. Its seconds hand then
    // crosses the video seam continuously, giving a clean repeating hero loop.
    const position = phase >= RETURN_START ? phase - LOOP : phase;
    return new Date(2026, 10, 7, 10, 8, 52, 0 + Math.round(position * 1000));
  }

  function composeFace(name, date, x) {
    if (name === 'analog') analog(date); else digital(date);
    s.drawImage(face, x, 0);
  }

  function renderAt(seconds, options = {}) {
    if (!images) return;
    const mode = options.mode || playbackMode;
    const state = timeline(seconds);
    const date = dateAt(seconds, mode, state.phase);
    s.fillStyle = COLORS.black;
    s.fillRect(0, 0, SIZE, SIZE);
    composeFace(state.face, date, state.offset);
    if (state.next) composeFace(state.next, date, state.offset + (state.offset <= 0 ? SIZE : -SIZE));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(photograph, 0, 0, canvas.width, canvas.height);
    ctx.save();
    const {x, y, ux, uy, vx, vy} = DISPLAY;
    ctx.setTransform(ux / 120, uy / 120, vx / 120, vy / 120,
      x - ux - vx, y - uy - vy);
    ctx.beginPath();
    ctx.arc(120, 120, 120, 0, Math.PI * 2);
    ctx.clip();
    // Emissive LCD pixels sit beneath the photographed glass. Black remains
    // transparent to its actual warm reflections; the bezel never moves.
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = .84;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.filter = 'blur(0.12px)';
    ctx.drawImage(screen, 0, 0);
    ctx.restore();
    return { phase: state.phase, face: state.face, transitioning: !!state.next, time: date.toISOString() };
  }

  function buttonState() {
    const label = playing ? 'Pause watch animation' : 'Play watch animation';
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    toggle.querySelector('path').setAttribute('d', playing ? 'M7 5h4v14H7zm6 0h4v14h-4z' : 'M8 5v14l11-7z');
    status.textContent = playing ? 'Watchface animation playing.' : 'Watchface animation paused.';
  }
  const canRun = () => playing && inView && !document.hidden;
  function suspend() {
    if (request) elapsed = (performance.now() - origin) / 1000;
    cancelAnimationFrame(request);
    request = 0;
  }
  function resume() {
    if (!canRun() || request) return;
    origin = performance.now() - elapsed * 1000;
    lastFrame = -Infinity;
    request = requestAnimationFrame(tick);
  }
  function tick(now) {
    if (!canRun()) { request = 0; return; }
    if (now - lastFrame >= 1000 / 30 - .5) {
      elapsed = (now - origin) / 1000;
      renderAt(elapsed);
      lastFrame = now;
    }
    request = requestAnimationFrame(tick);
  }
  function pause() {
    suspend();
    playing = false;
    buttonState();
  }
  function play() {
    if (playing || !photograph) return;
    playing = true;
    buttonState();
    resume();
  }
  toggle.addEventListener('click', () => playing ? pause() : play());
  document.addEventListener('visibilitychange', () => document.hidden ? suspend() : resume());
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting;
      if (inView) resume(); else suspend();
    }).observe(canvas);
  } else {
    inView = true;
  }
  reducedMotion.addEventListener('change', event => { if (event.matches) pause(); });

  const ready = (async () => {
    const bundle = window.WATCH_DEMO_ASSETS;
    if (!bundle?.metadata) throw new Error('Watch artwork metadata unavailable.');
    metadata = bundle.metadata;
    const names = ['analog-dial.png', 'hour-hand.png', 'minute-hand.png', 'second-hand.png', 'shoe-icon.png',
      'font2-atlas.png', 'roboto-thin24-atlas.png', 'digital-digits.png'];
    const [photo, artwork] = await Promise.all([
      image(bundle.images?.['wrist-clean.webp'] || new URL('wrist-clean.webp', assetBase).href),
      Promise.all(names.map(async name => [name, await image(bundle.images?.[name] || new URL(name, assetBase).href)])),
    ]);
    photograph = photo;
    images = Object.fromEntries(artwork);
    renderAt(0);
    canvas.hidden = false;
    // Keep the poster beneath the canvas as a resilient loading/error fallback.
    poster.setAttribute('aria-hidden', 'true');
    toggle.hidden = false;
    container.dataset.ready = 'true';
    buttonState();
    if (!reducedMotion.matches && params.get('autoplay') !== '0') play();
    return api;
  })().catch(error => {
    canvas.hidden = true;
    poster.removeAttribute('aria-hidden');
    toggle.hidden = true;
    status.textContent = 'Watch animation unavailable. Showing the analog watchface.';
    container.dataset.ready = 'false';
    console.warn('Watch animation:', error.message);
    return null;
  });

  const api = {
    canvas, ready, play, pause, renderAt, duration: LOOP,
    setMode(mode) { playbackMode = mode === 'fixed' ? 'fixed' : 'live'; renderAt(elapsed); },
    setSample(values = {}) {
      if (Number.isFinite(values.steps)) sample.steps = Math.max(0, Math.floor(values.steps));
      if (Number.isFinite(values.battery)) sample.battery = Math.max(0, Math.min(100, Math.round(values.battery)));
      if (typeof values.charging === 'boolean') sample.charging = values.charging;
      renderAt(elapsed);
    },
    renderFace(name, date = new Date()) {
      if (name === 'digital') digital(date); else analog(date);
      return face;
    },
    get isPlaying() { return playing; },
  };
  window.watchDemo = api;
})();
