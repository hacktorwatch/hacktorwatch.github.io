/* Live local clock on the original hero artwork. The measured projective
 * transform keeps the photographed glass and static complications registered
 * with the hands as the entire watch floats. No clock or location service. */
(() => {
  'use strict';
  const host = document.querySelector('[data-hero-clock]');
  if (!host) return;
  const canvas = host.querySelector('[data-hero-clock-canvas]');
  const photograph = host.querySelector('img');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let assets, glass, markerBright, markerSecond, font, atlas;
  let available = false, inView = true, timer = 0, state = null, labelMinute = '';
  const dateTexture = document.createElement('canvas');
  dateTexture.width = 300;
  dateTexture.height = 56;
  const dateCtx = dateTexture.getContext('2d');
  let dateKey = '';

  function image(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Hero clock artwork unavailable.'));
      img.src = url;
    });
  }

  function positionScreen() {
    if (!assets) return;
    // The homography maps unit-ring coordinates to the 1083 × 1319 image.
    // CSS matrix3d preserves true perspective rather than approximating it
    // with a rotation/skew. The shared parent supplies the floating motion.
    const h = assets.homography, r = assets.ring, c = assets.center;
    const scale = host.clientWidth / 1083;
    const a = h[0] / r, b = h[1] / r, d = h[3] / r, e = h[4] / r;
    const g = h[6] / r, j = h[7] / r;
    const x = h[2] - c * (a + b), y = h[5] - c * (d + e);
    const z = h[8] - c * (g + j);
    canvas.style.transform = `matrix3d(${a * scale},${d * scale},0,${g},${b * scale},${e * scale},0,${j},0,0,1,0,${x * scale},${y * scale},0,${z})`;
  }

  function dateArtwork(date) {
    const value = `${DAYS[date.getDay()]} ${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]}`;
    if (value === dateKey) return;
    dateKey = value;
    dateCtx.clearRect(0, 0, dateTexture.width, dateTexture.height);
    const glyphs = [...value].map(char => font.glyphs[char.charCodeAt(0)]);
    const scale = 1.9;
    const width = glyphs.reduce((sum, glyph) => sum + glyph.advance, 0);
    let cursor = (dateTexture.width - width * scale) / 2;
    const top = (dateTexture.height - font.height * scale) / 2;
    for (const glyph of glyphs) {
      dateCtx.drawImage(atlas, glyph.x, glyph.y, font.cellWidth, font.cellHeight,
        cursor - font.padding * scale, top - font.padding * scale,
        font.cellWidth * scale, font.cellHeight * scale);
      cursor += glyph.advance * scale;
    }
    dateCtx.globalCompositeOperation = 'source-in';
    dateCtx.fillStyle = '#eceeee';
    dateCtx.fillRect(0, 0, dateTexture.width, dateTexture.height);
    dateCtx.globalCompositeOperation = 'source-over';
  }

  function marker(position, source) {
    const rect = assets.markers[((position % 60) + 60) % 60];
    ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height,
      rect.x, rect.y, rect.width, rect.height);
  }

  function hand(degrees, length, width, color, tail = 0) {
    ctx.save();
    ctx.translate(assets.center, assets.center);
    ctx.rotate(degrees * Math.PI / 180);
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineWidth = width * assets.ring;
    ctx.beginPath();
    ctx.moveTo(0, tail * assets.ring);
    ctx.lineTo(0, -length * assets.ring);
    ctx.stroke();
    ctx.restore();
  }

  function render(date = new Date()) {
    if (!available || !Number.isFinite(date.getTime())) return state;
    const second = date.getSeconds() + (motion.matches ? 0 : date.getMilliseconds() / 1000);
    const minute = date.getMinutes() + second / 60;
    const hour = date.getHours() % 12 + minute / 60;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // This native canvas clean plate retains the original glass, numerals,
    // steps and battery pixels; only the old hands/date were reconstructed.
    ctx.drawImage(glass, 0, 0);
    dateArtwork(date);
    ctx.drawImage(dateTexture, assets.center - dateTexture.width / 2,
      assets.center - .438 * assets.ring - dateTexture.height / 2);
    // Complete photographed dot patches replace the original white glyph,
    // including its antialiased edges, before the hands are painted.
    marker(date.getMinutes(), markerBright);
    marker(date.getHours() % 12 * 5, markerBright);
    marker(date.getSeconds(), markerSecond);
    hand(hour * 30, .54, .043, '#f2f3f3');
    hand(minute * 6, .86, .040, '#f2f3f3');
    hand(second * 6, .96, .020, '#eb2814', .22);
    ctx.fillStyle = '#ed2915';
    ctx.beginPath();
    ctx.arc(assets.center, assets.center, .060 * assets.ring, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#f7dddd';
    ctx.beginPath();
    ctx.arc(assets.center, assets.center, .012 * assets.ring, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#b82212';
    ctx.beginPath();
    ctx.arc(assets.center, assets.center, .005 * assets.ring, 0, 2 * Math.PI);
    ctx.fill();
    state = {time: date.toISOString(), hour: date.getHours(), minute: date.getMinutes(),
      second: date.getSeconds(), day: date.getDate(), month: date.getMonth() + 1,
      year: date.getFullYear(), steps: assets.sample.steps, battery: assets.sample.battery};
    // No live region: assistive technology can read the clock on demand,
    // without announcing every sweep of the seconds hand.
    const key = `${state.year}-${state.month}-${state.day}-${state.hour}-${state.minute}`;
    if (key !== labelMinute) {
      labelMinute = key;
      const time = `${String(state.hour).padStart(2, '0')}:${String(state.minute).padStart(2, '0')}`;
      canvas.setAttribute('aria-label', `Hacktor Watch showing your local time ${time}, ${dateKey} ${state.year}; 1957 steps and 49% battery.`);
    }
    return {...state};
  }

  function stop() { clearTimeout(timer); timer = 0; }
  function update() {
    stop();
    if (!available || document.hidden || !inView) return;
    render();
    // Always reread wall time. Hidden tabs and a midnight rollover cannot
    // leave the watch behind, and reduced motion retains a working clock.
    const delay = motion.matches ? 1000 - Date.now() % 1000 + 5 : 1000 / 20;
    timer = setTimeout(update, delay);
  }
  document.addEventListener('visibilitychange', update);
  window.addEventListener('pageshow', update);
  motion.addEventListener('change', update);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting;
      update();
    }, {rootMargin: '80px'}).observe(host);
  }
  if ('ResizeObserver' in window) new ResizeObserver(positionScreen).observe(host);
  else window.addEventListener('resize', positionScreen);

  const ready = (async () => {
    assets = window.HERO_CLOCK_ASSETS;
    const fonts = window.WATCH_DEMO_ASSETS;
    if (!assets || !fonts) throw new Error('Hero clock assets unavailable.');
    font = fonts.metadata.fonts.font2;
    [glass, markerBright, markerSecond, atlas] = await Promise.all([
      image(assets.glass), image(assets.markerBright), image(assets.markerSecond),
      image(fonts.images?.[font.image] || new URL(`assets/watch-animation/${font.image}`, document.baseURI).href),
    ]);
    canvas.width = assets.width;
    canvas.height = assets.height;
    available = true;
    positionScreen();
    render();
    canvas.hidden = false;
    photograph.setAttribute('aria-hidden', 'true');
    host.dataset.ready = 'true';
    update();
    return true;
  })().catch(error => {
    stop();
    available = false;
    canvas.hidden = true;
    photograph.removeAttribute('aria-hidden');
    host.dataset.ready = 'false';
    console.warn('Hero clock:', error.message);
    return false;
  });
  window.heroClock = {canvas, ready, render, getState: () => state ? {...state} : null};
})();
