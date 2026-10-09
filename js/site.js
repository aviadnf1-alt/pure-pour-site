import { CONFIG } from './config.js?v=20261010a';
import { COCKTAILS } from './data.js?v=20261010a';
import { tierPrice, fmt } from './pricing.js?v=20261010a';
import { initStore, createOrder, storeMode, getSoldOut } from './store.js?v=20261010a';

const $ = id => document.getElementById(id);
const qty = Object.fromEntries(COCKTAILS.map(c => [c.slug, 0]));
let soldOut = new Set();          // טעמים שאזלו זמנית (מגיע מ-Firestore)
const { prices, maxBottles } = CONFIG;
const waBase = `https://wa.me/${CONFIG.business.whatsapp}`;

const bottles = () => Object.values(qty).reduce((a, b) => a + b, 0);
const waLink = text => `${waBase}?text=${encodeURIComponent(text)}`;
const PAY_APPS = { bit: 'ביט', paybox: 'פייבוקס' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = u => (typeof u === 'string' && /^https:\/\//i.test(u) ? u : '');

// "2–3 בקבוקים: 45 ₪ לבקבוק · 4–5: 38.75 ₪ · 6 ומעלה: 33.33 ₪"
function tiersNote() {
  const sizes = Object.keys(prices).map(Number).sort((a, b) => a - b);
  const parts = sizes.map((s, i) => {
    const next = sizes[i + 1];
    const range = s === sizes[sizes.length - 1] ? `${s} ומעלה` : next - s > 1 ? `${s}–${next - 1}` : `${s}`;
    return `${range}: ${fmt(prices[s] / s)}`;
  });
  return `המחיר לבקבוק יורד ככל שמזמינים יותר, וחל על כל הבקבוקים בהזמנה (גם אלה מעבר לחבילה). ${parts.join(' · ')}`;
}

// ---------- static bits ----------
function renderStatic() {
  $('shelfNote').textContent = CONFIG.delivery.shelfLifeNote;
  const { leadTimeText, urgentText } = CONFIG.delivery;
  $('leadChip').textContent = leadTimeText.replace(/\.$/, '');
  document.querySelectorAll('[data-lead]').forEach(el => {
    el.innerHTML = `<b>${esc(leadTimeText)}</b> <a href="${waLink('היי, אני צריך/ה הזמנה דחופה ל-')}" target="_blank" rel="noopener">${esc(urgentText)}</a>`;
  });
  $('phoneTxt').textContent = CONFIG.business.phoneDisplay;
  $('waLink').href = waBase;
  $('igLink').href = `https://instagram.com/${CONFIG.business.instagram}`;
  $('ttLink').href = `https://www.tiktok.com/@${CONFIG.business.tiktok}`;

  $('packs').innerHTML = Object.keys(prices).map(Number).sort((a, b) => a - b).map(s => `
    <div class="pack"><small>${s === 1 ? 'בקבוק בודד' : s + ' בקבוקים'}</small><b>${prices[s]} ₪</b>
    <span class="per">${s === 1 ? 'מחיר רגיל' : fmt(prices[s] / s) + ' לבקבוק'}</span></div>`).join('');
  $('packsNote').textContent = tiersNote();

  $('grid').innerHTML = COCKTAILS.map(c => `
    <article class="card" id="card-${c.slug}">
      <div class="pic" style="background:radial-gradient(circle at 50% 42%, ${c.colors[1]} 0%, ${c.colors[1]}88 38%, #1B0F0A 85%)">
        <svg aria-hidden="true"><use href="#glass"/></svg>
        <img src="images/cocktails/${c.slug}.jpg" alt="${c.he} – בקבוק קוקטייל Pure Pour" loading="lazy" onerror="this.remove()">
        <span class="abv">${c.abv}%</span>
        <span class="sold-badge">אזל זמנית</span>
      </div>
      <div class="body">
        <div class="en">${c.en}</div>
        <h3>${c.he}</h3>
        <div class="tags"><span class="tag base">${c.base}</span>${c.taste.map(t => `<span class="tag">${t}</span>`).join('')}</div>
        <p>${c.desc}</p>
        <div class="serve"><b>הגשה:</b> ${c.serve}</div>
        <div class="stepper">
          <button type="button" data-act="inc" data-slug="${c.slug}" aria-label="הוסף בקבוק ${c.he}">+</button>
          <output id="q-${c.slug}" aria-live="polite">0</output>
          <button type="button" data-act="dec" data-slug="${c.slug}" aria-label="הסר בקבוק ${c.he}" disabled>−</button>
        </div>
      </div>
    </article>`).join('');

  $('area').innerHTML = '<option value="" disabled selected>בחרו ישוב…</option>' +
    CONFIG.delivery.zones.map((z, i) => `<option value="${i}">${z.name} – ${z.fee} ₪</option>`).join('') +
    `<option value="other">${CONFIG.delivery.otherZoneLabel}</option>`;

  // תאריך מבוקש: מהיום ועד 60 יום קדימה. הזמנה ליום עצמו מאושרת ידנית בוואטסאפ.
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const t0 = new Date(); const min = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate());
  const max = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() + 60);
  $('wantedDate').min = iso(min); $('wantedDate').max = iso(max);
  $('wantedDate').addEventListener('input', () => { $('sameDayNote').hidden = $('wantedDate').value !== iso(min); });
  updateMethod();
}

// ---------- state → UI ----------
const isDelivery = () => document.querySelector('input[name=method]:checked').value === 'delivery';

// zone: null = לא נבחר ישוב; 'other' = ישוב שלא ברשימה (צריך בירור)
function deliveryInfo() {
  if (!isDelivery()) return { delivery: false, fee: 0, zone: null };
  const v = $('area').value;
  if (v === 'other') return { delivery: true, fee: 0, zone: 'other' };
  const z = v === '' ? null : CONFIG.delivery.zones[Number(v)];
  return { delivery: true, fee: z ? z.fee : 0, zone: z };
}

function current() {
  const n = bottles();
  const res = n >= 1 && n <= maxBottles ? tierPrice(n, prices) : null;
  const d = deliveryInfo();
  const ready = !!res && (!d.delivery || (d.zone && d.zone !== 'other'));
  return { n, res, d, ready, total: res ? res.cost + d.fee : 0 };
}

// הודעה כשבקבוק (או שניים) נוספים מורידים את המחיר לבקבוק
function nextTierNudge(n) {
  const next = Object.keys(prices).map(Number).sort((a, b) => a - b).find(s => s > n);
  if (!next || next - n > 2) return '';
  const t = tierPrice(next, prices);
  const add = next - n;
  return `הוסיפו עוד ${add === 1 ? 'בקבוק אחד' : 'שני בקבוקים'} והמחיר לבקבוק יורד ל-<b>${fmt(t.perBottle)}</b> (סה״כ ${fmt(t.cost)})`;
}

function update() {
  const { n, res, d, ready, total } = current();
  for (const c of COCKTAILS) {
    $(`q-${c.slug}`).textContent = qty[c.slug];
    const card = $(`card-${c.slug}`);
    card.classList.toggle('has', qty[c.slug] > 0);
    card.classList.toggle('soldout', soldOut.has(c.slug));
    card.querySelector('[data-act=dec]').disabled = qty[c.slug] === 0;
    card.querySelector('[data-act=inc]').disabled = n >= maxBottles || soldOut.has(c.slug);
  }

  const msg = $('barMsg');
  $('bar').hidden = n === 0 || !$('done').hidden;
  if (res) {
    const withFee = d.delivery && d.zone && d.zone !== 'other';
    const count = n === 1 ? 'בקבוק אחד' : `${n} בקבוקים · ${fmt(res.perBottle)} לבקבוק`;
    msg.innerHTML = withFee
      ? `${count} · משלוח ${fmt(d.fee)} · <b>${fmt(total)}</b>`
      : `${count} · <b>${fmt(res.cost)}</b>`;
  }
  if (n >= maxBottles) msg.innerHTML += ` · הגעתם למקסימום. להזמנות גדולות – <a href="${waBase}" target="_blank" rel="noopener" style="color:inherit">וואטסאפ</a>`;
  $('barBtn').setAttribute('aria-disabled', res ? 'false' : 'true');
  const nudge = res ? nextTierNudge(n) : '';
  $('nudge').innerHTML = nudge;
  $('nudge').hidden = !nudge;

  const ul = $('sum');
  const lines = COCKTAILS.filter(c => qty[c.slug] > 0).map(c => `<li><span>${c.he} × ${qty[c.slug]}</span></li>`);
  if (res) {
    lines.push(`<li><span>${n} בקבוקים × ${fmt(res.perBottle)}</span><span>${fmt(res.cost)}</span></li>`);
    if (d.delivery && d.zone && d.zone !== 'other') lines.push(`<li><span>משלוח ל${d.zone.name}</span><span>${fmt(d.fee)}</span></li>`);
    lines.push(`<li class="total"><span>סה״כ לתשלום</span><span>${fmt(total)}</span></li>`);
    if (nudge) lines.push(`<li class="nudge-li"><span>${nudge}</span></li>`);
  }
  ul.innerHTML = lines.length ? lines.join('') : '<li class="hint">עוד לא נבחרו בקבוקים. חזרו לתפריט.</li>';
  $('submit').disabled = !ready;

  const other = d.delivery && d.zone === 'other';
  $('areaHint').innerHTML = other
    ? `לישוב שלא ברשימה צריך לבדוק אפשרות משלוח. <a href="${waLink('היי, אשמח לבדוק אפשרות משלוח לישוב: ')}" target="_blank" rel="noopener">כתבו לנו בוואטסאפ</a>, או בחרו איסוף עצמי.`
    : '';
}

function updateMethod() {
  const del = isDelivery();
  $('areaField').hidden = !del;
  $('addrField').hidden = !del;
  $('dateLegend').textContent = del ? 'למתי תרצו את המשלוח?' : 'מתי תרצו לאסוף?';
  $('methodHint').textContent = del ? CONFIG.delivery.deliveryText : CONFIG.delivery.pickupText;
  update();
}

// ---------- events ----------
$('grid').addEventListener('click', e => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const slug = b.dataset.slug;
  if (b.dataset.act === 'inc' && bottles() < maxBottles && !soldOut.has(slug)) qty[slug]++;
  if (b.dataset.act === 'dec' && qty[slug] > 0) qty[slug]--;
  update();
});
$('barBtn').addEventListener('click', e => { if ($('barBtn').getAttribute('aria-disabled') === 'true') { e.preventDefault(); $('menu').scrollIntoView(); } });
document.querySelectorAll('input[name=method]').forEach(r => r.addEventListener('change', updateMethod));
$('area').addEventListener('change', update);

function normPhone(raw) {
  const d = raw.replace(/[^\d]/g, '');
  if (/^972\d{8,9}$/.test(d)) return '0' + d.slice(3);
  return /^0\d{8,9}$/.test(d) ? d : '';
}

function orderText(o, via) {
  const items = o.items.map(i => `• ${i.name} × ${i.qty}`).join('\n');
  return [`היי, הזמנה מאתר Pure Pour`, `מספר הזמנה: ${o.id}`, `שם: ${o.name}`, `טלפון: ${o.phone}`,
    `סכום לתשלום: ${o.total} ₪${o.deliveryFee ? ` (כולל משלוח ${o.deliveryFee} ₪)` : ''}`, items,
    o.method === 'delivery' ? `משלוח: ${o.area}, ${o.address}` : 'איסוף עצמי בשילה',
    o.wanted ? `מועד מבוקש: ${o.wanted}` : '', o.notes ? `הערות: ${o.notes}` : '',
    o.payApp ? `בקשת תשלום ב${PAY_APPS[o.payApp]}` : ''].filter(Boolean).join('\n');
}

$('form').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('err'); err.textContent = '';
  const { n, res, d, total } = current();
  if (!res) { err.textContent = 'בחרו לפחות בקבוק אחד.'; return; }
  const name = $('name').value.trim();
  const phone = normPhone($('phone').value);
  const method = d.delivery ? 'delivery' : 'pickup';
  const address = $('address').value.trim();
  if (name.length < 2) { err.textContent = 'נא למלא שם.'; $('name').focus(); return; }
  if (!phone) { err.textContent = 'מספר הטלפון לא תקין (למשל 050-1234567).'; $('phone').focus(); return; }
  if (d.delivery && (!d.zone || d.zone === 'other')) { err.textContent = 'נא לבחור ישוב למשלוח מהרשימה.'; $('area').focus(); return; }
  if (d.delivery && address.length < 3) { err.textContent = 'נא למלא רחוב ומספר בית.'; $('address').focus(); return; }
  // בדיקה אחרונה מול הרשימה העדכנית של טעמים שאזלו (ייתכן שהתעדכנה אחרי שהלקוח התחיל לבחור)
  soldOut = new Set(await getSoldOut());
  const gone = COCKTAILS.filter(c => qty[c.slug] > 0 && soldOut.has(c.slug));
  if (gone.length) {
    gone.forEach(c => { qty[c.slug] = 0; });
    update();
    err.textContent = `הטעם ${gone.map(c => c.he).join(', ')} אזל זמנית והוסר מההזמנה. אפשר לבחור טעם אחר.`;
    $('menu').scrollIntoView();
    return;
  }
  const wd = $('wantedDate').value;
  if (!wd) { err.textContent = 'נא לבחור תאריך מבוקש.'; $('wantedDate').focus(); return; }
  if (wd < $('wantedDate').min || wd > $('wantedDate').max) { err.textContent = 'אפשר לבחור תאריך מהיום ועד 60 יום קדימה.'; $('wantedDate').focus(); return; }
  if (!$('age').checked) { err.textContent = 'יש לאשר שאתם בני 18 ומעלה.'; $('age').focus(); return; }
  const [wy, wm, wdd] = wd.split('-').map(Number);
  const dayName = new Date(wy, wm - 1, wdd).toLocaleDateString('he-IL', { weekday: 'long' });
  const wanted = `${dayName} ${String(wdd).padStart(2, '0')}.${String(wm).padStart(2, '0')}.${wy} · ${$('wantedTime').value}`;

  const data = {
    name, phone, method,
    area: d.delivery ? d.zone.name : '',
    deliveryFee: d.fee,
    subtotal: res.cost,
    address: d.delivery ? address : '',
    wanted,
    notes: $('notes').value.trim(),
    items: COCKTAILS.filter(c => qty[c.slug] > 0).map(c => ({ slug: c.slug, name: c.he, qty: qty[c.slug] })),
    bottles: n, packs: { tier: res.tier, perBottle: Math.round(res.perBottle * 100) / 100 }, total,
    payApp: document.querySelector('input[name=payApp]:checked').value,
    status: 'pending', ageConfirmed: true,
  };

  const btn = $('submit'); btn.disabled = true; btn.textContent = 'שולחים…';
  try {
    const order = await createOrder(data);
    notifyOwner(order);
    showDone(order);
  } catch (ex) {
    console.error(ex);
    err.innerHTML = `לא הצלחנו לשמור את ההזמנה. אפשר לשלוח אותה ישירות בוואטסאפ: <a href="${waLink(orderText({ ...data, id: '(ללא מספר)' }))}" target="_blank" rel="noopener">שליחה בוואטסאפ</a>`;
    btn.disabled = false;
  } finally {
    btn.textContent = 'שליחת הזמנה';
  }
});

// התראת push לבעל העסק (ntfy). נשלחת רק כשההזמנה נשמרה באמת ב-Firebase, ולא חוסמת את הלקוח אם נכשלה.
function notifyOwner(o) {
  const topic = CONFIG.notify && CONFIG.notify.ntfyTopic;
  if (!topic || storeMode() !== 'firebase') return;
  const where = o.method === 'delivery' ? `משלוח ל${o.area}` : 'איסוף';
  try {
    fetch('https://ntfy.sh/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic, priority: 4, tags: ['cocktail'],
        title: `הזמנה חדשה ${o.id}`,
        message: `${o.bottles} בקבוקים · ${o.total} ₪ · ${where}\nמועד מבוקש: ${o.wanted}\nלשלוח בקשת תשלום ב${PAY_APPS[o.payApp] || 'ביט/פייבוקס'}`,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* ignore */ }
}

function showDone(o) {
  $('form').hidden = true; $('bar').hidden = true;
  $('oid').textContent = o.id;
  $('doneTotal').textContent = fmt(o.total);
  $('donePhone').textContent = o.phone;
  $('doneHow').textContent = o.method === 'delivery' ? 'משלוח' : 'איסוף';

  const rows = o.items.map(i => `<li><span>${esc(i.name)} × ${i.qty}</span><span></span></li>`);
  rows.push(`<li><span>${o.bottles} ${o.bottles === 1 ? 'בקבוק' : 'בקבוקים'} × ${fmt(o.packs.perBottle)}</span><span>${fmt(o.subtotal)}</span></li>`);
  if (o.method === 'delivery') rows.push(`<li><span>משלוח ל${esc(o.area)}, ${esc(o.address)}</span><span>${fmt(o.deliveryFee)}</span></li>`);
  else rows.push(`<li><span>איסוף עצמי בשילה</span><span>${fmt(0)}</span></li>`);
  rows.push(`<li><span>מועד מבוקש: ${esc(o.wanted)} (יאושר בוואטסאפ)</span><span></span></li>`);
  rows.push(`<li class="total"><span>סה״כ לתשלום</span><span>${fmt(o.total)}</span></li>`);
  $('doneSum').innerHTML = rows.join('');

  $('donePayApp').textContent = PAY_APPS[o.payApp] || 'ביט או פייבוקס';
  $('doneNote').textContent = `לא קיבלתם בקשה תוך זמן קצר? כתבו לנו בוואטסאפ עם מספר ההזמנה (${o.id}).`;

  $('waBtn').href = waLink(`היי, יש לי שאלה לגבי הזמנה ${o.id}`);
  $('done').hidden = false;
  $('done').focus();
  $('done').scrollIntoView({ block: 'start' });
}

// ---------- boot ----------
renderStatic();
update();
initStore().then(async m => {
  $('demoBanner').hidden = m !== 'demo';
  soldOut = new Set(await getSoldOut());
  update();
});
