(() => {
  'use strict';
  const art = document.querySelector('.home-code-art');
  const canvas = art.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const stencil = document.createElement('canvas');
  const mask = stencil.getContext('2d', { willReadFrequently: true });
  if (!ctx || !mask) return;

  const colors = ['#ecf5ff', '#a9ceff', '#c6d8f5'];
  let width = 0, height = 0, points = [];
  let inView = false, frame = 0, lastPaint = 0, pointer = null;
  const moving = () => document.body.classList.contains('motion-on');
  const active = () => moving() && inView && !document.hidden;

  function resize() {
    width = art.clientWidth;
    height = art.clientHeight;
    if (!width || !height) return;
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    stencil.width = width;
    stencil.height = height;
    const size = Math.min(width * .265, height * .42, 106);
    mask.font = `800 ${size}px "Microsoft YaHei", "PingFang SC", sans-serif`;
    mask.textAlign = 'center';
    mask.textBaseline = 'middle';
    mask.fillText('胡', width / 2 - size * .53, height * .53);
    mask.fillText('杰', width / 2 + size * .53, height * .53);

    const pixels = mask.getImageData(0, 0, width, height).data;
    points = [];
    for (let y = 1; y < height; y += 3) {
      for (let x = 1; x < width; x += 3) {
        if (pixels[(y * width + x) * 4 + 3] < 140) continue;
        const phase = Math.random() * Math.PI * 2;
        points.push({x, y, dx: 0, dy: 0, phase, size: 1.65 + Math.random() * .48,
          color: colors[Math.floor(Math.random() * colors.length)]});
      }
    }
    draw(0, false);
    art.classList.toggle('particle-rendered', points.length > 0);
  }

  function draw(time, animate) {
    ctx.clearRect(0, 0, width, height);
    const seconds = time / 1000;
    const wave = width * (.5 + .25 * Math.sin(seconds * .9));
    for (const point of points) {
      let shiftX = 0, shiftY = 0;
      if (animate && pointer) {
        const dx = point.x - pointer.x, dy = point.y - pointer.y;
        const distance = Math.hypot(dx, dy);
        const force = Math.max(0, 1 - distance / 49) ** 2 * 16 / Math.max(distance, 1);
        shiftX = dx * force;
        shiftY = dy * force;
      }
      point.dx = animate ? point.dx + (shiftX - point.dx) * .16 : 0;
      point.dy = animate ? point.dy + (shiftY - point.dy) * .16 : 0;
      const driftX = animate ? Math.sin(seconds * 1.7 + point.phase) * .62 : 0;
      const driftY = animate ? Math.cos(seconds * 1.3 + point.phase) * .65 : 0;
      const shimmer = animate ? .22 * Math.max(0, 1 - Math.abs(point.x - wave) / 48) : .1;
      ctx.globalAlpha = Math.min(1, .68 + .1 * (Math.sin(point.phase + seconds * 2) + 1) + shimmer);
      ctx.fillStyle = point.color;
      ctx.fillRect(point.x + point.dx + driftX, point.y + point.dy + driftY, point.size, point.size);
    }
    ctx.globalAlpha = 1;
  }

  function tick(time) {
    frame = 0;
    if (!active()) return;
    if (time - lastPaint > 32) {
      draw(time, true);
      lastPaint = time;
    }
    frame = requestAnimationFrame(tick);
  }

  function sync() {
    if (active()) {
      if (!frame) frame = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(frame);
      frame = 0;
      if (!moving()) draw(0, false);
    }
  }

  art.addEventListener('pointermove', event => {
    if (!active() || event.pointerType === 'touch') return;
    const rect = art.getBoundingClientRect();
    pointer = {x: event.clientX - rect.left, y: event.clientY - rect.top};
  }, {passive: true});
  art.addEventListener('pointerleave', () => { pointer = null; });
  document.addEventListener('portfolio:motion', sync);
  document.addEventListener('visibilitychange', sync);
  new ResizeObserver(resize).observe(art);
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (!inView) pointer = null;
    sync();
  }, {threshold: .05}).observe(art);
})();
