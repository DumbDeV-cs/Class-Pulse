/* Hajiri — attendance app (vanilla JS, no build step) */
'use strict';

/* ───────────── helpers ───────────── */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtPct = p => p == null ? '—' : (Math.round(p * 10) / 10).toString();
const state = { settings: {}, classes: [], today: '', creds: {} };

async function api(path, opts = {}) {
  const o = { ...opts };
  if (o.json !== undefined) { o.method = o.method || 'POST'; o.headers = { 'Content-Type': 'application/json' }; o.body = JSON.stringify(o.json); delete o.json; }
  const res = await fetch('/api' + path, o);
  let data = null;
  try { data = await res.json(); } catch (_) { /* non-JSON */ }
  if (!res.ok) throw new Error((data && data.error) || 'Request failed (' + res.status + ')');
  return data;
}

const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  chart: '<path d="M4 20V11M10 20V4M16 20v-7M22 20H2"/>',
  message: '<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>', download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>', phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>', trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
  trend: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>', refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M3 21v-5h5"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>', fire: '<path d="M12 22a7 7 0 0 0 7-7c0-4-3-6-4-10-3 2-4 4-4 6-1-1-2-2-2-4-3 3-4 6-4 8a7 7 0 0 0 7 7z"/>',
};
const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;

const GRADS = [['#ff9a8b', '#ff6a88'], ['#6a85f1', '#8ec5fc'], ['#43c6ac', '#74d6a8'], ['#f7971e', '#ffb75e'], ['#7f7fd5', '#b993d6'], ['#2193b0', '#6dd5ed'], ['#ee9ca7', '#c779d0'], ['#56ab2f', '#a8e063']];
function avatar(s, size = 40, sq = false) {
  let h = 0; for (const c of s.name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [a, b] = GRADS[h % GRADS.length];
  const ini = s.name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const img = s.photo ? `<img src="${esc(s.photo)}" alt="" loading="lazy" onerror="this.remove()">` : '';
  return `<span class="av${sq ? ' sq' : ''}" style="--s:${size}px;background:linear-gradient(135deg,${a},${b})">${esc(ini)}${img}</span>`;
}

function band(pct) {
  if (pct == null) return 'none';
  const t = +state.settings.threshold || 75;
  return pct >= t ? 'good' : pct >= t - 10 ? 'warn' : 'critical';
}
const BAND_LABEL = { good: 'On track', warn: 'Watch', critical: 'At risk', none: 'No data' };
const BAND_COLOR = { good: 'var(--good)', warn: 'var(--warn)', critical: 'var(--bad)', none: 'var(--faint)' };

function ring(pct, size = 150, stroke = 12, fs = 40, label = '') {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return `<div class="ring" style="width:${size}px;height:${size}px;--fs:${fs}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
      <circle class="bar" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" stroke-linecap="round"
        stroke="${BAND_COLOR[band(pct)]}" stroke-dasharray="${c}" stroke-dashoffset="${c}" data-target="${c * (1 - v / 100)}"/>
    </svg>
    <div class="mid"><b>${pct == null ? '—' : `<span data-count="${pct}" data-dec="1">0</span>`}</b>${pct == null ? '' : '<b style="font-size:.5em;color:var(--muted)">%</b>'}${label ? `<small>${esc(label)}</small>` : ''}</div>
  </div>`;
}

/* run entrance animations after a render */
function animate(root) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $$('.ring .bar', root).forEach(el => el.style.strokeDashoffset = el.dataset.target);
    $$('.bar-fill', root).forEach(el => el.style.width = el.dataset.w + '%');
  }));
  $$('[data-count]', root).forEach(el => {
    const to = +el.dataset.count, dec = +(el.dataset.dec || 0), t0 = performance.now(), dur = 1100;
    const tick = now => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 4);
      el.textContent = (to * e).toFixed(dec);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type; el.textContent = msg;
  $('#toast-root').append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 3200);
}

let overlay = null;
function openOverlay(html, drawer = false) {
  closeOverlay(true);
  const root = $('#overlay-root');
  root.innerHTML = `<div class="backdrop ${drawer ? 'drawer' : ''}"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  overlay = $('.backdrop', root);
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) closeOverlay(); });
  document.body.style.overflow = 'hidden';
  return $('.modal', overlay);
}
function closeOverlay(instant) {
  if (!overlay) return;
  const o = overlay; overlay = null; document.body.style.overflow = '';
  if (instant) return o.remove();
  o.classList.add('out'); setTimeout(() => o.remove(), 250);
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeOverlay(); });

function confirmDialog(title, text, ok = 'Confirm', danger = true) {
  return new Promise(resolve => {
    const m = openOverlay(`<h2>${esc(title)}</h2><p class="muted" style="margin-top:6px">${esc(text)}</p>
      <div class="modal-actions"><button class="btn" data-a="no">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-a="yes">${esc(ok)}</button></div>`);
    m.addEventListener('click', e => { const a = e.target.closest('[data-a]'); if (a) { closeOverlay(); resolve(a.dataset.a === 'yes'); } });
  });
}

const parseTs = s => new Date(String(s).replace(' ', 'T') + 'Z');
function ago(s) {
  const d = (Date.now() - parseTs(s)) / 1000;
  if (d < 60) return 'just now'; if (d < 3600) return Math.floor(d / 60) + ' min ago';
  if (d < 86400) return Math.floor(d / 3600) + ' h ago';
  return parseTs(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
const longDate = iso => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const shortDate = iso => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const skeleton = (n = 3) => `<div class="view grid g3">${'<div class="skel" style="height:140px"></div>'.repeat(n)}</div>`;

const PROVIDERS = {
  dryrun: { name: 'Demo mode', desc: 'Messages are logged but never sent. Safe for testing.' },
  link: { name: 'Click-to-send', desc: 'Opens WhatsApp with the message ready. No account needed.' },
  cloud: { name: 'WhatsApp Cloud API', desc: 'Fully automatic via Meta. Needs a business account.' },
  twilio: { name: 'Twilio WhatsApp', desc: 'Fully automatic via Twilio. Needs a Twilio account.' },
};
const STATUS_LABEL = { sent: 'Sent', simulated: 'Demo', manual: 'Ready to send', failed: 'Failed' };

/* ───────────── shell / router ───────────── */
const NAV = [['dashboard', 'Dashboard', 'dashboard'], ['attendance', 'Attendance', 'check'], ['students', 'Students', 'users'],
['reports', 'Reports', 'chart'], ['messages', 'Messages', 'message'], ['settings', 'Settings', 'settings']];

function renderShell(active) {
  $('#nav').innerHTML = NAV.map(([k, l, i]) => `<a class="nav-link ${k === active ? 'active' : ''}" href="#/${k}">${icon(i)}${l}</a>`).join('');
  $('#tabbar').innerHTML = NAV.filter(n => n[0] !== 'settings').map(([k, l, i]) => `<a class="${k === active ? 'active' : ''}" href="#/${k}">${icon(i)}${l}</a>`).join('');
  $('#schoolName').textContent = state.settings.school_name || 'Smart Attendance';
  const p = state.settings.provider, chip = $('#providerChip');
  chip.className = 'provider-chip ' + (p === 'dryrun' ? 'demo' : 'live');
  chip.innerHTML = `<i></i>${esc(PROVIDERS[p]?.name || p)}`;
  setThemeIcon();
}
function setThemeIcon() {
  const dark = document.documentElement.dataset.theme === 'dark' ||
    (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme:dark)').matches);
  $('#themeBtn').innerHTML = icon(dark ? 'sun' : 'moon');
}
$('#themeBtn').addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch (_) { }
  setThemeIcon();
});

const VIEWS = {};
let navToken = 0;
async function route() {
  const [path, qs] = (location.hash.slice(2) || 'dashboard').split('?');
  const name = VIEWS[path] ? path : 'dashboard';
  const params = new URLSearchParams(qs || '');
  const token = ++navToken;
  const old = $('#main'), main = old.cloneNode(false); old.replaceWith(main);
  renderShell(name);
  main.innerHTML = skeleton();
  try {
    await VIEWS[name](main, params, () => token === navToken);
  } catch (err) {
    if (token !== navToken) return;
    main.innerHTML = `<div class="card empty view">${icon('alert')}<p><b>Something went wrong</b></p><p class="small">${esc(err.message)}</p><br><button class="btn" onclick="route()">Try again</button></div>`;
  }
  if (token === navToken) { window.scrollTo(0, 0); }
}
window.addEventListener('hashchange', route);

async function boot() {
  const b = await api('/bootstrap');
  Object.assign(state, { settings: b.settings, classes: b.classes, today: b.today });
  route();
}
async function refreshBoot() { const b = await api('/bootstrap'); Object.assign(state, { settings: b.settings, classes: b.classes, today: b.today }); renderShell((location.hash.slice(2) || 'dashboard').split('?')[0]); }

/* ───────────── Dashboard ───────────── */
function trendChart(points) {
  const valid = points.filter(p => p.rate != null);
  if (valid.length < 2) return `<div class="empty">${icon('trend')}<p>Not enough data yet</p></div>`;
  const W = 600, H = 230, pl = 14, pr = 14, pt = 34, pb = 34;
  const lo = Math.max(0, Math.floor((Math.min(...valid.map(p => p.rate)) - 8) / 10) * 10), hi = 100;
  const x = i => pl + i * (W - pl - pr) / (points.length - 1), y = r => pt + (1 - (r - lo) / (hi - lo)) * (H - pt - pb);
  const pts = points.map((p, i) => p.rate == null ? null : [x(i), y(p.rate), p]).filter(Boolean);
  const smooth = pts.map((p, i) => {
    if (!i) return `M${p[0]},${p[1]}`;
    const q = pts[i - 1], cx = (q[0] + p[0]) / 2;
    return `C${cx},${q[1]} ${cx},${p[1]} ${p[0]},${p[1]}`;
  }).join(' ');
  const area = `${smooth} L${pts.at(-1)[0]},${H - pb} L${pts[0][0]},${H - pb} Z`;
  const grid = [lo, (lo + hi) / 2, hi].map(v => `<line class="grid-line" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text x="${W - pr}" y="${y(v) - 6}" text-anchor="end">${v}%</text>`).join('');
  const labels = points.map((p, i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${new Date(p.date + 'T00:00').toLocaleDateString('en-GB', { weekday: 'short' })}</text>`).join('');
  const dots = pts.map(([px, py, p], i) => `<g><circle class="pt" style="--i:${i}" cx="${px}" cy="${py}" r="5"><title>${shortDate(p.date)}: ${fmtPct(p.rate)}%</title></circle>
    <text class="val" x="${px}" y="${py - 14}" text-anchor="middle" style="opacity:0;animation:fade .4s ease forwards;animation-delay:${.6 + i * .12}s">${Math.round(p.rate)}</text></g>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Attendance trend, last school days">
    <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".28"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
    ${grid}<path class="area" d="${area}" fill="url(#ag)"/><path class="line" pathLength="1" d="${smooth}"/>${dots}${labels}</svg>`;
}

VIEWS.dashboard = async (main) => {
  const d = await api('/dashboard');
  const t = d.today, notTaken = t.marked < t.students;
  const stat = (i, ico, kind, num, suffix, label) => `<div class="card stat rise" style="--i:${i}"><div class="ico ${kind}">${icon(ico)}</div>
    <div class="num"><span data-count="${num}" data-dec="${String(num).includes('.') ? 1 : 0}">0</span>${suffix ? `<small>${suffix}</small>` : ''}</div><div class="lbl">${label}</div></div>`;
  main.innerHTML = `<div class="view">
    <div class="page-head"><div><div class="eyebrow">${esc(longDate(d.date))}</div><h1>${greeting()}</h1>
      <p>${notTaken ? `${t.marked} of ${t.students} students marked today.` : 'Attendance has been taken for every class today.'}</p></div>
      <a class="btn primary" href="#/attendance">${icon('check')}Take attendance</a></div>

    <div class="grid g4" style="margin-bottom:18px">
      ${stat(0, 'users', '', t.students, '', 'Students enrolled')}
      ${stat(1, 'trend', 'good', d.overall ?? 0, '%', 'Overall attendance')}
      ${stat(2, 'alert', 'bad', d.at_risk_count, '', 'Below ' + esc(state.settings.threshold) + '% attendance')}
      ${stat(3, 'message', 'info', d.message_count, '', 'Parent messages')}
    </div>

    <div class="grid g2" style="margin-bottom:18px">
      <div class="card hero rise" style="--i:4">
        ${ring(t.rate, 168, 14, 44, "today's rate")}
        <div><h2>Today at a glance</h2><p class="sub" style="margin-bottom:18px">Present and late count as attended.</p>
          <div class="legend">${[['present', 'Present'], ['late', 'Late'], ['absent', 'Absent'], ['leave', 'On leave']].map(([k, l]) =>
    `<div><i class="dot ${k}"></i><b data-count="${t[k]}">0</b><span>${l}</span></div>`).join('')}</div></div>
      </div>
      <div class="card rise" style="--i:5"><div class="card-head"><div><h2>Last 7 school days</h2><p class="sub">Daily attendance rate</p></div></div>${trendChart(d.trend)}</div>
    </div>

    <h2 style="margin:26px 4px 14px;font-size:20px;letter-spacing:-.02em">Classes</h2>
    <div class="grid g3" style="margin-bottom:18px">${d.classes.map((c, i) => {
      const b = band(c.overall), done = c.marked === c.students;
      return `<a class="card class-card rise" style="--i:${6 + i}" href="#/attendance?class=${encodeURIComponent(c.class_name)}">
        <div class="row"><h3>Class ${esc(c.class_name)}</h3><span class="spacer"></span>
          <span class="pill ${done ? 'good' : 'warn'}">${done ? 'Taken' : c.marked ? 'Partial' : 'Not taken'}</span></div>
        <p class="sub" style="margin:2px 0 16px">${c.students} students · ${c.overall == null ? 'no history' : fmtPct(c.overall) + '% overall'}</p>
        <div class="bar-track"><div class="bar-fill ${b}" data-w="${c.overall || 0}"></div></div>
        <div class="mini-counts"><span><b>${c.present}</b>present</span><span><b>${c.late}</b>late</span><span><b>${c.absent}</b>absent</span><span><b>${c.leave}</b>leave</span></div></a>`;
    }).join('')}</div>

    <div class="grid g2">
      <div class="card rise" style="--i:9"><div class="card-head"><div><h2>Needs attention</h2><p class="sub">Attendance below ${esc(state.settings.threshold)}%</p></div>
        <a class="small" href="#/reports">View report</a></div>
        ${d.at_risk.length ? d.at_risk.map(s => `<div class="list-item">${avatar(s, 42)}<div class="grow"><div class="t">${esc(s.name)}</div><div class="s">Class ${esc(s.class_name)} · ${s.stats.absent} absences</div></div>
          <span class="pill ${band(s.stats.percentage)}">${fmtPct(s.stats.percentage)}%</span>
          <button class="iconbtn" title="Send attendance alert to parent" data-alert="${s.id}">${icon('send')}</button></div>`).join('')
      : `<div class="empty">${icon('check')}<p>Everyone is on track</p></div>`}</div>
      <div class="card rise" style="--i:10"><div class="card-head"><div><h2>Recent messages</h2><p class="sub">Parent notifications</p></div><a class="small" href="#/messages">See all</a></div>
        ${d.messages.length ? d.messages.map(m => `<div class="list-item"><div class="grow"><div class="t">${esc(m.student_name)}</div><div class="s">${m.kind === 'absent' ? 'Absence notice' : 'Low attendance alert'} · ${ago(m.created_at)}</div></div>
          <span class="pill ${m.status}">${STATUS_LABEL[m.status]}</span></div>`).join('')
      : `<div class="empty">${icon('message')}<p>No messages yet</p></div>`}</div>
    </div></div>`;
  animate(main);
  main.addEventListener('click', async e => {
    const b = e.target.closest('[data-alert]'); if (!b) return;
    b.disabled = true; await sendLowAlert(+b.dataset.alert); b.disabled = false;
  });
};

async function sendLowAlert(id) {
  try {
    const m = await api('/notify/low', { json: { student_id: id } });
    if (m.status === 'manual') window.open(m.link, '_blank', 'noopener');
    toast(m.status === 'failed' ? 'Failed: ' + (m.error || 'unknown error') : m.status === 'simulated' ? 'Alert logged (demo mode)' : m.status === 'manual' ? 'WhatsApp opened' : 'Alert sent to parent', m.status === 'failed' ? 'err' : '');
  } catch (e) { toast(e.message, 'err'); }
}

/* ───────────── Attendance ───────────── */
VIEWS.attendance = async (main, params, alive) => {
  if (!state.classes.length) { main.innerHTML = `<div class="card empty view">${icon('users')}<p><b>No students yet</b></p><p class="small">Add students first.</p><br><a class="btn primary" href="#/students">Add students</a></div>`; return; }
  let cls = params.get('class'); if (!state.classes.includes(cls)) cls = state.classes[0];
  let date = params.get('date') || state.today, q = '', notify = true, marks = {}, data = null, busy = false;
  const STATUS = [['present', 'Present', 'P'], ['late', 'Late', 'L'], ['absent', 'Absent', 'A'], ['leave', 'Leave', 'Lv']];

  main.innerHTML = `<div class="view">
    <div class="page-head"><div><div class="eyebrow" id="a-date"></div><h1>Take attendance</h1><p id="a-sub"></p></div></div>
    <div class="att-bar"><div class="chips" id="a-classes">${state.classes.map(c => `<button class="chip ${c === cls ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <span class="spacer"></span><input type="date" class="input" id="a-d" style="width:auto" max="${state.today}" value="${date}">
      <div class="search">${icon('search')}<input class="input" id="a-q" placeholder="Search student" autocomplete="off"></div></div>
    <div id="a-notice"></div><div class="sumchips" id="a-sum"></div>
    <div id="a-list">${'<div class="skel" style="height:64px;margin-bottom:10px;border-radius:18px"></div>'.repeat(5)}</div>
    <div class="actionbar" id="a-bar" hidden></div></div>`;

  const sum = () => {
    const c = { present: 0, late: 0, absent: 0, leave: 0 }; Object.values(marks).forEach(s => c[s]++); return c;
  };
  function paintSum(bump) {
    const c = sum();
    $('#a-sum').innerHTML = STATUS.map(([k, l]) => `<div class="sumchip"><i class="dot ${k}"></i>${l}<b data-k="${k}">${c[k]}</b></div>`).join('') +
      `<button class="chip" id="a-allp">Mark all present</button>`;
    if (bump) { const b = $(`#a-sum b[data-k="${bump}"]`); if (b) { b.classList.add('bump'); setTimeout(() => b.classList.remove('bump'), 260); } }
    const n = c.absent, bar = $('#a-bar');
    bar.hidden = !data || !data.students.length;
    bar.innerHTML = `<label class="switch"><input type="checkbox" id="a-n" ${notify ? 'checked' : ''}><i></i>Notify parents on WhatsApp</label><span class="spacer"></span>
      <span class="muted small">${n ? `${n} absent` : 'Nobody absent'}</span><button class="btn primary" id="a-save" ${busy ? 'disabled' : ''}>${busy ? '<span class="spin"></span>' : icon('check')}${notify && n ? `Save & notify ${n}` : 'Save attendance'}</button>`;
  }
  function paintList() {
    const list = data.students.filter(s => !q || s.name.toLowerCase().includes(q) || String(s.roll) === q);
    $('#a-list').innerHTML = list.length ? list.map((s, i) => `<div class="arow rise" style="--i:${Math.min(i, 12)}" data-id="${s.id}" data-s="${marks[s.id]}">
      <span class="roll">${s.roll}</span>${avatar(s, 44)}
      <div class="who"><b>${esc(s.name)}</b><span>${s.stats.percentage == null ? 'New student' : fmtPct(s.stats.percentage) + '% attendance'}${s.notified ? ' · <span style="color:var(--good)">parent notified</span>' : ''}</span></div>
      <div class="seg">${STATUS.map(([k, l, sh]) => `<button data-s="${k}" class="${marks[s.id] === k ? 'on' : ''}" aria-pressed="${marks[s.id] === k}"><span class="l">${l}</span><span class="s">${sh}</span></button>`).join('')}</div></div>`).join('')
      : `<div class="card empty">${icon('search')}<p>No student matches “${esc(q)}”</p></div>`;
  }
  async function load() {
    $('#a-date').textContent = longDate(date);
    data = await api(`/attendance?class=${encodeURIComponent(cls)}&date=${date}`);
    if (!alive()) return;
    marks = {}; data.students.forEach(s => marks[s.id] = s.status || 'present');
    $('#a-sub').textContent = `Class ${cls} · ${data.students.length} students · ` + (data.taken ? 'already recorded — changes will update it' : 'everyone starts as present, tap to mark exceptions');
    $('#a-notice').innerHTML = data.weekend ? `<div class="notice">${icon('alert')}This date is a weekly holiday. You can still record attendance if school was open.</div>` : '';
    paintList(); paintSum();
  }

  main.addEventListener('click', async e => {
    const chip = e.target.closest('#a-classes .chip');
    if (chip) { cls = chip.dataset.c; $$('#a-classes .chip').forEach(c => c.classList.toggle('on', c === chip)); history.replaceState(null, '', `#/attendance?class=${encodeURIComponent(cls)}&date=${date}`); return load(); }
    const sb = e.target.closest('.seg button');
    if (sb) {
      const row = sb.closest('.arow'), id = +row.dataset.id, s = sb.dataset.s;
      marks[id] = s; row.dataset.s = s;
      $$('.seg button', row).forEach(b => { const on = b === sb; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      return paintSum(s);
    }
    if (e.target.closest('#a-allp')) { data.students.forEach(s => marks[s.id] = 'present'); paintList(); return paintSum('present'); }
    if (e.target.closest('#a-save')) return save();
  });
  main.addEventListener('change', e => {
    if (e.target.id === 'a-d') { if (e.target.value) { date = e.target.value; load(); } }
    if (e.target.id === 'a-n') { notify = e.target.checked; paintSum(); }
  });
  main.addEventListener('input', e => { if (e.target.id === 'a-q') { q = e.target.value.trim().toLowerCase(); paintList(); } });

  async function save() {
    if (busy) return; busy = true; paintSum();
    try {
      const res = await api('/attendance', { json: { date, class_name: cls, notify, records: Object.entries(marks).map(([id, status]) => ({ student_id: +id, status })) } });
      showResult(res);
      await load();
    } catch (e) { toast(e.message, 'err'); }
    busy = false; paintSum();
  }
  function showResult(res) {
    const c = res.counts, msgs = res.messages, prov = state.settings.provider;
    const m = openOverlay(`<h2>Attendance saved</h2><p class="muted">Class ${esc(cls)} · ${esc(longDate(date))}</p>
      <div class="kv" style="margin:18px 0">${STATUS.map(([k, l]) => `<div><b style="color:var(--${k === 'present' ? 'good' : k === 'late' ? 'warn' : k === 'absent' ? 'bad' : 'info'})">${c[k]}</b><span>${l}</span></div>`).join('')}</div>
      ${msgs.length ? `${prov === 'dryrun' ? `<div class="notice">${icon('alert')}Demo mode: messages were logged, not sent. Choose a provider in Settings.</div>` : ''}
        <div class="eyebrow">Parent notifications</div>
        ${msgs.map(x => `<div class="list-item"><div class="grow"><div class="t">${esc(x.student_name)}</div><div class="s">${x.phone ? '+' + esc(x.phone) : 'No valid number'}${x.error ? ' · ' + esc(x.error) : ''}</div></div>
          <span class="pill ${x.status}">${STATUS_LABEL[x.status]}</span>${x.status === 'manual' ? `<a class="btn sm good" target="_blank" rel="noopener" href="${esc(x.link)}">${icon('send')}Send</a>` : ''}</div>`).join('')}`
        : `<p class="muted small">${notify ? 'No new absence notices were needed (already notified, or nobody is absent).' : 'Parent notifications were switched off for this save.'}</p>`}
      <div class="modal-actions"><button class="btn primary" data-close>Done</button></div>`);
    m.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeOverlay(); });
  }
  await load();
};

/* ───────────── Students ───────────── */
VIEWS.students = async (main) => {
  let cls = '', q = '', all = await api('/students');
  main.innerHTML = `<div class="view">
    <div class="page-head"><div><div class="eyebrow">Directory</div><h1>Students</h1><p id="s-sub"></p></div><button class="btn primary" id="s-add">${icon('plus')}Add student</button></div>
    <div class="att-bar"><div class="chips" id="s-classes"><button class="chip on" data-c="">All</button>${state.classes.map(c => `<button class="chip" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <span class="spacer"></span><div class="search">${icon('search')}<input class="input" id="s-q" placeholder="Search name or roll" autocomplete="off"></div></div>
    <div class="sgrid" id="s-grid"></div></div>`;
  const paint = () => {
    const list = all.filter(s => (!cls || s.class_name === cls) && (!q || s.name.toLowerCase().includes(q) || String(s.roll) === q));
    $('#s-sub').textContent = `${list.length} of ${all.length} students`;
    $('#s-grid').innerHTML = list.length ? list.map((s, i) => { const b = band(s.stats.percentage); return `<button class="card scard rise" style="--i:${Math.min(i, 14)}" data-id="${s.id}">
      <div class="photo">${avatar(s, 200, true)}<span class="pct ${b}"><i></i>${s.stats.percentage == null ? 'New' : fmtPct(s.stats.percentage) + '%'}</span></div>
      <div class="meta"><b>${esc(s.name)}</b><span>Class ${esc(s.class_name)} · Roll ${s.roll}</span></div></button>`; }).join('')
      : `<div class="card empty" style="grid-column:1/-1">${icon('users')}<p>No students found</p></div>`;
  };
  paint();
  main.addEventListener('click', e => {
    const c = e.target.closest('#s-classes .chip');
    if (c) { cls = c.dataset.c; $$('#s-classes .chip').forEach(x => x.classList.toggle('on', x === c)); return paint(); }
    if (e.target.closest('#s-add')) return studentForm(null, reload);
    const card = e.target.closest('.scard'); if (card) openProfile(+card.dataset.id, reload);
  });
  main.addEventListener('input', e => { if (e.target.id === 's-q') { q = e.target.value.trim().toLowerCase(); paint(); } });
  async function reload() { await refreshBoot(); route(); }
};

function heatmap(history) {
  const days = 84, end = new Date(state.today + 'T00:00'), cells = [];
  const start = new Date(end); start.setDate(start.getDate() - days + 1);
  for (let i = 0; i < start.getDay(); i++) cells.push('<i class="blank"></i>');
  for (let i = 0; i < days; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const iso = d.toLocaleDateString('en-CA'), s = history[iso];
    cells.push(`<i class="${s || ''}" style="--i:${cells.length}" title="${shortDate(iso)}${s ? ': ' + s : ''}"></i>`);
  }
  return `<div class="heat">${cells.join('')}</div>`;
}

async function openProfile(id, onChange) {
  const m = openOverlay(`<div class="p-hero"><div class="skel" style="height:112px;width:112px;border-radius:50%;margin:0 auto"></div></div>`, true);
  let s;
  try { s = await api('/students/' + id); } catch (e) { closeOverlay(); return toast(e.message, 'err'); }
  const st = s.stats, b = s.band, wa = s.parent_phone ? 'https://wa.me/' + s.parent_phone.replace(/\D/g, '') : '';
  m.innerHTML = `<div class="p-hero"><button class="iconbtn p-close" data-a="close" aria-label="Close">${icon('x')}</button>
      ${avatar(s, 112)}<h2>${esc(s.name)}</h2><p class="muted">Class ${esc(s.class_name)} · Roll ${s.roll}</p></div>
    <div class="p-body">
      <div class="row" style="justify-content:center;gap:26px">${ring(st.percentage, 120, 11, 30, 'attendance')}
        <div><span class="pill ${b}" style="margin-bottom:10px">${BAND_LABEL[b]}</span>
          <div class="small muted">Rank <b style="color:var(--text)">${s.class_rank}</b> of ${s.class_size} in class</div>
          <div class="small muted" style="margin-top:4px">${icon('fire')} <b style="color:var(--text)">${s.streak}</b> day streak</div></div></div>
      <div class="kv"><div><b style="color:var(--good)">${st.present}</b><span>Present</span></div><div><b style="color:var(--warn)">${st.late}</b><span>Late</span></div>
        <div><b style="color:var(--bad)">${st.absent}</b><span>Absent</span></div><div><b style="color:var(--info)">${st.leave}</b><span>Leave</span></div></div>
      <div><div class="eyebrow">Last 12 weeks</div>${heatmap(s.history)}</div>
      <div><div class="eyebrow">Parent / guardian</div><div class="contact"><span class="ico">${icon('phone')}</span>
        <div class="grow" style="flex:1"><b>${esc(s.parent_name || 'Not set')}</b><div class="small muted">${esc(s.parent_phone || 'No phone number')}</div></div>
        ${wa ? `<a class="btn sm" href="${esc(wa)}" target="_blank" rel="noopener">${icon('external')}Chat</a>` : ''}</div></div>
      ${s.messages.length ? `<div><div class="eyebrow">Recent messages</div>${s.messages.slice(0, 4).map(x => `<div class="list-item"><div class="grow"><div class="t">${x.kind === 'absent' ? 'Absence notice' : 'Low attendance alert'}</div><div class="s">${esc(shortDate(x.date))} · ${ago(x.created_at)}</div></div><span class="pill ${x.status}">${STATUS_LABEL[x.status]}</span></div>`).join('')}</div>` : ''}
      <div class="row" style="flex-wrap:wrap"><button class="btn" data-a="edit">${icon('edit')}Edit</button>
        <button class="btn" data-a="alert">${icon('send')}Send alert</button><span class="spacer"></span><button class="btn danger" data-a="del">${icon('trash')}Delete</button></div>
    </div>`;
  animate(m);
  m.addEventListener('click', async e => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'close') closeOverlay();
    if (a === 'edit') studentForm(s, onChange);
    if (a === 'alert') sendLowAlert(s.id);
    if (a === 'del' && await confirmDialog('Delete ' + s.name + '?', 'Their profile, photo and attendance history will be permanently removed.', 'Delete')) {
      try { await api('/students/' + s.id, { method: 'DELETE' }); toast('Student deleted'); closeOverlay(); onChange && onChange(); } catch (er) { toast(er.message, 'err'); }
    }
  });
}

function studentForm(s, onSaved) {
  const edit = !!s; let file = null, removePhoto = false;
  const m = openOverlay(`<h2>${edit ? 'Edit student' : 'New student'}</h2><p class="muted small">Parent phone is used for WhatsApp notifications.</p>
    <form id="sf"><div class="form-grid">
      <div class="full"><label class="drop" id="drop"><span id="prev">${avatar(s || { name: 'New Student' }, 64)}</span>
        <span><b>${icon('camera')} Upload photo</b><br><span class="small muted">JPG or PNG · cropped to a square automatically</span></span>
        <input type="file" id="photo" accept="image/*" hidden></label>
        ${edit && s.photo ? `<button type="button" class="btn sm ghost" id="rmphoto" style="margin-top:6px">Remove current photo</button>` : ''}</div>
      <label class="field full">Full name<input class="input" name="name" required value="${esc(s?.name)}" placeholder="e.g. Aarav Sharma"></label>
      <label class="field">Class<input class="input" name="class_name" required list="cl" value="${esc(s?.class_name)}" placeholder="e.g. 10-A"><datalist id="cl">${state.classes.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
      <label class="field">Roll number<input class="input" name="roll" type="number" min="1" required value="${esc(s?.roll)}"></label>
      <label class="field">Parent name<input class="input" name="parent_name" value="${esc(s?.parent_name)}"></label>
      <label class="field">Parent WhatsApp<input class="input" name="parent_phone" inputmode="tel" value="${esc(s?.parent_phone)}" placeholder="98XXXXXXXX"></label>
    </div><div class="modal-actions"><button type="button" class="btn" data-a="cancel">Cancel</button><button class="btn primary" type="submit">${edit ? 'Save changes' : 'Add student'}</button></div></form>`);
  const input = $('#photo', m), drop = $('#drop', m);
  const setFile = f => {
    if (!f || !f.type.startsWith('image/')) return toast('Please choose an image file', 'err');
    file = f; removePhoto = false;
    $('#prev', m).innerHTML = `<span class="av" style="--s:64px"><img src="${URL.createObjectURL(f)}" alt=""></span>`;
  };
  input.addEventListener('change', () => setFile(input.files[0]));
  ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => setFile(e.dataTransfer.files[0]));
  $('#rmphoto', m)?.addEventListener('click', e => { removePhoto = true; file = null; $('#prev', m).innerHTML = avatar({ name: s.name }, 64); e.target.remove(); });
  m.addEventListener('click', e => { if (e.target.closest('[data-a=cancel]')) closeOverlay(); });
  $('#sf', m).addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target); if (file) fd.set('photo', file); if (removePhoto) fd.set('remove_photo', '1');
    const btn = $('button[type=submit]', m); btn.disabled = true;
    try {
      await api(edit ? '/students/' + s.id : '/students', { method: edit ? 'PUT' : 'POST', body: fd });
      toast(edit ? 'Student updated' : 'Student added'); closeOverlay(); onSaved && onSaved();
    } catch (er) { toast(er.message, 'err'); btn.disabled = false; }
  });
}

/* ───────────── Reports ───────────── */
VIEWS.reports = async (main) => {
  let cls = '', start = '', end = '', sort = 'asc', data = null;
  const qs = () => { const p = new URLSearchParams(); if (cls) p.set('class', cls); if (start) p.set('start', start); if (end) p.set('end', end); return p.toString(); };
  main.innerHTML = `<div class="view">
    <div class="page-head"><div><div class="eyebrow">Analytics</div><h1>Attendance report</h1><p>Percentage = (present + late) ÷ (present + late + absent). Leave days are excused.</p></div>
      <a class="btn" id="r-csv" href="#">${icon('download')}Export CSV</a></div>
    <div class="att-bar"><div class="chips" id="r-classes"><button class="chip on" data-c="">All classes</button>${state.classes.map(c => `<button class="chip" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <span class="spacer"></span><label class="row small muted">From<input type="date" class="input" id="r-s" style="width:auto" max="${state.today}"></label>
      <label class="row small muted">To<input type="date" class="input" id="r-e" style="width:auto" max="${state.today}"></label></div>
    <div class="grid g4" id="r-sum" style="margin-bottom:18px"></div><div class="card" style="padding:12px 12px 6px"><div class="scroll-x" id="r-table"></div></div></div>`;
  async function load() {
    data = await api('/reports?' + qs()); $('#r-csv').href = '/api/reports/export.csv?' + qs();
    const s = data.summary, tile = (ico, kind, n, suf, l, i) => `<div class="card stat rise" style="--i:${i}"><div class="ico ${kind}">${icon(ico)}</div><div class="num"><span data-count="${n}" data-dec="${String(n).includes('.') ? 1 : 0}">0</span>${suf ? `<small>${suf}</small>` : ''}</div><div class="lbl">${l}</div></div>`;
    $('#r-sum').innerHTML = tile('users', '', s.students, '', 'Students', 0) + tile('trend', 'good', s.average ?? 0, '%', 'Average attendance', 1) + tile('alert', 'bad', s.below, '', 'Below threshold', 2) + tile('check', 'info', s.perfect, '', '100% attendance', 3);
    paint(); animate($('#r-sum')); animate($('#r-table'));
  }
  function paint() {
    const rows = [...data.rows].sort((a, b) => sort === 'asc' ? (a.stats.percentage ?? 101) - (b.stats.percentage ?? 101) : (b.stats.percentage ?? -1) - (a.stats.percentage ?? -1));
    $('#r-table').innerHTML = rows.length ? `<table class="table"><thead><tr><th>Student</th><th>Class</th><th class="num">Present</th><th class="num">Late</th><th class="num">Absent</th><th class="num">Leave</th>
      <th class="sortable" id="r-sort">Attendance ${sort === 'asc' ? '↑' : '↓'}</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(r => `<tr>
      <td><div class="row">${avatar(r, 36)}<div><b>${esc(r.name)}</b><div class="small muted">Roll ${r.roll}</div></div></div></td><td>${esc(r.class_name)}</td>
      <td class="num">${r.stats.present}</td><td class="num">${r.stats.late}</td><td class="num">${r.stats.absent}</td><td class="num">${r.stats.leave}</td>
      <td><div class="pcell"><div class="bar-track"><div class="bar-fill ${r.band}" data-w="${r.stats.percentage || 0}"></div></div><b>${fmtPct(r.stats.percentage)}%</b></div></td>
      <td><span class="pill ${r.band}">${BAND_LABEL[r.band]}</span></td>
      <td>${r.band === 'warn' || r.band === 'critical' ? `<button class="btn sm" data-alert="${r.id}">${icon('send')}Alert</button>` : ''}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty">${icon('chart')}<p>No data for this selection</p></div>`;
    animate($('#r-table'));
  }
  main.addEventListener('click', async e => {
    const c = e.target.closest('#r-classes .chip');
    if (c) { cls = c.dataset.c; $$('#r-classes .chip').forEach(x => x.classList.toggle('on', x === c)); return load(); }
    if (e.target.closest('#r-sort')) { sort = sort === 'asc' ? 'desc' : 'asc'; return paint(); }
    const a = e.target.closest('[data-alert]'); if (a) { a.disabled = true; await sendLowAlert(+a.dataset.alert); a.disabled = false; }
  });
  main.addEventListener('change', e => { if (e.target.id === 'r-s') { start = e.target.value; load(); } if (e.target.id === 'r-e') { end = e.target.value; load(); } });
  await load();
};

/* ───────────── Messages ───────────── */
VIEWS.messages = async (main) => {
  const list = await api('/messages');
  const prov = state.settings.provider;
  main.innerHTML = `<div class="view"><div class="page-head"><div><div class="eyebrow">WhatsApp</div><h1>Message log</h1><p>Every notification sent to parents, with delivery status.</p></div>
    <a class="btn" href="#/settings">${icon('settings')}Provider: ${esc(PROVIDERS[prov]?.name)}</a></div>
    ${prov === 'dryrun' ? `<div class="notice">${icon('alert')}Demo mode is on — nothing is delivered to real phones. Open Settings to connect WhatsApp.</div>` : ''}
    <div class="card">${list.length ? list.map((m, i) => `<div class="list-item rise" style="--i:${Math.min(i, 10)};align-items:flex-start" data-id="${m.id}">
      <div class="grow"><div class="row" style="gap:8px;flex-wrap:wrap"><b>${esc(m.student_name)}</b><span class="pill ${m.kind === 'absent' ? 'critical' : 'warn'}">${m.kind === 'absent' ? 'Absence' : 'Low attendance'}</span>
        <span class="pill ${m.status}">${STATUS_LABEL[m.status]}</span><span class="small muted">${m.phone ? '+' + esc(m.phone) : 'no number'} · ${ago(m.created_at)}</span></div>
        <p class="small muted" style="margin-top:6px;white-space:normal">${esc(m.body)}</p>${m.error ? `<p class="small" style="color:var(--bad);margin-top:4px">${esc(m.error)}</p>` : ''}</div>
      <div class="row">${m.phone ? `<a class="iconbtn" title="Open in WhatsApp" target="_blank" rel="noopener" href="${esc(m.link)}">${icon('external')}</a>` : ''}
        <button class="iconbtn" title="Resend" data-resend="${m.id}">${icon('refresh')}</button></div></div>`).join('')
      : `<div class="empty">${icon('message')}<p>No messages yet. Absence notices appear here after you save attendance.</p></div>`}</div></div>`;
  main.addEventListener('click', async e => {
    const b = e.target.closest('[data-resend]'); if (!b) return; b.disabled = true;
    try { const r = await api('/messages/' + b.dataset.resend + '/resend', { method: 'POST' }); toast(r.status === 'failed' ? 'Failed: ' + r.error : 'Resent · ' + STATUS_LABEL[r.status], r.status === 'failed' ? 'err' : ''); if (r.status === 'manual') window.open(r.link, '_blank', 'noopener'); route(); }
    catch (er) { toast(er.message, 'err'); b.disabled = false; }
  });
};

/* ───────────── Settings ───────────── */
VIEWS.settings = async (main) => {
  const { settings: s, credentials } = await api('/settings');
  const cur = { ...s };
  const sample = { parent: 'Mr. Sharma', student: 'Aarav Sharma', class_name: '10-A', date: state.today, percentage: '82.5', school: s.school_name, threshold: s.threshold };
  const fill = t => t.replace(/\{(\w+)\}/g, (m, k) => sample[k] ?? m);
  const needs = { cloud: 'WHATSAPP_TOKEN, WHATSAPP_PHONE_ID', twilio: 'TWILIO_SID, TWILIO_TOKEN' };
  main.innerHTML = `<div class="view"><div class="page-head"><div><div class="eyebrow">Configuration</div><h1>Settings</h1></div><button class="btn primary" id="st-save">Save changes</button></div>
    <div class="stack">
    <div class="card rise"><h2>School</h2><div class="form-grid"><label class="field">School name<input class="input" data-k="school_name" value="${esc(s.school_name)}"></label>
      <label class="field">Country code<input class="input" data-k="country_code" value="${esc(s.country_code)}" inputmode="numeric"><span class="small" style="font-weight:400">Added to local numbers. Nepal is 977.</span></label>
      <label class="field full">Attendance threshold: <span id="thv" style="color:var(--text)">${esc(s.threshold)}%</span><input type="range" min="50" max="100" step="1" data-k="threshold" value="${esc(s.threshold)}"></label></div></div>
    <div class="card rise" style="--i:1"><h2>WhatsApp delivery</h2><p class="sub" style="margin-bottom:16px">Credentials are read from environment variables (.env), never stored in the database.</p>
      <div class="provider-grid">${Object.entries(PROVIDERS).map(([k, p]) => `<button class="ptile ${cur.provider === k ? 'on' : ''}" data-p="${k}"><b>${p.name}${needs[k] ? `<span class="pill ${credentials[k] ? 'good' : 'warn'}">${credentials[k] ? 'Configured' : 'Keys needed'}</span>` : ''}</b><span>${p.desc}</span></button>`).join('')}</div>
      <div class="row" style="margin-top:18px;flex-wrap:wrap"><input class="input" id="st-test" placeholder="Phone number to test, e.g. 98XXXXXXXX" style="max-width:300px"><button class="btn" id="st-send">${icon('send')}Send test message</button></div></div>
    <div class="card rise" style="--i:2"><h2>Message templates</h2><p class="sub" style="margin-bottom:14px">Click a placeholder to insert it.</p>
      <div class="chips" style="margin-bottom:14px">${['parent', 'student', 'class_name', 'date', 'percentage', 'school', 'threshold'].map(k => `<span class="ph-chip" data-ph="{${k}}">{${k}}</span>`).join('')}</div>
      <div class="grid g2"><div class="stack"><label class="field">Absence notice<textarea class="input" data-k="absent_template" rows="5">${esc(s.absent_template)}</textarea></label>
        <label class="field">Low attendance alert<textarea class="input" data-k="low_template" rows="4">${esc(s.low_template)}</textarea></label></div>
        <div><div class="eyebrow">Preview</div><div class="wa-preview" id="pv1"></div><div class="wa-preview" id="pv2" style="margin-top:12px"></div></div></div></div></div></div>`;
  let focused = null;
  const pv = () => { $('#pv1').textContent = fill(cur.absent_template); $('#pv2').textContent = fill(cur.low_template); }; pv();
  main.addEventListener('input', e => { const k = e.target.dataset.k; if (!k) return; cur[k] = e.target.value; if (k === 'threshold') $('#thv').textContent = e.target.value + '%'; if (k.endsWith('template') || k === 'school_name') { if (k === 'school_name') sample.school = e.target.value; pv(); } });
  main.addEventListener('focusin', e => { if (e.target.tagName === 'TEXTAREA') focused = e.target; });
  main.addEventListener('click', async e => {
    const p = e.target.closest('[data-p]'); if (p) { cur.provider = p.dataset.p; $$('.ptile').forEach(t => t.classList.toggle('on', t === p)); return; }
    const ph = e.target.closest('[data-ph]'); if (ph) { const t = focused || $('[data-k=absent_template]'); const a = t.selectionStart ?? t.value.length; t.setRangeText(ph.dataset.ph, a, t.selectionEnd ?? a, 'end'); t.dispatchEvent(new Event('input', { bubbles: true })); t.focus(); return; }
    if (e.target.closest('#st-send')) {
      try { await api('/settings', { method: 'PUT', json: { provider: cur.provider } }); const r = await api('/settings/test', { json: { phone: $('#st-test').value } });
        if (r.status === 'manual') window.open(r.link, '_blank', 'noopener');
        toast(r.status === 'failed' ? 'Failed: ' + r.error : r.status === 'simulated' ? 'Test logged (demo mode)' : r.status === 'manual' ? 'WhatsApp opened' : 'Test message sent', r.status === 'failed' ? 'err' : '');
      } catch (er) { toast(er.message, 'err'); }
    }
    if (e.target.closest('#st-save')) {
      try { await api('/settings', { method: 'PUT', json: cur }); await refreshBoot(); toast('Settings saved'); } catch (er) { toast(er.message, 'err'); }
    }
  });
};

boot().catch(err => { $('#main').innerHTML = `<div class="card empty">${icon('alert')}<p><b>Cannot reach the server</b></p><p class="small">${esc(err.message)}</p></div>`; });
//gg
//gg
