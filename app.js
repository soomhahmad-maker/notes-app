// ===== Supabase config =====
// (anon/publishable key is safe to expose in the browser)
const SUPABASE_URL = "https://qonqiwadfynopmdrgjge.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_U8LHkouD1Cfy4aUsH4CnTg_YyrxR0D-";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== State =====
let currentUser = null; // supabase user object
let editingId = null;
let pendingDeleteId = null;
let selectedColor = "yellow";

// ===== DOM refs =====
const authScreen = document.getElementById("auth-screen");
const notesScreen = document.getElementById("notes-screen");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const loginMsg = document.getElementById("login-msg");
const regMsg = document.getElementById("reg-msg");
const userEmailEl = document.getElementById("user-email");
const notesGrid = document.getElementById("notes-grid");
const emptyState = document.getElementById("empty-state");
const searchInput = document.getElementById("search-input");
const noteModal = document.getElementById("note-modal");
const confirmModal = document.getElementById("confirm-modal");

// ===== Tabs =====
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    document.querySelectorAll(".auth-form").forEach(f => f.classList.remove("active"));
    const target = tab.dataset.tab === "login" ? loginForm : registerForm;
    target.classList.add("active");
    loginMsg.textContent = "";
    regMsg.textContent = "";
  });
});

// ===== Helpers =====
function showMsg(el, text, type) {
  el.textContent = text;
  el.className = "msg " + (type || "");
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("ar-SA") + " " + d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
}

// ===== Auth =====
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  showMsg(loginMsg, "جاري الدخول...", "");
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    console.error("Supabase signIn error:", error);
    showMsg(loginMsg, translateAuthError(error.message), "error");
    return;
  }
  await onSignedIn(data.user);
});

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;
  const confirm = document.getElementById("reg-confirm").value;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showMsg(regMsg, "البريد الإلكتروني غير صالح", "error");
    return;
  }
  if (password.length < 4) {
    showMsg(regMsg, "كلمة المرور يجب أن تكون 4 أحرف على الأقل", "error");
    return;
  }
  if (password !== confirm) {
    showMsg(regMsg, "كلمتا المرور غير متطابقتين", "error");
    return;
  }
  showMsg(regMsg, "جاري إنشاء الحساب...", "");
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin + window.location.pathname
    }
  });
  if (error) {
    console.error("Supabase signUp error:", error);
    showMsg(regMsg, translateAuthError(error.message), "error");
    return;
  }
  if (data.session) {
    showMsg(regMsg, "تم إنشاء الحساب بنجاح", "success");
    await onSignedIn(data.user);
  } else {
    // email confirmation required
    showMsg(regMsg, "تم إنشاء الحساب. يرجى تأكيد بريدك الإلكتروني ثم تسجيل الدخول.", "success");
  }
});

function translateAuthError(msg) {
  const m = (msg || "").toLowerCase();
  if (m.includes("invalid login credentials")) return "البريد أو كلمة المرور غير صحيحة";
  if (m.includes("user already registered")) return "هذا البريد مسجل مسبقاً";
  if (m.includes("email not confirmed")) return "يرجى تأكيد بريدك الإلكتروني (تحقق من صندوق الوارد)";
  if (m.includes("password")) return "كلمة المرور غير صالحة";
  if (m.includes("email")) return "البريد الإلكتروني غير صالح: " + (msg || "");
  console.error("Supabase auth error (raw):", msg);
  return msg || "حدث خطأ";
}

async function onSignedIn(user) {
  currentUser = user;
  userEmailEl.textContent = user.email;
  authScreen.classList.remove("active");
  notesScreen.classList.add("active");
  // migrate any local notes (best effort)
  await migrateLocalNotes(user);
  await renderNotes();
}

async function logout() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  notesScreen.classList.remove("active");
  authScreen.classList.add("active");
  loginForm.reset();
  registerForm.reset();
  loginMsg.textContent = "";
  regMsg.textContent = "";
}

document.getElementById("logout-btn").addEventListener("click", logout);

// Auth state listener (handles session restore)
supabaseClient.auth.onAuthStateChange(async (event, session) => {
  if (event === "SIGNED_IN" && session && !currentUser) {
    await onSignedIn(session.user);
  } else if (event === "SIGNED_OUT") {
    currentUser = null;
    notesScreen.classList.remove("active");
    authScreen.classList.add("active");
  }
});

// Auto-login on load
(async function init() {
  const { data } = await supabaseClient.auth.getSession();
  if (data && data.session && data.session.user) {
    await onSignedIn(data.session.user);
  } else {
    authScreen.classList.add("active");
  }
})();

// ===== Migration from localStorage =====
async function migrateLocalNotes(user) {
  try {
    const key = "notes_app_notes_" + user.email.toLowerCase();
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const localNotes = JSON.parse(raw);
    if (!Array.isArray(localNotes) || localNotes.length === 0) return;

    // avoid duplicate migration
    const migKey = "notes_migrated_" + user.email.toLowerCase();
    if (localStorage.getItem(migKey) === "1") return;

    // only migrate if cloud has no notes
    const { data: cloud, error } = await supabaseClient
      .from("notes")
      .select("id")
      .limit(1);
    if (error) return;
    if (cloud && cloud.length > 0) {
      localStorage.setItem(migKey, "1");
      return;
    }

    const rows = localNotes.map(n => ({
      user_id: user.id,
      title: n.title || "بدون عنوان",
      content: n.content || "",
      color: n.color || "yellow",
      pinned: !!n.pinned,
      created_at: n.createdAt ? new Date(n.createdAt).toISOString() : new Date().toISOString(),
      updated_at: n.updatedAt ? new Date(n.updatedAt).toISOString() : new Date().toISOString()
    }));
    const { error: insErr } = await supabaseClient.from("notes").insert(rows);
    if (!insErr) {
      localStorage.setItem(migKey, "1");
    }
  } catch (e) {
    // silent: migration is best-effort
  }
}

// ===== Notes =====
async function fetchNotes() {
  const { data, error } = await supabaseClient
    .from("notes")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) {
    console.error(error);
    return [];
  }
  return data || [];
}

async function renderNotes() {
  if (!currentUser) return;
  const query = searchInput.value.trim().toLowerCase();
  let notes = await fetchNotes();
  // sort: pinned first, then newest
  notes.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updated_at) - new Date(a.updated_at);
  });
  if (query) {
    notes = notes.filter(n =>
      (n.title || "").toLowerCase().includes(query) ||
      (n.content || "").toLowerCase().includes(query)
    );
  }
  notesGrid.innerHTML = "";
  if (notes.length === 0) {
    const p = emptyState.querySelector("p");
    if (p) p.textContent = query ? "لا توجد نتائج مطابقة للبحث" : "لا توجد ملاحظات بعد. أضف أول ملاحظة!";
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");
  notes.forEach(n => {
    const card = document.createElement("div");
    card.className = "note-card color-" + (n.color || "yellow") + (n.pinned ? " pinned" : "");
    card.innerHTML = `
      ${n.pinned ? '<span class="pin-badge">📌</span>' : ''}
      <h3>${escapeHtml(n.title)}</h3>
      <p>${escapeHtml(n.content)}</p>
      <div class="meta">
        <span>${formatDate(new Date(n.updated_at).getTime())}</span>
        <div class="actions">
          <button class="pin" data-id="${n.id}">${n.pinned ? "إلغاء التثبيت" : "تثبيت"}</button>
          <button class="edit" data-id="${n.id}">تعديل</button>
          <button class="delete" data-id="${n.id}">حذف</button>
        </div>
      </div>
    `;
    notesGrid.appendChild(card);
  });

  notesGrid.querySelectorAll(".edit").forEach(b => b.addEventListener("click", () => openEdit(b.dataset.id)));
  notesGrid.querySelectorAll(".delete").forEach(b => b.addEventListener("click", () => askDelete(b.dataset.id)));
  notesGrid.querySelectorAll(".pin").forEach(b => b.addEventListener("click", () => togglePin(b.dataset.id)));
}

// ===== Modal logic =====
const colorPicker = document.getElementById("color-picker");
colorPicker.querySelectorAll(".color-swatch").forEach(sw => {
  sw.addEventListener("click", () => {
    colorPicker.querySelectorAll(".color-swatch").forEach(s => s.classList.remove("selected"));
    sw.classList.add("selected");
    selectedColor = sw.dataset.color;
  });
});

function openNew() {
  editingId = null;
  document.getElementById("modal-title").textContent = "ملاحظة جديدة";
  document.getElementById("note-title").value = "";
  document.getElementById("note-content").value = "";
  document.getElementById("note-pinned").checked = false;
  selectedColor = "yellow";
  colorPicker.querySelectorAll(".color-swatch").forEach(s => s.classList.toggle("selected", s.dataset.color === "yellow"));
  noteModal.classList.remove("hidden");
  setTimeout(() => document.getElementById("note-title").focus(), 50);
}

async function openEdit(id) {
  const notes = await fetchNotes();
  const note = notes.find(n => n.id === id);
  if (!note) return;
  editingId = id;
  document.getElementById("modal-title").textContent = "تعديل الملاحظة";
  document.getElementById("note-title").value = note.title;
  document.getElementById("note-content").value = note.content;
  document.getElementById("note-pinned").checked = !!note.pinned;
  selectedColor = note.color || "yellow";
  colorPicker.querySelectorAll(".color-swatch").forEach(s => s.classList.toggle("selected", s.dataset.color === selectedColor));
  noteModal.classList.remove("hidden");
  setTimeout(() => document.getElementById("note-title").focus(), 50);
}

function closeModal() {
  noteModal.classList.add("hidden");
  editingId = null;
}

document.getElementById("add-note-btn").addEventListener("click", openNew);
document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-cancel").addEventListener("click", closeModal);
noteModal.querySelector(".modal-backdrop").addEventListener("click", closeModal);

document.getElementById("note-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("note-title").value.trim();
  const content = document.getElementById("note-content").value.trim();
  const pinned = document.getElementById("note-pinned").checked;
  if (!title) {
    alert("العنوان مطلوب (Title is required)");
    return;
  }
  if (!currentUser) {
    alert("يرجى تسجيل الدخول أولاً (Please log in first)");
    return;
  }
  try {
    const now = new Date().toISOString();
    if (editingId) {
      const { error } = await supabaseClient
        .from("notes")
        .update({ title, content, color: selectedColor, pinned, updated_at: now })
        .eq("id", editingId);
      if (error) { console.error("Save (update) error:", error); alert("فشل الحفظ: " + (error.message || error)); return; }
    } else {
      const { error } = await supabaseClient
        .from("notes")
        .insert({ user_id: currentUser.id, title, content, color: selectedColor, pinned });
      if (error) { console.error("Save (insert) error:", error); alert("فشل الحفظ: " + (error.message || error)); return; }
    }
    closeModal();
    await renderNotes();
  } catch (err) {
    console.error("Save exception:", err);
    alert("فشل الحفظ: " + (err && err.message ? err.message : err));
  }
});

// Delete
function askDelete(id) {
  pendingDeleteId = id;
  confirmModal.classList.remove("hidden");
}
document.getElementById("confirm-cancel").addEventListener("click", () => {
  confirmModal.classList.add("hidden");
  pendingDeleteId = null;
});
confirmModal.querySelector(".modal-backdrop").addEventListener("click", () => {
  confirmModal.classList.add("hidden");
  pendingDeleteId = null;
});
document.getElementById("confirm-delete").addEventListener("click", async () => {
  if (pendingDeleteId) {
    const { error } = await supabaseClient.from("notes").delete().eq("id", pendingDeleteId);
    if (error) console.error(error);
    pendingDeleteId = null;
    confirmModal.classList.add("hidden");
    await renderNotes();
  }
});

async function togglePin(id) {
  // fetch current
  const { data } = await supabaseClient.from("notes").select("pinned").eq("id", id).single();
  if (!data) return;
  await supabaseClient.from("notes").update({ pinned: !data.pinned, updated_at: new Date().toISOString() }).eq("id", id);
  await renderNotes();
}

searchInput.addEventListener("input", () => renderNotes());

// Keyboard shortcut: Esc to close modals
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!noteModal.classList.contains("hidden")) closeModal();
    if (!confirmModal.classList.contains("hidden")) {
      confirmModal.classList.add("hidden");
      pendingDeleteId = null;
    }
  }
});
