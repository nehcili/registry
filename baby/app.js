/* ============================================================
   Baby Registry — app.js
   Shared logic for index.html (public) and internal.html (tracking)
   ============================================================ */

// ── Globals ───────────────────────────────────────────────
const PAGE = document.body.dataset.page;           // 'public' | 'internal'
const EXPECTED_PW_HASH = 'bd17904b96b6da039fb32eb84cfc46fef67a23205fd1d7f8d80fb60e2e3852bc';
let ipHash = null;
let counts = {};      // itemId (string) → number
let myIps = {};       // itemId → bool (has this visitor pledged?)
let db = null;
let unsub = null;

// ── DOM refs ──────────────────────────────────────────────
const mainEl = document.getElementById('main-content');
const sidebarEl = document.getElementById('sidebar-nav');
const gateEl = document.getElementById('gate-overlay');
const gateInput = document.getElementById('gate-password');
const gateBtn = document.getElementById('gate-btn');
const offlineBanner = document.getElementById('offline-banner');
const toastEl = document.getElementById('toast');
let activeSection = null;

// ── Toast ─────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3000);
}

// ── Password Gate ─────────────────────────────────────────
async function checkPassword() {
  const input = gateInput.value;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  if (hex === EXPECTED_PW_HASH) {
    sessionStorage.setItem('baby_internal_authed', '1');
    hideGate();
  } else {
    gateInput.classList.add('error');
    gateInput.value = '';
    setTimeout(() => gateInput.classList.remove('error'), 350);
  }
}

function hideGate() {
  if (gateEl) {
    gateEl.classList.add('hidden');
  }
}

function showGate() {
  if (gateEl) {
    gateEl.classList.remove('hidden');
    gateInput.focus();
  }
}

function initPasswordGate() {
  if (PAGE !== 'internal') return;
  if (sessionStorage.getItem('baby_internal_authed') === '1') {
    hideGate();
    return;
  }
  showGate();
  if (gateBtn) gateBtn.addEventListener('click', checkPassword);
  if (gateInput) gateInput.addEventListener('keydown', e => { if (e.key === 'Enter') checkPassword(); });
}

// ── IP Hashing ────────────────────────────────────────────
async function sha256(str) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function initIP() {
  const cached = sessionStorage.getItem('baby_ip_hash');
  if (cached) {
    ipHash = cached;
    return;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
    clearTimeout(timeout);
    const data = await resp.json();
    ipHash = await sha256(data.ip);
  } catch (e) {
    // ipify unreachable — fall back to random session ID
    ipHash = 'anon-' + crypto.randomUUID();
  }
  sessionStorage.setItem('baby_ip_hash', ipHash);
}

// ── Firestore ─────────────────────────────────────────────
function initFirebase() {
  try {
    firebase.initializeApp(window.FIREBASE_CONFIG);
    db = firebase.firestore();
    // Enable offline persistence
    db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
  } catch (e) {
    console.warn('Firebase init failed:', e.message);
    showOfflineBanner();
  }
}

function showOfflineBanner() {
  if (offlineBanner) offlineBanner.classList.add('show');
}

function hideOfflineBanner() {
  if (offlineBanner) offlineBanner.classList.remove('show');
}

function subscribeCounts() {
  if (!db) return;
  unsub = db.collection('pledges').onSnapshot(snap => {
    hideOfflineBanner();
    counts = {};
    myIps = {};
    snap.forEach(doc => {
      const data = doc.data();
      counts[doc.id] = data.count || 0;
      if (ipHash && data.ips && data.ips[ipHash]) {
        myIps[doc.id] = true;
      }
    });
    updateCounters();
    updatePledgeStates();
    enableAllButtons();
  }, err => {
    console.warn('Firestore listener error:', err.message);
    showOfflineBanner();
  });
}

// ── Data Filtering ────────────────────────────────────────
function getVisibleSections() {
  const sections = [];
  for (const section of window.REGISTRY_DATA.sections) {
    const visibleItems = section.items.filter(item => {
      if (PAGE === 'public') return item.is_in_registry && !item.is_done;
      return true; // internal: show all
    });
    if (visibleItems.length > 0) {
      sections.push({ ...section, items: visibleItems });
    }
  }
  return sections;
}

// ── Sidebar ────────────────────────────────────────────────
function renderSidebar() {
  if (!sidebarEl) return;
  const sections = getVisibleSections();
  let html = '<div class="sidebar-title">Sections</div><div class="sidebar-nav-list">';
  for (const section of sections) {
    const slug = section.slug || section.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    html += `<button class="sidebar-nav-item" data-target="sec-${slug}">`;
    html += `<span>${esc(section.name)}</span>`;
    html += `<span class="sidebar-nav-count" id="sc-nav-${slug}">⋯</span>`;
    html += `</button>`;
  }
  html += '</div>';
  sidebarEl.innerHTML = html;

  // Click handler: smooth scroll to section
  sidebarEl.addEventListener('click', e => {
    const item = e.target.closest('.sidebar-nav-item');
    if (!item) return;
    const targetId = item.dataset.target;
    const target = document.getElementById(targetId);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

function setupSidebarScrollSpy() {
  if (!sidebarEl) return;
  const sections = document.querySelectorAll('.section[id]');
  if (!sections.length) return;

  const observer = new IntersectionObserver(entries => {
    // Find the first section that's substantially visible
    let found = null;
    for (const entry of entries) {
      if (entry.isIntersecting) {
        found = entry.target.id;
      }
    }
    // If multiple are visible, use the one highest on screen
    if (!found) {
      for (const entry of entries) {
        if (entry.boundingClientRect.top < window.innerHeight / 2) {
          found = entry.target.id;
        }
      }
    }
    if (found) {
      setActiveSidebarItem(found);
    }
  }, { rootMargin: '-10% 0px -70% 0px', threshold: 0 });

  sections.forEach(s => observer.observe(s));
}

function setActiveSidebarItem(targetId) {
  if (activeSection === targetId) return;
  activeSection = targetId;
  sidebarEl.querySelectorAll('.sidebar-nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.target === targetId);
  });
}

function updateSidebarCounters() {
  if (!sidebarEl) return;
  const sections = getVisibleSections();
  for (const section of sections) {
    const slug = section.slug || section.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const el = document.getElementById('sc-nav-' + slug);
    if (!el) continue;
    let total = 0;
    for (const item of section.items) {
      total += counts[String(item.id)] || 0;
    }
    el.textContent = total || '';
  }
}

// ── Rendering ─────────────────────────────────────────────
function render() {
  const sections = getVisibleSections();
  let html = '';

  for (const section of sections) {
    const slug = section.slug || section.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    html += `<section class="section" id="sec-${slug}" data-section="${slug}">`;
    html += `<div class="section-head">`;
    html += `<h2>${esc(section.name)}</h2>`;
    html += `<span class="section-count" id="sc-${slug}">⋯</span>`;
    html += `</div>`;

    for (const item of section.items) {
      const isDone = item.is_done === true;
      const itemId = String(item.id);
      html += renderCard(item, isDone, itemId);
    }

    html += `</section>`;
  }

  mainEl.innerHTML = html;
}

function renderCard(item, isDone, itemId) {
  const hasLink1 = item.link1 && item.link1 !== 'null';
  const hasLink2 = item.link2 && item.link2 !== 'null';
  const doneClass = isDone ? ' done' : '';
  const isRegistry = item.is_in_registry;

  let html = `<article class="card${doneClass}" data-id="${itemId}">`;

  // Top row: title + badges
  html += `<div class="card-top">`;
  html += `<h3 class="card-title">${esc(item.name)}`;

  // Non-registry tag (internal only)
  if (PAGE === 'internal' && !isRegistry) {
    html += `<span class="not-registry-badge">not on registry</span>`;
  }
  html += `</h3>`;

  // Done badge (internal only)
  if (PAGE === 'internal' && isDone) {
    html += `<span class="done-badge">✓ done</span>`;
  }

  // Count badge
  html += `<span class="count-badge" id="cnt-${itemId}">⋯</span>`;
  html += `</div>`;

  // Description
  html += `<p class="card-desc">${esc(item.description)}</p>`;

  // Actions row
  html += `<div class="card-actions">`;

  // Links
  if (hasLink1) {
    html += `<a class="btn btn-link" href="${escAttr(item.link1)}">View</a>`;
  }
  if (hasLink2) {
    html += `<a class="btn btn-link-alt" href="${escAttr(item.link2)}">Alt</a>`;
  }

  // Pledge button (not for done items, on both pages)
  if (!isDone) {
    html += `<button class="btn btn-pledge" id="pledge-${itemId}" data-id="${itemId}" aria-pressed="false" disabled>⋯</button>`;
  }

  html += `</div>`;
  html += `</article>`;
  return html;
}

// ── Counters ──────────────────────────────────────────────
function updateCounters() {
  // Per-item counters
  document.querySelectorAll('.count-badge').forEach(el => {
    const id = el.id.replace('cnt-', '');
    const c = counts[id] || 0;
    el.textContent = c === 1 ? '💝 1 helping' : `💝 ${c} helping`;
  });

  // Section counters
  const sections = getVisibleSections();
  for (const section of sections) {
    const slug = section.slug || section.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const el = document.getElementById('sc-' + slug);
    if (!el) continue;
    let total = 0;
    for (const item of section.items) {
      total += counts[String(item.id)] || 0;
    }
    el.textContent = total === 1 ? '1 helping' : `${total} helping`;
  }

  // Sidebar counters
  updateSidebarCounters();
}

// ── Pledge Button States ──────────────────────────────────
function updatePledgeStates() {
  document.querySelectorAll('.btn-pledge').forEach(btn => {
    const itemId = btn.dataset.id;
    if (myIps[itemId]) {
      btn.setAttribute('aria-pressed', 'true');
      btn.textContent = '♡ Helping!';
    } else {
      btn.setAttribute('aria-pressed', 'false');
      btn.textContent = '♡ I\'ll help';
    }
  });
}

function enableAllButtons() {
  document.querySelectorAll('.btn-pledge').forEach(btn => {
    btn.disabled = false;
    btn.textContent = btn.getAttribute('aria-pressed') === 'true' ? '♡ Helping!' : '♡ I\'ll help';
  });
}

// ── Pledge Toggle ─────────────────────────────────────────
async function togglePledge(itemId, btn) {
  if (!db) { showToast('Not connected — try refreshing the page.'); return; }
  if (!ipHash) { showToast('Still connecting… please wait a moment.'); return; }
  if (btn.dataset.busy === '1') return;

  btn.dataset.busy = '1';
  btn.disabled = true;

  const docRef = db.collection('pledges').doc(itemId);

  try {
    await db.runTransaction(async tx => {
      const snap = await tx.get(docRef);
      const cur = snap.exists ? snap.data() : { count: 0, ips: {} };
      const ips = { ...cur.ips };

      if (ips[ipHash]) {
        delete ips[ipHash];
      } else {
        ips[ipHash] = true;
      }

      tx.set(docRef, { count: Object.keys(ips).length, ips });
    });
    // UI updates via onSnapshot — no manual update needed
  } catch (err) {
    console.error('Pledge transaction failed:', err);
    showToast('Couldn\'t update — check your connection and try again.');
  } finally {
    btn.disabled = false;
    delete btn.dataset.busy;
  }
}

// ── Event Delegation ──────────────────────────────────────
function setupEvents() {
  mainEl.addEventListener('click', e => {
    const btn = e.target.closest('.btn-pledge');
    if (!btn) return;
    const itemId = btn.dataset.id;
    togglePledge(itemId, btn);
  });
}

// ── Utilities ─────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escAttr(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Init ──────────────────────────────────────────────────
async function init() {
  // 1. Password gate first (internal page)
  initPasswordGate();

  // 2. Render sidebar + cards immediately from data.js (no network needed)
  renderSidebar();
  render();
  setupSidebarScrollSpy();
  setupEvents();

  // 3. Firebase + IP in parallel
  initFirebase();
  await initIP();

  // 4. Subscribe to real-time counts
  subscribeCounts();
}

// ── Start ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
