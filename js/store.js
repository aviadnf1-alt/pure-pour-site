// שכבת אחסון: Firebase כשמוגדר ב-config.js, אחרת מצב הדגמה (localStorage בדפדפן).
import { CONFIG } from './config.js?v=20261008b';

const FB_VER = '10.12.2';
const LS_KEY = 'pp_demo_orders_v1';

let mode = 'demo';          // 'demo' | 'firebase' | 'error'
let fb = null;

export const storeMode = () => mode;

export async function initStore() {
  const c = CONFIG.firebase;
  if (!(c && c.apiKey && c.projectId)) return mode;
  try {
    const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
    const [appM, fs, am] = await Promise.all([
      import(base + 'firebase-app.js'),
      import(base + 'firebase-firestore.js'),
      import(base + 'firebase-auth.js'),
    ]);
    const app = appM.initializeApp(c);
    fb = { db: fs.getFirestore(app), auth: am.getAuth(app), fs, am };
    mode = 'firebase';
  } catch (e) {
    // חשוב: לא לחזור למצב הדגמה – אחרת הזמנות אמיתיות יישמרו רק בדפדפן של הלקוח.
    console.error('Firebase init failed', e);
    mode = 'error';
  }
  return mode;
}

const newId = () => 'PP-' + (1000 + Math.floor(Math.random() * 9000));

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function writeLocal(list) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}
const reviveLocal = o => ({ ...o, createdAt: new Date(o.createdAt) });

export async function createOrder(data) {
  if (mode === 'error') throw new Error('store-unavailable');
  if (mode === 'firebase') {
    const { db, fs } = fb;
    let lastErr;
    for (let i = 0; i < 4; i++) {
      const id = newId();
      try {
        await fs.setDoc(fs.doc(db, 'orders', id), { ...data, id, createdAt: fs.serverTimestamp() });
        return { ...data, id, createdAt: new Date() };
      } catch (e) {
        lastErr = e;
        if (e.code !== 'permission-denied') break;   // התנגשות מספר הזמנה נראית כ-permission-denied
      }
    }
    throw lastErr;
  }
  const list = readLocal();
  let id = newId();
  while (list.some(o => o.id === id)) id = newId();
  const order = { ...data, id, createdAt: new Date().toISOString() };
  list.push(order);
  writeLocal(list);
  return reviveLocal(order);
}

// ---- זמינות טעמים (רשימת slugs של טעמים שאזלו זמנית) ----
const SOLD_KEY = 'pp_demo_soldout_v1';

export async function getSoldOut() {
  try {
    if (mode === 'firebase') {
      const { db, fs } = fb;
      const snap = await fs.getDoc(fs.doc(db, 'settings', 'soldOut'));
      const list = snap.exists() ? snap.data().slugs : [];
      return Array.isArray(list) ? list : [];
    }
    if (mode === 'demo') return JSON.parse(localStorage.getItem(SOLD_KEY) || '[]');
  } catch (e) { console.error('getSoldOut failed', e); }
  return [];
}

export async function setSoldOut(slugs) {
  if (mode === 'firebase') {
    const { db, fs } = fb;
    return fs.setDoc(fs.doc(db, 'settings', 'soldOut'), { slugs });
  }
  localStorage.setItem(SOLD_KEY, JSON.stringify(slugs));
}

// ---- ניהול ----
export function onAuth(cb) {
  if (mode === 'firebase') return fb.am.onAuthStateChanged(fb.auth, cb);
  if (mode === 'demo') { cb({ email: 'demo' }); return () => {}; }
  cb(null); return () => {};
}
export const login = (email, pw) => fb.am.signInWithEmailAndPassword(fb.auth, email, pw);
export const logout = () => (mode === 'firebase' ? fb.am.signOut(fb.auth) : Promise.resolve());

export function listenOrders(cb, onError) {
  if (mode === 'firebase') {
    const { db, fs } = fb;
    const q = fs.query(fs.collection(db, 'orders'), fs.orderBy('createdAt', 'desc'));
    return fs.onSnapshot(q, snap => {
      cb(snap.docs.map(d => {
        const o = d.data();
        return { ...o, createdAt: o.createdAt && o.createdAt.toDate ? o.createdAt.toDate() : new Date() };
      }));
    }, onError);
  }
  const push = () => cb(readLocal().map(reviveLocal).sort((a, b) => b.createdAt - a.createdAt));
  const onStorage = e => { if (e.key === LS_KEY) push(); };
  window.addEventListener('storage', onStorage);
  push();
  return () => window.removeEventListener('storage', onStorage);
}

export async function updateOrder(id, patch) {
  if (mode === 'firebase') {
    const { db, fs } = fb;
    return fs.updateDoc(fs.doc(db, 'orders', id), patch);
  }
  writeLocal(readLocal().map(o => (o.id === id ? { ...o, ...patch } : o)));
  window.dispatchEvent(new StorageEvent('storage', { key: LS_KEY }));
}
