/* ── State ───────────────────────────────────────────────────────────────────── */
const state = {
  currentFile: null,       // relative path
  originalContent: '',     // last-saved content
  mode: 'edit',            // 'edit' | 'split' | 'preview'
  notifications: [],
  gitStatus: null,
  conflicts: [],           // [{file, content}]
  currentConflictIdx: 0,
  resolvedConflicts: {},   // {file: resolvedContent}
  createParentPath: null,
};

/* ── DOM refs ────────────────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const dom = {
  editor:                 $('editor'),
  fileTree:               $('file-tree'),
  currentFileLabel:       $('current-file-label'),
  unsavedDot:             $('unsaved-dot'),
  btnSave:                $('btn-save'),
  btnNewFile:             $('btn-new-file'),
  btnNewFolder:           $('btn-new-folder'),
  // folder inline form
  createFolderForm:       $('create-folder-form'),
  createFolderInput:      $('create-folder-input'),
  btnCreateFolderConfirm: $('btn-create-folder-confirm'),
  btnCreateFolderCancel:  $('btn-create-folder-cancel'),
  // new file modal
  newFileOverlay:         $('new-file-overlay'),
  newFileName:            $('new-file-name'),
  btnNewFileCancel:       $('btn-new-file-cancel'),
  btnNewFileCreate:       $('btn-new-file-create'),
  btnRefresh:             $('btn-refresh'),
  btnDeleteFile:    $('btn-delete-file'),
  btnCopyAll:       $('btn-copy-all'),
  welcome:          $('welcome'),
  paneEdit:         $('pane-edit'),
  panePreview:      $('pane-preview'),
  previewContent:   $('preview-content'),
  editorBody:       $('editor-body'),
  tabEdit:          $('tab-edit'),
  tabSplit:         $('tab-split'),
  tabPreview:       $('tab-preview'),
  formatBar:        $('format-bar'),
  syncDot:          $('sync-dot'),
  syncText:         $('sync-text'),
  commitMsg:        $('commit-msg'),
  btnPull:          $('btn-pull'),
  btnCommit:        $('btn-commit'),
  btnPush:          $('btn-push'),
  notifToggle:      $('btn-notif-toggle'),
  notifBadge:       $('notif-badge'),
  notifPanel:       $('notif-panel'),
  notifList:        $('notif-list'),
  btnClearNotifs:   $('btn-clear-notifs'),
  conflictOverlay:  $('conflict-overlay'),
  conflictFileNav:  $('conflict-file-nav'),
  colOurs:          $('col-ours'),
  colTheirs:        $('col-theirs'),
  btnKeepMine:      $('btn-keep-mine'),
  btnKeepTheirs:    $('btn-keep-theirs'),
  manualEdit:       $('manual-edit'),
  btnSaveManual:    $('btn-save-manual'),
  btnFinishResolve: $('btn-finish-resolve'),
  conflictRemaining:$('conflict-remaining'),
  toasts:           $('toasts'),
  sidebar:          $('sidebar'),
  sidebarBackdrop:  $('sidebar-backdrop'),
  btnSidebarToggle: $('btn-sidebar-toggle'),
  // settings
  btnSettings:      $('btn-settings'),
  settingsOverlay:  $('settings-overlay'),
  sName:            $('s-name'),
  sEmail:           $('s-email'),
  sRepoUrl:         $('s-repo-url'),
  sGhUser:          $('s-gh-user'),
  sToken:           $('s-token'),
  sTokenSaved:      $('s-token-saved'),
  btnTokenToggle:   $('btn-token-toggle'),
  btnTestConn:      $('btn-test-conn'),
  sConnStatus:      $('s-conn-status'),
  btnSettingsClose: $('btn-settings-close'),
  btnSettingsCancel:$('btn-settings-cancel'),
  btnSettingsSave:  $('btn-settings-save'),
};

/* ── Sidebar toggle (mobile drawer) ─────────────────────────────────────────── */
function openSidebar() {
  dom.sidebar.classList.add('open');
  dom.sidebarBackdrop.classList.remove('hidden');
}
function closeSidebar() {
  dom.sidebar.classList.remove('open');
  dom.sidebarBackdrop.classList.add('hidden');
}
function isMobile() { return window.innerWidth <= 640; }

dom.btnSidebarToggle.addEventListener('click', () => {
  dom.sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
});
dom.sidebarBackdrop.addEventListener('click', closeSidebar);

/* ── API helpers ─────────────────────────────────────────────────────────────── */
async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  return res.json();
}
const GET  = path        => api('GET',    path);
const POST = (path, b)   => api('POST',   path, b);
const DEL  = path        => api('DELETE', path);

/* ── Toast notifications ─────────────────────────────────────────────────────── */
const ICONS = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

function toast(msg, type = 'info', duration = 4000) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <span class="toast-icon">${ICONS[type]}</span>
    <span class="toast-msg">${msg}</span>
    <button class="toast-close">✕</button>
  `;
  el.querySelector('.toast-close').addEventListener('click', () => el.remove());
  dom.toasts.prepend(el);
  if (duration > 0) {
    setTimeout(() => {
      el.style.animation = 'fadeOut .3s ease forwards';
      setTimeout(() => el.remove(), 300);
    }, duration);
  }
}

/* ── Notifications panel ─────────────────────────────────────────────────────── */
function addNotification(icon, title, detail) {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  state.notifications.unshift({ icon, title, detail, time });
  renderNotifBadge();
  renderNotifList();
}

function renderNotifBadge() {
  const count = state.notifications.length;
  dom.notifBadge.textContent = count;
  dom.notifBadge.classList.toggle('hidden', count === 0);
}

function renderNotifList() {
  if (state.notifications.length === 0) {
    dom.notifList.innerHTML = '<div class="notif-empty">No notifications yet</div>';
    return;
  }
  dom.notifList.innerHTML = state.notifications.map(n => `
    <div class="notif-item">
      <span class="notif-icon">${n.icon}</span>
      <div class="notif-body">
        <div>${n.title}</div>
        ${n.detail ? `<div style="color:var(--text-muted);font-size:12px">${n.detail}</div>` : ''}
        <div class="notif-time">${n.time}</div>
      </div>
    </div>
  `).join('');
}

dom.notifToggle.addEventListener('click', e => {
  e.stopPropagation();
  dom.notifPanel.classList.toggle('hidden');
});
dom.btnClearNotifs.addEventListener('click', () => {
  state.notifications = [];
  renderNotifBadge();
  renderNotifList();
});
document.addEventListener('click', e => {
  if (!dom.notifPanel.contains(e.target) && e.target !== dom.notifToggle) {
    dom.notifPanel.classList.add('hidden');
  }
});

/* ── File tree ───────────────────────────────────────────────────────────────── */
async function loadFiles() {
  dom.fileTree.innerHTML = '<div class="tree-loading">Loading…</div>';
  const tree = await GET('/api/files');
  renderTree(tree, dom.fileTree, '');
  if (dom.fileTree.innerHTML === '') {
    dom.fileTree.innerHTML = '<div class="tree-empty">No files yet. Click + File to create one.</div>';
  }
}

function renderTree(items, container, parentPath) {
  container.innerHTML = '';
  if (!items.length) {
    if (container === dom.fileTree) {
      container.innerHTML = '<div class="tree-empty">No files yet.</div>';
    }
    return;
  }
  items.forEach(item => {
    if (item.type === 'dir') {
      const wrapper = document.createElement('div');
      const row = document.createElement('div');
      row.className = 'tree-item tree-folder';
      row.dataset.path = item.path;
      row.innerHTML = `
        <span class="tree-folder-toggle open">▶</span>
        <span class="item-icon">📁</span>
        <span class="item-name" title="${item.name}">${item.name}</span>
        <span class="item-actions">
          <button class="item-action-btn" data-action="new-file-in" data-path="${item.path}" title="New file here">+📄</button>
          <button class="item-action-btn" data-action="rename-dir" data-path="${item.path}" data-name="${item.name}" title="Rename">✏️</button>
        </span>
      `;
      const children = document.createElement('div');
      children.className = 'tree-folder-children';
      renderTree(item.children, children, item.path);

      row.addEventListener('click', e => {
        if (e.target.closest('.item-actions')) return;
        children.classList.toggle('collapsed');
        const toggle = row.querySelector('.tree-folder-toggle');
        toggle.classList.toggle('open', !children.classList.contains('collapsed'));
      });

      row.querySelector('[data-action="new-file-in"]')?.addEventListener('click', e => {
        e.stopPropagation();
        showNewFileModal(item.path);
      });
      row.querySelector('[data-action="rename-dir"]')?.addEventListener('click', e => {
        e.stopPropagation();
        renameItem(item.path, item.name, 'folder');
      });

      wrapper.appendChild(row);
      wrapper.appendChild(children);
      container.appendChild(wrapper);
    } else {
      const row = document.createElement('div');
      row.className = 'tree-item' + (item.path === state.currentFile ? ' active' : '');
      row.dataset.path = item.path;
      row.innerHTML = `
        <span class="item-icon">📄</span>
        <span class="item-name" title="${item.name}">${item.name.replace(/\.md$/, '')}</span>
        <span class="item-actions">
          <button class="item-action-btn" data-action="rename" data-path="${item.path}" data-name="${item.name}" title="Rename">✏️</button>
        </span>
      `;
      row.addEventListener('click', e => {
        if (e.target.closest('.item-actions')) return;
        openFile(item.path);
      });
      row.querySelector('[data-action="rename"]')?.addEventListener('click', e => {
        e.stopPropagation();
        renameItem(item.path, item.name, 'file');
      });
      container.appendChild(row);
    }
  });
}

async function renameItem(oldPath, oldName, type) {
  const ext = type === 'file' ? '' : '';
  const nameWithoutExt = type === 'file' ? oldName.replace(/\.md$/, '') : oldName;
  const newName = prompt(`Rename "${nameWithoutExt}" to:`, nameWithoutExt);
  if (!newName || newName === nameWithoutExt) return;

  const finalName = type === 'file'
    ? (newName.endsWith('.md') ? newName : newName + '.md')
    : newName;
  const dir = oldPath.includes('/') ? oldPath.split('/').slice(0, -1).join('/') : '';
  const newPath = dir ? `${dir}/${finalName}` : finalName;

  const res = await POST('/api/rename', { oldPath, newPath });
  if (res.success) {
    if (state.currentFile === oldPath) state.currentFile = newPath;
    loadFiles();
    toast('Renamed successfully', 'success');
  } else {
    toast(res.error || 'Rename failed', 'error');
  }
}

/* ── File type defaults ──────────────────────────────────────────────────────── */
const FILE_TYPE_DEFAULTS = {
  blank:      { name: 'new-document',      label: 'Blank' },
  prd:        { name: 'product-requirements', label: 'PRD' },
  userstory:  { name: 'user-stories',      label: 'User Stories' },
  qa:         { name: 'test-cases',         label: 'QA Test Cases' },
  html:       { name: 'html-component',    label: 'HTML + CSS' },
  angular:    { name: 'angular-component', label: 'Angular Component' },
};

/* ── New file modal ──────────────────────────────────────────────────────────── */
let selectedFileType = 'blank';

function showNewFileModal(parentPath = null) {
  state.createParentPath = parentPath;
  selectedFileType = 'blank';

  // Reset selection
  document.querySelectorAll('.file-type-card').forEach(c => c.classList.remove('selected'));
  document.querySelector('.file-type-card[data-type="blank"]').classList.add('selected');
  dom.newFileName.value = FILE_TYPE_DEFAULTS.blank.name;

  dom.newFileOverlay.classList.remove('hidden');
  dom.newFileName.focus();
  dom.newFileName.select();
}

function closeNewFileModal() {
  dom.newFileOverlay.classList.add('hidden');
}

// Card selection
document.querySelectorAll('.file-type-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.file-type-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedFileType = card.dataset.type;
    // Only update the name if user hasn't customised it yet
    const currentName = dom.newFileName.value.trim();
    const isDefault = Object.values(FILE_TYPE_DEFAULTS).some(d => d.name === currentName);
    if (!currentName || isDefault) {
      dom.newFileName.value = FILE_TYPE_DEFAULTS[selectedFileType].name;
      dom.newFileName.select();
    }
  });
});

dom.btnNewFile.addEventListener('click', () => showNewFileModal());
dom.btnNewFileCancel.addEventListener('click', closeNewFileModal);
dom.newFileOverlay.addEventListener('click', e => { if (e.target === dom.newFileOverlay) closeNewFileModal(); });

dom.newFileName.addEventListener('keydown', e => {
  if (e.key === 'Enter') confirmNewFile();
  if (e.key === 'Escape') closeNewFileModal();
});

dom.btnNewFileCreate.addEventListener('click', confirmNewFile);

async function confirmNewFile() {
  let name = dom.newFileName.value.trim();
  if (!name) { dom.newFileName.focus(); return; }
  if (!name.endsWith('.md')) name += '.md';

  const parent = state.createParentPath;
  const filePath = parent ? `${parent}/${name}` : name;
  const content = selectedFileType === 'blank'
    ? `# ${name.replace(/\.md$/, '')}\n\n`
    : TEMPLATES[selectedFileType];

  closeNewFileModal();

  const res = await POST('/api/file', { filePath, content });
  if (res.success) {
    await loadFiles();
    openFile(filePath);
    toast(`Created ${FILE_TYPE_DEFAULTS[selectedFileType].label}: ${name}`, 'success');
  } else {
    toast(res.error || 'Failed to create file', 'error');
  }
}

/* ── Folder inline form ──────────────────────────────────────────────────────── */
dom.btnNewFolder.addEventListener('click', () => {
  state.createParentPath = null;
  dom.createFolderInput.value = '';
  dom.createFolderForm.classList.remove('hidden');
  dom.createFolderInput.focus();
});

dom.btnCreateFolderCancel.addEventListener('click', () => dom.createFolderForm.classList.add('hidden'));
dom.btnCreateFolderConfirm.addEventListener('click', confirmCreateFolder);
dom.createFolderInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') confirmCreateFolder();
  if (e.key === 'Escape') dom.createFolderForm.classList.add('hidden');
});

async function confirmCreateFolder() {
  const name = dom.createFolderInput.value.trim();
  if (!name) return;
  dom.createFolderForm.classList.add('hidden');
  const folderPath = state.createParentPath ? `${state.createParentPath}/${name}` : name;
  const res = await POST('/api/mkdir', { folderPath });
  if (res.success) {
    await loadFiles();
    toast(`Created folder "${name}"`, 'success');
  } else {
    toast(res.error || 'Failed to create folder', 'error');
  }
}

/* ── Open / save file ────────────────────────────────────────────────────────── */
async function openFile(filePath) {
  if (state.currentFile && state.originalContent !== dom.editor.value) {
    const ok = confirm('You have unsaved changes. Discard them and open another file?');
    if (!ok) return;
  }
  const data = await GET(`/api/file?path=${encodeURIComponent(filePath)}`);
  if (data.error) { toast(data.error, 'error'); return; }

  state.currentFile = filePath;
  state.originalContent = data.content;
  dom.editor.value = data.content;
  setEditorVisible(true);

  const name = filePath.split('/').pop().replace(/\.md$/, '');
  dom.currentFileLabel.textContent = filePath;
  document.title = `${name} — Acceleratty`;

  setUnsaved(false);
  if (state.mode === 'preview' || state.mode === 'split') renderPreview();
  highlightActiveFile(filePath);
  if (isMobile()) closeSidebar();
  dom.editor.focus();
}

function highlightActiveFile(filePath) {
  document.querySelectorAll('.tree-item').forEach(el => {
    el.classList.toggle('active', el.dataset.path === filePath);
  });
}

async function saveFile() {
  if (!state.currentFile) return;
  const content = dom.editor.value;
  const res = await POST('/api/file', { filePath: state.currentFile, content });
  if (res.success) {
    state.originalContent = content;
    setUnsaved(false);
    toast('Saved', 'success', 2000);
  } else {
    toast(res.error || 'Save failed', 'error');
  }
}

function setUnsaved(yes) {
  dom.unsavedDot.classList.toggle('hidden', !yes);
  dom.btnSave.disabled = !yes;
}

dom.btnSave.addEventListener('click', saveFile);
dom.btnDeleteFile.addEventListener('click', async () => {
  if (!state.currentFile) return;
  if (!confirm(`Delete "${state.currentFile}"? This cannot be undone.`)) return;
  const res = await DEL(`/api/file?path=${encodeURIComponent(state.currentFile)}`);
  if (res.success) {
    state.currentFile = null;
    setEditorVisible(false);
    dom.currentFileLabel.textContent = '';
    document.title = 'Acceleratty';
    setUnsaved(false);
    loadFiles();
    toast('File deleted', 'info');
  } else {
    toast(res.error || 'Delete failed', 'error');
  }
});

dom.editor.addEventListener('input', () => {
  setUnsaved(dom.editor.value !== state.originalContent);
  if (state.mode === 'split') renderPreview();
});

// Autosave on Ctrl/Cmd+S
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    if (state.currentFile) saveFile();
  }
});

dom.btnRefresh.addEventListener('click', loadFiles);

/* ── View modes ──────────────────────────────────────────────────────────────── */

// Show/hide the entire editor UI (tabs, format bar, panes) based on whether a file is open
function setEditorVisible(visible) {
  $('toolbar-tabs').classList.toggle('hidden', !visible);
  dom.formatBar.classList.toggle('hidden', !visible);
  dom.btnDeleteFile.classList.toggle('hidden', !visible);
  dom.welcome.classList.toggle('hidden', visible);
  if (!visible) {
    dom.paneEdit.classList.add('hidden');
    dom.panePreview.classList.add('hidden');
    dom.paneEdit.classList.remove('split');
    dom.panePreview.classList.remove('split');
  }
}

function setMode(mode) {
  state.mode = mode;
  dom.tabEdit.classList.toggle('active', mode === 'edit');
  dom.tabSplit.classList.toggle('active', mode === 'split');
  dom.tabPreview.classList.toggle('active', mode === 'preview');

  // Always reset pane state cleanly
  dom.paneEdit.classList.add('hidden');
  dom.paneEdit.classList.remove('split');
  dom.panePreview.classList.add('hidden');
  dom.panePreview.classList.remove('split');

  if (!state.currentFile) return; // no file — nothing to show

  if (mode === 'edit') {
    dom.paneEdit.classList.remove('hidden');
  } else if (mode === 'preview') {
    dom.panePreview.classList.remove('hidden');
    renderPreview();
  } else { // split
    dom.paneEdit.classList.add('split');
    dom.panePreview.classList.add('split');
    dom.paneEdit.classList.remove('hidden');
    dom.panePreview.classList.remove('hidden');
    renderPreview();
  }
}

dom.tabEdit.addEventListener('click', () => setMode('edit'));
dom.tabSplit.addEventListener('click', () => setMode('split'));
dom.tabPreview.addEventListener('click', () => setMode('preview'));

/* ── Markdown preview ────────────────────────────────────────────────────────── */
function renderPreview() {
  const raw  = marked.parse(dom.editor.value || '');
  // H3 — sanitise rendered HTML before injecting into the DOM
  const safe = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(raw) : raw;
  dom.previewContent.innerHTML = safe;
  addCopyButtons();
}

function addCopyButtons() {
  // Copy buttons on code blocks
  dom.previewContent.querySelectorAll('pre').forEach(pre => {
    if (pre.querySelector('.copy-code-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'copy-code-btn';
    btn.textContent = 'Copy';
    btn.addEventListener('click', () => {
      const code = pre.querySelector('code')?.innerText || pre.innerText;
      copyToClipboard(code, btn);
    });
    pre.style.position = 'relative';
    pre.appendChild(btn);
  });

  // Copy buttons next to headings
  dom.previewContent.querySelectorAll('h1, h2, h3').forEach(h => {
    if (h.querySelector('.section-copy-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'section-copy-btn';
    btn.textContent = 'Copy section';
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const sectionText = getSectionText(h);
      copyToClipboard(sectionText, btn);
    });
    h.appendChild(btn);
  });
}

function getSectionText(heading) {
  const level = parseInt(heading.tagName[1]);
  let text = heading.innerText.replace('Copy section', '').trim() + '\n\n';
  let el = heading.nextElementSibling;
  while (el) {
    const elLevel = el.tagName.match(/^H(\d)$/) ? parseInt(el.tagName[1]) : null;
    if (elLevel !== null && elLevel <= level) break;
    text += el.innerText + '\n\n';
    el = el.nextElementSibling;
  }
  return text.trim();
}

function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✓ Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 2000);
    }
    toast('Copied to clipboard', 'success', 2000);
  }).catch(() => toast('Copy failed — try selecting manually', 'error'));
}

dom.btnCopyAll.addEventListener('click', () => {
  const text = state.currentFile ? dom.editor.value : '';
  if (!text) { toast('No file open', 'warning'); return; }
  copyToClipboard(text, null);
});

/* ── Formatting toolbar ──────────────────────────────────────────────────────── */
const FORMATS = {
  bold:   { wrap: ['**', '**'],        placeholder: 'bold text' },
  italic: { wrap: ['*', '*'],          placeholder: 'italic text' },
  h1:     { prefix: '# ',             placeholder: 'Heading 1' },
  h2:     { prefix: '## ',            placeholder: 'Heading 2' },
  bullet: { prefix: '- ',             placeholder: 'List item' },
  code:   { wrap: ['```\n', '\n```'], placeholder: 'code here' },
  link:   { wrap: ['[', '](url)'],     placeholder: 'link text' },
};

document.querySelectorAll('.fmt-btn[data-fmt]').forEach(btn => {
  btn.addEventListener('click', () => {
    const fmt = FORMATS[btn.dataset.fmt];
    if (!fmt) return;
    insertFormat(fmt);
  });
});

function insertFormat(fmt) {
  const ta = dom.editor;
  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  const sel   = ta.value.substring(start, end) || fmt.placeholder;

  let newText, cursor;
  if (fmt.wrap) {
    newText = fmt.wrap[0] + sel + fmt.wrap[1];
    cursor  = start + fmt.wrap[0].length + sel.length + fmt.wrap[1].length;
  } else {
    newText = fmt.prefix + sel;
    cursor  = start + fmt.prefix.length + sel.length;
  }

  ta.setRangeText(newText, start, end, 'end');
  ta.selectionStart = ta.selectionEnd = cursor;
  ta.dispatchEvent(new Event('input'));
  ta.focus();
}

/* ── Git / sync ──────────────────────────────────────────────────────────────── */
async function updateGitStatus() {
  const status = await GET('/api/git/status').catch(() => null);
  if (!status) return;
  state.gitStatus = status;

  const changed = (status.modified?.length || 0) +
                  (status.created?.length || 0) +
                  (status.deleted?.length || 0) +
                  (status.not_added?.length || 0);

  if (status.conflicted?.length > 0) {
    setSyncStatus('conflict', `${status.conflicted.length} conflict${status.conflicted.length > 1 ? 's' : ''}`);
  } else if (changed > 0) {
    setSyncStatus('changed', `${changed} file${changed > 1 ? 's' : ''} changed`);
  } else {
    setSyncStatus('ok', 'Up to date');
  }
}

function setSyncStatus(type, text) {
  dom.syncDot.className = `sync-dot ${type}`;
  dom.syncText.textContent = text;
}

function setBusy(text) {
  dom.syncDot.className = 'sync-dot busy';
  dom.syncText.textContent = text;
  [dom.btnPull, dom.btnCommit, dom.btnPush].forEach(b => b.disabled = true);
}
function clearBusy() {
  [dom.btnPull, dom.btnCommit, dom.btnPush].forEach(b => b.disabled = false);
  updateGitStatus();
}

dom.btnCommit.addEventListener('click', async () => {
  setBusy('Saving snapshot…');
  const message = dom.commitMsg.value.trim() || 'Update content';
  const res = await POST('/api/git/commit', { message });
  clearBusy();
  if (res.nothing) {
    toast('Nothing new to save', 'info');
  } else if (res.success) {
    dom.commitMsg.value = '';
    toast('Snapshot saved!', 'success');
    addNotification('📸', 'Snapshot saved', message);
  } else {
    toast(res.error || 'Commit failed', 'error');
  }
});

dom.btnPush.addEventListener('click', async () => {
  setBusy('Sharing changes…');
  const res = await POST('/api/git/push', {});
  clearBusy();
  if (res.success) {
    toast('Changes shared successfully!', 'success');
    addNotification('⬆️', 'Changes shared', 'Your updates are now available to the team');
  } else {
    toast(res.error || 'Share failed. Check your connection and remote URL.', 'error', 0);
  }
});

dom.btnPull.addEventListener('click', async () => {
  setBusy('Checking for updates…');
  const res = await POST('/api/git/pull', {});
  clearBusy();
  if (res.hasConflicts) {
    toast('Conflicts found — please resolve them', 'warning', 0);
    addNotification('⚠️', 'Merge conflict', `${res.conflicts.length} file(s) need resolution`);
    showConflictModal(res.conflicts);
  } else if (res.success) {
    const summary = res.result?.summary;
    const msg = summary?.changes > 0
      ? `${summary.changes} file(s) updated`
      : 'Already up to date';
    toast(msg, 'success');
    if (summary?.changes > 0) {
      addNotification('⬇️', 'Updates received', msg);
      loadFiles();
      if (state.currentFile) {
        const fresh = await GET(`/api/file?path=${encodeURIComponent(state.currentFile)}`);
        if (fresh.content && fresh.content !== dom.editor.value) {
          state.originalContent = fresh.content;
          dom.editor.value = fresh.content;
          setUnsaved(false);
          if (state.mode !== 'edit') renderPreview();
          toast('Current file updated from remote', 'info');
        }
      }
    }
  } else {
    toast(res.error || 'Update failed', 'error', 0);
  }
});

/* ── Conflict resolution ─────────────────────────────────────────────────────── */
function parseConflict(content) {
  const oursLines = [];
  const theirsLines = [];
  const normalLines = [];
  const lines = content.split('\n');
  let phase = 'normal'; // normal | ours | theirs

  for (const line of lines) {
    if (line.startsWith('<<<<<<<')) { phase = 'ours'; continue; }
    if (line.startsWith('=======')) { phase = 'theirs'; continue; }
    if (line.startsWith('>>>>>>>')) { phase = 'normal'; continue; }
    if (phase === 'ours') oursLines.push(line);
    else if (phase === 'theirs') theirsLines.push(line);
    else normalLines.push(line);
  }

  // Reconstruct content with chosen version
  function rebuild(chosenLines) {
    // Replace conflict section with chosen lines
    const result = [];
    let inConflict = false;
    let skip = false;
    for (const line of lines) {
      if (line.startsWith('<<<<<<<')) { inConflict = true; skip = (chosenLines === theirsLines); continue; }
      if (line.startsWith('=======')) { skip = (chosenLines === oursLines); continue; }
      if (line.startsWith('>>>>>>>')) { inConflict = false; skip = false; continue; }
      if (!skip) result.push(line);
    }
    return result.join('\n');
  }

  return {
    ours: oursLines.join('\n'),
    theirs: theirsLines.join('\n'),
    normal: normalLines.join('\n'),
    resolveOurs: () => removeConflictMarkers(content, 'ours'),
    resolveTheirs: () => removeConflictMarkers(content, 'theirs'),
  };
}

function removeConflictMarkers(content, keep) {
  const lines = content.split('\n');
  const result = [];
  let phase = 'normal';

  for (const line of lines) {
    if (line.startsWith('<<<<<<<')) { phase = 'ours'; continue; }
    if (line.startsWith('=======')) { phase = 'theirs'; continue; }
    if (line.startsWith('>>>>>>>')) { phase = 'normal'; continue; }
    if (phase === 'normal' || phase === keep) result.push(line);
  }
  return result.join('\n');
}

function showConflictModal(conflicts) {
  state.conflicts = conflicts;
  state.currentConflictIdx = 0;
  state.resolvedConflicts = {};
  dom.conflictOverlay.classList.remove('hidden');
  renderConflictNav();
  renderConflictView(0);
  updateFinishButton();
}

function renderConflictNav() {
  dom.conflictFileNav.innerHTML = state.conflicts.map((c, i) => `
    <button class="conflict-file-btn ${i === state.currentConflictIdx ? 'active' : ''} ${state.resolvedConflicts[c.file] !== undefined ? 'resolved' : ''}"
            onclick="switchConflict(${i})">
      ${c.file.split('/').pop()}
    </button>
  `).join('');
}

window.switchConflict = function(idx) {
  state.currentConflictIdx = idx;
  renderConflictNav();
  renderConflictView(idx);
};

function renderConflictView(idx) {
  const conflict = state.conflicts[idx];
  const parsed = parseConflict(conflict.content);
  dom.colOurs.textContent = parsed.ours || '(empty)';
  dom.colTheirs.textContent = parsed.theirs || '(empty)';
  dom.manualEdit.value = state.resolvedConflicts[conflict.file] ?? conflict.content;
}

dom.btnKeepMine.addEventListener('click', async () => {
  const conflict = state.conflicts[state.currentConflictIdx];
  const resolved = removeConflictMarkers(conflict.content, 'ours');
  await resolveConflict(conflict.file, resolved);
});

dom.btnKeepTheirs.addEventListener('click', async () => {
  const conflict = state.conflicts[state.currentConflictIdx];
  const resolved = removeConflictMarkers(conflict.content, 'theirs');
  await resolveConflict(conflict.file, resolved);
});

dom.btnSaveManual.addEventListener('click', async () => {
  const conflict = state.conflicts[state.currentConflictIdx];
  const content = dom.manualEdit.value;
  if (content.includes('<<<<<<<')) {
    toast('File still has conflict markers — please resolve all conflicts', 'warning');
    return;
  }
  await resolveConflict(conflict.file, content);
});

async function resolveConflict(file, content) {
  const res = await POST('/api/git/resolve', { filePath: file, content });
  if (res.success) {
    state.resolvedConflicts[file] = content;
    toast(`Resolved: ${file.split('/').pop()}`, 'success');
    renderConflictNav();
    updateFinishButton();

    // Auto-advance to next unresolved
    const next = state.conflicts.findIndex((c, i) => state.resolvedConflicts[c.file] === undefined);
    if (next !== -1) { state.currentConflictIdx = next; renderConflictView(next); renderConflictNav(); }
  } else {
    toast(res.error || 'Failed to save resolution', 'error');
  }
}

function updateFinishButton() {
  const total = state.conflicts.length;
  const done  = Object.keys(state.resolvedConflicts).length;
  const remaining = total - done;
  dom.conflictRemaining.textContent = `${done} of ${total} resolved`;
  dom.btnFinishResolve.disabled = remaining > 0;
  dom.btnFinishResolve.textContent = remaining > 0
    ? `${remaining} remaining…`
    : 'Finish & Save Resolutions';
}

dom.btnFinishResolve.addEventListener('click', async () => {
  const res = await POST('/api/git/resolve-commit', {});
  if (res.success) {
    dom.conflictOverlay.classList.add('hidden');
    toast('All conflicts resolved and saved!', 'success');
    addNotification('✅', 'Conflicts resolved', 'All merge conflicts have been resolved');
    loadFiles();
    updateGitStatus();
    if (state.currentFile && state.resolvedConflicts[state.currentFile]) {
      const fresh = await GET(`/api/file?path=${encodeURIComponent(state.currentFile)}`);
      if (fresh.content) { dom.editor.value = fresh.content; state.originalContent = fresh.content; }
    }
  } else {
    toast(res.error || 'Failed to complete resolution', 'error');
  }
});

/* ── Server-Sent Events ──────────────────────────────────────────────────────── */
function connectSSE() {
  const es = new EventSource('/api/events');

  es.onmessage = e => {
    const { type, data } = JSON.parse(e.data);

    if (type === 'file_added') {
      addNotification('📄', 'New file added', data.name);
      toast(`New file: ${data.name}`, 'info', 3000);
      loadFiles();
    } else if (type === 'file_changed') {
      addNotification('✏️', 'File changed', data.name);
      // If it's the open file and we haven't unsaved changes, reload it
      if (data.path === state.currentFile && dom.editor.value === state.originalContent) {
        GET(`/api/file?path=${encodeURIComponent(data.path)}`).then(res => {
          if (res.content) {
            dom.editor.value = res.content;
            state.originalContent = res.content;
            if (state.mode !== 'edit') renderPreview();
            toast(`"${data.name}" was updated externally`, 'info', 3000);
          }
        });
      }
    } else if (type === 'file_deleted') {
      addNotification('🗑️', 'File deleted', data.name);
      loadFiles();
    } else if (type === 'git_conflicts') {
      addNotification('⚠️', 'Merge conflict detected', `${data.count} file(s) affected`);
    } else if (type === 'git_pulled') {
      updateGitStatus();
    } else if (type === 'git_committed') {
      updateGitStatus();
    }
  };

  es.onerror = () => {
    setTimeout(connectSSE, 3000); // reconnect
  };
}

/* ── Timeline ────────────────────────────────────────────────────────────────── */
let timelineVisible = false;

function createTimelineToggle() {
  const btn = document.createElement('button');
  btn.id = 'btn-timeline';
  btn.className = 'btn btn-sm';
  btn.title = 'View decision timeline';
  btn.innerHTML = '📅 Timeline';
  btn.style.cssText = 'background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.12);color:var(--sync-text);font-size:12px;padding:5px 10px';
  btn.addEventListener('click', toggleTimeline);
  document.querySelector('.sync-right').prepend(btn);
}

async function toggleTimeline() {
  timelineVisible = !timelineVisible;
  let panel = $('timeline-panel');

  if (!timelineVisible) {
    if (panel) panel.remove();
    return;
  }

  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'timeline-panel';
    panel.innerHTML = `
      <div class="timeline-header">
        <strong>📅 Decision Timeline</strong>
        <span class="timeline-sub">Commit history — track how content evolved</span>
        <button class="btn-link" onclick="toggleTimeline()" style="margin-left:auto">✕ Close</button>
      </div>
      <div id="timeline-list" class="timeline-list"><div class="timeline-loading">Loading history…</div></div>
    `;
    document.getElementById('app').appendChild(panel);
  }

  const log = await GET('/api/git/log');
  renderTimeline(log, $('timeline-list'));
}

function renderTimeline(commits, container) {
  if (!commits || commits.length === 0) {
    container.innerHTML = '<div class="timeline-empty">No history yet. Save a snapshot to start tracking changes.</div>';
    return;
  }
  container.innerHTML = commits.map((c, i) => {
    const date = new Date(c.date);
    const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isFirst = i === commits.length - 1;
    return `
      <div class="timeline-item" data-hash="${c.hash}">
        <div class="timeline-line ${isFirst ? 'first' : ''}"></div>
        <div class="timeline-dot ${i === 0 ? 'latest' : ''}"></div>
        <div class="timeline-content">
          <div class="timeline-msg">${escapeHtml(c.message)}</div>
          <div class="timeline-meta">
            <span class="timeline-author">👤 ${escapeHtml(c.author_name || 'Unknown')}</span>
            <span class="timeline-date">📅 ${dateStr} ${timeStr}</span>
            <span class="timeline-hash">${c.hash.substring(0, 7)}</span>
          </div>
          <div class="timeline-files" id="files-${c.hash}" style="display:none"></div>
          <button class="timeline-expand-btn btn-link" onclick="loadCommitFiles('${c.hash}')">
            Show changed files ▸
          </button>
        </div>
      </div>
    `;
  }).join('');
}

window.loadCommitFiles = async function(hash) {
  const btn = document.querySelector(`.timeline-item[data-hash="${hash}"] .timeline-expand-btn`);
  const filesDiv = $(`files-${hash}`);
  if (filesDiv.style.display !== 'none') {
    filesDiv.style.display = 'none';
    btn.textContent = 'Show changed files ▸';
    return;
  }
  btn.textContent = 'Loading…';
  const data = await GET(`/api/git/commit-files?hash=${encodeURIComponent(hash)}`);
  if (data.files && data.files.length) {
    filesDiv.innerHTML = data.files.map(f => `
      <div class="timeline-file">
        <span class="timeline-file-status status-${f.status}">${f.status}</span>
        <span class="timeline-file-name">${escapeHtml(f.file)}</span>
      </div>
    `).join('');
  } else {
    filesDiv.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:4px 0">No files changed</div>';
  }
  filesDiv.style.display = 'block';
  btn.textContent = 'Hide ▴';
};

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ── File format templates ───────────────────────────────────────────────────── */
const TEMPLATES = {
  prd: `# Product Requirements Document

**Product:**
**Version:** 1.0
**Date:** ${new Date().toLocaleDateString()}
**Owner:**

---

## 1. Overview
> Brief description of the product/feature

## 2. Goals & Success Metrics
- **Goal:**
- **Metric:**

## 3. User Stories
| As a... | I want to... | So that... |
|---------|-------------|------------|
|         |             |            |

## 4. Requirements

### Functional Requirements
- [ ] FR-01:
- [ ] FR-02:

### Non-Functional Requirements
- [ ] NFR-01: Performance —
- [ ] NFR-02: Security —

## 5. Out of Scope
-

## 6. Open Questions
- [ ]

## 7. Timeline
| Milestone | Date |
|-----------|------|
|           |      |
`,
  qa: `# QA Test Cases

**Feature:**
**Version:**
**Tester:**
**Date:** ${new Date().toLocaleDateString()}

---

## Test Suite

### TC-001: [Test Case Name]
- **Priority:** High / Medium / Low
- **Preconditions:**
- **Steps:**
  1.
  2.
  3.
- **Expected Result:**
- **Actual Result:**
- **Status:** ⬜ Pending / ✅ Pass / ❌ Fail

---

### TC-002: [Test Case Name]
- **Priority:**
- **Preconditions:**
- **Steps:**
  1.
- **Expected Result:**
- **Actual Result:**
- **Status:** ⬜ Pending

---

## Test Summary
| Total | Pass | Fail | Blocked |
|-------|------|------|---------|
|       |      |      |         |
`,
  userstory: `# User Stories

**Epic:**
**Sprint:**
**Date:** ${new Date().toLocaleDateString()}

---

## Story 1: [Short Title]

**As a** [type of user],
**I want to** [action],
**So that** [benefit/value].

### Acceptance Criteria
- [ ] Given [context], when [action], then [outcome]
- [ ] Given [context], when [action], then [outcome]

### Story Points:
### Priority:

---

## Story 2: [Short Title]

**As a** [type of user],
**I want to** [action],
**So that** [benefit/value].

### Acceptance Criteria
- [ ]

### Story Points:
### Priority:
`,
  html: `# HTML + CSS Component

**Component:**
**Date:** ${new Date().toLocaleDateString()}

---

## Description
Brief description of the component and its purpose.

## HTML Structure

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Component Name</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <!-- Component markup here -->
</body>
</html>
\`\`\`

## CSS Styles

\`\`\`css
/* Component styles */
.component {
  /* styles */
}
\`\`\`

## Usage Notes
-

## Browser Support
- Chrome ✅
- Firefox ✅
- Safari ✅
- Edge ✅
`,
  angular: `# Angular Component

**Component:**
**Module:**
**Date:** ${new Date().toLocaleDateString()}

---

## Overview
Description of this component's purpose and responsibility.

## Component File

\`\`\`typescript
import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-component-name',
  templateUrl: './component-name.component.html',
  styleUrls: ['./component-name.component.scss']
})
export class ComponentNameComponent implements OnInit {
  @Input() data: any;
  @Output() action = new EventEmitter<any>();

  constructor() {}

  ngOnInit(): void {}
}
\`\`\`

## Template

\`\`\`html
<div class="component-wrapper">
  <!-- template -->
</div>
\`\`\`

## Inputs & Outputs
| Name | Type | Direction | Description |
|------|------|-----------|-------------|
|      |      | @Input    |             |
|      |      | @Output   |             |

## Dependencies
-

## Notes
-
`
};

function addTemplateButton() {
  const btn = document.createElement('button');
  btn.className = 'fmt-btn';
  btn.id = 'btn-template';
  btn.textContent = '📋 Template';
  btn.title = 'Insert a document template';
  btn.addEventListener('click', showTemplateMenu);
  const sep = document.createElement('span');
  sep.className = 'fmt-sep';
  dom.formatBar.appendChild(sep);
  dom.formatBar.appendChild(btn);
}

let templateMenuEl = null;
function showTemplateMenu() {
  if (templateMenuEl) { templateMenuEl.remove(); templateMenuEl = null; return; }

  const menu = document.createElement('div');
  menu.style.cssText = `
    position:fixed;z-index:400;background:#fff;border:1px solid var(--border);
    border-radius:var(--radius);box-shadow:var(--shadow);padding:4px 0;min-width:200px;
  `;
  const items = [
    { key: 'prd',       label: '📄 PRD — Product Requirements' },
    { key: 'qa',        label: '🧪 QA — Test Cases' },
    { key: 'userstory', label: '📖 User Stories' },
    { key: 'html',      label: '🌐 HTML + CSS Component' },
    { key: 'angular',   label: '🅰️ Angular Component' },
  ];
  items.forEach(({ key, label }) => {
    const item = document.createElement('button');
    item.style.cssText = `display:block;width:100%;text-align:left;padding:8px 14px;border:none;
      background:none;cursor:pointer;font-size:13px;font-family:var(--font);color:var(--text)`;
    item.textContent = label;
    item.onmouseenter = () => item.style.background = 'var(--bg)';
    item.onmouseleave = () => item.style.background = 'none';
    item.addEventListener('click', () => {
      if (!state.currentFile) {
        toast('Open or create a file first', 'warning');
      } else {
        const current = dom.editor.value;
        dom.editor.value = current + (current ? '\n\n' : '') + TEMPLATES[key];
        dom.editor.dispatchEvent(new Event('input'));
        toast('Template inserted', 'success', 2000);
      }
      menu.remove(); templateMenuEl = null;
    });
    menu.appendChild(item);
  });

  const btnRect = $('btn-template').getBoundingClientRect();
  menu.style.top = (btnRect.bottom + 4) + 'px';
  menu.style.left = btnRect.left + 'px';
  document.body.appendChild(menu);
  templateMenuEl = menu;

  setTimeout(() => {
    document.addEventListener('click', function handler() {
      menu.remove(); templateMenuEl = null;
      document.removeEventListener('click', handler);
    });
  }, 10);
}

/* ── Settings modal ──────────────────────────────────────────────────────────── */
async function openSettings() {
  // Show modal immediately, then populate with saved values
  dom.settingsOverlay.classList.remove('hidden');
  setConnStatus('unknown', 'Not tested');

  try {
    const s = await GET('/api/settings');
    dom.sName.value    = s.name     || '';
    dom.sEmail.value   = s.email    || '';
    dom.sRepoUrl.value = s.remoteUrl || '';
    dom.sGhUser.value  = s.ghUser   || '';
    dom.sToken.value   = '';
    dom.sTokenSaved.classList.toggle('hidden', !s.hasCredentials);
    dom.sToken.placeholder = s.hasCredentials
      ? 'Enter a new token to replace the saved one'
      : 'ghp_xxxxxxxxxxxxxxxxxxxx';
  } catch (_) {
    // API not yet available — modal still opens with empty fields
  }
}

function closeSettings() {
  dom.settingsOverlay.classList.add('hidden');
}

function setConnStatus(type, label) {
  dom.sConnStatus.className = `conn-status conn-status-${type}`;
  dom.sConnStatus.querySelector('.conn-label').textContent = label;
}

dom.btnSettings.addEventListener('click', openSettings);
dom.btnSettingsClose.addEventListener('click', closeSettings);
dom.btnSettingsCancel.addEventListener('click', closeSettings);
dom.settingsOverlay.addEventListener('click', e => { if (e.target === dom.settingsOverlay) closeSettings(); });

// Show/hide token
dom.btnTokenToggle.addEventListener('click', () => {
  const isPassword = dom.sToken.type === 'password';
  dom.sToken.type = isPassword ? 'text' : 'password';
  dom.btnTokenToggle.textContent = isPassword ? '🙈' : '👁';
});

// Test connection
dom.btnTestConn.addEventListener('click', async () => {
  // Save first so we have credentials in the remote URL
  const saved = await saveSettingsToServer(true);
  if (!saved) return;

  setConnStatus('testing', 'Testing…');
  dom.btnTestConn.disabled = true;

  const res = await POST('/api/git/test-connection', {});
  dom.btnTestConn.disabled = false;

  if (res.success) {
    setConnStatus('ok', 'Connected ✓');
    toast('Connection successful!', 'success');
  } else {
    setConnStatus('error', res.message || 'Connection failed');
    toast(res.message || 'Connection failed', 'error', 0);
  }
});

// Save settings
dom.btnSettingsSave.addEventListener('click', async () => {
  const saved = await saveSettingsToServer(false);
  if (saved) {
    closeSettings();
    toast('Settings saved', 'success');
  }
});

async function saveSettingsToServer(silent = false) {
  const name    = dom.sName.value.trim();
  const email   = dom.sEmail.value.trim();
  const repoUrl = dom.sRepoUrl.value.trim();
  const ghUser  = dom.sGhUser.value.trim();
  const token   = dom.sToken.value.trim();

  // Basic validation
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    dom.sEmail.classList.add('error');
    dom.sEmail.focus();
    if (!silent) toast('Please enter a valid email address', 'warning');
    return false;
  }
  dom.sEmail.classList.remove('error');

  if (repoUrl && !repoUrl.startsWith('https://') && !repoUrl.startsWith('git@')) {
    dom.sRepoUrl.classList.add('error');
    dom.sRepoUrl.focus();
    if (!silent) toast('Repository URL should start with https:// or git@', 'warning');
    return false;
  }
  dom.sRepoUrl.classList.remove('error');

  const res = await POST('/api/settings', { name, email, repoUrl, ghUser, token });
  if (!res.success) {
    if (!silent) toast(res.error || 'Failed to save settings', 'error');
    return false;
  }
  return true;
}

/* ── Init ────────────────────────────────────────────────────────────────────── */
async function init() {
  await loadFiles();
  updateGitStatus();
  setInterval(updateGitStatus, 30000);
  connectSSE();
  createTimelineToggle();
  addTemplateButton();
  setEditorVisible(false); // nothing open yet — show welcome screen only
  state.mode = 'edit';     // default mode for when a file is opened
  await checkRepoSetup();
}

// Show the right welcome state depending on whether a content repo is configured
async function checkRepoSetup() {
  const { hasRemote } = await GET('/api/settings/status').catch(() => ({ hasRemote: false }));
  $('welcome-setup').classList.toggle('hidden',  hasRemote);
  $('welcome-ready').classList.toggle('hidden', !hasRemote);
}

// Re-check after settings are saved so welcome screen updates immediately
const _origSaveSettings = saveSettingsToServer;
// Patch: call checkRepoSetup after a successful save
dom.btnSettingsSave.addEventListener('click', () => {
  // checkRepoSetup is called via the existing save handler's closeSettings chain;
  // attach it here to run after any successful save
  setTimeout(checkRepoSetup, 300);
});

init();
