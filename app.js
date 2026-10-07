(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // ---------------------------------------------------------------------------
  // Presets & state
  // ---------------------------------------------------------------------------

  const PRESETS = [
    { id: 'ig-square',   group: 'Social',          label: 'Instagram square (1:1)',   w: 1080, h: 1080 },
    { id: 'ig-portrait', group: 'Social',          label: 'Instagram portrait (4:5)', w: 1080, h: 1350 },
    { id: 'story',       group: 'Social',          label: 'Story / Reel (9:16)',      w: 1080, h: 1920 },
    { id: 'wide',        group: 'Social',          label: 'Landscape (16:9)',         w: 1920, h: 1080 },
    { id: 'link',        group: 'Social',          label: 'Facebook / LinkedIn post', w: 1200, h: 630 },
    { id: 'pin',         group: 'Social',          label: 'Pinterest (2:3)',          w: 1000, h: 1500 },
    { id: 'p4x6',        group: 'Print (300 DPI)', label: '4 × 6 in',                 w: 1800, h: 1200 },
    { id: 'p5x7',        group: 'Print (300 DPI)', label: '5 × 7 in',                 w: 1500, h: 2100 },
    { id: 'p8x10',       group: 'Print (300 DPI)', label: '8 × 10 in',                w: 2400, h: 3000 },
    { id: 'p11x14',      group: 'Print (300 DPI)', label: '11 × 14 in',               w: 3300, h: 4200 },
    { id: 'a4',          group: 'Print (300 DPI)', label: 'A4',                       w: 2480, h: 3508 },
    { id: 'letter',      group: 'Print (300 DPI)', label: 'US Letter',                w: 2550, h: 3300 },
    { id: 'custom',      group: 'Other',           label: 'Custom size' },
  ];

  const state = {
    view: 'home',
    photos: [],
    s: {
      preset: 'ig-square',
      w: 1080,
      h: 1080,
      layout: 'grid',
      fit: 'cover',
      spacing: 16,
      border: 16,
      radius: 0,
      color: '#ffffff',
      transparent: false,
      format: 'png',
      quality: 92,
    },
  };
  let nextId = 1;

  // ---------------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------------

  function setView(view) {
    state.view = view;
    document.body.dataset.view = view;
    if (view === 'edit') {
      syncControls();
      scheduleRender();
    }
  }

  $('#startBtn').addEventListener('click', () => setView('collect'));

  let confirmTimer = 0;
  const newBtn = $('#newBtn');
  newBtn.addEventListener('click', () => {
    if (state.photos.length && !newBtn.classList.contains('danger')) {
      newBtn.classList.add('danger');
      newBtn.textContent = 'Discard current collage?';
      confirmTimer = setTimeout(resetNewBtn, 3000);
      return;
    }
    resetNewBtn();
    for (const p of state.photos) URL.revokeObjectURL(p.url);
    state.photos = [];
    renderThumbs();
    setView('collect');
  });
  function resetNewBtn() {
    clearTimeout(confirmTimer);
    newBtn.classList.remove('danger');
    newBtn.textContent = 'New Collage';
  }

  $('#createBtn').addEventListener('click', () => {
    if (state.photos.length) setView('edit');
  });
  $('#backBtn').addEventListener('click', () => setView('collect'));

  // ---------------------------------------------------------------------------
  // Adding photos: file picker, drag & drop, paste
  // ---------------------------------------------------------------------------

  const fileInput = $('#fileInput');
  fileInput.addEventListener('change', () => {
    addFiles(fileInput.files);
    fileInput.value = '';
  });
  $('#dropzone').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });

  async function addFiles(fileList) {
    const files = [...fileList].filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|avif|heic|heif|bmp)$/i.test(f.name));
    if (!files.length) { toast('No images found'); return; }

    const results = await Promise.allSettled(files.map(loadPhoto));
    let added = 0;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') { state.photos.push(r.value); added++; }
      else toast(`Couldn’t read “${files[i].name}” — this browser may not support that format`);
    });
    if (!added) return;

    if (state.view === 'home') setView('collect');
    renderThumbs();
    if (state.view === 'edit') {
      toast(`Added ${added} photo${added > 1 ? 's' : ''}`);
      scheduleRender();
    }
  }

  function loadPhoto(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) { URL.revokeObjectURL(url); reject(new Error('empty image')); return; }
        resolve({
          id: nextId++,
          name: file.name || 'Pasted image',
          url, img, w, h,
          preview: downscale(img, w, h, 1600), // smaller copy keeps live preview fast
          fx: 0.5, fy: 0.5, zoom: 1,           // crop focal point & zoom (cover mode)
        });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
      img.src = url;
    });
  }

  function downscale(img, w, h, max) {
    const k = Math.min(1, max / Math.max(w, h));
    if (k === 1) return img;
    const c = document.createElement('canvas');
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  document.addEventListener('paste', (e) => {
    if (e.target.matches?.('input, textarea')) return;
    let files = [...(e.clipboardData?.files || [])];
    if (!files.length) {
      files = [...(e.clipboardData?.items || [])]
        .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
        .map((it) => it.getAsFile())
        .filter(Boolean);
    }
    if (!files.length) return;
    e.preventDefault();
    addFiles(files);
  });

  // Whole-window file drop
  const overlay = $('#dropOverlay');
  let dragDepth = 0;
  let thumbDragEl = null; // set while reordering thumbnails
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');

  window.addEventListener('dragenter', (e) => {
    if (thumbDragEl || !hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    overlay.classList.add('show');
  });
  window.addEventListener('dragleave', (e) => {
    if (thumbDragEl || !hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) overlay.classList.remove('show');
  });
  window.addEventListener('dragover', (e) => {
    if (thumbDragEl || !hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('drop', (e) => {
    if (thumbDragEl || !hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    overlay.classList.remove('show');
    addFiles(e.dataTransfer.files);
  });

  // ---------------------------------------------------------------------------
  // Thumbnails (reorder + remove)
  // ---------------------------------------------------------------------------

  const thumbs = $('#thumbs');

  function renderThumbs() {
    thumbs.textContent = '';
    state.photos.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = 'thumb';
      li.draggable = true;
      li.dataset.id = p.id;
      li.title = p.name;
      const img = document.createElement('img');
      img.src = p.url;
      img.alt = p.name;
      img.draggable = false;
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = i + 1;
      const rm = document.createElement('button');
      rm.className = 'remove';
      rm.setAttribute('aria-label', `Remove ${p.name}`);
      rm.textContent = '×';
      li.append(img, badge, rm);
      thumbs.append(li);
    });

    const n = state.photos.length;
    $('#countLabel').textContent = n ? `${n} photo${n > 1 ? 's' : ''}` : 'No photos yet';
    $('#editCount').textContent = n;
    $('#createBtn').disabled = !n;
    document.querySelector('.view-collect').classList.toggle('has-photos', n > 0);
  }

  thumbs.addEventListener('click', (e) => {
    const btn = e.target.closest('.remove');
    if (!btn) return;
    const id = +btn.closest('.thumb').dataset.id;
    const i = state.photos.findIndex((p) => p.id === id);
    if (i < 0) return;
    URL.revokeObjectURL(state.photos[i].url);
    state.photos.splice(i, 1);
    renderThumbs();
  });

  thumbs.addEventListener('dragstart', (e) => {
    const li = e.target.closest('.thumb');
    if (!li) return;
    thumbDragEl = li;
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', li.dataset.id);
  });
  thumbs.addEventListener('dragover', (e) => {
    if (!thumbDragEl) return;
    e.preventDefault();
    const over = e.target.closest('.thumb');
    if (!over || over === thumbDragEl) return;
    const r = over.getBoundingClientRect();
    const after = e.clientX - r.left > r.width / 2;
    thumbs.insertBefore(thumbDragEl, after ? over.nextSibling : over);
  });
  thumbs.addEventListener('drop', (e) => { if (thumbDragEl) e.preventDefault(); });
  thumbs.addEventListener('dragend', () => {
    if (!thumbDragEl) return;
    thumbDragEl.classList.remove('dragging');
    thumbDragEl = null;
    const order = [...thumbs.children].map((li) => +li.dataset.id);
    state.photos.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    renderThumbs();
  });

  // ---------------------------------------------------------------------------
  // Layout engines — each returns [{x, y, w, h, i}] where i indexes state.photos
  // ---------------------------------------------------------------------------

  function computeLayout(photos, W, H, s) {
    const b = s.border, g = s.spacing;
    const r = { x: b, y: b, w: W - 2 * b, h: H - 2 * b };
    if (!photos.length || r.w < 4 || r.h < 4) return [];
    const A = photos.map((p) => p.w / p.h);
    const idx = photos.map((_, i) => i);

    let cells;
    switch (s.layout) {
      case 'rows':     cells = justified(idx, A, r, g); break;
      case 'columns':  cells = transpose(justified(idx, A.map((a) => 1 / a), transpose(r), g)); break;
      case 'mosaic':   cells = mosaic(idx, A, r, g); break;
      case 'featured': cells = featured(idx, A, r, g); break;
      default:         cells = grid(idx, A, r, g);
    }
    // Snap to whole pixels so adjacent cells never leave hairline seams.
    return cells.map((c) => {
      const x0 = Math.round(c.x), y0 = Math.round(c.y);
      return { x: x0, y: y0, w: Math.round(c.x + c.w) - x0, h: Math.round(c.y + c.h) - y0, i: c.i };
    }).filter((c) => c.w > 0 && c.h > 0);
  }

  function transpose(v) {
    if (Array.isArray(v)) return v.map((c) => ({ x: c.y, y: c.x, w: c.h, h: c.w, i: c.i }));
    return { x: v.y, y: v.x, w: v.h, h: v.w };
  }

  // How badly a cell crops a photo (0 = perfect fit).
  const cropCost = (cellW, cellH, aspect) => Math.abs(Math.log(cellW / cellH / aspect));

  // Even grid: picks the column count that crops the photos least.
  function grid(idx, A, r, g) {
    const n = idx.length;
    let best = null;
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      if ((rows - 1) * cols >= n) continue;
      const cw = (r.w - (cols - 1) * g) / cols;
      const ch = (r.h - (rows - 1) * g) / rows;
      if (cw <= 0 || ch <= 0) continue;
      const lastCount = n - (rows - 1) * cols;
      const lw = (r.w - (lastCount - 1) * g) / lastCount;
      let score = 0;
      idx.forEach((id, k) => {
        const inLast = Math.floor(k / cols) === rows - 1;
        score += cropCost(inLast ? lw : cw, ch, A[id]);
      });
      score = score / n + (lastCount < cols ? 0.08 : 0);
      if (!best || score < best.score) best = { score, cols, rows, cw, ch, lastCount, lw };
    }
    if (!best) return idx.map((i) => ({ ...r, i }));

    const cells = [];
    idx.forEach((id, k) => {
      const row = Math.floor(k / best.cols);
      const col = k % best.cols;
      const w = row === best.rows - 1 ? best.lw : best.cw;
      cells.push({ x: r.x + col * (w + g), y: r.y + row * (best.ch + g), w, h: best.ch, i: id });
    });
    return cells;
  }

  // Justified rows: photos keep their proportions; row count chosen to fill the frame.
  function justified(idx, A, r, g) {
    const n = idx.length;
    const a = idx.map((i) => A[i]);
    const rowHeight = (row) => Math.max(1, r.w - (row.length - 1) * g) / row.reduce((s, j) => s + a[j], 0);

    let best = null;
    for (let k = 1; k <= n; k++) {
      const rows = partition(a, k);
      const natural = rows.reduce((s, row) => s + rowHeight(row), 0) + (k - 1) * g;
      const score = Math.abs(Math.log(natural / r.h));
      if (!best || score < best.score) best = { score, rows };
    }

    const heights = best.rows.map(rowHeight);
    const total = heights.reduce((s, h) => s + h, 0);
    const avail = Math.max(1, r.h - (best.rows.length - 1) * g);
    const cells = [];
    let y = r.y;
    best.rows.forEach((row, ri) => {
      const h = (heights[ri] / total) * avail;
      const sum = row.reduce((s, j) => s + a[j], 0);
      const availW = Math.max(1, r.w - (row.length - 1) * g);
      let x = r.x;
      for (const j of row) {
        const w = (availW * a[j]) / sum;
        cells.push({ x, y, w, h, i: idx[j] });
        x += w + g;
      }
      y += h + g;
    });
    return cells;
  }

  // Split a sequence into k contiguous, non-empty groups with balanced sums.
  function partition(a, k) {
    const n = a.length;
    const total = a.reduce((s, v) => s + v, 0);
    const rows = [];
    let cur = [], acc = 0;
    for (let j = 0; j < n; j++) {
      cur.push(j);
      acc += a[j];
      if (rows.length < k - 1) {
        const itemsLeft = n - j - 1;
        const rowsLeft = k - rows.length - 1;
        const target = (total * (rows.length + 1)) / k;
        if (itemsLeft === rowsLeft || acc + a[j + 1] / 2 >= target) {
          rows.push(cur);
          cur = [];
        }
      }
    }
    rows.push(cur);
    return rows;
  }

  // Mosaic: recursive guillotine splits, choosing cut direction to minimise cropping.
  function mosaic(idx, A, r, g) {
    function solve(ids, rect) {
      const n = ids.length;
      if (n === 1) return { score: cropCost(rect.w, rect.h, A[ids[0]]), cells: [{ ...rect, i: ids[0] }] };
      const mids = n % 2 && n <= 16 ? [Math.floor(n / 2), Math.ceil(n / 2)] : [Math.ceil(n / 2)];
      let best = null;
      for (const m of mids) {
        const t = m / n;
        for (const vertical of [true, false]) {
          let ra, rb;
          if (vertical) {
            const w = rect.w - g;
            if (w < 2) continue;
            const wa = w * t;
            ra = { x: rect.x, y: rect.y, w: wa, h: rect.h };
            rb = { x: rect.x + wa + g, y: rect.y, w: w - wa, h: rect.h };
          } else {
            const h = rect.h - g;
            if (h < 2) continue;
            const ha = h * t;
            ra = { x: rect.x, y: rect.y, w: rect.w, h: ha };
            rb = { x: rect.x, y: rect.y + ha + g, w: rect.w, h: h - ha };
          }
          const sa = solve(ids.slice(0, m), ra);
          const sb = solve(ids.slice(m), rb);
          const score = sa.score + sb.score;
          if (!best || score < best.score) best = { score, cells: sa.cells.concat(sb.cells) };
        }
      }
      return best || { score: Infinity, cells: [] };
    }
    return solve(idx, r).cells;
  }

  // Featured: first photo large, the rest in a grid beside or below it.
  function featured(idx, A, r, g) {
    if (idx.length === 1) return [{ ...r, i: idx[0] }];
    const hero = idx[0];
    const rest = idx.slice(1);
    const f = rest.length === 1 ? 0.5 : rest.length <= 3 ? 0.62 : 0.66;

    const sideW = (r.w - g) * f;
    const topH = (r.h - g) * f;
    const side = cropCost(sideW, r.h, A[hero]) <= cropCost(r.w, topH, A[hero]);

    if (side) {
      return [{ x: r.x, y: r.y, w: sideW, h: r.h, i: hero },
        ...grid(rest, A, { x: r.x + sideW + g, y: r.y, w: r.w - sideW - g, h: r.h }, g)];
    }
    return [{ x: r.x, y: r.y, w: r.w, h: topH, i: hero },
      ...grid(rest, A, { x: r.x, y: r.y + topH + g, w: r.w, h: r.h - topH - g }, g)];
  }

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------

  function isTransparent(s) { return s.transparent && s.format === 'png'; }

  function drawCollage(ctx, W, H, s, photos, cells, full) {
    ctx.clearRect(0, 0, W, H);
    if (!isTransparent(s)) {
      ctx.fillStyle = s.color;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    for (const c of cells) drawPhoto(ctx, photos[c.i], c, s, full);
  }

  function coverGeometry(p, c) {
    const k = Math.max(c.w / p.w, c.h / p.h) * p.zoom;
    const dw = p.w * k, dh = p.h * k;
    return { dw, dh, ex: dw - c.w, ey: dh - c.h };
  }

  function drawPhoto(ctx, p, c, s, full) {
    const src = full ? p.img : p.preview;
    ctx.save();
    if (s.fit === 'contain') {
      const k = Math.min(c.w / p.w, c.h / p.h);
      const dw = p.w * k, dh = p.h * k;
      const dx = c.x + (c.w - dw) / 2, dy = c.y + (c.h - dh) / 2;
      roundRect(ctx, dx, dy, dw, dh, s.radius);
      ctx.clip();
      ctx.drawImage(src, dx, dy, dw, dh);
    } else {
      const { dw, dh, ex, ey } = coverGeometry(p, c);
      roundRect(ctx, c.x, c.y, c.w, c.h, s.radius);
      ctx.clip();
      ctx.drawImage(src, c.x - ex * p.fx, c.y - ey * p.fy, dw, dh);
    }
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    if (!r) { ctx.rect(x, y, w, h); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------------------------------------------------------------------------
  // Live preview
  // ---------------------------------------------------------------------------

  const preview = $('#preview');
  const pctx = preview.getContext('2d');
  const stageInner = $('#stageInner');
  let cells = [];
  let raf = 0;

  function scheduleRender() {
    if (state.view !== 'edit' || raf) return;
    raf = requestAnimationFrame(() => { raf = 0; renderPreview(); });
  }

  function renderPreview() {
    const { w: W, h: H } = state.s;
    const cs = getComputedStyle(stageInner);
    const availW = stageInner.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const availH = stageInner.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (availW <= 0 || availH <= 0) return;

    const fit = Math.min(availW / W, availH / H, 1);
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.min(1, fit * dpr);
    preview.width = Math.max(1, Math.round(W * scale));
    preview.height = Math.max(1, Math.round(H * scale));
    preview.style.width = `${Math.round(W * fit)}px`;
    preview.style.height = `${Math.round(H * fit)}px`;
    preview.classList.toggle('transparent', isTransparent(state.s));

    cells = computeLayout(state.photos, W, H, state.s);
    pctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawCollage(pctx, W, H, state.s, state.photos, cells, false);

    if (swapDrag && swapDrag.target != null) {
      const c = cells.find((cc) => cc.i === swapDrag.target);
      if (c) {
        pctx.save();
        pctx.lineWidth = Math.max(3, Math.min(W, H) / 150);
        pctx.strokeStyle = '#e2552e';
        roundRect(pctx, c.x, c.y, c.w, c.h, state.s.radius);
        pctx.stroke();
        pctx.restore();
      }
    }

    $('#sizeLabel').textContent = `${W} × ${H} px · ${state.photos.length} photo${state.photos.length === 1 ? '' : 's'}`;
  }

  new ResizeObserver(scheduleRender).observe(stageInner);

  // --- Direct manipulation on the preview: pan, zoom, reset, swap -------------

  function toCanvasPoint(e) {
    const r = preview.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * state.s.w,
      y: ((e.clientY - r.top) / r.height) * state.s.h,
    };
  }
  function hitCell(pt) {
    return cells.find((c) => pt.x >= c.x && pt.x <= c.x + c.w && pt.y >= c.y && pt.y <= c.y + c.h);
  }

  let panDrag = null;
  let swapDrag = null;

  preview.addEventListener('pointerdown', (e) => {
    const pt = toCanvasPoint(e);
    const c = hitCell(pt);
    if (!c) return;
    preview.setPointerCapture(e.pointerId);
    if (e.shiftKey) {
      swapDrag = { from: c.i, target: null };
      preview.style.cursor = 'move';
      return;
    }
    if (state.s.fit !== 'cover') return;
    const p = state.photos[c.i];
    panDrag = { p, c, start: pt, fx: p.fx, fy: p.fy };
    preview.style.cursor = 'grabbing';
  });

  preview.addEventListener('pointermove', (e) => {
    const pt = toCanvasPoint(e);
    if (panDrag) {
      const { p, c, start } = panDrag;
      const { ex, ey } = coverGeometry(p, c);
      if (ex > 0.5) p.fx = clamp(panDrag.fx - (pt.x - start.x) / ex, 0, 1);
      if (ey > 0.5) p.fy = clamp(panDrag.fy - (pt.y - start.y) / ey, 0, 1);
      scheduleRender();
    } else if (swapDrag) {
      const c = hitCell(pt);
      const target = c && c.i !== swapDrag.from ? c.i : null;
      if (target !== swapDrag.target) { swapDrag.target = target; scheduleRender(); }
    } else {
      preview.style.cursor = hitCell(pt) ? (e.shiftKey ? 'move' : state.s.fit === 'cover' ? 'grab' : 'default') : 'default';
    }
  });

  function endDrag() {
    if (swapDrag) {
      const { from, target } = swapDrag;
      swapDrag = null;
      if (target != null) {
        const ph = state.photos;
        [ph[from], ph[target]] = [ph[target], ph[from]];
        renderThumbs();
      }
      scheduleRender();
    }
    panDrag = null;
    preview.style.cursor = '';
  }
  preview.addEventListener('pointerup', endDrag);
  preview.addEventListener('pointercancel', endDrag);

  preview.addEventListener('wheel', (e) => {
    if (state.s.fit !== 'cover') return;
    const c = hitCell(toCanvasPoint(e));
    if (!c) return;
    e.preventDefault();
    const p = state.photos[c.i];
    p.zoom = clamp(p.zoom * Math.exp(-e.deltaY * 0.0015), 1, 5);
    scheduleRender();
  }, { passive: false });

  preview.addEventListener('dblclick', (e) => {
    const c = hitCell(toCanvasPoint(e));
    if (!c) return;
    Object.assign(state.photos[c.i], { fx: 0.5, fy: 0.5, zoom: 1 });
    scheduleRender();
  });

  // ---------------------------------------------------------------------------
  // Settings panel
  // ---------------------------------------------------------------------------

  const presetSel = $('#preset');
  (() => {
    const groups = {};
    for (const p of PRESETS) {
      if (!groups[p.group]) {
        groups[p.group] = document.createElement('optgroup');
        groups[p.group].label = p.group;
        presetSel.append(groups[p.group]);
      }
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.w ? `${p.label} — ${p.w}×${p.h}` : p.label;
      groups[p.group].append(o);
    }
  })();

  // Resize the output, scaling spacing/border/radius so the look stays consistent.
  function setSize(w, h) {
    const s = state.s;
    const f = Math.min(w, h) / Math.min(s.w, s.h);
    if (f !== 1) {
      s.spacing = Math.round(s.spacing * f);
      s.border = Math.round(s.border * f);
      s.radius = Math.round(s.radius * f);
    }
    s.w = w;
    s.h = h;
  }

  presetSel.addEventListener('change', () => {
    const p = PRESETS.find((x) => x.id === presetSel.value);
    state.s.preset = p.id;
    if (p.w) setSize(p.w, p.h);
    update();
  });

  function onDimChange() {
    const w = clamp(Math.round(+$('#w').value) || state.s.w, 100, 10000);
    const h = clamp(Math.round(+$('#h').value) || state.s.h, 100, 10000);
    const match = PRESETS.find((p) => p.w && ((p.w === w && p.h === h) || (p.w === h && p.h === w)));
    state.s.preset = match ? match.id : 'custom';
    setSize(w, h);
    update();
  }
  $('#w').addEventListener('change', onDimChange);
  $('#h').addEventListener('change', onDimChange);

  $('#rotateBtn').addEventListener('click', () => {
    setSize(state.s.h, state.s.w);
    update();
  });

  $('#layouts').addEventListener('click', (e) => {
    const b = e.target.closest('[data-layout]');
    if (!b) return;
    state.s.layout = b.dataset.layout;
    update();
  });

  $('#shuffleBtn').addEventListener('click', () => {
    const ph = state.photos;
    for (let i = ph.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ph[i], ph[j]] = [ph[j], ph[i]];
    }
    renderThumbs();
    scheduleRender();
  });

  $('#fitSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fit]');
    if (!b) return;
    state.s.fit = b.dataset.fit;
    update();
  });

  $('#resetCropsBtn').addEventListener('click', () => {
    for (const p of state.photos) Object.assign(p, { fx: 0.5, fy: 0.5, zoom: 1 });
    scheduleRender();
  });

  for (const key of ['spacing', 'border', 'radius']) {
    const range = $(`#${key}`);
    const num = $(`#${key}Num`);
    range.addEventListener('input', () => { state.s[key] = +range.value; update(); });
    num.addEventListener('input', () => {
      if (num.value === '') return;
      state.s[key] = Math.max(0, Math.round(+num.value) || 0);
      update(num);
    });
  }

  $('#swatches').addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]');
    if (!b) return;
    state.s.color = b.dataset.color;
    state.s.transparent = false;
    update();
  });
  $('#color').addEventListener('input', (e) => {
    state.s.color = e.target.value;
    state.s.transparent = false;
    update();
  });
  $('#transparent').addEventListener('change', (e) => {
    state.s.transparent = e.target.checked;
    if (e.target.checked) state.s.format = 'png';
    update();
  });

  $('#formatSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-format]');
    if (!b) return;
    state.s.format = b.dataset.format;
    update();
  });
  $('#quality').addEventListener('input', (e) => {
    state.s.quality = +e.target.value;
    update();
  });

  function update(skip) {
    syncControls(skip);
    scheduleRender();
  }

  function setRange(el, value, max) {
    el.max = max;
    el.value = Math.min(value, max);
    el.style.setProperty('--fill', `${(Math.min(value, max) / max) * 100}%`);
  }

  // Push state into the controls. `skip` is the element currently being typed in.
  function syncControls(skip) {
    const s = state.s;
    const short = Math.min(s.w, s.h);
    presetSel.value = s.preset;
    if (skip !== $('#w')) $('#w').value = s.w;
    if (skip !== $('#h')) $('#h').value = s.h;

    $$('#layouts [data-layout]').forEach((b) => b.classList.toggle('active', b.dataset.layout === s.layout));
    $$('#fitSeg [data-fit]').forEach((b) => b.classList.toggle('active', b.dataset.fit === s.fit));
    $$('#formatSeg [data-format]').forEach((b) => b.classList.toggle('active', b.dataset.format === s.format));

    const maxes = {
      spacing: Math.max(20, Math.round(short * 0.08)),
      border: Math.max(20, Math.round(short * 0.1)),
      radius: Math.max(20, Math.round(short * 0.15)),
    };
    for (const key of Object.keys(maxes)) {
      setRange($(`#${key}`), s[key], maxes[key]);
      const num = $(`#${key}Num`);
      if (skip !== num) num.value = s[key];
    }

    let swatchMatched = false;
    $$('#swatches [data-color]').forEach((b) => {
      const on = !s.transparent && b.dataset.color.toLowerCase() === s.color.toLowerCase();
      if (on) swatchMatched = true;
      b.classList.toggle('active', on);
    });
    const customLabel = $('.custom-color');
    customLabel.classList.toggle('active', !s.transparent && !swatchMatched);
    if (!swatchMatched) customLabel.style.background = s.color;
    else customLabel.style.background = '';
    $('#color').value = s.color;
    $('#transparent').checked = s.transparent;

    $('#qualityRow').style.display = s.format === 'jpeg' ? '' : 'none';
    setRange($('#quality'), s.quality, 100);
    $('#quality').min = 50;
    $('#quality').style.setProperty('--fill', `${((s.quality - 50) / 50) * 100}%`);
    $('#qualityOut').textContent = `${s.quality}%`;
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  function renderFull(format) {
    const s = { ...state.s, format };
    const { w: W, h: H } = s;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    drawCollage(ctx, W, H, s, state.photos, computeLayout(state.photos, W, H, s), true);
    const type = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Export failed'))), type, s.quality / 100);
    });
  }

  async function save() {
    if (!state.photos.length) return;
    const btn = $('#saveBtn');
    btn.disabled = true;
    btn.textContent = 'Rendering…';
    try {
      const blob = await renderFull(state.s.format);
      const ext = state.s.format === 'jpeg' ? 'jpg' : 'png';
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `collage-${state.s.w}x${state.s.h}-${stamp}.${ext}`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      toast(`Saved ${a.download} (${(blob.size / 1048576).toFixed(1)} MB)`);
    } catch (err) {
      toast('Sorry — the image could not be exported. Try a smaller size.');
      console.error(err);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save image';
    }
  }

  $('#saveBtn').addEventListener('click', save);

  $('#copyBtn').addEventListener('click', async () => {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      toast('Copying images isn’t supported in this browser — use Save instead');
      return;
    }
    try {
      // Safari needs the ClipboardItem created synchronously with a promise.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': renderFull('png') })]);
      toast('Collage copied to clipboard');
    } catch (err) {
      toast('Couldn’t copy to the clipboard');
      console.error(err);
    }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && state.view === 'edit') {
      e.preventDefault();
      save();
    }
  });

  // ---------------------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------------------

  const toastEl = $('#toast');
  let toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
  }

  renderThumbs();
  syncControls();
})();
