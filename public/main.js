(() => {
  'use strict';
  const iframe = document.getElementById('universe');
  const status = document.getElementById('universe-status');
  const fallback = document.getElementById('universe-fallback');
  const pause = document.getElementById('pause-button');
  const burst = document.getElementById('burst-button');
  const hint = document.querySelector('.pointer-hint');
  const shapeButtons = [...document.querySelectorAll('[data-shape]')];
  const controls = [...document.querySelectorAll('.particle-controls button')];
  let ready = false;
  let userPaused = false;
  let inView = false;
  let pageMotionOff = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let loadTimer;
  controls.forEach(button => button.disabled = true);

  function send(action, value) {
    if (ready) iframe.contentWindow.postMessage({type:'hujie-universe', action, value}, location.origin);
  }
  function renderPause() {
    pause.setAttribute('aria-pressed', String(userPaused || pageMotionOff));
    pause.setAttribute('aria-label', pageMotionOff ? '整体动态效果已关闭' : userPaused ? '播放粒子动画' : '暂停粒子动画');
    pause.querySelector('span').textContent = pageMotionOff ? '静态' : userPaused ? '播放' : '暂停';
    pause.querySelector('path').setAttribute('d', userPaused || pageMotionOff ? 'm6 3 9 7-9 7Z' : 'M7 4v12M13 4v12');
    hint.textContent = pageMotionOff || userPaused ? '拖动旋转 · 可切换形态' : '拖动旋转 · 点击引爆';
  }
  function syncMotion() {
    send('playback', {paused: userPaused, allowMotion: !pageMotionOff, visible: inView && !document.hidden});
    pause.disabled = !ready || pageMotionOff;
    burst.disabled = !ready || pageMotionOff;
    renderPause();
  }
  function waitForScene() {
    clearTimeout(loadTimer);
    loadTimer = setTimeout(() => {
      if (!ready) {
        status.textContent = '加载时间较长';
        fallback.hidden = false;
      }
    }, 25000);
  }
  document.addEventListener('portfolio:motion', event => {pageMotionOff = !event.detail.enabled; syncMotion();});
  iframe.addEventListener('load', () => iframe.contentWindow.postMessage({type:'hujie-universe',action:'ping'},location.origin));
  renderPause();
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== iframe.contentWindow || event.data?.type !== 'hujie-universe-status') return;
    if (event.data.status === 'ready') {
      clearTimeout(loadTimer);
      ready = true;
      status.textContent = '实时粒子实验';
      fallback.hidden = true;
      controls.forEach(button => button.disabled = false);
      syncMotion();
    } else if (event.data.status === 'error') {
      clearTimeout(loadTimer);
      ready = false;
      controls.forEach(button => button.disabled = true);
      status.textContent = '图形效果暂不可用';
      fallback.hidden = false;
    }
  });
  shapeButtons.forEach(button => button.addEventListener('click', () => {
    shapeButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    send('shape', button.dataset.shape);
  }));
  burst.addEventListener('click', () => {
    if (userPaused) {userPaused = false; syncMotion();}
    send('burst');
  });
  pause.addEventListener('click', () => { userPaused = !userPaused; syncMotion(); });
  new IntersectionObserver(([entry]) => {inView = entry.isIntersecting; syncMotion();}, {threshold:0.02}).observe(iframe);
  document.addEventListener('visibilitychange', syncMotion);
  waitForScene();
  window.addEventListener('pagehide', () => clearTimeout(loadTimer));
  window.addEventListener('pageshow', () => {
    if (!ready && fallback.hidden) waitForScene();
    syncMotion();
  });
  document.getElementById('retry-universe').addEventListener('click', () => {
    ready = false;
    controls.forEach(button => button.disabled = true);
    fallback.hidden = true;
    status.textContent = '正在重新加载';
    waitForScene();
    iframe.src = iframe.src;
  });
})();
