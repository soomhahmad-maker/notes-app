// ===== Storage helpers =====
const USERS_KEY = "notes_app_users";
const SESSION_KEY = "notes_app_session";

function getUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || "[]"); }
  catch (e) { return []; }
}
function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}
function notesKey(email) {
  return "notes_app_notes_" + email.toLowerCase();
}
function getNotes(email) {
  try { return JSON.parse(localStorage.getItem(notesKey(email)) || "[]"); }
  catch (e) { return []; }
}
function saveNotes(email, notes) {
  localStorage.setItem(notesKey(email), JSON.stringify(notes));
}

// Simple hash (not cryptographically secure, demo only)
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return "h_" + (h >>> 0).toString(16);
}

// ===== State =====
let currentUser = null;
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

// ===== Auth =====
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim().toLowerCase();
  const password = document.getElementById("login-password").value;
  const users = getUsers();
  const user = users.find(u => u.email === email);
  if (!user) {
    showMsg(loginMsg, "لا يوجد حساب بهذا البريد", "error");
    return;
  }
  if (user.password !== hash(password)) {
    showMsg(loginMsg, "كلمة المرور غير صحيحة", "error");
    return;
  }
  login(email);
});

registerForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const email = document.getElementById("reg-email").value.trim().toLowerCase();
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
  const users = getUsers();
  if (users.find(u => u.email === email)) {
    showMsg(regMsg, "هذا البريد مسجل مسبقاً", "error");
    return;
  }
  users.push({ email, password: hash(password), createdAt: Date.now() });
  saveUsers(users);
  showMsg(regMsg, "تم إنشاء الحساب بنجاح", "success");
  setTimeout(() => login(email), 600);
});

function login(email) {
  currentUser = email;
  localStorage.setItem(SESSION_KEY, email);
  userEmailEl.textContent = email;
  authScreen.classList.remove("active");
  notesScreen.classList.add("active");
  renderNotes();
}

function logout() {
  currentUser = null;
  localStorage.removeItem(SESSION_KEY);
  notesScreen.classList.remove("active");
  authScreen.classList.add("active");
  loginForm.reset();
  registerForm.reset();
  loginMsg.textContent = "";
  regMsg.textContent = "";
}

document.getElementById("logout-btn").addEventListener("click", logout);

// Auto login
(function init() {
  const session = localStorage.getItem(SESSION_KEY);
  if (session) {
    const users = getUsers();
    if (users.find(u => u.email === session)) {
      login(session);
      return;
    }
    localStorage.removeItem(SESSION_KEY);
  }
  authScreen.classList.add("active");
})();

// ===== Notes =====
function renderNotes() {
  if (!currentUser) return;
  const query = searchInput.value.trim().toLowerCase();
  let notes = getNotes(currentUser);
  // sort: pinned first, then newest
  notes.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
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
        <span>${formatDate(n.updatedAt)}</span>
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

function openEdit(id) {
  const notes = getNotes(currentUser);
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

document.getElementById("note-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const title = document.getElementById("note-title").value.trim();
  const content = document.getElementById("note-content").value.trim();
  const pinned = document.getElementById("note-pinned").checked;
  if (!title) return;
  const notes = getNotes(currentUser);
  const now = Date.now();
  if (editingId) {
    const idx = notes.findIndex(n => n.id === editingId);
    if (idx !== -1) {
      notes[idx] = { ...notes[idx], title, content, color: selectedColor, pinned, updatedAt: now };
    }
  } else {
    notes.push({
      id: "n_" + now + "_" + Math.random().toString(36).slice(2, 8),
      title, content, color: selectedColor, pinned, createdAt: now, updatedAt: now
    });
  }
  saveNotes(currentUser, notes);
  closeModal();
  renderNotes();
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
document.getElementById("confirm-delete").addEventListener("click", () => {
  if (pendingDeleteId) {
    const notes = getNotes(currentUser).filter(n => n.id !== pendingDeleteId);
    saveNotes(currentUser, notes);
    pendingDeleteId = null;
    confirmModal.classList.add("hidden");
    renderNotes();
  }
});

function togglePin(id) {
  const notes = getNotes(currentUser);
  const note = notes.find(n => n.id === id);
  if (note) {
    note.pinned = !note.pinned;
    note.updatedAt = Date.now();
    saveNotes(currentUser, notes);
    renderNotes();
  }
}

searchInput.addEventListener("input", renderNotes);

// ===== Utils =====
function showMsg(el, text, type) {
  el.textContent = text;
  el.className = "msg " + type;
}

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
