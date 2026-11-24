(() => {
  'use strict';
  async function readPhotos() {
    const response = await fetch('/gallery.json', {cache:'no-store'});
    if (!response.ok) return null;
    const data = await response.json();
    if (!Array.isArray(data?.photos)) return null;
    return data.photos
      .filter(photo => typeof photo?.title === 'string' && typeof photo.url === 'string' &&
        /^\/photos\/[a-f0-9]{32}\.(jpg|png|webp|gif|avif)$/.test(photo.url))
      .map(photo => ({...photo, category: typeof photo.category === 'string' && photo.category.trim() || '未分类'}));
  }

  const preview = document.getElementById('home-photo');
  if (preview) {
    const caption = document.getElementById('home-photo-caption');
    const fallback = caption.textContent;
    function resetPreview() {
      preview.hidden = true;
      preview.removeAttribute('src');
      caption.textContent = fallback;
    }
    async function showPreview() {
      try {
        const photos = await readPhotos();
        if (!photos) return;
        const photo = photos[0];
        if (!photo) { resetPreview(); return; }
        preview.src = photo.url;
        preview.hidden = false;
        caption.textContent = photo.title;
      } catch { /* The illustration stays visible when the gallery is unavailable. */ }
    }
    preview.addEventListener('error', resetPreview);
    window.addEventListener('focus', showPreview);
    showPreview();
    return;
  }

  const grid = document.getElementById('photo-grid');
  const note = document.getElementById('photo-note');
  const works = document.getElementById('gallery-works');
  const placeholders = [...grid.children].map(node => node.cloneNode(true));
  const emptyNote = [...note.childNodes].map(node => node.cloneNode(true));
  const photoButtons = new Map();
  const filterButtons = new Map();
  let photos = [], selectedPhotos = [], category = null;
  let current = 0, openerUrl, pending, snapshot = '[]', loading = false;

  const filters = document.createElement('div');
  filters.className = 'gallery-filters';
  filters.setAttribute('role', 'group');
  filters.setAttribute('aria-label', '摄影分类');
  filters.hidden = true;
  grid.before(filters);

  const dialog = document.createElement('dialog');
  dialog.className = 'photo-lightbox';
  dialog.setAttribute('aria-label', '摄影作品预览');
  function lightboxButton(className, name, text) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.setAttribute('aria-label', name);
    button.textContent = text;
    return button;
  }
  const close = lightboxButton('lightbox-close', '关闭照片', '×');
  close.autofocus = true;
  const previous = lightboxButton('lightbox-prev', '上一张照片', '←');
  const next = lightboxButton('lightbox-next', '下一张照片', '→');
  const image = document.createElement('img');
  const caption = document.createElement('div');
  caption.className = 'lightbox-caption';
  caption.setAttribute('role', 'status');
  dialog.append(close, previous, image, next, caption);
  document.body.append(dialog);

  function show(index) {
    const count = selectedPhotos.length;
    if (!count) return;
    current = (index + count) % count;
    const photo = selectedPhotos[current];
    image.src = photo.url;
    image.alt = photo.title;
    caption.textContent = `${current + 1} / ${count} · ${photo.title}${photo.caption ? '\n' + photo.caption : ''}`;
    previous.hidden = next.hidden = count < 2;
  }
  function restoreFocus(photoUrl) {
    const opener = photoButtons.get(photoUrl);
    if (opener) {
      opener.focus({preventScroll:true});
    } else {
      (filters.hidden ? works : filterButtons.get(category)).focus();
    }
  }
  close.addEventListener('click', () => dialog.close());
  previous.addEventListener('click', () => show(current - 1));
  next.addEventListener('click', () => show(current + 1));
  dialog.addEventListener('keydown', event => {
    if (selectedPhotos.length < 2 || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    show(current + (event.key === 'ArrowRight' ? 1 : -1));
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    if (pending) {
      applyPhotos(pending, openerUrl);
    } else {
      restoreFocus(openerUrl);
    }
  });

  function renderPhotos() {
    photoButtons.clear();
    selectedPhotos = category === null ? photos : photos.filter(photo => photo.category === category);
    if (!photos.length) {
      grid.replaceChildren(...placeholders.map(node => node.cloneNode(true)));
      note.replaceChildren(...emptyNote.map(node => node.cloneNode(true)));
      return;
    }
    const cards = selectedPhotos.map((photo, index) => {
      const figure = document.createElement('figure');
      figure.className = 'photo-slot';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'photo-open';
      button.dataset.photoUrl = photo.url;
      button.setAttribute('aria-label', '放大查看：' + photo.title);
      const frame = document.createElement('span');
      frame.className = 'photo-frame has-photo';
      const thumbnail = document.createElement('img');
      thumbnail.src = photo.url;
      thumbnail.alt = photo.title;
      thumbnail.loading = 'lazy';
      thumbnail.decoding = 'async';
      if (Number.isInteger(photo.width) && photo.width > 0) thumbnail.width = photo.width;
      if (Number.isInteger(photo.height) && photo.height > 0) thumbnail.height = photo.height;
      frame.append(thumbnail);
      button.append(frame);
      button.addEventListener('click', () => {
        openerUrl = photo.url;
        show(index);
        dialog.showModal();
      });
      photoButtons.set(photo.url, button);
      const figcaption = document.createElement('figcaption');
      const title = document.createElement('span');
      title.textContent = photo.title;
      const label = document.createElement('span');
      label.textContent = photo.category;
      figcaption.append(title, label);
      figure.append(button, figcaption);
      return figure;
    });
    grid.replaceChildren(...cards);
    note.textContent = `${category === null ? '' : category + ' · '}${selectedPhotos.length} 张作品 · 点击照片可放大。`;
  }

  function applyPhotos(update, focusUrl) {
    const active = document.activeElement;
    const previousUrl = focusUrl || active?.dataset.photoUrl;
    const previousFilter = active?.dataset.galleryCategory;
    photos = update.photos;
    snapshot = update.snapshot;
    pending = null;
    const categories = [...new Set(photos.map(photo => photo.category))];
    if (!categories.includes(category)) category = null;
    filterButtons.clear();
    for (const value of [null, ...categories]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = value ?? '全部作品';
      button.dataset.galleryCategory = value ?? '';
      button.setAttribute('aria-pressed', String(value === category));
      button.addEventListener('click', () => {
        if (category === value) return;
        category = value;
        for (const [filter, item] of filterButtons) item.setAttribute('aria-pressed', String(filter === category));
        renderPhotos();
      });
      filterButtons.set(value, button);
    }
    filters.replaceChildren(...filterButtons.values());
    filters.hidden = categories.length < 2;
    renderPhotos();
    if (previousUrl) {
      restoreFocus(previousUrl);
    } else if (previousFilter !== undefined) {
      const button = filterButtons.get(previousFilter || null);
      if (button && !filters.hidden) button.focus({preventScroll:true});
      else restoreFocus();
    }
  }

  async function load() {
    if (loading) return;
    loading = true;
    try {
      const nextPhotos = await readPhotos();
      if (!nextPhotos) return;
      const nextSnapshot = JSON.stringify(nextPhotos);
      if (nextSnapshot === snapshot) {
        pending = null;
        return;
      }
      const update = {photos: nextPhotos, snapshot: nextSnapshot};
      if (dialog.open) pending = update;
      else applyPhotos(update);
    } catch { /* Keep the current exhibition when the gallery is unavailable. */ }
    finally { loading = false; }
  }
  load();
  window.addEventListener('focus', load);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
})();
