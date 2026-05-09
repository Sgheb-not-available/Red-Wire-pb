// ---- Config ----
// Cambia API_URL con l'URL del tuo backend deployato
const API_URL = 'https://red-wire.onrender.com'; // es. Railway

// Token salvato una volta in localStorage (non è un dato sensibile come una password,
// ma è specifico per dispositivo — Emily usa il suo, Riccardo il suo)
const TOKEN_KEY = 'rw_token';
const MY_USER_KEY = 'rw_user_id';

// ---- Auth ----
function getToken() { return localStorage.getItem(TOKEN_KEY); }
function getMyUserId() { return localStorage.getItem(MY_USER_KEY); }
function saveAuth(token, userId) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(MY_USER_KEY, userId);
}
function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(MY_USER_KEY);
}

// ---- Date helpers ----
function getDayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDayLabel(date) {
  return date.toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long'
  });
}

function toStartOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

// ---- API ----
async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...(options.headers || {}), 'Authorization': `Bearer ${token}` },
  });
  if (res.status === 401) { clearAuth(); location.reload(); return null; }
  return res;
}

async function fetchPhotos(dayKey) {
  try {
    const res = await apiFetch(`/photos/${dayKey}`);
    if (!res || !res.ok) return {};
    const data = await res.json();
    return data.photos || {};
  } catch { return {}; }
}

async function uploadPhoto(file, dayKey) {
  const form = new FormData();
  form.append('photo', file);
  const res = await apiFetch(`/photos/${dayKey}`, { method: 'POST', body: form });
  if (!res) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Errore durante il caricamento');
  }
  return res.json();
}

// ---- UI ----
function setCardState(card, photo, isToday, isMyCard) {
  const badge = card.querySelector('.status-badge');
  const preview = card.querySelector('.preview');
  const placeholder = card.querySelector('.placeholder');
  const input = card.querySelector('input[type="file"]');

  if (photo && photo.url) {
    card.classList.add('uploaded');
    preview.src = photo.url;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    if (isMyCard && isToday) {
      badge.textContent = 'Caricata · tocca per cambiare';
      input.disabled = false;
    } else {
      badge.textContent = 'Caricata ✓';
      input.disabled = true;
    }
  } else {
    card.classList.remove('uploaded');
    preview.style.display = 'none';
    preview.src = '';
    placeholder.style.display = '';
    badge.textContent = isMyCard && isToday ? 'In attesa' : (isToday ? 'Non ancora' : 'Non caricata');
    input.disabled = !(isMyCard && isToday);
  }
}

function setLoading(card, loading) {
  const badge = card.querySelector('.status-badge');
  card.classList.toggle('loading', loading);
  if (loading) badge.textContent = 'Caricamento…';
}

function refreshProgress(photos) {
  const count = Object.values(photos).filter(p => p && p.url).length;
  document.getElementById('progressText').textContent = `${count}/2 foto caricate`;
}

// ---- Setup dialog ----
function showSetupDialog() {
  const overlay = document.createElement('div');
  overlay.id = 'setup-overlay';
  overlay.innerHTML = `
    <div class="setup-modal">
      <h2>Chi sei?</h2>
      <p>Seleziona il tuo profilo e inserisci il token che ti è stato condiviso.</p>
      <div class="setup-users">
        <button class="setup-user-btn" data-user="userA">Emily</button>
        <button class="setup-user-btn" data-user="userB">Riccardo</button>
      </div>
      <input class="setup-token-input" type="password" placeholder="Token di accesso" autocomplete="off" />
      <button class="setup-confirm-btn" disabled>Entra</button>
      <p class="setup-error"></p>
    </div>
  `;
  document.body.appendChild(overlay);

  let selectedUser = null;
  const confirmBtn = overlay.querySelector('.setup-confirm-btn');
  const tokenInput = overlay.querySelector('.setup-token-input');
  const errorEl = overlay.querySelector('.setup-error');

  overlay.querySelectorAll('.setup-user-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('.setup-user-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedUser = btn.dataset.user;
      confirmBtn.disabled = !(selectedUser && tokenInput.value.trim());
    });
  });

  tokenInput.addEventListener('input', () => {
    confirmBtn.disabled = !(selectedUser && tokenInput.value.trim());
  });

  confirmBtn.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Verifica…';
    errorEl.textContent = '';
    try {
      const res = await fetch(`${API_URL}/photos/${getDayKey(new Date())}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        errorEl.textContent = 'Token non valido. Riprova.';
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Entra';
        return;
      }
      saveAuth(token, selectedUser);
      overlay.remove();
      initApp();
    } catch {
      errorEl.textContent = 'Impossibile contattare il server.';
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Entra';
    }
  });
}

// ---- Main app ----
function initApp() {
  const myUserId = getMyUserId();
  const todayDate = toStartOfDay(new Date());
  let selectedDate = toStartOfDay(new Date());
  let currentPhotos = {};

  const cards = Array.from(document.querySelectorAll('.upload-card'));
  const labelEl = document.getElementById('todayLabel');
  const hintEl = document.getElementById('viewingHint');
  const prevDayBtn = document.getElementById('prevDayBtn');
  const nextDayBtn = document.getElementById('nextDayBtn');

  async function renderDay() {
    const dayKey = getDayKey(selectedDate);
    const isToday = isSameDay(selectedDate, todayDate);

    labelEl.textContent = getDayLabel(selectedDate);
    hintEl.textContent = isToday ? 'Carica la tua foto di oggi' : 'Storico — caricamento disabilitato';
    nextDayBtn.disabled = isToday;

    cards.forEach(card => setLoading(card, true));
    currentPhotos = await fetchPhotos(dayKey);
    cards.forEach(card => {
      const userId = card.getAttribute('data-user-id');
      setLoading(card, false);
      setCardState(card, currentPhotos[userId], isToday, userId === myUserId);
    });
    refreshProgress(currentPhotos);
  }

  prevDayBtn.addEventListener('click', () => {
    selectedDate = toStartOfDay(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() - 1));
    renderDay();
  });
  nextDayBtn.addEventListener('click', () => {
    if (isSameDay(selectedDate, todayDate)) return;
    selectedDate = toStartOfDay(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + 1));
    renderDay();
  });

  cards.forEach(card => {
    const userId = card.getAttribute('data-user-id');
    const input = card.querySelector('input[type="file"]');
    input.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (!isSameDay(selectedDate, todayDate) || userId !== myUserId) { input.value = ''; return; }

      setLoading(card, true);
      try {
        const dayKey = getDayKey(selectedDate);
        await uploadPhoto(file, dayKey);
        currentPhotos = await fetchPhotos(dayKey);
        setLoading(card, false);
        setCardState(card, currentPhotos[userId], true, true);
        refreshProgress(currentPhotos);
      } catch (err) {
        setLoading(card, false);
        setCardState(card, currentPhotos[userId], true, true);
        alert(err.message || 'Errore durante il caricamento');
      }
      input.value = '';
    });
  });

  // Doppio click sull'header per logout (nascosto)
  document.querySelector('header h1')?.addEventListener('dblclick', () => {
    if (confirm('Disconnetti questo dispositivo?')) { clearAuth(); location.reload(); }
  });

  renderDay();
}

// ---- Entry point ----
document.addEventListener('DOMContentLoaded', () => {
  if (!getToken() || !getMyUserId()) showSetupDialog();
  else initApp();
});