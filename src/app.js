(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const SPIN_MS = 5600;
  const ROLE_ORDER = ['tank', 'healer', 'melee', 'ranged', 'caster'];
  const DPS_ROLES = ['melee', 'ranged', 'caster'];
  const STORE_KEY = 'ffxiv-job-wheel:v1';

  const $ = (id) => document.getElementById(id);
  const canvas = $('wheel');
  const ctx = canvas.getContext('2d');
  const wrap = $('wheelWrap');
  const pointer = $('pointer');
  const spinBtn = $('spinBtn');

  // ---------- State ----------

  const JOB_BY_ID = Object.fromEntries(JOBS.map((j) => [j.id, j]));

  const state = {
    roles: new Set(ROLE_ORDER),
    order: JOBS.map((j) => j.id),   // slice order around the wheel, every job included
    excluded: new Set(),            // jobs left off regardless of role filters
    jobsOpen: false,
    includeLimited: true,
    sound: true,
    noRepeat: false,
    history: [],
  };

  let pool = [];          // jobs currently on the wheel
  let rotation = 0;       // radians, clockwise
  let spinning = false;
  let winner = -1;        // index into pool of the last result
  let size = 0;           // canvas CSS size in px
  let frame = null;       // pre-rendered wooden frame (redrawn on resize)

  const icons = {};
  for (const job of JOBS) {
    const img = new Image();
    img.src = `icons/${job.id}.png`;
    img.onload = () => draw();
    icons[job.id] = img;
  }

  loadState();

  // ---------- Persistence (best effort) ----------

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!saved) return;
      if (Array.isArray(saved.roles)) state.roles = new Set(saved.roles.filter((r) => ROLES[r]));
      if (Array.isArray(saved.order)) state.order = normalizeOrder(saved.order);
      if (Array.isArray(saved.excluded)) state.excluded = new Set(saved.excluded.filter((id) => JOB_BY_ID[id]));
      if (typeof saved.jobsOpen === 'boolean') state.jobsOpen = saved.jobsOpen;
      if (typeof saved.includeLimited === 'boolean') state.includeLimited = saved.includeLimited;
      else if (typeof saved.includeBlu === 'boolean') state.includeLimited = saved.includeBlu;
      if (typeof saved.sound === 'boolean') state.sound = saved.sound;
      if (typeof saved.noRepeat === 'boolean') state.noRepeat = saved.noRepeat;
      if (Array.isArray(saved.history)) state.history = saved.history.filter((id) => JOBS.some((j) => j.id === id)).slice(0, 30);
    } catch (_) { /* storage unavailable */ }
  }

  // Drop unknown or duplicate ids, and add any jobs missing from a saved order at the end
  function normalizeOrder(ids) {
    const order = [...new Set(ids.filter((id) => JOB_BY_ID[id]))];
    for (const job of JOBS) if (!order.includes(job.id)) order.push(job.id);
    return order;
  }

  function saveState() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        roles: [...state.roles],
        order: state.order,
        excluded: [...state.excluded],
        jobsOpen: state.jobsOpen,
        includeLimited: state.includeLimited,
        sound: state.sound,
        noRepeat: state.noRepeat,
        history: state.history,
      }));
    } catch (_) { /* storage unavailable */ }
  }

  // ---------- Filters ----------

  const roleFilters = $('roleFilters');
  for (const role of ROLE_ORDER) {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.dataset.role = role;
    btn.style.setProperty('--role-color', ROLES[role].color);
    btn.style.setProperty('--role-accent', ROLES[role].accent);
    btn.innerHTML = `<span class="swatch"></span><span>${ROLES[role].label}</span><span class="n"></span>`;
    btn.addEventListener('click', () => {
      if (spinning) return;
      state.roles.has(role) ? state.roles.delete(role) : state.roles.add(role);
      onFilterChange();
    });
    roleFilters.appendChild(btn);
  }

  document.querySelectorAll('[data-quick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (spinning) return;
      state.roles = new Set(btn.dataset.quick === 'all' ? ROLE_ORDER : DPS_ROLES);
      onFilterChange();
    });
  });

  $('includeLimited').checked = state.includeLimited;
  $('includeLimited').addEventListener('change', (e) => {
    if (spinning) { e.target.checked = state.includeLimited; return; }
    state.includeLimited = e.target.checked;
    onFilterChange();
  });

  $('sound').checked = state.sound;
  $('sound').addEventListener('change', (e) => { state.sound = e.target.checked; saveState(); });

  $('noRepeat').checked = state.noRepeat;
  $('noRepeat').addEventListener('change', (e) => { state.noRepeat = e.target.checked; saveState(); });

  $('clearHistory').addEventListener('click', () => {
    state.history = [];
    renderHistory();
    saveState();
  });

  function passesFilters(job) {
    return state.roles.has(job.role) && (state.includeLimited || !job.limited);
  }

  function jobAllowed(job) {
    return passesFilters(job) && !state.excluded.has(job.id);
  }

  function buildPool() {
    return state.order.map((id) => JOB_BY_ID[id]).filter(jobAllowed);
  }

  function onFilterChange() {
    pool = buildPool();
    winner = -1;
    renderFilters();
    renderJobs();
    draw();
    saveState();
  }

  // ---------- Job list (order and exclusions) ----------

  const jobsCard = $('jobsCard');
  const jobList = $('jobList');
  const jobRows = {};

  jobsCard.open = state.jobsOpen;
  jobsCard.addEventListener('toggle', () => { state.jobsOpen = jobsCard.open; saveState(); });

  for (const job of JOBS) {
    const li = document.createElement('li');
    li.draggable = true;
    li.dataset.id = job.id;
    li.style.setProperty('--role-accent', ROLES[job.role].accent);
    li.innerHTML = `<span class="grip" aria-hidden="true"></span><img src="icons/${job.id}.png" alt="" draggable="false"><span class="name"></span><input type="checkbox">`;
    li.querySelector('.name').textContent = job.name;
    const box = li.querySelector('input');
    box.setAttribute('aria-label', `Include ${job.name}`);
    box.title = 'Include on the wheel';
    box.addEventListener('change', () => {
      if (spinning) { box.checked = !state.excluded.has(job.id); return; }
      box.checked ? state.excluded.delete(job.id) : state.excluded.add(job.id);
      onFilterChange();
    });
    jobRows[job.id] = li;
  }

  function renderJobs() {
    const current = [...jobList.children].map((li) => li.dataset.id);
    if (current.join() !== state.order.join()) {
      for (const id of state.order) jobList.appendChild(jobRows[id]);
    }
    for (const id of state.order) {
      const job = JOB_BY_ID[id];
      const li = jobRows[id];
      const included = !state.excluded.has(id);
      li.querySelector('input').checked = included;
      li.classList.toggle('excluded', !included);
      li.classList.toggle('filtered', !passesFilters(job));
      li.title = passesFilters(job) ? '' : 'Hidden by the role filters';
    }
    const n = state.excluded.size;
    $('excludedCount').textContent = n ? `${n} excluded` : '';
  }

  function setOrder(ids) {
    if (spinning) return;
    state.order = ids;
    onFilterChange();
  }

  $('shuffleOrder').addEventListener('click', () => {
    const ids = [...state.order];
    for (let i = ids.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    setOrder(ids);
  });

  $('resetOrder').addEventListener('click', () => setOrder(JOBS.map((j) => j.id)));

  $('includeAll').addEventListener('click', () => {
    if (spinning) return;
    state.excluded.clear();
    onFilterChange();
  });

  // Drag and drop: rows move live while dragging, and the wheel follows along
  let dragRow = null;

  jobList.addEventListener('dragstart', (e) => {
    const li = e.target.closest && e.target.closest('li');
    if (!li || spinning) { e.preventDefault(); return; }
    dragRow = li;
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', li.dataset.id);
  });

  jobList.addEventListener('dragover', (e) => {
    if (!dragRow) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const over = e.target.closest && e.target.closest('li');
    if (!over || over === dragRow) return;
    const box = over.getBoundingClientRect();
    const ref = e.clientY > box.top + box.height / 2 ? over.nextSibling : over;
    if (ref === dragRow || ref === dragRow.nextSibling) return;
    jobList.insertBefore(dragRow, ref);
    state.order = [...jobList.children].map((li) => li.dataset.id);
    pool = buildPool();
    winner = -1;
    draw();
  });

  jobList.addEventListener('drop', (e) => { if (dragRow) e.preventDefault(); });

  jobList.addEventListener('dragend', () => {
    if (!dragRow) return;
    dragRow.classList.remove('dragging');
    dragRow = null;
    saveState();
  });

  // Keyboard reordering: Alt+Up / Alt+Down moves the focused job's slice
  jobList.addEventListener('keydown', (e) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    const li = e.target.closest('li');
    if (!li) return;
    e.preventDefault();
    const from = state.order.indexOf(li.dataset.id);
    const to = from + (e.key === 'ArrowUp' ? -1 : 1);
    if (to < 0 || to >= state.order.length) return;
    const ids = [...state.order];
    [ids[from], ids[to]] = [ids[to], ids[from]];
    setOrder(ids);
    e.target.focus();
  });

  function renderFilters() {
    const sameSet = (list) => list.length === state.roles.size && list.every((r) => state.roles.has(r));
    document.querySelector('[data-quick="all"]').classList.toggle('on', sameSet(ROLE_ORDER));
    document.querySelector('[data-quick="dps"]').classList.toggle('on', sameSet(DPS_ROLES));

    roleFilters.querySelectorAll('.chip').forEach((btn) => {
      const role = btn.dataset.role;
      btn.classList.toggle('on', state.roles.has(role));
      btn.querySelector('.n').textContent =
        JOBS.filter((j) => j.role === role && (state.includeLimited || !j.limited) && !state.excluded.has(j.id)).length;
    });

    const count = $('count');
    if (pool.length === 0) {
      count.textContent = state.roles.size === 0
        ? 'Select at least one role to spin.'
        : 'Every job in the selected roles is excluded.';
      count.classList.add('warn');
    } else {
      count.textContent = `${pool.length} job${pool.length === 1 ? '' : 's'} on the wheel`;
      count.classList.remove('warn');
    }
    spinBtn.disabled = spinning || pool.length === 0;
  }

  // ---------- Drawing ----------

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    size = wrap.clientWidth;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    frame = renderFrame(dpr);
    draw();
  }

  // Wheel geometry shared by the frame and the segments
  function metrics() {
    const wood = Math.round(size * 0.042 + 4);    // wooden bowl width
    const brass = Math.max(4, Math.round(size * 0.01)); // brass track width
    return { wood, brass, R: size / 2 - 3 - wood - brass };
  }

  // Pale brass used for the track, diamonds, pegs and hub ring
  const BRASS = { hi: '#fff7e2', mid: '#d6bf86', lo: '#82683a' };

  // Small seeded PRNG so the wood grain looks the same every time
  function mulberry32(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // The dark wood roulette frame doesn't rotate, so it's drawn once per resize
  function renderFrame(dpr) {
    const off = document.createElement('canvas');
    off.width = Math.round(size * dpr);
    off.height = Math.round(size * dpr);
    const g = off.getContext('2d');
    g.scale(dpr, dpr);
    const c = size / 2;
    const { wood, brass, R } = metrics();
    const Ro = size / 2 - 3;   // outer edge of the wood
    const Ri = R + brass;      // inner edge of the wood
    const rand = mulberry32(1337);

    const annulus = (outer, inner) => {
      g.beginPath();
      g.arc(c, c, outer, 0, TAU);
      g.arc(c, c, inner, 0, TAU, true);
    };

    // Base walnut, shaded so the bowl looks rounded
    const base = g.createRadialGradient(c, c, Ri, c, c, Ro);
    base.addColorStop(0, '#080302');
    base.addColorStop(0.35, '#24110a');
    base.addColorStop(0.7, '#190b05');
    base.addColorStop(1, '#050201');
    annulus(Ro, Ri);
    g.fillStyle = base;
    g.fill();

    // Grain: wavy concentric strands
    g.save();
    annulus(Ro, Ri);
    g.clip();
    g.lineCap = 'round';
    for (let k = 0; k < 170; k++) {
      const r = Ri + rand() * (Ro - Ri);
      const start = rand() * TAU;
      const len = 0.4 + rand() * (TAU - 0.4);
      const amp = 0.3 + rand() * 1.6;
      const freq = 3 + Math.floor(rand() * 9);
      const phase = rand() * TAU;
      const dark = rand() < 0.65;
      g.strokeStyle = dark
        ? `rgba(12, 5, 2, ${0.18 + rand() * 0.35})`
        : `rgba(120, 66, 34, ${0.05 + rand() * 0.11})`;
      g.lineWidth = 0.4 + rand() * (dark ? 1.8 : 1.1);
      g.beginPath();
      for (let a = 0; a <= len; a += 0.015) {
        const rr = r + amp * Math.sin(a * freq + phase);
        const x = c + Math.cos(start + a) * rr;
        const y = c + Math.sin(start + a) * rr;
        a === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }

    // Lacquer: light from the top left, falling off to the bottom right
    const sheen = g.createLinearGradient(0, 0, size, size);
    sheen.addColorStop(0, 'rgba(255, 220, 180, 0.12)');
    sheen.addColorStop(0.45, 'rgba(255, 225, 190, 0.02)');
    sheen.addColorStop(1, 'rgba(0, 0, 0, 0.30)');
    g.fillStyle = sheen;
    g.fillRect(0, 0, size, size);
    const spec = g.createRadialGradient(c - size * 0.3, c - size * 0.36, 0, c - size * 0.3, c - size * 0.36, size * 0.32);
    spec.addColorStop(0, 'rgba(255, 240, 220, 0.16)');
    spec.addColorStop(1, 'rgba(255, 240, 220, 0)');
    g.fillStyle = spec;
    g.fillRect(0, 0, size, size);
    g.restore();

    // Bevels on the outer lip and the groove next to the brass
    g.lineWidth = 2;
    g.strokeStyle = '#0c0502';
    g.beginPath(); g.arc(c, c, Ro - 1, 0, TAU); g.stroke();
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(255, 205, 160, 0.22)';
    g.beginPath(); g.arc(c, c, Ro - 3, 0, TAU); g.stroke();
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(8, 3, 1, 0.85)';
    g.beginPath(); g.arc(c, c, Ri + 1, 0, TAU); g.stroke();

    // Brass diamonds around the bowl, like a roulette ball track
    const dr = Ri + (Ro - Ri) * 0.5;
    const long = wood * 0.3;   // along the radius, pointing at the center
    const wide = long * 0.5;
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + TAU / 16 + (i * TAU) / 8;
      g.save();
      g.translate(c + Math.cos(a) * dr, c + Math.sin(a) * dr);
      g.rotate(a);
      g.beginPath();
      g.moveTo(long, 0); g.lineTo(0, wide); g.lineTo(-long, 0); g.lineTo(0, -wide);
      g.closePath();
      const dg = g.createLinearGradient(-long, -wide, long, wide);
      dg.addColorStop(0, BRASS.hi);
      dg.addColorStop(0.5, BRASS.mid);
      dg.addColorStop(1, BRASS.lo);
      g.shadowColor = 'rgba(0, 0, 0, 0.6)';
      g.shadowBlur = 4;
      g.shadowOffsetY = 1.5;
      g.fillStyle = dg;
      g.fill();
      g.restore();
    }

    // Brass track between the wood and the segments
    const bg = g.createLinearGradient(0, c - Ri, 0, c + Ri);
    bg.addColorStop(0, BRASS.hi);
    bg.addColorStop(0.5, BRASS.mid);
    bg.addColorStop(1, BRASS.lo);
    annulus(Ri, R - 1);
    g.fillStyle = bg;
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(50, 36, 14, 0.8)';
    g.beginPath(); g.arc(c, c, Ri, 0, TAU); g.stroke();

    return off;
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const c = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
    return `rgb(${c(n >> 16)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
  }

  function draw() {
    if (!size) return;
    const cx = size / 2;
    const cy = size / 2;
    const { brass, R } = metrics();  // R is the radius of the segment disc
    const n = pool.length;

    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(frame, 0, 0, size, size);

    if (n === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.fillStyle = '#16213f';
      ctx.fill();
      ctx.fillStyle = '#9aa6c4';
      ctx.font = `600 ${Math.max(14, size * 0.03)}px "Segoe UI", -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No jobs selected', cx, cy + R * 0.35);
      return;
    }

    const seg = TAU / n;

    for (let i = 0; i < n; i++) {
      const job = pool[i];
      const role = ROLES[job.role];
      const a0 = -Math.PI / 2 + rotation + i * seg;
      const a1 = a0 + seg;
      const mid = a0 + seg / 2;
      const isWinner = i === winner && !spinning;

      // Segment fill: radial gradient, alternating brightness within a role
      const prevSame = i > 0 && pool[i - 1].role === job.role;
      const alt = prevSame && (i % 2 === 1) ? 0.04 : 0;
      const grad = ctx.createRadialGradient(cx, cy, R * 0.15, cx, cy, R);
      grad.addColorStop(0, shade(role.color, -0.12 + alt + (isWinner ? 0.12 : 0)));
      grad.addColorStop(1, shade(role.color, 0.06 + alt + (isWinner ? 0.18 : 0)));

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, a0, a1);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Separator
      ctx.strokeStyle = 'rgba(214, 191, 134, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R);
      ctx.stroke();

      // Icon near the rim
      const arc = seg * R * 0.8;
      const iconSize = Math.min(R * 0.17, arc * 0.78);
      const iconR = R - iconSize * 0.62 - 6;
      const img = icons[job.id];
      ctx.save();
      ctx.translate(cx + Math.cos(mid) * iconR, cy + Math.sin(mid) * iconR);
      ctx.rotate(mid + Math.PI / 2);
      if (isWinner) {
        ctx.shadowColor = '#ffe09a';
        ctx.shadowBlur = 18;
      }
      if (img.complete && img.naturalWidth) {
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
      }
      ctx.restore();

      // Name along the radius, reading from the rim toward the hub
      const textOuter = iconR - iconSize * 0.62 - 6;
      const textInner = R * 0.22;
      const maxLen = textOuter - textInner;
      let fontSize = Math.min(R * 0.065, seg * R * 0.5 * 0.55);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(mid);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.font = `400 ${fontSize}px "XIV Display", "Segoe UI", -apple-system, sans-serif`;
      const w = ctx.measureText(job.name).width;
      if (w > maxLen) {
        fontSize *= maxLen / w;
        ctx.font = `400 ${fontSize}px "XIV Display", "Segoe UI", -apple-system, sans-serif`;
      }
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 4;
      ctx.fillStyle = isWinner ? '#ffe09a' : '#f1ece0';
      ctx.fillText(job.name, textOuter, 0);
      ctx.restore();
    }

    // Inner shading ring
    const vignette = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fillStyle = vignette;
    ctx.fill();

    // Rim pegs at each segment boundary
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + rotation + i * seg;
      const px = cx + Math.cos(a) * (R + brass / 2);
      const py = cy + Math.sin(a) * (R + brass / 2);
      ctx.beginPath();
      ctx.arc(px, py, Math.max(2.5, size * 0.006), 0, TAU);
      ctx.fillStyle = BRASS.hi;
      ctx.fill();
      ctx.strokeStyle = BRASS.lo;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Hub ring behind the button
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.21, 0, TAU);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(214, 191, 134, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // ---------- Spinning ----------

  function randomInt(max) {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / max) * max; // reject to avoid modulo bias
    do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % max;
  }

  function randomFloat() {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 0x100000000;
  }

  function indexAtPointer(rot) {
    const n = pool.length;
    const seg = TAU / n;
    const a = ((-rot % TAU) + TAU) % TAU;
    return Math.floor(a / seg) % n;
  }

  // Strong ease-out with a soft settle at the end
  function ease(t) {
    return 1 - Math.pow(1 - t, 4);
  }

  function spin() {
    if (spinning || pool.length === 0) return;
    audio.unlock();

    const n = pool.length;
    let target = randomInt(n);
    const last = state.history[0];
    if (state.noRepeat && n > 1 && pool[target].id === last) {
      // Re-draw uniformly from everything except the last result
      const others = pool.map((_, i) => i).filter((i) => pool[i].id !== last);
      target = others[randomInt(others.length)];
    }

    const seg = TAU / n;
    const offset = 0.15 + randomFloat() * 0.7; // land somewhere inside the segment, not on a line
    const base = -(target + offset) * seg;
    const delta = (((base - rotation) % TAU) + TAU) % TAU;
    const turns = 5 + randomInt(3);
    const start = rotation;
    const end = rotation + delta + turns * TAU;

    spinning = true;
    winner = -1;
    renderFilters();
    $('result').innerHTML = '<div class="result-empty">Spinning…</div>';

    let lastIdx = indexAtPointer(rotation);
    const t0 = performance.now();

    function frame(now) {
      const t = Math.min(1, (now - t0) / SPIN_MS);
      rotation = start + (end - start) * ease(t);

      const idx = indexAtPointer(rotation);
      if (idx !== lastIdx) {
        lastIdx = idx;
        tick();
      }
      draw();

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        rotation = ((end % TAU) + TAU) % TAU;
        finish(indexAtPointer(rotation));
      }
    }
    requestAnimationFrame(frame);
  }

  function tick() {
    pointer.classList.add('tick');
    requestAnimationFrame(() => pointer.classList.remove('tick'));
    if (state.sound) audio.tick();
  }

  function finish(idx) {
    spinning = false;
    winner = idx;
    const job = pool[idx];
    draw();
    renderFilters();
    showResult(job);
    state.history.unshift(job.id);
    state.history = state.history.slice(0, 30);
    renderHistory();
    saveState();
    if (state.sound) audio.win();
  }

  function showResult(job) {
    const role = ROLES[job.role];
    const el = $('result');
    el.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'result-job';
    box.style.setProperty('--glow', role.accent + '99');
    box.innerHTML = `
      <img src="icons/${job.id}.png" alt="">
      <div>
        <div class="name"></div>
        <div class="role" style="color:${role.accent}">${role.label}</div>
      </div>`;
    box.querySelector('.name').textContent = job.name;
    el.appendChild(box);
  }

  function renderHistory() {
    const list = $('history');
    list.innerHTML = '';
    if (state.history.length === 0) {
      list.innerHTML = '<li class="empty">No spins yet</li>';
      return;
    }
    state.history.forEach((id, i) => {
      const job = JOBS.find((j) => j.id === id);
      const li = document.createElement('li');
      li.innerHTML = `<span class="idx">${i + 1}</span><img src="icons/${job.id}.png" alt=""><span></span>`;
      li.lastChild.textContent = job.name;
      li.lastChild.style.color = ROLES[job.role].accent;
      list.appendChild(li);
    });
  }

  // ---------- Sound (generated ticks, recorded win sound) ----------

  const audio = (() => {
    let ac = null;
    const get = () => {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) ac = new AC();
      }
      return ac;
    };

    function blip(freq, dur, type, vol, when = 0) {
      const a = get();
      if (!a) return;
      const t = a.currentTime + when;
      const osc = a.createOscillator();
      const gain = a.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(a.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }

    const confirm = new Audio('sounds/confirm.mp3');
    confirm.preload = 'auto';
    confirm.volume = 0.5;

    return {
      unlock() { const a = get(); if (a && a.state === 'suspended') a.resume(); },
      tick() { blip(1500, 0.035, 'square', 0.04); },
      win() {
        confirm.currentTime = 0;
        confirm.play().catch(() => { /* playback blocked or file missing */ });
      },
    };
  })();

  // ---------- Wiring ----------

  spinBtn.addEventListener('click', spin);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      spin();
    }
  });
  // Stop Space from also "clicking" whatever button/checkbox has focus
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') e.preventDefault();
  });
  new ResizeObserver(resize).observe(wrap);

  pool = buildPool();
  renderFilters();
  renderJobs();
  renderHistory();
  resize();
  // The wheel is a canvas, so redraw once the bundled font has loaded
  document.fonts.load('20px "XIV Display"').then(draw);
})();
