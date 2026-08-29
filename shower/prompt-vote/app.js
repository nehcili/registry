/* ============================================================
   Baby Shower — prompt/vote app.js
   Shared logic for index.html (submit + vote) and leaderboard.html (TV)
   ============================================================ */

const PAGE = document.body.dataset.page;   // 'submit' | 'leaderboard'
const PROMPTS = 'baby_shower_prompts';
const VOTERS  = 'baby_shower_voters';
const MAX_VOTES = 3;

let db = null;
let ipHash = null;
let prompts = [];   // [{ id, text, votes, mine }]

// ── SHA-256 + IP hash (copied from registry/baby/app.js) ──
async function sha256(str) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function initIP() {
  const cached = sessionStorage.getItem('shower_ip_hash');
  if (cached) { ipHash = cached; return; }
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 5000);
    const r = await fetch('https://api.ipify.org?format=json', { signal: c.signal });
    clearTimeout(t);
    const d = await r.json();
    ipHash = await sha256(d.ip);
  } catch (e) {
    ipHash = 'anon-' + crypto.randomUUID();
  }
  sessionStorage.setItem('shower_ip_hash', ipHash);
}

// ── Firebase ──
function initFirebase() {
  try {
    firebase.initializeApp(window.FIREBASE_CONFIG);
    db = firebase.firestore();
    db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
  } catch (e) {
    console.warn('Firebase init failed:', e.message);
  }
}

function subscribe() {
  if (!db) return;
  db.collection(PROMPTS).onSnapshot(snap => {
    prompts = [];
    snap.forEach(doc => {
      const d = doc.data();
      prompts.push({
        id: doc.id,
        text: d.text || '',
        votes: d.votes || 0,
        mine: !!(d.ips && d.ips[ipHash])
      });
    });
    prompts.sort((a, b) => b.votes - a.votes || a.text.localeCompare(b.text));
    render();
  }, err => console.warn('listener error:', err.message));
}

// ── Rendering ──
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function render() {
  if (PAGE === 'leaderboard') renderLeaderboard();
  else renderList();
}

function renderLeaderboard() {
  const el = document.getElementById('board');
  const top5 = prompts.slice(0, 5).map(p => p.id);
  el.innerHTML = prompts.map((p, i) => {
    const top = top5.includes(p.id);
    return `<div class="lb-row${top ? ' top' : ''}">
      <span class="lb-rank">${i + 1}</span>
      <span class="lb-text">${esc(p.text)}</span>
      <span class="lb-votes">${p.votes} ♥</span>
    </div>`;
  }).join('');
}

function renderList() {
  const el = document.getElementById('list');
  el.innerHTML = prompts.map(p => `
    <div class="pv-item">
      <div class="pv-text">${esc(p.text)}</div>
      <button class="vote-btn${p.mine ? ' voted' : ''}" data-id="${p.id}">${p.mine ? '♥' : '♡'} ${p.votes}</button>
    </div>`).join('');
}

// ── Actions ──
async function submitPrompt(text) {
  if (!db) { alert('Still connecting… try again in a moment.'); return; }
  try {
    await db.collection(PROMPTS).add({
      text,
      votes: 0,
      ips: {},
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    alert('Could not submit — check connection.');
  }
}

async function toggleVote(id) {
  if (!db || !ipHash) { alert('Still connecting… try again.'); return; }
  const pRef = db.collection(PROMPTS).doc(id);
  const vRef = db.collection(VOTERS).doc(ipHash);
  try {
    await db.runTransaction(async tx => {
      const pS = await tx.get(pRef);
      const vS = await tx.get(vRef);
      const p = pS.exists ? pS.data() : { text: '', votes: 0, ips: {}, createdAt: null };
      const v = vS.exists ? vS.data() : { count: 0 };
      const ips = { ...(p.ips || {}) };
      let count = v.count || 0;
      if (ips[ipHash]) {
        delete ips[ipHash];
        count = Math.max(0, count - 1);
      } else {
        if (count >= MAX_VOTES) throw new Error('limit');
        ips[ipHash] = true;
        count++;
      }
      tx.set(pRef, { text: p.text, votes: Object.keys(ips).length, ips, createdAt: p.createdAt });
      tx.set(vRef, { count });
    });
  } catch (e) {
    if (e.message === 'limit') alert('You can vote for up to 3 prompts.');
    else console.warn('vote failed:', e.message);
  }
}

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
  initFirebase();
  await initIP();
  subscribe();

  if (PAGE === 'submit') {
    const form = document.getElementById('prompt-form');
    form.addEventListener('submit', e => {
      e.preventDefault();
      const input = document.getElementById('prompt-input');
      const t = input.value.trim();
      if (t) { submitPrompt(t); input.value = ''; }
    });
    document.querySelectorAll('.pv-examples button[data-ex]').forEach(b => {
      b.addEventListener('click', () => {
        document.getElementById('prompt-input').value = b.dataset.ex;
      });
    });
    document.getElementById('list').addEventListener('click', e => {
      const b = e.target.closest('.vote-btn');
      if (b) toggleVote(b.dataset.id);
    });
  }
});
