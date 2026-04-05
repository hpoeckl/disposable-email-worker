export function renderDashboard(): Response {
  return new Response(HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Disposable Email Gateway</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect x='5' y='25' width='90' height='55' rx='4' fill='none' stroke='%236c8aff' stroke-width='6'/><polyline points='5,25 50,58 95,25' fill='none' stroke='%236c8aff' stroke-width='6'/></svg>">
<style>
  :root {
    --bg: #0f1117;
    --surface: #1a1d27;
    --border: #2a2d3a;
    --text: #e1e4ed;
    --muted: #8b8fa3;
    --accent: #6c8aff;
    --accent-hover: #849dff;
    --danger: #ff6b6b;
    --success: #51cf66;
    --warn: #ffd43b;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
    background: var(--bg);
    color: var(--text);
    line-height: 1.5;
    padding: 1rem;
    max-width: 960px;
    margin: 0 auto;
  }
  h1 { font-size: 1.3rem; margin-bottom: 1rem; }
  h2 { font-size: 1.1rem; margin-bottom: 0.75rem; color: var(--accent); }

  /* Tabs */
  .tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--border);
    margin-bottom: 1rem;
    overflow-x: auto;
  }
  .tab {
    padding: 0.5rem 1rem;
    cursor: pointer;
    border: none;
    background: none;
    color: var(--muted);
    font-size: 0.85rem;
    font-family: inherit;
    border-bottom: 2px solid transparent;
    white-space: nowrap;
  }
  .tab:hover { color: var(--text); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  .panel { display: none; }
  .panel.active { display: block; }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
    margin-bottom: 1rem;
  }
  th, td {
    text-align: left;
    padding: 0.4rem 0.6rem;
  }
  tr { border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; }
  tr:hover { background: var(--surface); }

  /* Badges */
  .badge {
    display: inline-block;
    padding: 0.15rem 0.4rem;
    border-radius: 3px;
    font-size: 0.7rem;
    font-weight: 600;
  }
  .badge-active { background: #1a3a1a; color: var(--success); }
  .badge-inactive { background: #3a1a1a; color: var(--danger); }
  .badge-expired { background: #3a3a1a; color: var(--warn); }

  /* Buttons */
  button, .btn {
    padding: 0.35rem 0.7rem;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8rem;
    font-family: inherit;
  }
  button:hover, .btn:hover { border-color: var(--accent); }
  .btn-sm { padding: 0.2rem 0.4rem; font-size: 0.7rem; }
  .btn-danger { color: var(--danger); }
  .btn-danger:hover { border-color: var(--danger); }
  .btn-accent { background: var(--accent); color: #fff; border-color: var(--accent); }
  .btn-accent:hover { background: var(--accent-hover); }

  /* Forms */
  input, select {
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    border-radius: 4px;
    font-size: 0.8rem;
    font-family: inherit;
  }
  input:focus, select:focus { outline: none; border-color: var(--accent); }
  .form-row { display: flex; gap: 0.5rem; margin-bottom: 0.75rem; align-items: center; flex-wrap: wrap; }
  label { font-size: 0.8rem; color: var(--muted); min-width: 80px; }

  /* Utility */
  .muted { color: var(--muted); }
  .mono { font-family: monospace; font-size: 0.8rem; }
  .mt { margin-top: 1rem; }
  .empty { color: var(--muted); font-style: italic; font-size: 0.85rem; padding: 1rem 0; }
  .actions { display: flex; gap: 0.3rem; }

  /* Drag and drop */
  .drag-handle { cursor: grab; color: var(--muted); user-select: none; font-size: 1rem; }
  .drag-handle:active { cursor: grabbing; }
  tr.dragging { opacity: 0.4; }
  tr.drag-over { border-top: 2px solid var(--accent); }

  /* Admin bar */
  .admin-bar {
    display: none;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.4rem 0.8rem;
    margin-bottom: 1rem;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
  }
  .admin-bar.visible { display: flex; }
  .admin-bar label { min-width: auto; color: var(--warn); font-weight: 600; }

  /* Search */
  .search-row {
    margin-bottom: 0.5rem;
  }
  .search-row input {
    width: 100%;
    max-width: 300px;
  }

  /* Modal */
  .modal-overlay {
    display: none;
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.6);
    z-index: 100;
    align-items: center;
    justify-content: center;
  }
  .modal-overlay.active { display: flex; }
  .modal {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
    min-width: 320px;
    max-width: 500px;
    width: 90%;
  }
  .modal h3 { margin-bottom: 1rem; font-size: 1rem; }
  .modal .form-row:last-of-type { margin-bottom: 1rem; }

  /* Toast */
  #toast {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-size: 0.8rem;
    display: none;
    z-index: 200;
  }
  #toast.error { background: #3a1a1a; color: var(--danger); display: block; }
  #toast.success { background: #1a3a1a; color: var(--success); display: block; }

  /* Responsive table wrapper */
  .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }

  /* Mobile */
  @media (max-width: 640px) {
    body { padding: 0.5rem; }
    h1 { font-size: 1.1rem; }
    .tabs { gap: 0; }
    .tab { padding: 0.4rem 0.6rem; font-size: 0.75rem; }
    .form-row { flex-direction: column; align-items: stretch; }
    .form-row input, .form-row select, .form-row button { width: 100%; }
    label { min-width: auto; }
    .admin-bar { flex-direction: column; align-items: stretch; }
    .admin-bar select { width: 100%; }
    .modal { min-width: auto; width: 95%; padding: 1rem; }
    .search-row input { max-width: 100%; }
    table { font-size: 0.7rem; }
    th, td { padding: 0.3rem 0.4rem; }
    .actions { flex-wrap: wrap; }
  }
</style>
</head>
<body>

<h1>Disposable Email Gateway</h1>

<div id="admin-bar" class="admin-bar">
  <label>ADMIN</label>
  <span>View as:</span>
  <select id="admin-user-select" onchange="onAdminUserChange()">
    <option value="">All users</option>
  </select>
</div>

<div class="tabs">
  <button class="tab active" data-tab="aliases">Aliases</button>
  <button class="tab" data-tab="rules">Rules</button>
  <button class="tab" data-tab="recipients">Recipients</button>
  <button class="tab" data-tab="deliveries">Failed Deliveries</button>
  <button class="tab" data-tab="settings">Settings</button>
  <button class="tab" data-tab="users" id="users-tab" style="display:none">Users</button>
</div>

<!-- ALIASES -->
<div id="aliases" class="panel active">
  <div class="form-row">
    <input id="new-alias-tag" placeholder="tag" style="width:120px">
    <input id="new-alias-limit" type="number" value="24" style="width:60px">
    <input id="new-alias-desc" placeholder="description (optional)" style="flex:1;min-width:120px">
    <input id="new-alias-user" placeholder="user (admin)" style="width:100px;display:none">
    <button class="btn-accent" onclick="createAlias()">Create</button>
  </div>
  <div class="search-row">
    <input id="alias-search" placeholder="Filter aliases..." oninput="filterAliases()">
  </div>
  <div class="table-wrap"><table>
    <thead><tr><th>Tag</th><th>User</th><th>Description</th><th>Count</th><th>WL</th><th>Status</th><th>Last Forward</th><th>Actions</th></tr></thead>
    <tbody id="aliases-body"></tbody>
  </table></div>
</div>

<!-- RULES -->
<div id="rules" class="panel">
  <div class="form-row">
    <button class="btn-accent" onclick="showRuleModal()">New Rule</button>
    <span id="rules-user-label" class="muted" style="display:none"></span>
  </div>
  <div class="table-wrap"><table class="mt">
    <thead><tr><th></th><th>Pri</th><th>Name</th><th>Conditions</th><th>Action</th><th>Hits</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody id="rules-body"></tbody>
  </table></div>
</div>

<!-- RECIPIENTS -->
<div id="recipients" class="panel">
  <div class="form-row">
    <input id="new-recipient" placeholder="email@example.com" style="flex:1">
    <button class="btn-accent" onclick="addRecipient()">Add</button>
    <button class="btn-sm" onclick="syncRecipients()">Sync CF</button>
    <span id="recipients-user-label" class="muted" style="display:none"></span>
  </div>
  <div class="table-wrap"><table>
    <thead><tr><th>Email</th><th>Verified</th><th>Default</th><th>Added</th><th>Actions</th></tr></thead>
    <tbody id="recipients-body"></tbody>
  </table></div>
</div>

<!-- FAILED DELIVERIES -->
<div id="deliveries" class="panel">
  <div class="form-row">
    <button class="btn-sm" onclick="purgeDeliveries()">Purge >30 days</button>
  </div>
  <div class="search-row">
    <input id="delivery-search" placeholder="Filter deliveries..." oninput="filterDeliveries()">
  </div>
  <div class="table-wrap"><table>
    <thead><tr><th>Date</th><th id="del-user-th" style="display:none">User</th><th>Alias</th><th>Sender</th><th>Subject</th><th>Reason</th><th></th></tr></thead>
    <tbody id="deliveries-body"></tbody>
  </table></div>
</div>

<!-- SETTINGS -->
<div id="settings" class="panel">
  <div id="settings-user-label" class="muted" style="display:none;margin-bottom:0.5rem"></div>
  <div class="form-row"><label>Catch-all</label><select id="set-catchall"><option value="1">Enabled</option><option value="0">Disabled</option></select></div>
  <div class="form-row"><label>From format</label><select id="set-format">
    <option value="sender_count_alias">sender [n/m] via tag</option>
    <option value="sender_via_alias">sender via tag</option>
    <option value="count_subject">[n/m] subject</option>
    <option value="alias_only">tag only</option>
    <option value="noreply">noreply</option>
  </select></div>
  <div class="form-row"><label>Default limit</label><input id="set-limit" type="number" style="width:80px"></div>
  <div class="form-row"><label>Bandwidth</label><span id="set-bandwidth" class="mono"></span></div>
  <button class="btn-accent" onclick="saveSettings()">Save</button>
</div>

<!-- USERS (admin only) -->
<div id="users" class="panel">
  <div class="form-row">
    <input id="new-user" placeholder="username" style="width:200px">
    <button class="btn-accent" onclick="createUser()">Add User</button>
  </div>
  <div class="table-wrap"><table>
    <thead><tr><th>User</th><th>Aliases</th><th>Recipients</th><th>Rules</th><th>Bandwidth</th><th>First Alias</th><th>Actions</th></tr></thead>
    <tbody id="users-body"></tbody>
  </table></div>
</div>

<!-- WHITELIST MODAL -->
<div id="wl-modal" class="modal-overlay" onclick="if(event.target===this)closeWlModal()">
  <div class="modal">
    <h3>Whitelist — <span id="wl-alias-tag"></span></h3>
    <div class="form-row">
      <select id="wl-type"><option value="email">email</option><option value="domain">domain</option><option value="segment">segment</option></select>
      <input id="wl-pattern" placeholder="pattern" style="flex:1">
      <button class="btn-accent" onclick="addWlEntry()">Add</button>
    </div>
    <table><thead><tr><th>Type</th><th>Pattern</th><th></th></tr></thead>
    <tbody id="wl-body"></tbody></table>
  </div>
</div>

<!-- RULE MODAL -->
<div id="rule-modal" class="modal-overlay" onclick="if(event.target===this)closeRuleModal()">
  <div class="modal">
    <h3 id="rule-modal-title">New Rule</h3>
    <div id="rule-modal-user" class="form-row" style="display:none"><label style="color:var(--warn);min-width:auto">User:</label><span id="rule-modal-user-name" class="mono"></span></div>
    <div class="form-row"><label>Name</label><input id="rule-name" style="flex:1"></div>
    <div class="form-row"><label>Operator</label><select id="rule-op"><option value="and">AND</option><option value="or">OR</option></select></div>
    <div class="form-row"><label>Action</label><select id="rule-action"><option value="block">Block</option><option value="reject">Reject</option><option value="forward">Forward</option></select></div>
    <div class="form-row" id="rule-fwd-row"><label>Forward to</label><select id="rule-fwd" multiple style="flex:1;min-height:60px"></select></div>
    <h3 style="font-size:0.85rem;margin:0.5rem 0">Conditions</h3>
    <div id="rule-conditions"></div>
    <button class="btn-sm mt" onclick="addConditionRow()">+ Condition</button>
    <div class="mt"><button class="btn-accent" onclick="saveRule()">Save</button></div>
  </div>
</div>

<!-- ALIAS EDIT MODAL -->
<div id="alias-modal" class="modal-overlay" onclick="if(event.target===this)closeAliasModal()">
  <div class="modal">
    <h3>Edit Alias — <span id="alias-edit-tag"></span></h3>
    <div class="form-row"><label>Limit</label><input id="alias-edit-limit" type="number" style="width:80px"></div>
    <div class="form-row"><label>Description</label><input id="alias-edit-desc" style="flex:1"></div>
    <div class="form-row"><label>Active</label><select id="alias-edit-active"><option value="1">Yes</option><option value="0">No</option></select></div>
    <div class="form-row"><input type="checkbox" id="alias-edit-reset"><label for="alias-edit-reset" style="min-width:auto">Reset counter</label></div>
    <button class="btn-accent" onclick="saveAlias()">Save</button>
  </div>
</div>

<div id="toast"></div>

<script>
let currentUser = '';
let isAdmin = false;
let adminTargetUser = '';

function userParam() {
  return isAdmin && adminTargetUser ? '?user=' + encodeURIComponent(adminTargetUser) : '';
}

const api = (path, opts) => fetch('/api' + path, {
  headers: { 'Content-Type': 'application/json', ...opts?.headers },
  ...opts,
}).then(async r => {
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || r.statusText);
  return d;
});

// Tabs
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  document.getElementById(t.dataset.tab).classList.add('active');
}));

// Toast
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = type;
  setTimeout(() => el.className = '', 3000);
}

// Admin
async function initAdmin() {
  try {
    const me = await api('/me');
    currentUser = me.user;
    isAdmin = me.isAdmin;
    if (isAdmin) {
      document.getElementById('admin-bar').classList.add('visible');
      document.getElementById('new-alias-user').style.display = '';
      document.getElementById('del-user-th').style.display = '';
      document.getElementById('users-tab').style.display = '';
      // Populate user list from aliases + users table
      const [aliases, allUsers] = await Promise.all([api('/aliases'), api('/users').catch(() => [])]);
      const users = [...new Set([...aliases.map(a => a.user), ...allUsers.map(u => u.user)])].sort();
      const sel = document.getElementById('admin-user-select');
      users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u;
        opt.textContent = u;
        sel.appendChild(opt);
      });
    }
  } catch (e) {
    console.error('Failed to init admin:', e);
  }
}

function onAdminUserChange() {
  adminTargetUser = document.getElementById('admin-user-select').value;
  updateUserLabels();
  loadAll();
}

function updateUserLabels() {
  const target = adminTargetUser || currentUser;
  const labels = ['rules-user-label', 'recipients-user-label', 'settings-user-label'];
  labels.forEach(id => {
    const el = document.getElementById(id);
    if (isAdmin) {
      el.style.display = '';
      el.textContent = 'Acting as: ' + target;
    } else {
      el.style.display = 'none';
    }
  });
}

// --- ALIASES ---
let aliasesData = [];
async function loadAliases() {
  aliasesData = await api('/aliases' + userParam());
  renderAliases();
}

function renderAliases() {
  const search = (document.getElementById('alias-search').value || '').toLowerCase();
  const filtered = search
    ? aliasesData.filter(a => a.tag.toLowerCase().includes(search) || a.user.toLowerCase().includes(search) || (a.description || '').toLowerCase().includes(search))
    : aliasesData;
  const tb = document.getElementById('aliases-body');
  if (filtered.length === 0) { tb.innerHTML = '<tr><td colspan="8" class="empty">No aliases</td></tr>'; return; }
  tb.innerHTML = filtered.map(a => {
    const expired = a.forwarded >= a.limit;
    const status = !a.active ? '<span class="badge badge-inactive">disabled</span>'
      : expired ? '<span class="badge badge-expired">expired</span>'
      : '<span class="badge badge-active">active</span>';
    const wl = a.whitelist_count > 0 ? '<span class="badge badge-active">' + a.whitelist_count + '</span>' : '<span class="muted">—</span>';
    return \`<tr>
      <td class="mono">\${esc(a.tag)}</td>
      <td class="muted">\${esc(a.user)}</td>
      <td class="muted" style="font-size:0.75rem;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="\${esc(a.description || '')}">\${esc(a.description || '—')}</td>
      <td>\${a.forwarded}/\${a.limit}</td>
      <td>\${wl}</td>
      <td>\${status}</td>
      <td class="muted" style="font-size:0.75rem">\${fmtDate(a.last_forwarded_at)}</td>
      <td class="actions">
        <button class="btn-sm" onclick="editAlias('\${esc(a.tag)}','\${esc(a.user)}')">Edit</button>
        <button class="btn-sm" onclick="showWlModal('\${esc(a.tag)}','\${esc(a.user)}')">Whitelist</button>
        <button class="btn-sm btn-danger" onclick="delAlias('\${esc(a.tag)}','\${esc(a.user)}')">Del</button>
      </td>
    </tr>\`;
  }).join('');
}

function filterAliases() { renderAliases(); }

async function createAlias() {
  const tag = document.getElementById('new-alias-tag').value.trim();
  if (!tag) return;
  const body = {
    tag,
    limit: +document.getElementById('new-alias-limit').value,
    description: document.getElementById('new-alias-desc').value || undefined,
  };
  // Admin: prefer user field, fall back to dropdown, fall back to ?user= param
  const userField = document.getElementById('new-alias-user').value.trim();
  const targetUser = userField || adminTargetUser;
  const qp = (isAdmin && targetUser) ? '?user=' + encodeURIComponent(targetUser) : '';
  await api('/aliases' + qp, { method: 'POST', body: JSON.stringify(body) });
  document.getElementById('new-alias-tag').value = '';
  document.getElementById('new-alias-desc').value = '';
  document.getElementById('new-alias-user').value = '';
  toast('Alias created');
  loadAliases();
}

let editingAlias = null;
function editAlias(tag, user) {
  editingAlias = aliasesData.find(a => a.tag === tag && a.user === user);
  if (!editingAlias) return;
  document.getElementById('alias-edit-tag').textContent = tag + ' (' + user + ')';
  document.getElementById('alias-edit-limit').value = editingAlias.limit;
  document.getElementById('alias-edit-desc').value = editingAlias.description || '';
  document.getElementById('alias-edit-active').value = editingAlias.active;
  document.getElementById('alias-edit-reset').checked = false;
  document.getElementById('alias-modal').classList.add('active');
}
function closeAliasModal() { document.getElementById('alias-modal').classList.remove('active'); }

async function saveAlias() {
  if (!editingAlias) return;
  const qp = isAdmin ? '?user=' + encodeURIComponent(editingAlias.user) : '';
  await api('/aliases/' + editingAlias.tag + qp, { method: 'PATCH', body: JSON.stringify({
    limit: +document.getElementById('alias-edit-limit').value,
    description: document.getElementById('alias-edit-desc').value || null,
    active: document.getElementById('alias-edit-active').value === '1',
    reset_counter: document.getElementById('alias-edit-reset').checked,
  })});
  closeAliasModal();
  toast('Alias updated');
  loadAliases();
}

async function delAlias(tag, user) {
  if (!confirm('Delete alias ' + tag + '?')) return;
  const qp = isAdmin ? '?user=' + encodeURIComponent(user) : '';
  await api('/aliases/' + tag + qp, { method: 'DELETE' });
  toast('Alias deleted');
  loadAliases();
}

// --- WHITELIST ---
let wlAliasTag = '';
let wlAliasUser = '';
function showWlModal(tag, user) {
  wlAliasTag = tag;
  wlAliasUser = user;
  document.getElementById('wl-alias-tag').textContent = tag;
  document.getElementById('wl-modal').classList.add('active');
  loadWl();
}
function closeWlModal() { document.getElementById('wl-modal').classList.remove('active'); }

async function loadWl() {
  const qp = isAdmin ? '?user=' + encodeURIComponent(wlAliasUser) : '';
  const entries = await api('/aliases/' + wlAliasTag + '/whitelist' + qp);
  const tb = document.getElementById('wl-body');
  if (entries.length === 0) { tb.innerHTML = '<tr><td colspan="3" class="empty">No entries</td></tr>'; return; }
  tb.innerHTML = entries.map(e => \`<tr>
    <td>\${esc(e.type)}</td><td class="mono">\${esc(e.pattern)}</td>
    <td><button class="btn-sm btn-danger" onclick="delWl(\${e.id})">Del</button></td>
  </tr>\`).join('');
}

async function addWlEntry() {
  const type = document.getElementById('wl-type').value;
  const pattern = document.getElementById('wl-pattern').value.trim();
  if (!pattern) return;
  const qp = isAdmin ? '?user=' + encodeURIComponent(wlAliasUser) : '';
  await api('/aliases/' + wlAliasTag + '/whitelist' + qp, { method: 'POST', body: JSON.stringify({ type, pattern }) });
  document.getElementById('wl-pattern').value = '';
  toast('Entry added');
  loadWl();
}

async function delWl(id) {
  const qp = isAdmin ? '?user=' + encodeURIComponent(wlAliasUser) : '';
  await api('/aliases/' + wlAliasTag + '/whitelist/' + id + qp, { method: 'DELETE' });
  toast('Entry removed');
  loadWl();
}

// --- RULES ---
let rulesData = [];
async function loadRules() {
  const tb = document.getElementById('rules-body');
  if (isAdmin && !adminTargetUser) {
    rulesData = [];
    tb.innerHTML = '<tr><td colspan="8" class="empty">Select a user to view rules</td></tr>';
    return;
  }
  rulesData = await api('/rules' + userParam());
  if (rulesData.length === 0) { tb.innerHTML = '<tr><td colspan="8" class="empty">No rules</td></tr>'; return; }
  tb.innerHTML = rulesData.map(r => {
    const conds = r.conditions.map(c => \`\${c.field} \${c.match} "\${esc(c.value)}"\`).join(r.operator === 'and' ? ' AND ' : ' OR ');
    return \`<tr draggable="true" data-rule-id="\${r.id}">
      <td class="drag-handle" title="Drag to reorder">&#x2630;</td>
      <td>\${r.priority}</td>
      <td>\${esc(r.name)}</td>
      <td class="mono" style="font-size:0.7rem">\${conds}</td>
      <td>\${r.action}\${r.forward_to ? ' → ' + esc(r.forward_to) : ''}</td>
      <td>\${r.hit_count}</td>
      <td>\${r.active ? '<span class="badge badge-active">on</span>' : '<span class="badge badge-inactive">off</span>'}</td>
      <td class="actions">
        <button class="btn-sm" onclick="editRule(\${r.id})">Edit</button>
        <button class="btn-sm btn-danger" onclick="delRule(\${r.id})">Del</button>
      </td>
    </tr>\`;
  }).join('');
  initRuleDragDrop();
}

let editingRuleId = null;
function showRuleModal(id) {
  editingRuleId = id || null;
  const targetUser = adminTargetUser || currentUser;
  document.getElementById('rule-modal-title').textContent = id ? 'Edit Rule' : 'New Rule';
  if (isAdmin) {
    document.getElementById('rule-modal-user').style.display = '';
    document.getElementById('rule-modal-user-name').textContent = targetUser;
  } else {
    document.getElementById('rule-modal-user').style.display = 'none';
  }
  document.getElementById('rule-name').value = '';
  document.getElementById('rule-op').value = 'and';
  document.getElementById('rule-action').value = 'block';
  document.getElementById('rule-conditions').innerHTML = '';

  // Populate forward_to multi-select with verified recipients
  const fwdSel = document.getElementById('rule-fwd');
  const verified = recipientsData.filter(r => r.verified_at);
  fwdSel.innerHTML = verified.map(r => \`<option value="\${esc(r.email)}">\${esc(r.email)}</option>\`).join('');

  let selectedFwd = [];
  if (id) {
    const r = rulesData.find(x => x.id === id);
    if (r) {
      document.getElementById('rule-name').value = r.name;
      document.getElementById('rule-op').value = r.operator;
      document.getElementById('rule-action').value = r.action;
      selectedFwd = r.forward_to ? r.forward_to.split(',').map(e => e.trim()) : [];
      r.conditions.forEach(c => addConditionRow(c.field, c.match, c.value));
    }
  }
  // Set selected options
  [...fwdSel.options].forEach(o => { o.selected = selectedFwd.includes(o.value); });

  if (!document.getElementById('rule-conditions').children.length) addConditionRow();
  document.getElementById('rule-modal').classList.add('active');
}
function editRule(id) { showRuleModal(id); }
function closeRuleModal() { document.getElementById('rule-modal').classList.remove('active'); }

function addConditionRow(field, match, value) {
  const div = document.createElement('div');
  div.className = 'form-row';
  div.innerHTML = \`
    <select class="rc-field"><option value="sender">sender</option><option value="sender_domain">domain</option><option value="subject">subject</option><option value="alias_tag">alias tag</option></select>
    <select class="rc-match"><option value="equals">equals</option><option value="contains">contains</option><option value="starts_with">starts with</option><option value="ends_with">ends with</option><option value="regex">regex</option></select>
    <input class="rc-value" placeholder="value" style="flex:1" value="\${esc(value || '')}">
    <button class="btn-sm btn-danger" onclick="this.parentElement.remove()">X</button>
  \`;
  if (field) div.querySelector('.rc-field').value = field;
  if (match) div.querySelector('.rc-match').value = match;
  document.getElementById('rule-conditions').appendChild(div);
}

async function saveRule() {
  const name = document.getElementById('rule-name').value.trim();
  if (!name) return;
  const conditions = [...document.querySelectorAll('#rule-conditions .form-row')].map(row => ({
    field: row.querySelector('.rc-field').value,
    match: row.querySelector('.rc-match').value,
    value: row.querySelector('.rc-value').value,
  })).filter(c => c.value);
  if (conditions.length === 0) { toast('Add at least one condition', 'error'); return; }

  const body = {
    name,
    operator: document.getElementById('rule-op').value,
    action: document.getElementById('rule-action').value,
    forward_to: [...document.getElementById('rule-fwd').selectedOptions].map(o => o.value).join(',') || null,
    conditions,
  };

  if (editingRuleId) {
    await api('/rules/' + editingRuleId, { method: 'PATCH', body: JSON.stringify(body) });
    toast('Rule updated');
  } else {
    await api('/rules' + userParam(), { method: 'POST', body: JSON.stringify(body) });
    toast('Rule created');
  }
  closeRuleModal();
  loadRules();
}

async function delRule(id) {
  if (!confirm('Delete rule?')) return;
  await api('/rules/' + id, { method: 'DELETE' });
  toast('Rule deleted');
  loadRules();
}

// --- RULE DRAG & DROP ---
let dragSrcRow = null;
function initRuleDragDrop() {
  const rows = document.querySelectorAll('#rules-body tr[draggable]');
  rows.forEach(row => {
    row.addEventListener('dragstart', e => {
      dragSrcRow = row;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      rows.forEach(r => r.classList.remove('drag-over'));
      dragSrcRow = null;
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (row !== dragSrcRow) row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => {
      row.classList.remove('drag-over');
    });
    row.addEventListener('drop', async e => {
      e.preventDefault();
      row.classList.remove('drag-over');
      if (!dragSrcRow || row === dragSrcRow) return;
      const tbody = row.parentNode;
      const allRows = [...tbody.querySelectorAll('tr[draggable]')];
      const fromIdx = allRows.indexOf(dragSrcRow);
      const toIdx = allRows.indexOf(row);
      if (fromIdx < toIdx) {
        tbody.insertBefore(dragSrcRow, row.nextSibling);
      } else {
        tbody.insertBefore(dragSrcRow, row);
      }
      const newOrder = [...tbody.querySelectorAll('tr[draggable]')].map(r => +r.dataset.ruleId);
      try {
        await api('/rules/reorder' + userParam(), { method: 'POST', body: JSON.stringify({ rule_ids: newOrder }) });
        toast('Rules reordered');
        loadRules();
      } catch (err) {
        toast(err.message, 'error');
        loadRules();
      }
    });
  });
}

// --- RECIPIENTS ---
let recipientsData = [];
async function loadRecipients() {
  const tb = document.getElementById('recipients-body');
  if (isAdmin && !adminTargetUser) {
    recipientsData = [];
    tb.innerHTML = '<tr><td colspan="5" class="empty">Select a user to view recipients</td></tr>';
    return;
  }
  const recipients = await api('/recipients' + userParam());
  recipientsData = recipients;
  if (recipients.length === 0) { tb.innerHTML = '<tr><td colspan="5" class="empty">No recipients</td></tr>'; return; }
  tb.innerHTML = recipients.map(r => {
    const activeLabel = r.active ? '<span class="badge badge-active">yes</span>' : '<span class="badge badge-inactive">no</span>';
    return \`<tr>
      <td class="mono">\${esc(r.email)}</td>
      <td>\${r.verified_at ? '<span class="badge badge-active">verified</span>' : '<span class="badge badge-inactive">pending</span>'}</td>
      <td><button class="btn-sm" onclick="toggleRecipientActive(\${r.id},\${r.active ? 0 : 1})">\${activeLabel}</button></td>
      <td class="muted" style="font-size:0.75rem">\${fmtDate(r.created_at)}</td>
      <td class="actions"><button class="btn-sm btn-danger" onclick="delRecipient(\${r.id})">Del</button></td>
    </tr>\`;
  }).join('');
}

async function addRecipient() {
  const email = document.getElementById('new-recipient').value.trim();
  if (!email) return;
  await api('/recipients' + userParam(), { method: 'POST', body: JSON.stringify({ email }) });
  document.getElementById('new-recipient').value = '';
  toast('Recipient added');
  loadRecipients();
}

async function toggleRecipientActive(id, newVal) {
  await api('/recipients/' + id + userParam(), { method: 'PATCH', body: JSON.stringify({ active: !!newVal }) });
  loadRecipients();
}

async function syncRecipients() {
  try {
    const res = await api('/recipients/sync' + userParam(), { method: 'POST' });
    toast('Synced ' + (res.synced || 0) + ' recipient(s)');
    loadRecipients();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function delRecipient(id) {
  if (!confirm('Remove recipient?')) return;
  await api('/recipients/' + id + userParam(), { method: 'DELETE' });
  toast('Recipient removed');
  loadRecipients();
}

// --- FAILED DELIVERIES ---
let deliveriesData = [];
async function loadDeliveries() {
  deliveriesData = await api('/failed-deliveries' + userParam());
  renderDeliveries();
}

function renderDeliveries() {
  const search = (document.getElementById('delivery-search').value || '').toLowerCase();
  const filtered = search
    ? deliveriesData.filter(d => (d.alias_tag || '').toLowerCase().includes(search) || (d.sender || '').toLowerCase().includes(search) || (d.subject || '').toLowerCase().includes(search) || (d.reason || '').toLowerCase().includes(search) || (d.user || '').toLowerCase().includes(search))
    : deliveriesData;
  const tb = document.getElementById('deliveries-body');
  const colCount = isAdmin ? 7 : 6;
  if (filtered.length === 0) { tb.innerHTML = '<tr><td colspan="' + colCount + '" class="empty">No failed deliveries</td></tr>'; return; }
  tb.innerHTML = filtered.map(d => {
    const userTd = isAdmin ? \`<td class="muted">\${esc(d.user || '')}</td>\` : '';
    return \`<tr>
      <td class="muted" style="font-size:0.75rem">\${fmtDate(d.created_at)}</td>
      \${userTd}
      <td class="mono">\${esc(d.alias_tag || '')}</td>
      <td class="mono" style="font-size:0.75rem">\${esc(d.sender || '')}</td>
      <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${esc(d.subject || '')}</td>
      <td style="font-size:0.75rem">\${esc(d.reason)}</td>
      <td><button class="btn-sm btn-danger" onclick="delDelivery(\${d.id})">Del</button></td>
    </tr>\`;
  }).join('');
}

function filterDeliveries() { renderDeliveries(); }

async function delDelivery(id) {
  await api('/failed-deliveries/' + id, { method: 'DELETE' });
  loadDeliveries();
}

async function purgeDeliveries() {
  if (!confirm('Purge deliveries older than 30 days?')) return;
  await api('/failed-deliveries/purge' + userParam(), { method: 'POST' });
  toast('Purged');
  loadDeliveries();
}

// --- SETTINGS ---
async function loadSettings() {
  if (isAdmin && !adminTargetUser) {
    document.getElementById('set-catchall').value = '';
    document.getElementById('set-format').value = '';
    document.getElementById('set-limit').value = '';
    document.getElementById('set-bandwidth').textContent = 'Select a user to view settings';
    return;
  }
  const s = await api('/settings' + userParam());
  document.getElementById('set-catchall').value = s.catch_all;
  document.getElementById('set-format').value = s.from_name_format;
  document.getElementById('set-limit').value = s.default_limit;
  const mb = (s.bandwidth_used / 1048576).toFixed(1);
  const mbLimit = (s.bandwidth_limit / 1048576).toFixed(0);
  document.getElementById('set-bandwidth').textContent = mb + ' / ' + mbLimit + ' MB';
}

async function saveSettings() {
  await api('/settings' + userParam(), { method: 'PATCH', body: JSON.stringify({
    catch_all: document.getElementById('set-catchall').value === '1',
    from_name_format: document.getElementById('set-format').value,
    default_limit: +document.getElementById('set-limit').value,
  })});
  toast('Settings saved');
  loadSettings();
}

// --- USERS (admin) ---
async function loadUsers() {
  if (!isAdmin) return;
  const users = await api('/users');
  const tb = document.getElementById('users-body');
  if (users.length === 0) { tb.innerHTML = '<tr><td colspan="7" class="empty">No users</td></tr>'; return; }
  tb.innerHTML = users.map(u => {
    const bw = (u.bandwidth_used / 1048576).toFixed(1) + ' / ' + (u.bandwidth_limit / 1048576).toFixed(0) + ' MB';
    return \`<tr>
      <td class="mono">\${esc(u.user)}</td>
      <td>\${u.alias_count}</td>
      <td>\${u.recipient_count}</td>
      <td>\${u.rule_count}</td>
      <td class="muted" style="font-size:0.75rem">\${bw}</td>
      <td class="muted" style="font-size:0.75rem">\${fmtDate(u.created_at)}</td>
      <td class="actions">
        <button class="btn-sm" onclick="viewUser('\${esc(u.user)}')">View</button>
        <button class="btn-sm btn-danger" onclick="delUser('\${esc(u.user)}')">Del</button>
      </td>
    </tr>\`;
  }).join('');
}

async function createUser() {
  const user = document.getElementById('new-user').value.trim().toLowerCase();
  if (!user) return;
  await api('/users', { method: 'POST', body: JSON.stringify({ user }) });
  document.getElementById('new-user').value = '';
  toast('User created');
  loadUsers();
  refreshAdminUserList();
}

function viewUser(user) {
  document.getElementById('admin-user-select').value = user;
  onAdminUserChange();
  document.querySelector('[data-tab="aliases"]').click();
}

async function delUser(user) {
  if (!confirm('Delete user ' + user + ' and ALL their data (aliases, rules, recipients, settings)?')) return;
  await api('/users/' + user, { method: 'DELETE' });
  toast('User deleted');
  loadUsers();
  refreshAdminUserList();
}

async function refreshAdminUserList() {
  const [aliases, allUsers] = await Promise.all([api('/aliases'), api('/users').catch(() => [])]);
  const users = [...new Set([...aliases.map(a => a.user), ...allUsers.map(u => u.user)])].sort();
  const sel = document.getElementById('admin-user-select');
  const current = sel.value;
  sel.innerHTML = '<option value="">All users</option>';
  users.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u;
    opt.textContent = u;
    sel.appendChild(opt);
  });
  sel.value = current;
}

// Util
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fmtDate(s) { if (!s) return '—'; return new Date(s + 'Z').toLocaleString(); }

function loadAll() {
  loadAliases();
  loadRules();
  loadRecipients();
  loadDeliveries();
  loadSettings();
  loadUsers();
}

// Init
initAdmin().then(() => { updateUserLabels(); loadAll(); });
</script>
</body>
</html>`;
