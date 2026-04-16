const express = require('express');
const simpleGit = require('simple-git');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security helpers ──────────────────────────────────────────────────────────

// Redact embedded credentials from any string (e.g. git error messages that
// echo back the remote URL including the token).
function scrubCredentials(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/https?:\/\/[^:@\s]+:[^@\s]+@/gi, 'https://***:***@');
}

// Validate a git commit hash — must be 4–64 hex characters.
function isValidHash(hash) {
  return typeof hash === 'string' && /^[0-9a-f]{4,64}$/i.test(hash);
}

// Use the WHATWG URL constructor to safely strip credentials from a URL string.
function stripCredentialsFromUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const user           = decodeURIComponent(u.username);
    const hadCredentials = !!(u.username || u.password);
    u.username = '';
    u.password = '';
    return { clean: u.toString(), hasCredentials: hadCredentials, user };
  } catch {
    return { clean: rawUrl, hasCredentials: false, user: '' };
  }
}

// Sanitise a caught error before sending to the client:
// strip credentials and avoid leaking full filesystem paths.
function safeError(e) {
  const raw = e?.message || String(e);
  const scrubbed = scrubCredentials(raw);
  return scrubbed.replace(/\/[^\s:'"]+\/[^\s:'"]+/g, '<path>');
}

// Turn a git error into a plain-English message the user can act on.
function friendlyGitError(e) {
  const msg = e?.message || String(e);
  if (/could not read (Username|Password)|Terminal prompt disabled|device not configured/i.test(msg)) {
    return 'No credentials configured — open ⚙️ Settings and enter your GitHub username and token';
  }
  if (/Authentication failed|403|401|bad credentials/i.test(msg)) {
    return 'Authentication failed — open ⚙️ Settings and check your GitHub username and token';
  }
  if (/not found|404|repository.*not exist/i.test(msg)) {
    return 'Repository not found — open ⚙️ Settings and check the repository URL';
  }
  if (/ENOTFOUND|network|resolve host|getaddrinfo/i.test(msg)) {
    return 'Network error — check your internet connection';
  }
  if (/rejected.*non-fast-forward|fetch first/i.test(msg)) {
    return 'Your local copy is behind the remote — click ⬇ Get Updates first, then try again';
  }
  if (/nothing to push/i.test(msg)) {
    return 'Nothing to push — save a snapshot first';
  }
  return safeError(e);
}
const WORKSPACE = process.env.WORKSPACE
  ? path.resolve(process.env.WORKSPACE)
  : path.join(__dirname, 'content');

// Ensure workspace exists
if (!fs.existsSync(WORKSPACE)) {
  fs.mkdirSync(WORKSPACE, { recursive: true });
}

// Prevent git from hanging waiting for interactive credential input
process.env.GIT_TERMINAL_PROMPT = '0';

const git = simpleGit(WORKSPACE);

// Initialize git repo if needed
(async () => {
  try {
    const isRepo = await git.checkIsRepo().catch(() => false);
    if (!isRepo) {
      await git.init();
      await git.addConfig('user.name', 'Acceleratty User');
      await git.addConfig('user.email', 'user@acceleratty.local');
      const welcomePath = path.join(WORKSPACE, 'Welcome.md');
      fs.writeFileSync(welcomePath,
        '# Welcome to Acceleratty\n\n' +
        'Start creating your documents here.\n\n' +
        '## Getting Started\n\n' +
        '1. Click **+ File** in the sidebar to create a new document\n' +
        '2. Write your content — this editor supports **Markdown** formatting\n' +
        '3. Click **Save** to save your work\n' +
        '4. Use the sync bar at the bottom to share changes with your team\n\n' +
        '## Markdown Quick Reference\n\n' +
        '| Syntax | Result |\n' +
        '|--------|--------|\n' +
        '| `# Heading` | Big heading |\n' +
        '| `**bold**` | **Bold text** |\n' +
        '| `*italic*` | *Italic text* |\n' +
        '| `- item` | Bullet list |\n' +
        '| `` `code` `` | `inline code` |\n'
      );
      await git.add('.');
      await git.commit('Initial commit');
      console.log('Initialized new git repository in', WORKSPACE);
    }
  } catch (e) {
    console.error('Git init warning:', e.message);
  }
})();

app.use(express.json({ limit: '1mb' }));

// H3 — Content-Security-Policy: lock down script sources to self + the one CDN
// used for marked.js and DOMPurify. No inline scripts, no eval.
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline'",   // inline styles used by dynamic panels
      "img-src 'self' data:",
      "connect-src 'self'",
      "font-src 'self'",
    ].join('; ')
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ── SSE (Server-Sent Events) for real-time notifications ──────────────────────
let sseClients = [];

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('data: {"type":"connected"}\n\n');

  const id = Date.now() + Math.random();
  sseClients.push({ id, res });
  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== id);
  });
});

function broadcast(type, data) {
  const msg = `data: ${JSON.stringify({ type, data, time: new Date().toISOString() })}\n\n`;
  sseClients.forEach(c => { try { c.res.write(msg); } catch (_) {} });
}

// ── File watcher (detect external changes) ────────────────────────────────────
const pendingIgnore = new Set();

const watcher = chokidar.watch(WORKSPACE, {
  ignored: [/(^|[/\\])\../, /node_modules/],
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
});

watcher.on('add', fp => {
  const rel = path.relative(WORKSPACE, fp);
  if (pendingIgnore.has(rel)) { pendingIgnore.delete(rel); return; }
  if (fp.endsWith('.md')) broadcast('file_added', { path: rel, name: path.basename(fp) });
});
watcher.on('change', fp => {
  const rel = path.relative(WORKSPACE, fp);
  if (pendingIgnore.has(rel)) { pendingIgnore.delete(rel); return; }
  if (fp.endsWith('.md')) broadcast('file_changed', { path: rel, name: path.basename(fp) });
});
watcher.on('unlink', fp => {
  const rel = path.relative(WORKSPACE, fp);
  broadcast('file_deleted', { path: rel, name: path.basename(fp) });
});

// ── Security helper ───────────────────────────────────────────────────────────
function safePath(relPath) {
  if (!relPath) throw new Error('Path is required');
  const resolved = path.resolve(WORKSPACE, relPath);
  if (!resolved.startsWith(path.resolve(WORKSPACE) + path.sep) &&
      resolved !== path.resolve(WORKSPACE)) {
    throw new Error('Access denied: path outside workspace');
  }
  return resolved;
}

// ── File tree ─────────────────────────────────────────────────────────────────
function buildTree(dir, base) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const items = [];
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    const rel = path.relative(base, full);
    if (e.isDirectory()) {
      items.push({ type: 'dir', name: e.name, path: rel, children: buildTree(full, base) });
    } else if (e.name.endsWith('.md')) {
      const stat = fs.statSync(full);
      items.push({ type: 'file', name: e.name, path: rel, modified: stat.mtime });
    }
  }
  return items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// ── File API ──────────────────────────────────────────────────────────────────
app.get('/api/files', (req, res) => {
  try { res.json(buildTree(WORKSPACE, WORKSPACE)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/file', (req, res) => {
  try {
    const fp = safePath(req.query.path);
    res.json({ content: fs.readFileSync(fp, 'utf-8') });
  } catch (e) {
    res.status(e.message.includes('Access denied') ? 403 : 500).json({ error: e.message });
  }
});

app.post('/api/file', (req, res) => {
  try {
    const { filePath, content } = req.body;
    const fp = safePath(filePath);
    pendingIgnore.add(filePath);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, content, 'utf-8');
    res.json({ success: true });
  } catch (e) {
    res.status(e.message.includes('Access denied') ? 403 : 500).json({ error: e.message });
  }
});

app.delete('/api/file', (req, res) => {
  try {
    const fp = safePath(req.query.path);
    fs.unlinkSync(fp);
    res.json({ success: true });
  } catch (e) {
    res.status(e.message.includes('Access denied') ? 403 : 500).json({ error: e.message });
  }
});

app.post('/api/mkdir', (req, res) => {
  try {
    const fp = safePath(req.body.folderPath);
    fs.mkdirSync(fp, { recursive: true });
    const gitkeep = path.join(fp, '.gitkeep');
    if (!fs.existsSync(gitkeep)) fs.writeFileSync(gitkeep, '');
    res.json({ success: true });
  } catch (e) {
    res.status(e.message.includes('Access denied') ? 403 : 500).json({ error: e.message });
  }
});

app.post('/api/rename', (req, res) => {
  try {
    const from = safePath(req.body.oldPath);
    const to = safePath(req.body.newPath);
    if (fs.existsSync(to)) return res.status(409).json({ error: 'A file with that name already exists' });
    fs.renameSync(from, to);
    res.json({ success: true });
  } catch (e) {
    res.status(e.message.includes('Access denied') ? 403 : 500).json({ error: e.message });
  }
});

// ── Git API ───────────────────────────────────────────────────────────────────
app.get('/api/git/status', async (req, res) => {
  try {
    const status = await git.status();
    res.json(status);
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

app.get('/api/git/log', async (req, res) => {
  try {
    const log = await git.log({ maxCount: 10 });
    res.json(log.all);
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

app.get('/api/git/export-log', async (req, res) => {
  try {
    const log = await git.log({ maxCount: 200 });
    const now = new Date().toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    const lines = [
      '# Change Log',
      `> Generated ${now}`,
      '',
    ];

    for (const c of log.all) {
      const date = new Date(c.date).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });

      lines.push('---', '');
      lines.push(`## ${c.message.replace(/[#*`_[\]]/g, '\\$&')}`);
      lines.push('');
      lines.push(`| | |`);
      lines.push(`|---|---|`);
      lines.push(`| **Author** | ${c.author_name} |`);
      lines.push(`| **Email**  | ${c.author_email} |`);
      lines.push(`| **When**   | ${date} |`);
      lines.push(`| **Commit** | \`${c.hash.substring(0, 7)}\` |`);
      lines.push('');

      try {
        // Files changed in this commit
        const filesRaw = await git.raw([
          'diff-tree', '--no-commit-id', '-r', '--name-status', c.hash
        ]);
        const files = filesRaw.trim().split('\n').filter(Boolean).map(line => {
          const [status, ...parts] = line.split('\t');
          return { status: status.trim(), file: parts.join('\t') };
        });

        if (files.length) {
          const statusLabel = s => ({ A: 'Added', M: 'Modified', D: 'Deleted', R: 'Renamed' }[s[0]] || s);
          lines.push('### Files changed');
          lines.push('');
          files.forEach(f => lines.push(`- **${statusLabel(f.status)}** \`${f.file}\``));
          lines.push('');

          // Full diff — limit to 500 lines per commit to keep file manageable
          const diffRaw = await git.raw([
            'show', '--format=', '-p', '--no-color', c.hash
          ]);
          const diffLines = diffRaw.split('\n');
          const truncated = diffLines.length > 500;
          const diffBody  = (truncated ? diffLines.slice(0, 500) : diffLines).join('\n').trim();

          if (diffBody) {
            lines.push('### Exact changes');
            lines.push('');
            lines.push('```diff');
            lines.push(diffBody);
            if (truncated) lines.push(`\n… (diff truncated — commit has ${diffLines.length} lines)`);
            lines.push('```');
            lines.push('');
          }
        }
      } catch (_) {
        lines.push('_Could not retrieve diff for this commit._', '');
      }
    }

    const content = lines.join('\n');
    const filename = `change-log-${new Date().toISOString().split('T')[0]}.md`;
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

app.post('/api/git/commit', async (req, res) => {
  try {
    await git.add('.');
    const msg = req.body.message?.trim() || 'Update content';
    const result = await git.commit(msg);
    broadcast('git_committed', { message: msg });
    res.json({ success: true, result });
  } catch (e) {
    if (e.message.includes('nothing to commit')) {
      return res.json({ success: true, nothing: true, message: 'Nothing new to save' });
    }
    res.status(500).json({ error: safeError(e) });
  }
});

// ── Conflict resolution helpers ───────────────────────────────────────────────

// Extract one side from a file that contains git conflict markers.
//   side = 'ours'   → lines between <<<<<<< and =======
//   side = 'theirs' → lines between ======= and >>>>>>>
// Lines outside any conflict block are included for both sides.
function extractConflictSide(content, side) {
  const lines = content.split('\n');
  const out   = [];
  let zone = 'normal'; // 'normal' | 'ours' | 'theirs'
  for (const line of lines) {
    if (/^<{7}/.test(line))              { zone = 'ours';   continue; }
    if (/^={7}$/.test(line) && zone !== 'normal') { zone = 'theirs'; continue; }
    if (/^>{7}/.test(line))              { zone = 'normal'; continue; }
    if (zone === 'normal' || zone === side) out.push(line);
  }
  return out.join('\n');
}

// Return the first unused numbered backup path for a conflicted file.
// e.g. 'notes/plan.md' → 'notes/plan-1.md' (or -2, -3 … if earlier ones exist).
function nextBackupPath(relPath) {
  const ext  = path.extname(relPath);
  const base = relPath.slice(0, relPath.length - ext.length);
  for (let n = 1; n <= 999; n++) {
    const candidate = `${base}-${n}${ext}`;
    if (!fs.existsSync(path.join(WORKSPACE, candidate))) return candidate;
  }
  return `${base}-${Date.now()}${ext}`;
}

// Detect which branch to use for push/pull:
// 1. Use the current local branch if it already tracks a remote branch.
// 2. Otherwise ask the remote what its HEAD is (works for GitHub repos).
// 3. Fall back to trying 'main', then 'master'.
async function resolveRemoteBranch() {
  // Current local branch name
  const branchSummary = await git.branchLocal().catch(() => ({ current: '' }));
  const localBranch   = branchSummary.current || '';

  // If the local branch already has a tracked upstream, use it as-is
  if (localBranch) {
    const tracking = await git.raw(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
                               .catch(() => '');
    if (tracking.trim()) return localBranch; // upstream is configured — trust it
  }

  // Ask the remote what its default branch is
  try {
    const symref = await git.raw(['ls-remote', '--symref', 'origin', 'HEAD']);
    // Output looks like:  ref: refs/heads/main\tHEAD
    const match = symref.match(/ref: refs\/heads\/([^\s]+)\s+HEAD/);
    if (match) return match[1];
  } catch (_) {}

  // Fall back: check which of main / master actually exists on the remote
  for (const candidate of ['main', 'master']) {
    const exists = await git.raw(['ls-remote', '--heads', 'origin', candidate])
                             .catch(() => '');
    if (exists.trim()) return candidate;
  }

  // Last resort: use local branch name or 'main'
  return localBranch || 'main';
}

app.post('/api/git/push', async (req, res) => {
  try {
    const branch = await resolveRemoteBranch();
    // --set-upstream so the branch tracks origin after the first push
    const result = await git.push(['--set-upstream', 'origin', branch]);
    broadcast('git_pushed', {});
    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ error: friendlyGitError(e) });
  }
});

app.post('/api/git/pull', async (req, res) => {
  // Auto-resolve any merge conflicts without user intervention:
  //   • Accept "theirs" (the shared/remote version) on the original file.
  //   • Save "ours" (the local edits) as a numbered backup — e.g. report-1.md.
  //   • Commit both so nothing is ever lost.
  // Returns an array of { original, backup } objects, or null if no conflicts.
  async function autoResolveConflicts() {
    const status = await git.status();
    if (status.conflicted.length === 0) return null;

    const backups = [];
    for (const file of status.conflicted) {
      const fp = path.join(WORKSPACE, file);
      let raw;
      try { raw = fs.readFileSync(fp, 'utf-8'); } catch { continue; }

      const oursContent   = extractConflictSide(raw, 'ours');
      const theirsContent = extractConflictSide(raw, 'theirs');
      const backupRel     = nextBackupPath(file);
      const backupFp      = path.join(WORKSPACE, backupRel);

      // Accept theirs on the original path
      pendingIgnore.add(file);
      fs.writeFileSync(fp, theirsContent, 'utf-8');
      await git.add(file);

      // Preserve ours as a numbered backup
      pendingIgnore.add(backupRel);
      fs.writeFileSync(backupFp, oursContent, 'utf-8');
      await git.add(backupRel);

      backups.push({ original: file, backup: backupRel });
    }

    const names = backups.map(b => `"${b.backup}"`).join(', ');
    await git.commit(`Merge: accepted shared version, local edits preserved as ${names}`);
    return backups;
  }

  try {
    const branch = await resolveRemoteBranch();

    // Set upstream tracking so future plain `git pull` works without arguments
    await git.raw(['branch', '--set-upstream-to', `origin/${branch}`, branch])
             .catch(() => {});

    // Snapshot HEAD before pulling so we can diff what actually changed when
    // simple-git's parser returns empty files[] (common after merge commits).
    const headBefore = await git.raw(['rev-parse', 'HEAD']).then(s => s.trim()).catch(() => null);

    let result;
    try {
      result = await git.pull('origin', branch, { '--no-rebase': null });
    } catch (pullErr) {
      // First-time pull between two independently-initialised repos
      if (/unrelated histories/i.test(pullErr.message || '')) {
        result = await git.pull('origin', branch, {
          '--no-rebase': null,
          '--allow-unrelated-histories': null,
        });
      } else {
        throw pullErr;
      }
    }

    // Auto-resolve any conflicts that arose from the merge
    const backups = await autoResolveConflicts();

    // Normalise files to a consistent array of path strings
    let pulledFiles = (result.files || []).map(f =>
      typeof f === 'string' ? f : (f.file || f.path || '')
    ).filter(Boolean);

    // simple-git sometimes returns an empty files[] after merge commits
    // (e.g. --allow-unrelated-histories).  Fall back to diffing before/after HEAD.
    if (pulledFiles.length === 0) {
      try {
        const headAfter = await git.raw(['rev-parse', 'HEAD']).then(s => s.trim()).catch(() => null);
        if (headAfter) {
          if (headBefore && headAfter !== headBefore) {
            const diffOut = await git.raw(['diff', '--name-only', headBefore, headAfter]);
            pulledFiles = diffOut.split('\n').map(s => s.trim()).filter(Boolean);
          } else if (!headBefore) {
            const diffOut = await git.raw(['diff-tree', '--no-commit-id', '-r', '--name-only', headAfter]);
            pulledFiles = diffOut.split('\n').map(s => s.trim()).filter(Boolean);
          }
        }
      } catch (_) {}
    }

    // Include the backup files so the tree refresh shows them immediately
    if (backups) {
      for (const b of backups) {
        if (!pulledFiles.includes(b.backup)) pulledFiles.push(b.backup);
      }
    }

    broadcast('git_pulled', { files: pulledFiles, summary: result.summary });
    res.json({ success: true, result: { ...result, files: pulledFiles }, backups: backups || [] });
  } catch (e) {
    // If pull threw due to conflicts, auto-resolve before giving up
    try {
      const backups = await autoResolveConflicts();
      if (backups) {
        const files = backups.flatMap(b => [b.original, b.backup]);
        broadcast('git_pulled', { files });
        return res.json({ success: true, result: { files }, backups });
      }
    } catch (_) {}
    res.status(500).json({ error: friendlyGitError(e) });
  }
});

app.post('/api/git/resolve', async (req, res) => {
  try {
    const { filePath, content } = req.body;
    const fp = safePath(filePath);
    fs.writeFileSync(fp, content, 'utf-8');
    await git.add(filePath);
    res.json({ success: true });
  } catch (e) {
    res.status(e.message.includes('Access denied') ? 403 : 500).json({ error: e.message });
  }
});

app.post('/api/git/resolve-commit', async (req, res) => {
  try {
    await git.commit('Resolve merge conflicts');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

app.get('/api/git/commit-files', async (req, res) => {
  try {
    const { hash } = req.query;
    // H2 — reject anything that isn't a valid hex commit hash
    if (!isValidHash(hash)) return res.status(400).json({ error: 'Invalid commit hash' });
    const result = await git.raw(['diff-tree', '--no-commit-id', '-r', '--name-status', hash]);
    const files = result.trim().split('\n').filter(Boolean).map(line => {
      const [status, ...fileParts] = line.split('\t');
      return { status: status.trim(), file: fileParts.join('\t') };
    });
    res.json({ files });
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

// ── Settings (identity + remote) ──────────────────────────────────────────────

// Quick check: does the content repo have a remote configured?
app.get('/api/settings/status', async (req, res) => {
  try {
    const remotes = await git.getRemotes(true).catch(() => []);
    const origin  = remotes.find(r => r.name === 'origin');
    const hasRemote = !!(origin?.refs?.fetch);
    res.json({ hasRemote });
  } catch (e) {
    res.json({ hasRemote: false });
  }
});

app.get('/api/settings', async (req, res) => {
  try {
    const name    = (await git.raw(['config', '--local', 'user.name' ]).catch(() => '')).trim();
    const email   = (await git.raw(['config', '--local', 'user.email']).catch(() => '')).trim();
    const remotes = await git.getRemotes(true).catch(() => []);
    const origin  = remotes.find(r => r.name === 'origin');
    const rawUrl  = origin?.refs?.fetch || '';

    // M1 — use URL constructor, not regex, to strip credentials
    const { clean: remoteUrl, hasCredentials, user: ghUser } = stripCredentialsFromUrl(rawUrl);

    res.json({ name, email, remoteUrl, ghUser, hasCredentials });
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const { name, email, repoUrl, ghUser, token } = req.body;

    // M4 — validate inputs before touching git config
    if (name   && typeof name   !== 'string') return res.status(400).json({ error: 'Invalid name' });
    if (email  && typeof email  !== 'string') return res.status(400).json({ error: 'Invalid email' });
    if (ghUser && typeof ghUser !== 'string') return res.status(400).json({ error: 'Invalid username' });
    if (token  && typeof token  !== 'string') return res.status(400).json({ error: 'Invalid token' });
    if (name?.length   > 200) return res.status(400).json({ error: 'Name too long' });
    if (email?.length  > 254) return res.status(400).json({ error: 'Email too long' });
    if (token?.length  > 500) return res.status(400).json({ error: 'Token too long' });

    if (repoUrl) {
      // Reject anything that isn't http/https
      let parsedRepo;
      try { parsedRepo = new URL(repoUrl); } catch {
        return res.status(400).json({ error: 'Invalid repository URL' });
      }
      if (!['http:', 'https:'].includes(parsedRepo.protocol)) {
        return res.status(400).json({ error: 'Repository URL must use https://' });
      }
    }

    if (name)  await git.addConfig('user.name',  name.trim(),  false, 'local');
    if (email) await git.addConfig('user.email', email.trim(), false, 'local');

    if (repoUrl) {
      const parsed = new URL(repoUrl.trim());
      if (!parsed.pathname.endsWith('.git')) parsed.pathname += '.git';

      let effectiveUser  = ghUser?.trim()  || '';
      let effectiveToken = token?.trim()   || '';

      // If no new token was submitted, preserve the one already stored in the remote URL
      if (!effectiveToken) {
        const existingRemotes = await git.getRemotes(true).catch(() => []);
        const existingOrigin  = existingRemotes.find(r => r.name === 'origin');
        const existingRaw     = existingOrigin?.refs?.fetch || '';
        try {
          const existingUrl = new URL(existingRaw);
          if (existingUrl.password) {
            effectiveToken = decodeURIComponent(existingUrl.password);
            if (!effectiveUser) effectiveUser = decodeURIComponent(existingUrl.username);
          }
        } catch (_) {}
      }

      // Embed credentials for push/pull — only for https
      if (effectiveUser && effectiveToken) {
        parsed.username = encodeURIComponent(effectiveUser);
        parsed.password = encodeURIComponent(effectiveToken);
      }

      const urlWithCreds = parsed.toString();
      const remotes = await git.getRemotes().catch(() => []);
      if (remotes.find(r => r.name === 'origin')) {
        await git.remote(['set-url', 'origin', urlWithCreds]);
      } else {
        await git.addRemote('origin', urlWithCreds);
      }

      // C1 — tighten permissions on .git/config so it is owner-read/write only
      const gitConfig = path.join(WORKSPACE, '.git', 'config');
      if (fs.existsSync(gitConfig)) {
        try { fs.chmodSync(gitConfig, 0o600); } catch (_) {}
      }
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

// Return current branch + all local and remote branches
app.get('/api/settings/branches', async (req, res) => {
  try {
    const summary = await git.branchLocal().catch(() => ({ current: 'main', all: [] }));
    const current = summary.current || 'main';

    // Collect remote branch names (strip "remotes/origin/" prefix)
    const allRaw = await git.raw(['branch', '-a']).catch(() => '');
    const remote = allRaw.split('\n')
      .map(l => l.trim().replace(/^\*\s*/, ''))
      .filter(l => l.startsWith('remotes/origin/') && !l.includes('HEAD'))
      .map(l => l.replace('remotes/origin/', ''));

    // Merge local + remote, deduplicate
    const branches = [...new Set([...summary.all, ...remote])].sort();
    res.json({ current, branches });
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

// Switch to a different branch (checkout; create if it doesn't exist locally)
app.post('/api/git/checkout', async (req, res) => {
  try {
    const { branch } = req.body;
    if (!branch || typeof branch !== 'string' || !/^[\w.\-/]+$/.test(branch)) {
      return res.status(400).json({ error: 'Invalid branch name' });
    }
    // Try checkout; if branch doesn't exist locally, create it tracking origin
    try {
      await git.checkout(branch);
    } catch (_) {
      await git.checkoutBranch(branch, `origin/${branch}`);
    }
    broadcast('branch_changed', { branch });
    res.json({ success: true, branch });
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

app.post('/api/git/test-connection', async (req, res) => {
  try {
    await git.raw(['ls-remote', '--heads', 'origin']);
    res.json({ success: true, message: 'Connected successfully' });
  } catch (e) {
    // C2 — scrub credentials from raw error; never send `detail` to client
    const msg = e.message || '';
    let friendly = 'Connection failed';
    if (/auth|403|401|credential/i.test(msg))          friendly = 'Authentication failed — check your username and token';
    else if (/not found|404|repository/i.test(msg))    friendly = 'Repository not found — check the URL';
    else if (/ENOTFOUND|network|resolve host/i.test(msg)) friendly = 'Network error — check your internet connection';
    else if (/access blocked/i.test(msg))              friendly = 'Access blocked — check your token has the repo scope';
    res.json({ success: false, message: friendly });
  }
});

// H1 — bind to loopback only; no LAN exposure
app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n🚀 Acceleratty is running!`);
  console.log(`   Open: http://localhost:${PORT}`);
  console.log(`   Workspace: ${WORKSPACE}\n`);
});
