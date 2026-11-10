// 승강기 현장수첩 — Firebase 연결 (claude.ai 아티팩트의 저장소 기능을 Firebase로 대신함)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, query, limit as qLimit, onSnapshot, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// 앱을 쓸 수 있는 구글 계정 (Firestore 보안 규칙에도 같은 목록이 있어야 함)
export const ALLOWED = ["jtshim71@gmail.com", "a23443196@gmail.com"];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

function wrapRef(ref) {
  return {
    id: ref.id,
    get: async () => { const s = await getDoc(ref); return { id: s.id, exists: s.exists(), data: () => s.data() }; },
    set: (data) => setDoc(ref, data),
    update: (data) => updateDoc(ref, data),
    delete: () => deleteDoc(ref),
    onSnapshot: (cb, err) => onSnapshot(ref, s => cb({ id: s.id, exists: s.exists(), data: () => s.data() }), err),
  };
}
function wrapQuery(name, n) {
  const q = () => n ? query(collection(fs, name), qLimit(n)) : collection(fs, name);
  return {
    limit: (k) => wrapQuery(name, k),
    doc: (id) => wrapRef(doc(fs, name, id)),
    get: () => getDocs(q()),
    onSnapshot: (cb, err) => onSnapshot(q(), cb, e => { err && err({ code: e.code, message: e.message }); }),
  };
}
const dbApi = { collection: (name) => wrapQuery(name), doc: (path) => wrapRef(doc(fs, path)) };

// 사진: Firestore photos/{id} 문서에 작게 줄인 이미지(dataURL)로 저장
const photoCache = new Map();
window.phSrc = (id) => photoCache.get(id) || "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
async function loadPhoto(id) {
  if (photoCache.has(id)) return photoCache.get(id);
  const s = await getDoc(doc(fs, "photos", id));
  const u = s.exists() ? s.data().data : "";
  photoCache.set(id, u);
  return u;
}
new MutationObserver(() => {
  document.querySelectorAll("img[data-ph]:not([data-loaded])").forEach(img => {
    img.dataset.loaded = "1";
    loadPhoto(img.dataset.ph).then(u => { if (u) img.src = u; }).catch(() => {});
  });
}).observe(document.documentElement, { childList: true, subtree: true });
const blobToDataURL = (b) => new Promise((r, j) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = j; fr.readAsDataURL(b); });
const assetsApi = {
  upload: async (blob) => {
    const u = await blobToDataURL(blob);
    if (u.length > 900000) { const e = new Error("사진이 너무 커요"); e.code = "too_large"; throw e; }
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    await setDoc(doc(fs, "photos", id), { data: u, at: new Date().toISOString() });
    photoCache.set(id, u);
    return { id, url: u, sizeBytes: u.length, contentType: "image/jpeg" };
  },
  delete: (id) => deleteDoc(doc(fs, "photos", id)),
};
const downloadsApi = {
  save: async ({ filename, data }) => {
    const blob = data instanceof Blob ? data : new Blob([data], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  },
};
const userApi = {
  can: async () => true, canEdit: () => true, isOwner: () => true,
  id: async () => auth.currentUser?.uid, me: async () => ({ id: auth.currentUser?.uid, name: auth.currentUser?.displayName || "" }),
};

// 로그인 화면
const gate = document.getElementById("gate");
const gateMsg = document.getElementById("gateMsg");
let resolveReady; const ready = new Promise(r => (resolveReady = r));
window.__fbReady = ready;
document.getElementById("btnLogin").addEventListener("click", async () => {
  const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: "select_account" });
  try { await signInWithPopup(auth, p); } catch (e) { if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") signInWithRedirect(auth, p); else gateMsg.textContent = "로그인하지 못했어요 (" + e.code + ")"; }
});
document.getElementById("btnLogout").addEventListener("click", () => signOut(auth).then(() => location.reload()));
getRedirectResult(auth).catch(() => {});
onAuthStateChanged(auth, (u) => {
  if (!u) { gate.hidden = false; return; }
  if (!ALLOWED.includes((u.email || "").toLowerCase())) {
    gate.hidden = false; gateMsg.textContent = u.email + " 계정은 사용 권한이 없어요. 다른 계정으로 로그인해 주세요."; signOut(auth); return;
  }
  gate.hidden = true;
  document.getElementById("who").textContent = u.displayName || u.email;
  resolveReady({ db: dbApi, user: userApi, downloads: downloadsApi, assets: assetsApi, mcp: null });
  if (location.hash === "#import") openImport();
});

// 아티팩트에서 받은 "전체 백업 파일"을 Firestore로 옮기기 (처음 한 번)
function openImport() {
  const box = document.getElementById("importBox"); box.hidden = false;
  document.getElementById("importFile").onchange = async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    const log = document.getElementById("importLog");
    try {
      const j = JSON.parse(await f.text()); const cols = j.collections || {};
      let total = 0;
      for (const [name, rows] of Object.entries(cols)) {
        for (let i = 0; i < rows.length; i += 400) {
          const b = writeBatch(fs);
          rows.slice(i, i + 400).forEach(r => b.set(doc(fs, name, r.id), r.data));
          await b.commit(); total += Math.min(400, rows.length - i);
          log.textContent = name + " 옮기는 중… 누적 " + total + "건";
        }
      }
      log.textContent = "✅ 다 옮겼어요: " + Object.entries(cols).map(([k, v]) => k + " " + v.length).join(" · ");
    } catch (e) { log.textContent = "옮기지 못했어요: " + (e.code || e.message); }
  };
}
