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

  const state = {
    roles: new Set(ROLE_ORDER),
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
      if (typeof saved.includeLimited === 'boolean') state.includeLimited = saved.includeLimited;
      else if (typeof saved.includeBlu === 'boolean') state.includeLimited = saved.includeBlu;
      if (typeof saved.sound === 'boolean') state.sound = saved.sound;
      if (typeof saved.noRepeat === 'boolean') state.noRepeat = saved.noRepeat;
      if (Array.isArray(saved.history)) state.history = saved.history.filter((id) => JOBS.some((j) => j.id === id)).slice(0, 30);
    } catch (_) { /* storage unavailable */ }
  }

  function saveState() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        roles: [...state.roles],
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

  function jobAllowed(job) {
    return state.roles.has(job.role) && (state.includeLimited || !job.limited);
  }

  function onFilterChange() {
    pool = JOBS.filter(jobAllowed);
    winner = -1;
    renderFilters();
    draw();
    saveState();
  }

  function renderFilters() {
    const sameSet = (list) => list.length === state.roles.size && list.every((r) => state.roles.has(r));
    document.querySelector('[data-quick="all"]').classList.toggle('on', sameSet(ROLE_ORDER));
    document.querySelector('[data-quick="dps"]').classList.toggle('on', sameSet(DPS_ROLES));

    roleFilters.querySelectorAll('.chip').forEach((btn) => {
      const role = btn.dataset.role;
      btn.classList.toggle('on', state.roles.has(role));
      btn.querySelector('.n').textContent =
        JOBS.filter((j) => j.role === role && (state.includeLimited || !j.limited)).length;
    });

    const count = $('count');
    if (pool.length === 0) {
      count.textContent = 'Select at least one role to spin.';
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
    draw();
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
    const R = size / 2 - 14;       // inner radius of the gold rim
    const n = pool.length;

    ctx.clearRect(0, 0, size, size);

    // Outer rim
    const rim = ctx.createLinearGradient(0, cy - R, 0, cy + R);
    rim.addColorStop(0, '#ffe09a');
    rim.addColorStop(0.5, '#c9953f');
    rim.addColorStop(1, '#7a5520');
    ctx.beginPath();
    ctx.arc(cx, cy, R + 12, 0, TAU);
    ctx.fillStyle = rim;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, R + 2, 0, TAU);
    ctx.fillStyle = '#0b1328';
    ctx.fill();

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
      ctx.strokeStyle = 'rgba(227, 181, 90, 0.55)';
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
      ctx.font = `600 ${fontSize}px "Segoe UI", -apple-system, sans-serif`;
      const w = ctx.measureText(job.name).width;
      if (w > maxLen) {
        fontSize *= maxLen / w;
        ctx.font = `600 ${fontSize}px "Segoe UI", -apple-system, sans-serif`;
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
      const px = cx + Math.cos(a) * (R + 6);
      const py = cy + Math.sin(a) * (R + 6);
      ctx.beginPath();
      ctx.arc(px, py, Math.max(2.5, size * 0.006), 0, TAU);
      ctx.fillStyle = '#fff3cf';
      ctx.fill();
      ctx.strokeStyle = '#6b4a1b';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Hub ring behind the button
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.21, 0, TAU);
    ctx.fillStyle = 'rgba(8, 14, 32, 0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(227, 181, 90, 0.7)';
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

  // ---------- Sound (generated, no audio files) ----------

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

    return {
      unlock() { const a = get(); if (a && a.state === 'suspended') a.resume(); },
      tick() { blip(1500, 0.035, 'square', 0.04); },
      win() {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => blip(f, 0.5, 'triangle', 0.12, i * 0.09));
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

  pool = JOBS.filter(jobAllowed);
  renderFilters();
  renderHistory();
  resize();
})();
