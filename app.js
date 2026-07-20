import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, onValue, set, push } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAKVctCVWs6-BIb0E9UTHZhwGM59wwKR8Q",
  authDomain: "skoolai-4c635.firebaseapp.com",
  databaseURL: "https://skoolai-4c635-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "skoolai-4c635",
  storageBucket: "skoolai-4c635.firebasestorage.app",
  messagingSenderId: "147969717105",
  appId: "1:147969717105:web:fa6b35de1d5085613afcd0"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// The real enforcement lives in the Firebase Database rules (server-side).
// This client-side list just lets the app show a clear "not authorised" message
// instead of a confusing silent permission error.
const ALLOWED_EMAILS = [
  'chris.brasch@gmail.com',
  'maria.brasch09@gmail.com',
  'carlislerubio07@gmail.com',
  'oliverbrasch@gmail.com',
];

/* ===== Sign-in gate ===== */
const authGate = document.getElementById('authGate');
const authMessage = document.getElementById('authMessage');
const googleSignInBtn = document.getElementById('googleSignInBtn');

function showAuthGate(state, email){
  authGate.classList.add('open');
  document.body.classList.add('auth-locked');
  if(state === 'not-allowed'){
    authMessage.textContent = `${email} isn't on the family list for this board. Signed out — try a different Google account, or check with Chris or Maria.`;
    authMessage.classList.add('error');
  }else{
    authMessage.textContent = 'Sign in with a family Google account to view the homework board.';
    authMessage.classList.remove('error');
  }
}

function hideAuthGate(){
  authGate.classList.remove('open');
  document.body.classList.remove('auth-locked');
}

onAuthStateChanged(auth, (user) => {
  if(user && ALLOWED_EMAILS.includes(user.email)){
    hideAuthGate();
    startDataListeners();
  }else if(user){
    showAuthGate('not-allowed', user.email);
    signOut(auth);
  }else{
    showAuthGate('signed-out');
    // Signing out cancels the active listeners (same permission re-check as on
    // first load). Reset everything so a sign-back-in in the same tab starts
    // fresh listeners and shows "Loading…" rather than getting stuck.
    if(listenersStarted){
      listenersStarted = false;
      statusReady = false;
      hiddenReady = false;
      flagsReady = false;
      dateOverridesReady = false;
      subjectVisibilityReady = false;
      itemsReady = false;
    }
  }
});

googleSignInBtn.addEventListener('click', () => {
  googleSignInBtn.disabled = true;
  const provider = new GoogleAuthProvider();
  signInWithPopup(auth, provider).catch((err) => {
    console.error(err);
    if(err.code !== 'auth/popup-closed-by-user'){
      authMessage.textContent = "Couldn't sign in — please try again.";
      authMessage.classList.add('error');
    }
  }).finally(() => {
    googleSignInBtn.disabled = false;
  });
});

const statusRef = ref(db, 'homeworkBoard/status');
const hiddenRef = ref(db, 'homeworkBoard/hidden');
const dataRef = ref(db, 'homeworkBoard/customData');
const flagsRef = ref(db, 'homeworkBoard/flags');
const dateOverridesRef = ref(db, 'homeworkBoard/dateOverrides');
const subjectVisibilityRef = ref(db, 'homeworkBoard/subjectVisibility');
const feedbackRef = ref(db, 'homeworkBoard/feedback');

// Replaced with a SHA-256 hash of the parent PIN at deploy time by the GitHub Actions workflow.
// Never edit this by hand — set the real PIN via the RESET_PIN repository secret instead.
const RESET_PIN_HASH = "__PIN_HASH__";

async function checkPin(candidate){
  const enc = new TextEncoder().encode(candidate);
  const hashBuf = await crypto.subtle.digest('SHA-256', enc);
  const hex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('');
  return hex === RESET_PIN_HASH;
}

/* ===== Assessment data =====
   Loads the bundled data.json by default. If a parent has uploaded a new
   calendar (stored in Firebase under homeworkBoard/customData), that takes
   priority for everyone automatically. */
let ITEMS = [];
let bundledItems = [];
let itemsReady = false;

const VALID_TYPES = ['DR','FI','EX','EV'];
const VALID_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateItems(arr){
  if(!Array.isArray(arr) || arr.length === 0) return 'File must contain a non-empty array of assessment items.';
  for(let i = 0; i < arr.length; i++){
    const it = arr[i];
    if(!it || typeof it !== 'object') return `Item ${i+1} isn't a valid object.`;
    if(typeof it.date !== 'string' || !DATE_RE.test(it.date)) return `Item ${i+1} has an invalid date ("${it.date}"). Expected YYYY-MM-DD.`;
    if(typeof it.day !== 'string' || !VALID_DAYS.includes(it.day)) return `Item ${i+1} has an invalid day ("${it.day}"). Expected Mon, Tue, Wed, Thu, Fri, Sat, or Sun.`;
    if(typeof it.kid !== 'string' || it.kid.trim() === '') return `Item ${i+1} is missing a kid value.`;
    if(typeof it.subject !== 'string' || it.subject.trim() === '') return `Item ${i+1} is missing a subject.`;
    if(!VALID_TYPES.includes(it.type)) return `Item ${i+1} has an invalid type ("${it.type}"). Expected DR, FI, EX, or EV.`;
  }
  return null;
}

async function loadBundledData(){
  try{
    const res = await fetch('./data.json');
    bundledItems = await res.json();
  }catch(e){
    console.error('Could not load bundled data.json', e);
    bundledItems = [];
  }
}

function applyData(customVal){
  ITEMS = (Array.isArray(customVal) && customVal.length > 0) ? customVal : bundledItems;
  itemsReady = true;
  render();
  renderSubjectsPage();
}




const TYPE_LABEL = { DR:'Draft due', FI:'Final due', EX:'Exam', EV:'Note' };
const STATUSES = ['todo','inprogress','done'];
const COLUMNS = [
  {key:'todo', name:'To Do'},
  {key:'inprogress', name:'In Progress'},
  {key:'done', name:'Done'},
];

let status = {};   // sanitised-id -> 'inprogress'|'done'  (absent = todo)
let hidden = {};   // sanitised-id -> true
let flags = {};    // sanitised-id -> { note: string }
let dateOverrides = {}; // sanitised-id -> "YYYY-MM-DD" — a corrected due date, keyed off the item's ORIGINAL date so it never loses its status/flag/hidden history when edited
let subjectVisibility = {}; // "Y7|Subject Name" -> false when hidden. Absent (or true) means visible.
let feedback = {}; // pushId -> { from, category, message, timestamp }
let currentKidFilter = 'ALL';
let searchTerm = '';
let statusReady = false;
let hiddenReady = false;
let flagsReady = false;
let dateOverridesReady = false;
let subjectVisibilityReady = false;
let hiddenPanelOpen = false;

function itemId(it){ return it.date + '|' + it.kid + '|' + it.subject; }
// Firebase RTDB keys can't contain . # $ [ ] /
function dbKey(id){ return id.replace(/[.#$\[\]\/]/g, '_'); }
function getStatus(it){ return status[dbKey(itemId(it))] || 'todo'; }
function isHidden(it){ return !!hidden[dbKey(itemId(it))]; }
function getFlag(it){ return flags[dbKey(itemId(it))] || null; }
function effectiveDate(it){ return dateOverrides[dbKey(itemId(it))] || it.date; }

// Prefer an explicit subjectGroup field (data.json can supply this). Falls back to a
// best-guess from the task text for older datasets or uploads that don't include it,
// so subject toggling still works reasonably even without the field.
function subjectGroupOf(it){
  if(it.subjectGroup) return it.subjectGroup;
  const dashIdx = it.subject.indexOf(' - ');
  if(dashIdx > -1) return it.subject.slice(0, dashIdx).trim();
  return it.subject.replace(/\s+(FIA?\d+|FA\d+|IA\d+|Task \d+|\(FINAL\)).*$/i, '').trim() || it.subject;
}
function subjectVisKey(kid, group){ return dbKey(kid + '|' + group); }
function isSubjectVisible(it){
  if(it.type === 'EV') return true; // school-wide notes aren't subject-specific
  const key = subjectVisKey(it.kid, subjectGroupOf(it));
  return subjectVisibility[key] !== false; // absent or true = visible; only explicit false hides it
}
function escapeAttr(str){
  return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function showConnError(){ document.getElementById('connError').style.display = 'block'; }
function hideConnError(){ document.getElementById('connError').style.display = 'none'; }

// Every onValue below requires a valid, allowed sign-in per the database rules.
// Starting these before auth is confirmed causes a permission-denied error that
// permanently cancels the listener — Firebase does NOT auto-retry it later, even
// once sign-in succeeds. So this is only ever called from inside onAuthStateChanged.
let listenersStarted = false;
function startDataListeners(){
  if(listenersStarted) return;
  listenersStarted = true;

  loadBundledData().then(() => {
    onValue(dataRef, (snapshot) => {
      applyData(snapshot.val());
    }, () => { ITEMS = bundledItems; itemsReady = true; render(); });
  });

  onValue(statusRef, (snapshot) => {
    status = snapshot.val() || {};
    statusReady = true;
    hideConnError();
    render();
  }, () => showConnError());

  onValue(hiddenRef, (snapshot) => {
    hidden = snapshot.val() || {};
    hiddenReady = true;
    render();
  }, () => showConnError());

  onValue(flagsRef, (snapshot) => {
    flags = snapshot.val() || {};
    flagsReady = true;
    render();
  }, () => showConnError());

  onValue(dateOverridesRef, (snapshot) => {
    dateOverrides = snapshot.val() || {};
    dateOverridesReady = true;
    render();
  }, () => showConnError());

  onValue(subjectVisibilityRef, (snapshot) => {
    subjectVisibility = snapshot.val() || {};
    subjectVisibilityReady = true;
    render();
    renderSubjectsPage();
  }, () => showConnError());

  onValue(feedbackRef, (snapshot) => {
    feedback = snapshot.val() || {};
    renderFeedbackPage();
  }, () => showConnError());
}

let recentCompletionAt = 0;

function setStatus(id, val){
  const key = dbKey(id);
  const wasDone = status[key] === 'done';
  if(val === 'todo') delete status[key];
  else status[key] = val;
  set(statusRef, status).catch(showConnError);
  if(val === 'done' && !wasDone){ recentCompletionAt = Date.now(); }
  render();
}

/* ===== Gremlin mascot =====
   Hover-only, rate-limited to one quip per 10 minutes so it never
   turns into a distraction. 30 lines across 6 moods. */
const BOT_POOLS = {
  CALM: [
    "Nothing due today. Wild. Enjoy it, it won't last.",
    "I've checked twice. You're free. Go outside or something.",
    "Suspiciously quiet in here. Almost worrying.",
    "Nothing on fire right now. I know, I don't trust it either.",
    "Calm before the storm. Or just calm. Take the win.",
  ],
  SOON: [
    "Something's due in a few days. Just putting it out there. No pressure. Actually, some pressure.",
    "You've got time. Not heaps of time. Some time.",
    "Reminder from your least reliable friend: something's due soon.",
    "Future you has a deadline. Current you could maybe help out.",
    "Not urgent. Yet. I'll be back when it is.",
  ],
  TOMORROW: [
    "Right, this is the bit where I pretend to be responsible. Something's due tomorrow.",
    "I'd panic if I were you. I am panicking, actually, on your behalf.",
    "Tomorrow. As in the day after today. That soon.",
    "Tonight's the night. Or at least, it should be.",
    "Due tomorrow. I looked it up twice hoping I was wrong.",
  ],
  OVERDUE: [
    "So that thing was due yesterday. We don't need to talk about it. But we probably should.",
    "Look, I'm not your parent. I'm a gremlin. But even I'm concerned.",
    "Overdue. It happens. Less ideal when it happens a lot though.",
    "I've been avoiding this card too, if it helps.",
    "This one's living in the past. Might want to fix that.",
  ],
  COMPLETED: [
    "You actually did the thing. Legend behaviour.",
    "Three days in a row. I'm almost impressed. Almost.",
    "Look at you, being organised. Who even are you.",
    "Done. Filed. Never speak of it again.",
    "I'll allow myself one moment of pride. There. Moment over.",
  ],
  LATENIGHT: [
    "It's late. I respect the hustle, I fear the burnout.",
    "Studying this late? Bold. Slightly concerning. Bold though.",
    "It's past bedtime for both of us, honestly.",
    "Burning the midnight oil. I'm burning three energy drinks.",
    "Impressive dedication. Questionable life choices. Carry on.",
  ],
};

function randomFrom(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

function botCategory(){
  if(Date.now() - recentCompletionAt < 5 * 60 * 1000) return 'COMPLETED';

  const hour = new Date().getHours();
  if((hour >= 22 || hour < 5) && Math.random() < 0.4) return 'LATENIGHT';

  const active = ITEMS.filter(it => it.type !== 'EV' && !isHidden(it) && isSubjectVisible(it) && getStatus(it) !== 'done');
  if(active.length === 0) return 'CALM';
  const dus = active.map(it => daysUntil(effectiveDate(it)));
  const minDu = Math.min(...dus);
  if(minDu < 0) return 'OVERDUE';
  if(minDu <= 1) return 'TOMORROW';
  if(minDu <= 6) return 'SOON';
  return 'CALM';
}

const BOT_COOLDOWN_MS = 10 * 60 * 1000; // one quip per 10 minutes, max
let lastQuipAt = 0;

function revealBot(){
  if(Date.now() - lastQuipAt < BOT_COOLDOWN_MS) return; // still on cooldown, stay quiet
  lastQuipAt = Date.now();
  const pool = BOT_POOLS[botCategory()] || BOT_POOLS.CALM;
  const bubble = document.getElementById('botBubble');
  const btn = document.getElementById('botBtn');
  bubble.textContent = randomFrom(pool);
  bubble.classList.add('visible');
  btn.classList.remove('bounce');
  void btn.offsetWidth;
  btn.classList.add('bounce');
}

function hideBot(){
  clearTimeout(botHideDelay);
  botHideDelay = setTimeout(() => {
    document.getElementById('botBubble').classList.remove('visible');
  }, 250);
}
let botHideDelay = null;

const botWrap = document.querySelector('.bot-wrap');
botWrap.addEventListener('mouseenter', () => { clearTimeout(botHideDelay); revealBot(); });
botWrap.addEventListener('mouseleave', hideBot);
// Touch fallback — devices without hover get a tap-to-peek, auto-hiding after a few seconds.
document.getElementById('botBtn').addEventListener('click', () => {
  revealBot();
  setTimeout(hideBot, 5000);
});


function setHidden(id, val){
  const key = dbKey(id);
  if(val) hidden[key] = true; else delete hidden[key];
  set(hiddenRef, hidden).catch(showConnError);
  render();
}

function toggleFlag(id){
  const key = dbKey(id);
  if(flags[key]) delete flags[key];
  else flags[key] = { note: '' };
  set(flagsRef, flags).catch(showConnError);
  render();
}

function setDateOverride(id, originalDate, newDate){
  const key = dbKey(id);
  if(newDate === originalDate) delete dateOverrides[key]; // back to original — clean up rather than store a no-op
  else dateOverrides[key] = newDate;
  set(dateOverridesRef, dateOverrides).catch(showConnError);
  render();
}

function saveFlagNote(id, note){
  const key = dbKey(id);
  if(!flags[key]) return; // was unflagged mid-edit, nothing to save
  flags[key] = { note: note.slice(0, 200) };
  set(flagsRef, flags).catch(showConnError);
}

function daysUntil(dateStr){
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(dateStr + 'T00:00:00');
  return Math.round((d - today) / 86400000);
}
function fmtDate(dateStr){
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-AU', {day:'2-digit', month:'short'});
}
function dateBadge(dateStr){
  const du = daysUntil(dateStr);
  const d = fmtDate(dateStr);
  if(du < 0) return {label:`Overdue · ${d}`, cls:'overdue'};
  if(du === 0) return {label:`Due today · ${d}`, cls:'today'};
  if(du === 1) return {label:`Tomorrow · ${d}`, cls:'soon'};
  if(du <= 7) return {label:`In ${du} days · ${d}`, cls:'soon'};
  return {label: d, cls:''};
}

function renderNotesRibbon(){
  const ribbon = document.getElementById('notesRibbon');
  const upcoming = ITEMS
    .filter(it => it.type === 'EV')
    .filter(it => currentKidFilter === 'ALL' || it.kid === currentKidFilter || it.kid === 'BOTH')
    .filter(it => !isHidden(it))
    .filter(it => daysUntil(it.date) >= -1)
    .sort((a,b) => a.date.localeCompare(b.date))
    .slice(0, 6);
  if(upcoming.length === 0){ ribbon.innerHTML = ''; ribbon.style.display = 'none'; return; }
  ribbon.style.display = 'flex';
  ribbon.innerHTML = '<span class="ribbon-label">Upcoming</span>' + upcoming.map(it => `
    <span class="note-chip"><span class="kdot"></span>${it.subject} <span class="ndate num">${fmtDate(it.date)}</span></span>
  `).join('');
}

function renderHiddenPanel(){
  const btn = document.getElementById('hiddenBtnLabel');
  const list = document.getElementById('hiddenList');
  const panel = document.getElementById('hiddenPanel');

  const hiddenItems = ITEMS
    .filter(it => it.type !== 'EV')
    .filter(it => currentKidFilter === 'ALL' || it.kid === currentKidFilter)
    .filter(it => isHidden(it))
    .sort((a,b) => effectiveDate(a).localeCompare(effectiveDate(b)));
  btn.textContent = `Removed (${hiddenItems.length})`;
  panel.classList.toggle('open', hiddenPanelOpen);

  if(hiddenItems.length === 0){
    list.innerHTML = '<div class="hidden-empty">Nothing removed — every card for this filter is on the board.</div>';
    return;
  }
  list.innerHTML = hiddenItems.map(it => `
    <span class="hidden-chip">
      ${it.subject} <span style="color:var(--text-faint)">(${it.kid})</span>
      <button class="restore-btn" data-id="${itemId(it)}" title="Restore">+</button>
    </span>
  `).join('');
  list.querySelectorAll('.restore-btn').forEach(b => {
    b.addEventListener('click', () => setHidden(b.dataset.id, false));
  });
}

function cardHtml(it){
  const id = itemId(it);
  const st = getStatus(it);
  const idx = STATUSES.indexOf(st);
  const effDate = effectiveDate(it);
  const isEdited = effDate !== it.date;
  const badge = dateBadge(effDate);
  const flag = getFlag(it);
  const isFlagged = !!flag;
  return `<div class="card type-${it.type} ${isFlagged ? 'flagged' : ''}" draggable="true" data-id="${id}">
    <button class="remove-btn" data-id="${id}" data-tip="Doesn't apply to me — remove">
      <span class="material-symbols-outlined">close</span>
    </button>
    <div class="subj">${it.subject}</div>
    <div class="chip-row">
      <span class="chip kid-${it.kid}">${it.kid}</span>
      <span class="chip type-${it.type}-chip">${TYPE_LABEL[it.type]}</span>
    </div>
    ${isFlagged ? `<div class="flag-note-wrap">
      <input type="text" class="flag-note" data-id="${id}" maxlength="200" placeholder="Add a note for them (optional)" value="${escapeAttr(flag.note || '')}">
    </div>` : ''}
    <div class="badge-row">
      <button class="date-badge ${badge.cls}" data-id="${id}" data-tip="${isEdited ? 'Date corrected — tap to change' : 'Tap to correct this date'}">
        ${badge.label}${isEdited ? '<span class="material-symbols-outlined edited-icon">edit</span>' : ''}
      </button>
      <div class="card-actions">
        <button class="flag-btn ${isFlagged ? 'active' : ''}" data-id="${id}" data-tip="${isFlagged ? 'Unflag' : 'Flag for follow-up'}">
          <span class="material-symbols-outlined">flag</span>
        </button>
        <div class="move-btns">
          ${idx > 0 ? `<button class="move-btn" data-act="back" data-id="${id}" data-tip="Move back (are you sure?)">
            <span class="material-symbols-outlined">chevron_backward</span>
          </button>` : ''}
          <button class="move-btn" ${idx===2?'disabled':''} data-act="fwd" data-id="${id}" data-tip="Move forward">
            <span class="material-symbols-outlined">chevron_forward</span>
          </button>
        </div>
      </div>
    </div>
  </div>`;
}

function render(){
  renderNotesRibbon();
  renderHiddenPanel();
  const board = document.getElementById('board');
  if(!statusReady || !hiddenReady || !itemsReady || !flagsReady || !dateOverridesReady || !subjectVisibilityReady){ board.innerHTML = '<div class="loading">Loading the board…</div>'; return; }

  const filtered = ITEMS
    .filter(it => it.type !== 'EV')
    .filter(it => currentKidFilter === 'ALL' || it.kid === currentKidFilter)
    .filter(it => !isHidden(it))
    .filter(it => isSubjectVisible(it))
    .filter(it => !searchTerm || it.subject.toLowerCase().includes(searchTerm));

  const buckets = {todo:[], inprogress:[], done:[]};
  filtered.forEach(it => buckets[getStatus(it)].push(it));
  const TYPE_URGENCY = { EX: 0, FI: 1, DR: 2 };
  Object.keys(buckets).forEach(k => buckets[k].sort((a,b) => {
    const ad = effectiveDate(a), bd = effectiveDate(b);
    if(ad !== bd) return ad.localeCompare(bd);
    return TYPE_URGENCY[a.type] - TYPE_URGENCY[b.type];
  }));

  board.innerHTML = COLUMNS.map(col => {
    const items = buckets[col.key];
    const body = items.length
      ? items.map(cardHtml).join('')
      : `<div class="col-empty">${col.key === 'done' ? 'Nothing finished yet' : 'Nothing here'}</div>`;
    return `<div class="column" data-col="${col.key}">
      <div class="col-head">
        <span class="name">${col.name}</span>
        <span class="count num">${items.length}</span>
      </div>
      <div class="col-body" data-col="${col.key}">${body}</div>
    </div>`;
  }).join('');

  attachHandlers();
}

function attachHandlers(){
  document.querySelectorAll('.move-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const it = ITEMS.find(x => itemId(x) === id);
      const idx = STATUSES.indexOf(getStatus(it));
      if(btn.dataset.act === 'back' && idx > 0) setStatus(id, STATUSES[idx-1]);
      if(btn.dataset.act === 'fwd' && idx < 2) setStatus(id, STATUSES[idx+1]);
    });
  });
  document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setHidden(btn.dataset.id, true);
    });
  });
  document.querySelectorAll('.flag-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFlag(btn.dataset.id);
    });
  });
  document.querySelectorAll('.date-badge').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const it = ITEMS.find(x => itemId(x) === id);
      if(!it) return;

      const pin = prompt('Parent PIN required to change this due date:');
      if(pin === null || pin.trim() === '') return;
      const ok = await checkPin(pin.trim());
      if(!ok){ alert("Nope. That's not it."); return; }

      const current = effectiveDate(it);
      const input = prompt(`New date for "${it.subject}" (format: YYYY-MM-DD)`, current);
      if(input === null) return;
      const trimmed = input.trim();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)){
        alert('Please enter the date as YYYY-MM-DD, for example 2026-08-21.');
        return;
      }
      const d = new Date(trimmed + 'T00:00:00');
      if(isNaN(d.getTime())){
        alert("That doesn't look like a real date.");
        return;
      }
      setDateOverride(id, it.date, trimmed);
    });
  });
  document.querySelectorAll('.flag-note').forEach(input => {
    const save = () => saveFlagNote(input.dataset.id, input.value);
    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
      if(e.key === 'Enter'){ save(); input.blur(); }
    });
    input.addEventListener('click', (e) => e.stopPropagation());
  });
  document.querySelectorAll('.card[draggable="true"]').forEach(card => {
    card.addEventListener('dragstart', e => {
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', card.dataset.id);
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });
  document.querySelectorAll('.col-body').forEach(colBody => {
    colBody.addEventListener('dragover', e => {
      e.preventDefault();
      colBody.closest('.column').classList.add('drag-over');
    });
    colBody.addEventListener('dragleave', () => {
      colBody.closest('.column').classList.remove('drag-over');
    });
    colBody.addEventListener('drop', e => {
      e.preventDefault();
      colBody.closest('.column').classList.remove('drag-over');
      const id = e.dataTransfer.getData('text/plain');
      setStatus(id, colBody.dataset.col);
    });
  });
}

document.getElementById('refreshBtn').addEventListener('click', () => {
  location.reload();
});

document.getElementById('kidFilter').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if(!btn) return;
  currentKidFilter = btn.dataset.kid;
  document.querySelectorAll('#kidFilter .btn').forEach(b => b.classList.toggle('active', b === btn));
  document.getElementById('kidFilter').classList.remove('open');
  document.getElementById('filterToggleBtn').classList.remove('active');
  render();
});

document.getElementById('searchInput').addEventListener('input', (e) => {
  searchTerm = e.target.value.trim().toLowerCase();
  render();
});

const filterToggleBtn = document.getElementById('filterToggleBtn');
const kidFilterEl = document.getElementById('kidFilter');

filterToggleBtn.addEventListener('click', () => {
  const isOpen = kidFilterEl.classList.toggle('open');
  filterToggleBtn.classList.toggle('active', isOpen);
});

const menuBtn = document.getElementById('menuBtn');
const menuDropdown = document.getElementById('menuDropdown');

function closeMenu(){
  menuBtn.classList.remove('open');
  menuDropdown.classList.remove('open');
}

menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = menuDropdown.classList.toggle('open');
  menuBtn.classList.toggle('open', isOpen);
});

document.addEventListener('click', (e) => {
  if(!e.target.closest('.menu-wrap')) closeMenu();
});

document.getElementById('hiddenBtn').addEventListener('click', () => {
  hiddenPanelOpen = !hiddenPanelOpen;
  closeMenu();
  render();
});

document.getElementById('resetBtn').addEventListener('click', async () => {
  closeMenu();
  const pin = prompt('Parent PIN required to reset the board:');
  if(pin === null || pin.trim() === '') return;
  const ok = await checkPin(pin.trim());
  if(!ok){ alert("Nope. That's not it."); return; }
  if(confirm('Move every card back to To Do for the whole family? This cannot be undone.')){
    status = {};
    set(statusRef, status);
    render();
  }
});

const uploadInput = document.getElementById('uploadInput');

document.getElementById('uploadBtn').addEventListener('click', () => {
  closeMenu();
  uploadInput.click();
});

uploadInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if(!file) return;

  const pin = prompt('Parent PIN required to upload a new calendar:');
  if(pin === null || pin.trim() === '') return;
  const ok = await checkPin(pin.trim());
  if(!ok){ alert("Nope. That's not it."); return; }

  let parsed;
  try{
    parsed = JSON.parse(await file.text());
  }catch(err){
    alert('Could not read that file — make sure it is valid JSON.');
    return;
  }

  const validationError = validateItems(parsed);
  if(validationError){
    alert('Could not use that file:\n\n' + validationError);
    return;
  }

  if(!confirm(`This file has ${parsed.length} items and will replace the calendar for everyone, on every device. Continue?`)) return;

  try{
    await set(dataRef, parsed);
    alert("New calendar uploaded — everyone's board will update automatically.");
  }catch(err){
    console.error(err);
    alert('Upload failed — check your connection and try again.');
  }
});

document.getElementById('restoreBtn').addEventListener('click', async () => {
  closeMenu();
  const pin = prompt('Parent PIN required to restore the original calendar:');
  if(pin === null || pin.trim() === '') return;
  const ok = await checkPin(pin.trim());
  if(!ok){ alert("Nope. That's not it."); return; }
  if(confirm('Revert to the bundled calendar and discard any uploaded one?')){
    set(dataRef, null).catch(showConnError);
  }
});

/* ===== Info modal ===== */
const infoBackdrop = document.getElementById('infoBackdrop');
document.getElementById('infoBtn').addEventListener('click', () => infoBackdrop.classList.add('open'));
document.getElementById('infoCloseBtn').addEventListener('click', () => infoBackdrop.classList.remove('open'));
infoBackdrop.addEventListener('click', (e) => {
  if(e.target === infoBackdrop) infoBackdrop.classList.remove('open');
});

/* ===== Subjects page ===== */
const subjectsPage = document.getElementById('subjectsPage');

function getAllSubjectGroups(){
  const map = { Y7: new Set(), Y11: new Set() };
  ITEMS.forEach(it => {
    if(it.type === 'EV') return;
    if(!map[it.kid]) map[it.kid] = new Set();
    map[it.kid].add(subjectGroupOf(it));
  });
  return map;
}

function renderSubjectsPage(){
  if(!itemsReady) return;
  const container = document.getElementById('subjectsList');
  const groups = getAllSubjectGroups();
  const kidLabels = { Y7: 'Year 7', Y11: 'Year 11' };
  const kids = Object.keys(groups).filter(k => groups[k].size > 0);

  if(kids.length === 0){
    container.innerHTML = '<p style="color:var(--text-faint);font-size:13px;">No subjects found in the current calendar yet.</p>';
    return;
  }

  container.innerHTML = kids.map(kid => {
    const subs = Array.from(groups[kid]).sort();
    return `<div class="subj-kid-group">
      <h3 class="subj-kid-title">${kidLabels[kid] || kid}</h3>
      ${subs.map(g => {
        const key = subjectVisKey(kid, g);
        const isOn = subjectVisibility[key] !== false;
        return `<label class="subj-toggle-row">
          <span>${g}</span>
          <span class="switch ${isOn ? 'on' : ''}" data-key="${key}"></span>
        </label>`;
      }).join('')}
    </div>`;
  }).join('');
}

document.getElementById('subjectsList').addEventListener('click', (e) => {
  const sw = e.target.closest('.switch');
  if(!sw) return;
  const key = sw.dataset.key;
  const isCurrentlyOn = subjectVisibility[key] !== false;
  if(isCurrentlyOn) subjectVisibility[key] = false;
  else delete subjectVisibility[key];
  set(subjectVisibilityRef, subjectVisibility).catch(showConnError);
  renderSubjectsPage();
  render();
});

document.getElementById('subjectsPageBtn').addEventListener('click', () => {
  closeMenu();
  renderSubjectsPage();
  subjectsPage.classList.add('open');
});
document.getElementById('subjectsBackBtn').addEventListener('click', () => {
  subjectsPage.classList.remove('open');
});

/* ===== Feedback: submission ===== */
const feedbackBackdrop = document.getElementById('feedbackBackdrop');
const feedbackForm = document.getElementById('feedbackForm');
const fbStatus = document.getElementById('fbStatus');
let fbFrom = 'Year 7';
let fbCategory = 'Idea';

function openFeedbackModal(){
  fbStatus.textContent = '';
  fbStatus.className = 'fb-status';
  feedbackBackdrop.classList.add('open');
}
function closeFeedbackModal(){ feedbackBackdrop.classList.remove('open'); }

document.getElementById('feedbackFab').addEventListener('click', openFeedbackModal);
document.getElementById('feedbackCloseBtn').addEventListener('click', closeFeedbackModal);
feedbackBackdrop.addEventListener('click', (e) => {
  if(e.target === feedbackBackdrop) closeFeedbackModal();
});

document.getElementById('fbFromRow').addEventListener('click', (e) => {
  const btn = e.target.closest('.fb-choice');
  if(!btn) return;
  fbFrom = btn.dataset.val;
  document.querySelectorAll('#fbFromRow .fb-choice').forEach(b => b.classList.toggle('active', b === btn));
});
document.getElementById('fbCategoryRow').addEventListener('click', (e) => {
  const btn = e.target.closest('.fb-choice');
  if(!btn) return;
  fbCategory = btn.dataset.val;
  document.querySelectorAll('#fbCategoryRow .fb-choice').forEach(b => b.classList.toggle('active', b === btn));
});

const FEEDBACK_THROTTLE_MS = 30 * 1000; // basic spam guard — not bulletproof, see README

feedbackForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const messageInput = document.getElementById('fbMessage');
  const message = messageInput.value.trim();
  if(!message) return;

  const lastSent = Number(localStorage.getItem('skoolai_lastFeedback') || 0);
  const waitLeft = FEEDBACK_THROTTLE_MS - (Date.now() - lastSent);
  if(waitLeft > 0){
    fbStatus.textContent = `Hang on a moment — you can send another in ${Math.ceil(waitLeft / 1000)}s.`;
    fbStatus.className = 'fb-status error';
    return;
  }

  const submitBtn = feedbackForm.querySelector('.fb-submit');
  submitBtn.disabled = true;

  const entry = { from: fbFrom, category: fbCategory, message, timestamp: Date.now() };

  try{
    await set(push(feedbackRef), entry);
    localStorage.setItem('skoolai_lastFeedback', String(Date.now()));
    fbStatus.textContent = "Sent — thanks!";
    fbStatus.className = 'fb-status';
    messageInput.value = '';
    setTimeout(closeFeedbackModal, 1400);
  }catch(err){
    console.error(err);
    fbStatus.textContent = "Couldn't send that — check your connection and try again.";
    fbStatus.className = 'fb-status error';
  }finally{
    submitBtn.disabled = false;
  }
});

/* ===== Feedback: viewer (parent PIN required) ===== */
const feedbackPage = document.getElementById('feedbackPage');

function renderFeedbackPage(){
  const list = document.getElementById('feedbackList');
  const entries = Object.values(feedback).sort((a,b) => b.timestamp - a.timestamp);
  if(entries.length === 0){
    list.innerHTML = '<p class="feedback-empty">No feedback yet.</p>';
    return;
  }
  list.innerHTML = entries.map(en => `
    <div class="fb-entry">
      <div class="fb-entry-head">
        <span class="fb-entry-from">${en.from}</span>
        <span class="fb-entry-cat">${en.category}</span>
        <span class="fb-entry-date">${new Date(en.timestamp).toLocaleString('en-AU', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'})}</span>
      </div>
      <div class="fb-entry-msg">${escapeAttr(en.message)}</div>
    </div>
  `).join('');
}

document.getElementById('viewFeedbackBtn').addEventListener('click', async () => {
  closeMenu();
  const pin = prompt('Parent PIN required to view feedback:');
  if(pin === null || pin.trim() === '') return;
  const ok = await checkPin(pin.trim());
  if(!ok){ alert("Nope. That's not it."); return; }
  renderFeedbackPage();
  feedbackPage.classList.add('open');
});
document.getElementById('feedbackBackBtn').addEventListener('click', () => {
  feedbackPage.classList.remove('open');
});

document.getElementById('signOutBtn').addEventListener('click', () => {
  closeMenu();
  signOut(auth);
});




