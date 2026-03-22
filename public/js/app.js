// ========== STATE ==========
let games = [];
let token = localStorage.getItem('admin_token') || null;
let currentView = 'home'; // home | detail | admin
let partCount = 1;
let activeTab = 'game'; // 'game' | 'software'

// Detect mode: local (admin) vs deployed (read-only)
const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/NguyenMinhKhoiSE172625/GameHub/main/data/games.json';

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
  if (!isLocal) {
    // Deployed mode: hide admin button, clear token
    document.getElementById('btnAdmin').style.display = 'none';
    token = null;
  }
  updateAdminBtn();
  loadGames();
});

// ========== API HELPERS ==========
async function api(method, url, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  if (res.status === 401 && url !== '/api/login') {
    token = null;
    localStorage.removeItem('admin_token');
    updateAdminBtn();
    showToast('Phiên đăng nhập hết hạn', 'error');
  }
  return res;
}

// ========== GAMES ==========
async function loadGames() {
  try {
    if (isLocal) {
      const res = await api('GET', '/api/games');
      games = await res.json();
    } else {
      // Deployed: fetch from GitHub raw
      const res = await fetch(GITHUB_RAW_URL + '?t=' + Date.now());
      games = await res.json();
    }
    updateTabCounts();
    renderGames();
    if (currentView === 'admin') renderAdminList();
  } catch {
    showToast('Không thể tải danh sách game', 'error');
  }
}

function switchTab(tab) {
  activeTab = tab;
  document.getElementById('tabGame').classList.toggle('active', tab === 'game');
  document.getElementById('tabSoftware').classList.toggle('active', tab === 'software');
  document.getElementById('searchInput').placeholder = tab === 'game' ? 'Tìm game...' : 'Tìm software...';
  renderGames();
  if (currentView === 'admin') {
    document.getElementById('adminTitle').textContent = tab === 'game' ? '⚙️ Quản lý Games' : '⚙️ Quản lý Software';
    renderAdminList();
  }
}

function updateTabCounts() {
  const gc = games.filter(g => (g.type || 'game') === 'game').length;
  const sc = games.filter(g => (g.type || 'game') === 'software').length;
  document.getElementById('countGame').textContent = gc;
  document.getElementById('countSoftware').textContent = sc;
}

function getFilteredItems() {
  const query = document.getElementById('searchInput').value.toLowerCase().trim();
  let filtered = games.filter(g => (g.type || 'game') === activeTab);
  if (query) {
    filtered = filtered.filter(g =>
      g.name.toLowerCase().includes(query) ||
      (g.genres || []).some(t => t.toLowerCase().includes(query))
    );
  }
  return { filtered, query };
}

function renderGames() {
  const grid = document.getElementById('gamesGrid');
  const empty = document.getElementById('emptyState');
  const { filtered, query } = getFilteredItems();
  const icon = activeTab === 'game' ? '🎮' : '💻';
  const label = activeTab === 'game' ? 'game' : 'software';

  if (filtered.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    if (query) {
      empty.querySelector('h3').textContent = 'Không tìm thấy ' + label;
      empty.querySelector('p').textContent = `Không có kết quả cho "${query}"`;
    } else {
      empty.querySelector('h3').textContent = 'Chưa có ' + label + ' nào';
      empty.querySelector('p').textContent = 'Admin hãy đăng nhập để thêm mới';
    }
    empty.querySelector('.empty-icon').textContent = icon;
    return;
  }

  empty.style.display = 'none';
  grid.innerHTML = filtered.map(g => {
    const placeholder = (g.type || 'game') === 'software' ? '💻' : '🎮';
    return `
    <div class="game-card" onclick="showDetail('${g.id}')">
      <div class="card-img-wrapper">
        ${g.image
          ? `<img class="card-image" src="${escHtml(g.image)}" alt="${escHtml(g.name)}" onerror="this.outerHTML='<div class=\\'card-placeholder\\'>${placeholder}</div>'">`
          : `<div class="card-placeholder">${placeholder}</div>`
        }
        <span class="card-parts-count">${g.parts?.length || 0} nguồn</span>
        <span class="card-source">${escHtml(g.source || '')}</span>
      </div>
      <div class="card-body">
        <div class="card-title">${escHtml(g.name)}</div>
        ${g.releaseDate ? `<div class="card-date">📅 ${formatDate(g.releaseDate)}</div>` : ''}
        <div class="card-genres">
          ${(g.genres || []).slice(0, 4).map(t => `<span class="genre-tag">${escHtml(t)}</span>`).join('')}
          ${(g.genres || []).length > 4 ? `<span class="genre-tag">+${g.genres.length - 4}</span>` : ''}
        </div>
      </div>
    </div>
  `}).join('');
}

function filterGames() {
  renderGames();
}

function renderDownloadLinks(parts) {
  if (!parts.length) return '';
  // Detect sections: names like "Bản Offline ... - Google Drive"
  const hasSection = parts.some(p => p.name && p.name.includes(' - '));
  if (!hasSection) {
    return parts.map((p, i) => `
      <a href="${escHtml(p.url)}" target="_blank" rel="noopener" class="download-btn">
        <span class="part-number">${escHtml(p.name || 'Link ' + (i + 1))}</span>
        <span class="part-url">${escHtml(p.url)}</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </a>
    `).join('');
  }
  // Group by section prefix
  const groups = [];
  let lastSection = null;
  for (const p of parts) {
    const dashIdx = p.name.indexOf(' - ');
    const section = dashIdx > -1 ? p.name.substring(0, dashIdx) : '';
    const hosting = dashIdx > -1 ? p.name.substring(dashIdx + 3) : p.name;
    if (section !== lastSection) {
      groups.push({ section, links: [] });
      lastSection = section;
    }
    groups[groups.length - 1].links.push({ hosting, url: p.url });
  }
  return groups.map(g => `
    ${g.section ? `<div class="download-group-header">${escHtml(g.section)}</div>` : ''}
    ${g.links.map((l, i) => `
      <a href="${escHtml(l.url)}" target="_blank" rel="noopener" class="download-btn">
        <span class="part-number">${escHtml(l.hosting)}</span>
        <span class="part-url">${escHtml(l.url)}</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </a>
    `).join('')}
  `).join('');
}

// ========== DETAIL VIEW ==========
function showDetail(id) {
  const game = games.find(g => g.id === id);
  if (!game) return;

  document.getElementById('homeView').style.display = 'none';
  document.getElementById('adminView').style.display = 'none';
  document.getElementById('detailView').style.display = 'block';
  document.getElementById('tabBar').style.display = 'none';
  currentView = 'detail';
  window.scrollTo(0, 0);

  const password = game.source || 'linkneverdie.com';

  document.getElementById('detailContent').innerHTML = `
    <div class="detail-hero">
      ${game.image
        ? `<img src="${escHtml(game.image)}" alt="${escHtml(game.name)}" onerror="this.outerHTML='<div class=\\'detail-hero-placeholder\\'>🎮</div>'">`
        : '<div class="detail-hero-placeholder">🎮</div>'
      }
    </div>

    <h1 class="detail-title">${escHtml(game.name)}</h1>

    <div class="detail-meta">
      ${game.releaseDate ? `<span>📅 ${formatDate(game.releaseDate)}</span>` : ''}
      <span>📦 ${game.parts?.length || 0} nguồn tải</span>
      <span>🔗 ${escHtml(game.source || '')}</span>
    </div>

    <div class="detail-genres">
      ${(game.genres || []).map(t => `<span class="genre-tag">${escHtml(t)}</span>`).join('')}
    </div>

    ${game.description ? `<p class="detail-description">${escHtml(game.description)}</p>` : ''}

    <!-- Download Links -->
    <div class="download-section">
      <h3>⬇️ Chọn Nguồn Tải</h3>
      <div class="download-links">
        ${renderDownloadLinks(game.parts || [])}
      </div>
      </div>
      ${(!game.parts || game.parts.length === 0) ? '<p style="color:var(--text-muted);">Chưa có link tải nào.</p>' : ''}
    </div>

    <!-- Instructions -->
    <div class="instructions-section">
      <h3>📖 Hướng Dẫn Giải Nén & Cài Đặt</h3>
      <ol class="instructions-list">
        <li>
          <span class="step-number">1</span>
          <div>Chọn <strong>một nguồn tải</strong> phía trên (Google Drive, AkiraBox, Ranoz...) và mở link.</div>
        </li>
        <li>
          <span class="step-number">2</span>
          <div>Tải <strong>tất cả file</strong> (Part 1, Part 2...) từ nguồn đó về máy, cho vào <strong>cùng một thư mục</strong>.</div>
        </li>
        <li>
          <span class="step-number">3</span>
          <div>
            Khi được hỏi mật khẩu giải nén, nhập:
            <div class="password-box">
              <span class="password-text" id="pwText_${game.id}">${escHtml(password)}</span>
              <button class="btn-copy" onclick="copyPassword('${game.id}', event)">📋 Copy</button>
            </div>
          </div>
        </li>
        <li>
          <span class="step-number">4</span>
          <div>Click chuột phải vào file <strong>Part 1</strong> → chọn <strong>"Extract Here"</strong> hoặc <strong>"Giải nén tại đây"</strong> (dùng WinRAR hoặc 7-Zip).</div>
        </li>
        <li>
          <span class="step-number">5</span>
          <div>Sau khi giải nén xong, mở thư mục game và chạy file <strong>.exe</strong> để cài đặt hoặc chơi game.</div>
        </li>
      </ol>
      <div style="margin-top: 16px; padding: 12px 16px; background: rgba(255, 167, 38, 0.1); border: 1px solid rgba(255, 167, 38, 0.3); border-radius: 8px; font-size: 0.85rem; color: var(--warning);">
        ⚠️ <strong>Lưu ý:</strong> Chỉ cần tải từ <strong>1 nguồn</strong> (các nguồn chứa cùng nội dung). Chỉ giải nén Part 1, các Part còn lại sẽ tự động được giải nén theo.
      </div>
    </div>
  `;
}

function copyPassword(gameId, event) {
  event.stopPropagation();
  const el = document.getElementById(`pwText_${gameId}`);
  if (el) {
    navigator.clipboard.writeText(el.textContent).then(() => {
      showToast('Đã copy mật khẩu!', 'success');
    }).catch(() => {
      // Fallback
      const range = document.createRange();
      range.selectNode(el);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      document.execCommand('copy');
      window.getSelection().removeAllRanges();
      showToast('Đã copy mật khẩu!', 'success');
    });
  }
}

// ========== HOME VIEW ==========
function showHome() {
  document.getElementById('homeView').style.display = 'block';
  document.getElementById('tabBar').style.display = 'flex';
  document.getElementById('detailView').style.display = 'none';
  document.getElementById('adminView').style.display = 'none';
  currentView = 'home';
  renderGames();
}

// ========== ADMIN ==========
function toggleAdmin() {
  if (token) {
    // Already logged in
    if (currentView === 'admin') {
      showHome();
      document.getElementById('btnAdmin').classList.remove('active');
    } else {
      showAdminView();
    }
  } else {
    document.getElementById('loginModal').classList.add('show');
    document.getElementById('loginUser').focus();
  }
}

function closeLogin() {
  document.getElementById('loginModal').classList.remove('show');
  document.getElementById('loginError').textContent = '';
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPass').value = '';
}

async function doLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUser').value;
  const password = document.getElementById('loginPass').value;

  try {
    const res = await api('POST', '/api/login', { username, password });
    const data = await res.json();

    if (res.ok) {
      token = data.token;
      localStorage.setItem('admin_token', token);
      closeLogin();
      updateAdminBtn();
      showAdminView();
      showToast('Đăng nhập thành công!', 'success');
    } else {
      document.getElementById('loginError').textContent = data.error;
    }
  } catch {
    document.getElementById('loginError').textContent = 'Lỗi kết nối server';
  }
}

function logout() {
  api('POST', '/api/logout');
  token = null;
  localStorage.removeItem('admin_token');
  updateAdminBtn();
  showHome();
  showToast('Đã đăng xuất', 'success');
}

function updateAdminBtn() {
  const btn = document.getElementById('btnAdmin');
  const text = document.getElementById('adminBtnText');
  if (token) {
    btn.classList.add('active');
    text.textContent = 'Admin Panel';
  } else {
    btn.classList.remove('active');
    text.textContent = 'Admin';
  }
}

function showAdminView() {
  document.getElementById('homeView').style.display = 'none';
  document.getElementById('detailView').style.display = 'none';
  document.getElementById('adminView').style.display = 'block';
  document.getElementById('tabBar').style.display = 'flex';
  document.getElementById('btnAdmin').classList.add('active');
  currentView = 'admin';
  document.getElementById('adminTitle').textContent = activeTab === 'game' ? '⚙️ Quản lý Games' : '⚙️ Quản lý Software';
  renderAdminList();
}

function renderAdminList() {
  const list = document.getElementById('adminGamesList');

  const items = games.filter(g => (g.type || 'game') === activeTab);
  const label = activeTab === 'game' ? 'game' : 'software';

  if (items.length === 0) {
    list.innerHTML = `
      <div style="text-align:center; padding:40px; color:var(--text-muted);">
        Chưa có ${label} nào. Hãy thêm mới!
      </div>`;
    return;
  }

  list.innerHTML = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:12px;">
      <button class="btn-danger" style="font-size:0.8rem;" onclick="logout()">🚪 Đăng xuất</button>
    </div>
  ` + items.map(g => {
    const placeholder = (g.type || 'game') === 'software' ? '💻' : '🎮';
    return `
    <div class="admin-game-item">
      ${g.image
        ? `<img class="admin-game-thumb" src="${escHtml(g.image)}" alt="" onerror="this.style.display='none'">`
        : `<div class="admin-game-thumb" style="display:flex;align-items:center;justify-content:center;font-size:1.2rem;">${placeholder}</div>`
      }
      <div class="admin-game-info">
        <div class="name">${escHtml(g.name)}</div>
        <div class="meta">
          ${g.parts?.length || 0} nguồn • ${escHtml(g.source || '')}
          ${g.notepadUrl ? ' • 🔗 auto-sync' : ''}
          ${g.lastSync ? ' • ⏱ ' + new Date(g.lastSync).toLocaleString('vi-VN') : ''}
          ${g.syncStatus === 'success' ? ' ✅' : (g.syncStatus && g.syncStatus !== 'success' ? ' ❌' : '')}
        </div>
      </div>
      <div class="admin-game-actions">
        ${g.notepadUrl ? `<button class="btn-edit" onclick="syncOneGame('${g.id}')" style="color:var(--success);border-color:var(--success);">🔄 Sync</button>` : ''}
        <button class="btn-edit" onclick="editGame('${g.id}')">✏️ Sửa</button>
        <button class="btn-danger" onclick="deleteGame('${g.id}')">🗑️ Xoá</button>
      </div>
    </div>
  `}).join('');
}

// ========== ADD / EDIT FORM ==========
function showAddForm() {
  document.getElementById('adminFormWrapper').style.display = 'block';
  document.getElementById('formTitle').textContent = activeTab === 'game' ? 'Thêm Game Mới' : 'Thêm Software Mới';
  document.getElementById('editingId').value = '';
  document.getElementById('gameName').value = '';
  document.getElementById('gameDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('gameImage').value = '';
  document.getElementById('gameGenres').value = '';
  document.getElementById('gameDesc').value = '';
  document.querySelector('input[name="source"][value="linkneverdie.com"]').checked = true;
  partCount = 0;
  document.getElementById('partsContainer').innerHTML = '';
  document.getElementById('gameNotepadUrl').value = '';
  document.getElementById('gameAutoSync').checked = false;
  document.getElementById('gameName').focus();
  document.getElementById('adminFormWrapper').scrollIntoView({ behavior: 'smooth' });
}

function editGame(id) {
  const game = games.find(g => g.id === id);
  if (!game) return;

  document.getElementById('adminFormWrapper').style.display = 'block';
  document.getElementById('formTitle').textContent = 'Chỉnh Sửa Game';
  document.getElementById('editingId').value = id;
  document.getElementById('gameName').value = game.name;
  document.getElementById('gameDate').value = game.releaseDate || '';
  document.getElementById('gameImage').value = game.image || '';
  document.getElementById('gameGenres').value = (game.genres || []).join(', ');
  document.getElementById('gameDesc').value = game.description || '';

  const sourceRadio = document.querySelector(`input[name="source"][value="${game.source}"]`);
  if (sourceRadio) sourceRadio.checked = true;
  document.getElementById('gameNotepadUrl').value = game.notepadUrl || '';
  document.getElementById('gameAutoSync').checked = game.autoSync || false;

  partCount = 0;
  document.getElementById('partsContainer').innerHTML = '';
  (game.parts || []).forEach(p => {
    addPartInput(p.name, p.url);
  });
  if ((game.parts || []).length === 0) addPartInput();

  document.getElementById('adminFormWrapper').scrollIntoView({ behavior: 'smooth' });
}

function cancelForm() {
  document.getElementById('adminFormWrapper').style.display = 'none';
}

function addPartInput(name, url) {
  partCount++;
  const container = document.getElementById('partsContainer');
  const row = document.createElement('div');
  row.className = 'part-input-row';
  row.innerHTML = `
    <span class="part-label">Part ${partCount}</span>
    <input type="text" placeholder="Tên (tuỳ chọn)" value="${escAttr(name || '')}">
    <input type="url" placeholder="URL link tải" value="${escAttr(url || '')}">
    <button type="button" class="btn-remove-part" onclick="removePart(this)" title="Xoá">&times;</button>
  `;
  container.appendChild(row);
}

function removePart(btn) {
  const container = document.getElementById('partsContainer');
  if (container.children.length <= 0) return;
  btn.closest('.part-input-row').remove();
  // Re-number
  Array.from(container.children).forEach((row, i) => {
    row.querySelector('.part-label').textContent = `Part ${i + 1}`;
  });
  partCount = container.children.length;
}

async function saveGame(e) {
  e.preventDefault();

  const id = document.getElementById('editingId').value;
  const name = document.getElementById('gameName').value.trim();
  const releaseDate = document.getElementById('gameDate').value || new Date().toISOString().slice(0, 10);
  const image = document.getElementById('gameImage').value.trim();
  const genresStr = document.getElementById('gameGenres').value.trim();
  const genres = genresStr ? genresStr.split(',').map(s => s.trim()).filter(Boolean) : [];
  const source = document.querySelector('input[name="source"]:checked').value;
  const description = document.getElementById('gameDesc').value.trim();

  const partRows = document.querySelectorAll('#partsContainer .part-input-row');
  const parts = [];
  for (const row of partRows) {
    const inputs = row.querySelectorAll('input');
    const pName = inputs[0].value.trim();
    const pUrl = inputs[1].value.trim();
    if (pUrl) {
      parts.push({ name: pName || `Part ${parts.length + 1}`, url: pUrl });
    }
  }

  const notepadUrl = document.getElementById('gameNotepadUrl').value.trim();
  const autoSync = document.getElementById('gameAutoSync').checked;
  const body = { name, releaseDate, image, genres, source, description, parts, notepadUrl, autoSync, type: activeTab };

  try {
    let res;
    if (id) {
      res = await api('PUT', `/api/games/${id}`, body);
    } else {
      res = await api('POST', '/api/games', body);
    }

    if (res.ok) {
      const saved = await res.json();
      showToast(id ? 'Đã cập nhật!' : 'Đã thêm mới!', 'success');
      cancelForm();
      await loadGames();

      // Auto-sync if notepadUrl is set and no parts yet
      if (notepadUrl && (!parts || parts.length === 0)) {
        showToast('Đang tự động sync link tải...', '');
        await syncOneGame(saved.id);
      }
    } else {
      const err = await res.json();
      showToast(err.error || 'Lỗi lưu game', 'error');
    }
  } catch {
    showToast('Lỗi kết nối server', 'error');
  }
}

async function deleteGame(id) {
  const game = games.find(g => g.id === id);
  if (!confirm(`Xoá game "${game?.name}"?`)) return;

  try {
    const res = await api('DELETE', `/api/games/${id}`);
    if (res.ok) {
      showToast('Đã xoá game!', 'success');
      await loadGames();
    }
  } catch {
    showToast('Lỗi xoá game', 'error');
  }
}

// ========== UTILS ==========
function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast show ' + type;
  setTimeout(() => { toast.className = 'toast'; }, 3000);
}

// ========== SYNC ==========
async function syncOneGame(id) {
  showToast('Đang sync...', '');
  try {
    const res = await api('POST', `/api/games/${id}/sync`);
    const data = await res.json();
    if (res.ok && data.syncStatus === 'success') {
      showToast(`Sync thành công! ${data.parts?.length || 0} nguồn tải`, 'success');
    } else {
      showToast(data.syncStatus || data.error || 'Sync thất bại', 'error');
    }
    await loadGames();
  } catch {
    showToast('Lỗi kết nối server', 'error');
  }
}

async function syncAllGames() {
  if (!confirm('Sync tất cả game có notepad URL?')) return;
  showToast('Đang sync tất cả game...', '');
  try {
    const res = await api('POST', '/api/sync-all');
    const data = await res.json();
    if (res.ok) {
      showToast(`Sync xong: ${data.synced} OK, ${data.failed} lỗi`, data.failed ? 'error' : 'success');
    } else {
      showToast(data.error || 'Sync thất bại', 'error');
    }
    await loadGames();
  } catch {
    showToast('Lỗi kết nối server', 'error');
  }
}

// ========== CONFIG MODAL ==========
function showConfigModal() {
  document.getElementById('configModal').classList.add('show');
  loadConfig();
}

function closeConfigModal() {
  document.getElementById('configModal').classList.remove('show');
}

async function loadConfig() {
  try {
    const res = await api('GET', '/api/config');
    if (res.ok) {
      const cfg = await res.json();
      document.getElementById('cfgHadoanUser').value = cfg.hadoantv?.username || '';
      document.getElementById('cfgHadoanPass').value = '';
      document.getElementById('cfgHadoanPass').placeholder = cfg.hadoantv?.hasPassword ? '(đã lưu, để trống giữ cũ)' : 'nhập password';
      document.getElementById('cfgLndUser').value = cfg.linkneverdie?.username || '';
      document.getElementById('cfgLndPass').value = '';
      document.getElementById('cfgLndPass').placeholder = cfg.linkneverdie?.hasPassword ? '(đã lưu, để trống giữ cũ)' : 'nhập password';
      document.getElementById('cfgGithubRepo').value = cfg.github?.repo || '';
      document.getElementById('cfgGithubToken').value = '';
      document.getElementById('cfgGithubToken').placeholder = cfg.github?.hasToken ? '(đã lưu, để trống giữ cũ)' : 'ghp_xxxx...';
    }
  } catch {}
}

async function saveConfig(e) {
  e.preventDefault();
  const body = {};
  const hadoanUser = document.getElementById('cfgHadoanUser').value.trim();
  const hadoanPass = document.getElementById('cfgHadoanPass').value;
  const lndUser = document.getElementById('cfgLndUser').value.trim();
  const lndPass = document.getElementById('cfgLndPass').value;
  if (hadoanUser) body.hadoantv = { username: hadoanUser, password: hadoanPass || undefined };
  if (lndUser) body.linkneverdie = { username: lndUser, password: lndPass || undefined };
  const ghRepo = document.getElementById('cfgGithubRepo').value.trim();
  const ghToken = document.getElementById('cfgGithubToken').value;
  if (ghRepo) body.github = { repo: ghRepo, token: ghToken || undefined };
  try {
    const res = await api('PUT', '/api/config', body);
    if (res.ok) {
      showToast('Đã lưu cấu hình!', 'success');
      closeConfigModal();
    }
  } catch {
    showToast('Lỗi lưu cấu hình', 'error');
  }
}
