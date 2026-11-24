(() => {
  'use strict';
  const section = document.getElementById('photography');
  const panel = document.getElementById('light-exhibition');
  const canvas = document.getElementById('gallery-light-canvas');
  const controls = document.getElementById('light-modes');
  if (!section || !panel || !canvas || !controls) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const buttons = [...controls.querySelectorAll('[data-light-mode]')];
  const tones = {
    gold: { core: [255, 250, 233], edge: [219, 162, 100], air: [246, 186, 108] },
    prism: { core: [237, 253, 255], edge: [117, 169, 237], air: [122, 195, 247] }
  };
  const rgba = (rgb, alpha) => `rgba(${rgb.join(',')},${alpha})`;
  const clamp = (n, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
  const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a.map((n, index) => Math.round(n + (b[index] - n) * t));
  let mode = 'gold', blend = 0, width = 0, height = 0, compact = false;
  let frame = 0, inView = false, elapsed = 0, previous = 0, painted = 0;
  let targetX = 0, targetY = 0, offsetX = 0, offsetY = 0, touchUntil = 0;
  let pageMotion = !document.body.classList.contains('motion-off');
  let seed = 47133;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const dust = Array.from({ length: 74 }, () => ({
    depth: random(), lane: (random() - .5) * 1.68, phase: random() * Math.PI * 2,
    size: .38 + random() * 1.05, alpha: .12 + random() * .38
  }));

  // Bake the tapered volume once; smooth filtering keeps the edges feathered
  // as a single surface rotates and shifts above the exhibition.
  function makeBeam(tone, spectral) {
    const texture = document.createElement('canvas');
    texture.width = 256; texture.height = 220;
    const surface = texture.getContext('2d');
    if (!surface) return null;
    const image = surface.createImageData(texture.width, texture.height);
    for (let y = 0; y < texture.height; y++) {
      const v = y / (texture.height - 1);
      const attenuation = (.86 * Math.exp(-v * 1.48) + .18) * (1 - smooth((v - .86) / .14));
      const half = .08 + .92 * v;
      for (let x = 0; x < texture.width; x++) {
        const u = (x / (texture.width - 1) * 2 - 1) / half;
        if (Math.abs(u) >= 1) continue;
        const edge = 1 - smooth((Math.abs(u) - .62) / .38);
        const body = Math.exp(-u * u * 3.35) * .61;
        const core = Math.exp(-Math.pow((u + .064) * 3.8, 2)) * .54;
        const striation = .83 + .095 * Math.sin(u * 29 + .7) + .055 * Math.sin(u * 66 - v * .7)
          + .02 * Math.cos(u * 127 + v * 2.7);
        const color = mix(tone.edge, tone.core, clamp(.91 - Math.abs(u) * .61 - v * .18));
        if (spectral) {
          color[0] += Math.round(22 * Math.exp(-Math.pow((u - .52) * 9, 2)));
          color[2] += Math.round(16 * Math.exp(-Math.pow((u + .6) * 7, 2)));
        }
        const i = (y * texture.width + x) * 4;
        image.data[i] = color[0]; image.data[i + 1] = color[1]; image.data[i + 2] = color[2];
        image.data[i + 3] = Math.round(255 * clamp((body + core) * attenuation * edge * striation));
      }
    }
    surface.putImageData(image, 0, 0);
    return texture;
  }

  const textures = ctx ? [makeBeam(tones.gold, false), makeBeam(tones.prism, true)] : [];
  const canPaint = Boolean(ctx && textures[0] && textures[1]);
  const revealSurface = canPaint ? document.createElement('canvas') : null;
  const revealContext = revealSurface?.getContext('2d');
  if (revealContext) { revealSurface.width = textures[0].width; revealSurface.height = textures[0].height; }
  const active = () => canPaint && pageMotion && !reduce.matches && inView && !document.hidden;

  function paintBeam(texture, intensity, length, endHalf, fall) {
    if (intensity < .005 || fall <= 0) return;
    let surface = texture;
    if (fall < 1 && revealContext) {
      const w = texture.width, h = texture.height;
      revealContext.globalCompositeOperation = 'source-over';
      revealContext.clearRect(0, 0, w, h);
      revealContext.drawImage(texture, 0, 0);
      revealContext.globalCompositeOperation = 'destination-in';
      const feather = revealContext.createLinearGradient(0, 0, 0, h);
      feather.addColorStop(Math.max(0, fall - .15), '#fff');
      feather.addColorStop(fall, '#fff0');
      revealContext.fillStyle = feather;
      revealContext.fillRect(0, 0, w, h);
      surface = revealSurface;
    }
    ctx.globalAlpha = intensity;
    ctx.drawImage(surface, -endHalf, 0, endHalf * 2, length);
  }

  function glow(x, y, radiusX, radiusY, color, intensity) {
    if (intensity <= 0) return;
    ctx.save();
    ctx.translate(x, y); ctx.scale(radiusX, radiusY);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    gradient.addColorStop(0, rgba(color, intensity));
    gradient.addColorStop(.36, rgba(color, intensity * .52));
    gradient.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }

  function draw() {
    if (!canPaint || !width || !height) return;
    const phase = elapsed * .00048;
    const progress = !pageMotion || reduce.matches ? 1 : clamp(elapsed / 1180);
    const fall = 1 - Math.pow(1 - progress, 2.1);
    const floorIntensity = smooth((fall - .68) / .32);
    const air = mix(tones.gold.air, tones.prism.air, blend);
    const core = mix(tones.gold.core, tones.prism.core, blend);
    const sourceX = width * (compact ? .77 : .755) + Math.sin(phase * .58) * width * .009 + offsetX * 7;
    const sourceY = -height * .143;
    const floorX = width * (compact ? .64 : .69) + Math.sin(phase * .79) * width * .018 + offsetX * (compact ? 22 : 39);
    const floorY = height * (compact ? .824 : .817) + offsetY * 13;
    const dx = floorX - sourceX, dy = floorY - sourceY;
    const length = Math.hypot(dx, dy);
    const tilt = Math.atan2(-dx, dy);
    const endHalf = Math.min(width * (compact ? .55 : .309), height * .69);
    const topHalf = endHalf * .08;
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;

    // Scattered light in the air and the soft pool where the beam meets the floor.
    glow((sourceX + floorX) / 2, height * .46, endHalf * 1.43, height * .59, air, .104 * fall);
    glow(floorX, floorY, endHalf * 1.16, height * .138, air, .22 * floorIntensity);
    glow(floorX, floorY + 1, endHalf * .77, height * .049, core, .33 * floorIntensity);
    glow(floorX, floorY - height * .038, endHalf * .66, height * .15, core, .075 * floorIntensity);

    ctx.save();
    ctx.translate(sourceX, sourceY);
    ctx.rotate(tilt);
    ctx.globalCompositeOperation = 'screen';
    paintBeam(textures[0], 1 - blend, length, endHalf, fall);
    paintBeam(textures[1], blend, length, endHalf, fall);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    const count = compact ? 40 : dust.length;
    ctx.fillStyle = rgba(core, .9);
    for (let i = 0; i < count; i++) {
      const item = dust[i];
      const t = .15 + ((item.depth + 1 - (phase * .019) % 1) % 1) * .8;
      if (t >= fall) continue;
      const half = topHalf + (endHalf - topHalf) * t;
      const lane = item.lane + Math.sin(phase * .7 + item.phase) * .029;
      const edge = clamp(1 - Math.abs(lane) * .77);
      ctx.globalAlpha = item.alpha * edge * smooth((fall - t) * 9) * (1 - t * .47);
      ctx.fillRect(lane * half, t * length, item.size, item.size);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    glow(sourceX + dx * .15, 0, endHalf * .67, height * .32, core, .19 * fall);
    panel.classList.add('light-rendered');
  }

  function tick(now) {
    frame = 0;
    if (!active()) return;
    if (!previous) previous = now;
    elapsed += Math.min(now - previous, 64);
    previous = now;
    if (now - painted > 32) {
      if (touchUntil && now > touchUntil) { targetX = targetY = 0; touchUntil = 0; }
      offsetX += (targetX - offsetX) * .073;
      offsetY += (targetY - offsetY) * .073;
      blend += ((mode === 'prism' ? 1 : 0) - blend) * .12;
      draw();
      painted = now;
    }
    frame = requestAnimationFrame(tick);
  }

  function sync() {
    section.classList.toggle('light-interactive', canPaint && pageMotion && !reduce.matches);
    if (active()) {
      if (!frame) { previous = 0; frame = requestAnimationFrame(tick); }
    } else {
      cancelAnimationFrame(frame); frame = previous = 0;
      if (!pageMotion || reduce.matches) {
        targetX = targetY = offsetX = offsetY = 0;
        blend = mode === 'prism' ? 1 : 0;
        elapsed = Math.max(elapsed, 1180);
        draw();
      }
    }
  }

  function resize() {
    if (!canPaint) return;
    width = panel.clientWidth; height = panel.clientHeight;
    compact = width < 620;
    const ratio = Math.min(devicePixelRatio || 1, 1.4);
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  }

  function move(event) {
    if (!active() || event.target.closest('button,a')) return;
    const rect = panel.getBoundingClientRect();
    targetX = clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1);
    targetY = clamp((event.clientY - rect.top) / rect.height * 2 - 1, -1, 1);
  }

  buttons.forEach(button => button.addEventListener('click', () => {
    mode = button.dataset.lightMode;
    section.dataset.light = mode;
    buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    if (!active()) { blend = mode === 'prism' ? 1 : 0; draw(); }
  }));
  controls.hidden = false;
  panel.addEventListener('pointermove', event => { if (event.pointerType !== 'touch') move(event); }, { passive: true });
  panel.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch') { move(event); touchUntil = performance.now() + 1450; }
  }, { passive: true });
  panel.addEventListener('pointerleave', event => { if (event.pointerType !== 'touch') targetX = targetY = 0; });
  document.addEventListener('portfolio:motion', event => { pageMotion = event.detail.enabled; sync(); });
  reduce.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', () => { cancelAnimationFrame(frame); frame = previous = 0; });
  window.addEventListener('pageshow', sync);
  if (canPaint) {
    new ResizeObserver(resize).observe(panel);
    new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); }, { threshold: .025 }).observe(panel);
    resize();
  }
  sync();
})();
