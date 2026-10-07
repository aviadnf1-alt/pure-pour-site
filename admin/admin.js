import { fmt } from '../js/pricing.js';
import { COCKTAILS } from '../js/data.js';
import { initStore, onAuth, login, logout, listenOrders, updateOrder, getSoldOut, setSoldOut } from '../js/store.js';

const $ = id => document.getElementById(id);
const STATUS = {
  pending: 'ממתין לתשלום', paid: 'שולם', prepared: 'הוכן', delivered: 'נמסר / נאסף', cancelled: 'בוטל',
};
// לכל סטטוס – הפעולות הזמינות
const NEXT = {
  pending:   [['paid', 'אישור תשלום'], ['cancelled', 'ביטול']],
  paid:      [['prepared', 'סימון כהוכן'], ['pending', 'החזר לממתין'], ['cancelled', 'ביטול']],
  prepared:  [['delivered', 'סימון כנמסר'], ['paid', 'החזר ל"שולם"']],
  delivered: [['prepared', 'החזר ל"הוכן"']],
  cancelled: [['pending', 'שחזור']],
};
const REVENUE = new Set(['paid', 'prepared', 'delivered']);

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dt = d => d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const PAY_APPS = { bit: 'ביט', paybox: 'פייבוקס' };
const waPhone = p => { const d = String(p).replace(/\D/g, ''); return d.startsWith('0') ? '972' + d.slice(1) : d; };

let orders = [];
let unsub = null;

// ---------- auth ----------
$('fStatus').insertAdjacentHTML('beforeend', Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join(''));

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('loginErr').textContent = '';
  try { await login($('email').value.trim(), $('pw').value); }
  catch { $('loginErr').textContent = 'אימייל או סיסמה שגויים.'; }
});
$('logout').addEventListener('click', () => logout());

function show(user) {
  $('login').hidden = !!user;
  $('app').hidden = !user;
  if (unsub) { unsub(); unsub = null; }
  if (!user) return;
  $('listErr').textContent = '';
  loadStock();
  unsub = listenOrders(list => { orders = list; render(); }, err => {
    console.error(err);
    $('listErr').textContent = err.code === 'permission-denied'
      ? 'אין הרשאה לקרוא הזמנות. בדוק שה-UID של המנהל מוגדר בכללי Firestore (SETUP-HE.md).'
      : 'שגיאה בטעינת ההזמנות.';
  });
}

// ---------- render ----------
function filtered() {
  const q = $('q').value.trim().toLowerCase();
  const st = $('fStatus').value;
  const days = $('fRange').value;
  const since = days === 'all' ? 0 : Date.now() - Number(days) * 864e5;
  return orders.filter(o =>
    (!st || o.status === st) &&
    o.createdAt.getTime() >= since &&
    (!q || [o.id, o.name, o.phone].some(x => String(x).toLowerCase().includes(q))));
}

function render() {
  const list = filtered();

  const sum = f => list.filter(f).reduce((a, o) => a + o.total, 0);
  $('stats').innerHTML = [
    ['הזמנות', list.length],
    ['ממתינות לתשלום', fmt(sum(o => o.status === 'pending'))],
    ['שולם (כולל הוכן ונמסר)', fmt(sum(o => REVENUE.has(o.status)))],
    ['בקבוקים ששולמו', list.filter(o => REVENUE.has(o.status)).reduce((a, o) => a + o.bottles, 0)],
  ].map(([l, v]) => `<div class="stat"><small>${l}</small><b>${v}</b></div>`).join('');

  // רשימת הכנה: כל ההזמנות ששולמו ועוד לא הוכנו (בלי קשר לפילטר)
  const tally = {};
  orders.filter(o => o.status === 'paid').forEach(o => o.items.forEach(i => { tally[i.name] = (tally[i.name] || 0) + i.qty; }));
  const rows = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  $('prodList').innerHTML = rows.length
    ? rows.map(([n, q]) => `<div class="row"><span>${esc(n)}</span><b>${q}</b></div>`).join('') +
      `<div class="row"><span><b>סה״כ</b></span><b>${rows.reduce((a, r) => a + r[1], 0)}</b></div>`
    : '<p class="hint">אין כרגע הזמנות ששולמו וממתינות להכנה.</p>';

  $('orders').innerHTML = list.length ? list.map(card).join('') : '<p class="empty">אין הזמנות להצגה.</p>';
}

function card(o) {
  const items = o.items.map(i => `<li>${esc(i.name)} × ${i.qty}</li>`).join('');
  const actions = (NEXT[o.status] || []).map(([to, label]) =>
    `<button class="btn sm${to === 'cancelled' ? ' ghost' : ''}" data-id="${esc(o.id)}" data-to="${to}" type="button">${label}</button>`).join('');
  const wa = `https://wa.me/${waPhone(o.phone)}?text=${encodeURIComponent(`היי ${o.name}, כאן Pure Pour לגבי הזמנה ${o.id}`)}`;
  return `<article class="ord" data-st="${o.status}">
    <div class="ord-head">
      <span><span class="ord-id">${esc(o.id)}</span> · <strong>${esc(o.name)}</strong></span>
      <span class="ord-total">${fmt(o.total)}</span>
    </div>
    <div class="ord-meta">${dt(o.createdAt)} · <span class="badge">${STATUS[o.status] || esc(o.status)}</span> · ${o.bottles} בקבוקים ·
      ${o.method === 'delivery' ? 'משלוח' : 'איסוף'} · <span dir="ltr">${esc(o.phone)}</span></div>
    <ul>${items}</ul>
    ${o.method === 'delivery' ? `<div>משלוח: ${esc(o.area)}${o.area ? ', ' : ''}${esc(o.address)}${o.deliveryFee ? ` · דמי משלוח ${fmt(o.deliveryFee)}` : ''}</div>` : ''}
    ${o.wanted ? `<div>מועד מבוקש: ${esc(o.wanted)}</div>` : ''}
    ${o.notes ? `<div>הערות: ${esc(o.notes)}</div>` : ''}
    ${o.status === 'pending' ? `<div class="payreq"><b>לשלוח בקשת תשלום ב${PAY_APPS[o.payApp] || 'ביט/פייבוקס'}</b>
      ל-<span dir="ltr">${esc(o.phone)}</span> בסכום <b>${fmt(o.total)}</b> · מועד מבוקש: <b>${esc(o.wanted)}</b>
      <button class="btn sm ghost" data-copy="${esc(o.phone)}" type="button">העתק טלפון</button>
      <button class="btn sm ghost" data-copy="${o.total}" type="button">העתק סכום</button></div>` : ''}
    <div class="ord-actions">${actions}<a class="btn sm ghost" href="${wa}" target="_blank" rel="noopener">וואטסאפ ללקוח</a></div>
  </article>`;
}

$('orders').addEventListener('click', async e => {
  const cp = e.target.closest('button[data-copy]');
  if (cp) {
    try { await navigator.clipboard.writeText(cp.dataset.copy); const t = cp.textContent; cp.textContent = 'הועתק ✓'; setTimeout(() => { cp.textContent = t; }, 1200); }
    catch { cp.textContent = cp.dataset.copy; }
    return;
  }
  const b = e.target.closest('button[data-id]');
  if (!b) return;
  b.disabled = true;
  try { await updateOrder(b.dataset.id, { status: b.dataset.to }); }
  catch (ex) { console.error(ex); $('listErr').textContent = 'העדכון נכשל. נסה שוב.'; b.disabled = false; }
});
['q', 'fStatus', 'fRange'].forEach(id => $(id).addEventListener('input', render));

// ---------- זמינות טעמים ----------
let soldOut = new Set();

function renderStock() {
  $('stockList').innerHTML = COCKTAILS.map(c => {
    const out = soldOut.has(c.slug);
    return `<button type="button" class="stock-btn ${out ? 'out' : 'in'}" data-slug="${c.slug}" aria-pressed="${out}">
      <span>${esc(c.he)}</span><b>${out ? 'אזל' : 'זמין'}</b></button>`;
  }).join('');
}

async function loadStock() {
  soldOut = new Set(await getSoldOut());
  renderStock();
}

$('stockList').addEventListener('click', async e => {
  const b = e.target.closest('button[data-slug]');
  if (!b) return;
  const slug = b.dataset.slug;
  const next = new Set(soldOut);
  next.has(slug) ? next.delete(slug) : next.add(slug);
  b.disabled = true;
  try {
    await setSoldOut([...next]);
    soldOut = next;
    $('stockMsg').textContent = 'נשמר.';
  } catch (ex) {
    console.error(ex);
    $('stockMsg').textContent = 'השמירה נכשלה. נסה שוב.';
  }
  renderStock();
});

// ---------- CSV ----------
const cell = v => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;   // מניעת הזרקת נוסחאות באקסל
  return `"${s.replace(/"/g, '""')}"`;
};
$('csv').addEventListener('click', () => {
  const head = ['מספר הזמנה', 'תאריך', 'סטטוס', 'שם', 'טלפון', 'משלוח/איסוף', 'ישוב', 'כתובת', 'מועד מבוקש', 'פריטים', 'בקבוקים', 'דמי משלוח', 'סכום', 'אפליקציית תשלום', 'הערות'];
  const rows = filtered().map(o => [o.id, dt(o.createdAt), STATUS[o.status] || o.status, o.name, o.phone,
    o.method === 'delivery' ? 'משלוח' : 'איסוף', o.area, o.address, o.wanted,
    o.items.map(i => `${i.name} x${i.qty}`).join('; '), o.bottles, o.deliveryFee || 0, o.total, PAY_APPS[o.payApp] || '', o.notes]);
  const csv = '﻿' + [head, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `pure-pour-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// ---------- boot ----------
initStore().then(mode => {
  $('demoBanner').hidden = mode !== 'demo';
  if (mode === 'error') { $('login').hidden = false; $('loginErr').textContent = 'שגיאה בחיבור ל-Firebase. בדוק את ההגדרות.'; return; }
  onAuth(show);
});
