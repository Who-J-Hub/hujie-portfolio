(() => {
  'use strict';
  document.getElementById('year').textContent = String(new Date().getFullYear());
  const local = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
  if (local) {
    document.getElementById('manage-link').hidden = false;
  }

  const share = document.getElementById('share-button');
  if (!share) return;
  const shareStatus = document.getElementById('share-status');
  const shareUrl = document.getElementById('share-url');
  shareUrl.value = new URL('/', location.href).href;
  if (local) {
    document.getElementById('share-note').textContent = '当前是本机预览，发布后可在这里复制公开链接。';
    share.querySelector('span').textContent = '复制预览链接';
  }
  share.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareUrl.value);
      shareUrl.hidden = true;
      shareStatus.textContent = local ? '本机预览链接已复制' : '主页链接已复制';
    } catch {
      shareUrl.hidden = false;
      shareUrl.focus();
      shareUrl.select();
      shareStatus.textContent = '已选中链接，可以手动复制。';
    }
  });
})();
