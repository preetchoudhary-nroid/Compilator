const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createAssistant } = require('./ai/index.cjs');
const {
  extractInstallTarget,
  isNegated,
  resolveCatalogTarget,
} = require('./src/planner-core.js');

let mainWindow;

// Single reusable AI assistant — wires intent detection, runtime context,
// dynamic prompt building and the configured provider (Ollama / LM Studio /
// OpenAI / OpenRouter / Custom) with streaming support.
let assistant = null;
function getAssistant() {
  if (!assistant) assistant = createAssistant({ app });
  return assistant;
}


// ---------------------------------------------------------------------------
// REPORT SYSTEM
// Every executed task generates a text report under C:\AI\Reports. The folder
// structure below scales Compilator beyond just reports:
//   C:\AI\Reports   — task reports (YYYY-MM-DD_HH-mm-ss_<task-name>.txt)
//   C:\AI\Logs      — reserved for future logs
//   C:\AI\Config    — reserved for future configuration
//   C:\AI\Workspace — reserved for future workspace artifacts
// ---------------------------------------------------------------------------
const AI_ROOT = 'C:/AI';
const REPORT_DIR = path.join(AI_ROOT, 'Reports');

function ensureAIDirs() {
  for (const dir of ['Reports', 'Logs', 'Config', 'Workspace']) {
    fs.mkdirSync(path.join(AI_ROOT, dir), { recursive: true });
  }
}

function sanitizeTaskName(name) {
  const clean = String(name || 'task')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return clean || 'task';
}

const pad2 = (n) => String(n).padStart(2, '0');
const fmtDateTime = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
const fmtFileStamp = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}`;

const REPORT_STATUS = {
  done: 'Completed',
  already_installed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function buildReport(run) {
  const statusLabel = REPORT_STATUS[run.status] || String(run.status || 'Done');
  const durationSec = Math.max(0, Math.round((run.finishedAt - run.startedAt) / 1000));
  const stdoutText = run.stdout.length ? run.stdout.join('') : '(no output)';
  const stderrText = run.stderr.length ? run.stderr.join('') : '(no stderr)';
  const lines = [];
  lines.push('=====================================');
  lines.push('COMPILATOR TASK REPORT');
  lines.push('=====================================');
  lines.push('');
  lines.push('Task:');
  lines.push(run.task.label);
  lines.push('');
  lines.push('Type:');
  lines.push(run.task.type);
  lines.push('');
  lines.push('Started:');
  lines.push(run.startedAt ? fmtDateTime(run.startedAt) : '(unknown)');
  lines.push('');
  lines.push('Finished:');
  lines.push(run.finishedAt ? fmtDateTime(run.finishedAt) : '(unknown)');
  lines.push('');
  lines.push('Duration:');
  lines.push(`${durationSec} seconds`);
  lines.push('');
  lines.push('Status:');
  lines.push(statusLabel);
  lines.push('');
  lines.push('Command:');
  lines.push(run.task.command || '(none)');
  lines.push('');
  lines.push('Exit Code:');
  lines.push(run.exitCode === undefined || run.exitCode === null ? '(none)' : String(run.exitCode));
  lines.push('');
  lines.push('-------------------------------------');
  lines.push('OUTPUT');
  lines.push('-------------------------------------');
  lines.push('');
  lines.push(stdoutText);
  lines.push('');
  lines.push('-------------------------------------');
  lines.push('ERRORS');
  lines.push('-------------------------------------');
  lines.push('');
  lines.push(stderrText);
  if (run.error) {
    lines.push('');
    lines.push('Error Message:');
    lines.push(run.error.message || String(run.error));
    if (run.error.stack) {
      lines.push('');
      lines.push('Stack Trace:');
      lines.push(run.error.stack);
    }
  }
  lines.push('');
  lines.push('=====================================');
  lines.push('END REPORT');
  lines.push('=====================================');
  return lines.join('\n');
}

async function writeTaskReport(run) {
  try {
    ensureAIDirs();
    const fileName = `${fmtFileStamp(run.startedAt || new Date())}_${sanitizeTaskName(run.task.label)}.txt`;
    const reportPath = path.join(REPORT_DIR, fileName);
    await fs.promises.writeFile(reportPath, buildReport(run), 'utf8');
    return reportPath;
  } catch (err) {
    console.error('Failed to write task report:', err);
    return null;
  }
}

// In-memory record of currently running tasks so reports can capture full
// stdout/stderr, timing and failure details without changing the task format.
const activeTaskRuns = new Map();

// Send a renderer event without throwing when the window is gone. Long-running
// winget installs can outlive the window, so every renderer send is guarded.
function safeSend(wc, channel, payload) {
  try {
    if (wc && !wc.isDestroyed()) wc.send(channel, payload);
  } catch {
    // window may be gone mid-task — ignore
  }
}

function startTaskRun(task, wc, command) {
  const run = {
    id: task.id,
    task: { ...task, command },
    wc,
    startedAt: new Date(),
    stdout: [],
    stderr: [],
    error: null,
    status: 'running',
    exitCode: null,
    finishedAt: null,
    finished: false,
  };
  activeTaskRuns.set(task.id, run);
  safeSend(wc, 'task:update', { id: task.id, status: 'running', command });
  return run;
}

async function finishTaskRun(id, { status, exitCode, error }) {
  const run = activeTaskRuns.get(id);
  if (!run || run.finished) return;
  run.finished = true;
  run.status = status;
  run.exitCode = exitCode;
  run.error = error || run.error || null;
  run.finishedAt = new Date();
  const reportPath = await writeTaskReport(run);
  if (reportPath) safeSend(run.wc, 'task:reportCreated', { id, reportPath });
  else if (!run.wc || run.wc.isDestroyed()) console.warn('Main window closed before report for task', id, 'was delivered.');
  activeTaskRuns.delete(id);
}

// ---------------------------------------------------------------------------
// TASK PLANNER
// Converts a natural-language request into a structured task list exactly as
// specified by the Compilator planner rules. Does NOT execute anything — the
// human-approved execution step runs the tasks afterwards.
//
// Allowed task types: mkdir, winget_install, winget_list, write_file.
// ---------------------------------------------------------------------------
const ALLOWED_TYPES = ['mkdir', 'winget_install', 'winget_list', 'write_file'];

// Confident, real winget package ids only. Never guess.
const WINGET_CATALOG = {
  'visual studio code': 'Microsoft.VisualStudioCode',
  vscode: 'Microsoft.VisualStudioCode',
  'vs code': 'Microsoft.VisualStudioCode',
  node: 'OpenJS.NodeJS',
  nodejs: 'OpenJS.NodeJS',
  'node.js': 'OpenJS.NodeJS',
  python: 'Python.Python.3.12',
  'python 3.12': 'Python.Python.3.12',
  git: 'Git.Git',
  chrome: 'Google.Chrome',
  'google chrome': 'Google.Chrome',
  docker: 'Docker.DockerDesktop',
  'docker desktop': 'Docker.DockerDesktop',
};

const ESTIMATES = {
  mkdir: 2,
  winget_install: 180,
  winget_list: 15,
  write_file: 3,
};

// Parse "winget list" output: columns are Name / Id / Version / Available / Source.
function parseInstalledWingetOutput(output) {
  const packages = [];
  if (!output) return packages;
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^Name\b/.test(trimmed)) continue;
    if (/^[-─]+$/.test(trimmed)) continue;
    const cols = trimmed.split(/\s{2,}|\t+/);
    if (cols.length >= 3) {
      packages.push({ name: cols[0], id: cols[1], version: cols[2] });
    }
  }
  return packages;
}

function findInstalled(installed, wingetId) {
  const id = wingetId.toLowerCase();
  return installed.find((p) => p.id && p.id.toLowerCase() === id) || null;
}

function cleanPath(raw) {
  return raw
    .replace(/["']/g, '')
    .replace(/\b(?:named|called)\s+/i, '')
    .trim();
}

// Install-intent parsing lives in src/planner-core.js (shared with the
// browser-fallback planner in App.tsx): extractInstallTarget() handles any
// word order + conversational filler ("chrome install krde bhai",
// "chrome setup kar do"), and isNegated() blocks refusal/cancellation. We only
// build tasks for packages verified in WINGET_CATALOG — never guessed ones.

function planFromRequest(request, installed) {
  const text = (request || '').toLowerCase().trim();
  const tasks = [];
  const tasks_skipped = [];

  const pushSkip = (reqText, reason) => {
    tasks_skipped.push({ request: reqText, reason });
  };

  // ---- refusal / negation ------------------------------------------------
  // "i dont want to install X", "don't install chrome", "never mind",
  // "cancel the chrome installation" — never plan these.
  if (isNegated(text)) {
    pushSkip(request || '(empty request)', 'You asked not to install it — no action was planned.');
    return { tasks, tasks_skipped };
  }

  // ---- winget_list -------------------------------------------------------
  if (/(list installed|list packages|what's installed|what.*installed|installed packages|\blist\b)/.test(text)) {
    tasks.push({
      type: 'winget_list',
      label: 'List installed packages',
      params: {},
      estimated_seconds: ESTIMATES.winget_list,
      status: 'pending',
    });
    return { tasks, tasks_skipped };
  }

  // ---- mkdir -------------------------------------------------------------
  const mkdirMatch = text.match(/(?:mkdir|create folder|create directory|make folder|make directory|new folder)\s+(.+)/);
  if (mkdirMatch) {
    const folderPath = cleanPath(mkdirMatch[1]);
    if (folderPath) {
      tasks.push({
        type: 'mkdir',
        label: `Create folder ${folderPath}`,
        params: { path: folderPath },
        estimated_seconds: ESTIMATES.mkdir,
        status: 'pending',
      });
    }
    return { tasks, tasks_skipped };
  }

  // ---- write_file --------------------------------------------------------
  const writeMatch = text.match(
    /(?:write|create|save)\s+(?:a |the )?(?:file\s+)?(.+?)\s+(?:with|containing|content|that says|:)\s*([\s\S]*)/
  );
  if (writeMatch) {
    const filePath = cleanPath(writeMatch[1]);
    const content = writeMatch[2];
    if (filePath) {
      tasks.push({
        type: 'write_file',
        label: `Write file ${filePath}`,
        params: { path: filePath, content },
        estimated_seconds: ESTIMATES.write_file,
        status: 'pending',
      });
    }
    return { tasks, tasks_skipped };
  }
  const simpleWrite = text.match(/(?:write|create|save)\s+(?:a |the )?(?:file\s+)?["']?([^"']+)["']?\s*$/);
  if (simpleWrite && /write|create|save/.test(text)) {
    const filePath = cleanPath(simpleWrite[1]);
    if (filePath) {
      tasks.push({
        type: 'write_file',
        label: `Write file ${filePath}`,
        params: { path: filePath, content: '' },
        estimated_seconds: ESTIMATES.write_file,
        status: 'pending',
      });
    }
    return { tasks, tasks_skipped };
  }

  // ---- prepare AI development PC (curated plan) --------------------------
  if (/(prepare|set up|setup|ready)\b/.test(text) && /(ai|dev|development|environment|pc|computer)/.test(text)) {
    const vsCodeId = 'Microsoft.VisualStudioCode';
    const nodeId = 'OpenJS.NodeJS';
    const vsCodeInstalled = findInstalled(installed, vsCodeId);
    const nodeInstalled = findInstalled(installed, nodeId);
    tasks.push({
      type: 'mkdir',
      label: 'Create folder C:/AI',
      params: { path: 'C:/AI' },
      estimated_seconds: ESTIMATES.mkdir,
      status: 'pending',
    });
    tasks.push({
      type: 'winget_install',
      label: 'Install Visual Studio Code',
      params: { id: vsCodeId },
      estimated_seconds: vsCodeInstalled ? 0 : ESTIMATES.winget_install,
      status: vsCodeInstalled ? 'already_installed' : 'pending',
      ...(vsCodeInstalled ? { note: `Already installed (version ${vsCodeInstalled.version})` } : {}),
    });
    tasks.push({
      type: 'winget_install',
      label: 'Install Node.js',
      params: { id: nodeId },
      estimated_seconds: nodeInstalled ? 0 : ESTIMATES.winget_install,
      status: nodeInstalled ? 'already_installed' : 'pending',
      ...(nodeInstalled ? { note: `Already installed (version ${nodeInstalled.version})` } : {}),
    });
    return { tasks, tasks_skipped };
  }

  // ---- winget_install ----------------------------------------------------
  // Accepts natural phrasing: "install git", "git install", "chrome install krde bhai",
  // "install git please", "chrome setup kar do". Filler words are stripped by the
  // shared parser core before matching against the verified catalog.
  const requested = extractInstallTarget(text);
  if (requested) {
    const catalogHit = resolveCatalogTarget(requested, WINGET_CATALOG);
    if (catalogHit) {
      const { key, id } = catalogHit;
      const installedPkg = findInstalled(installed, id);
      tasks.push({
        type: 'winget_install',
        label: `Install ${key} (${id})`,
        params: { id },
        estimated_seconds: installedPkg ? 0 : ESTIMATES.winget_install,
        status: installedPkg ? 'already_installed' : 'pending',
        ...(installedPkg ? { note: `Already installed (version ${installedPkg.version})` } : {}),
      });
      return { tasks, tasks_skipped };
    }
    pushSkip(`install ${requested}`, 'Unknown or unverified winget package id — refusing to guess one.');
    return { tasks, tasks_skipped };
  }

  // An install-ish request we could not pin down — explain what we support.
  if (/\b(?:install|set ?up|setup)\b/i.test(text)) {
    pushSkip(
      text || '(empty request)',
      'I could not figure out which package to install. Supported: vscode, node, python, git, chrome, docker.'
    );
    return { tasks, tasks_skipped };
  }

  // ---- no match ----------------------------------------------------------
  pushSkip(
    text || '(empty request)',
    `Does not match any allowed task type (${ALLOWED_TYPES.join(', ')}).`
  );
  return { tasks, tasks_skipped };
}

function summarizePlan(plan) {
  const { tasks, tasks_skipped } = plan;
  const lines = [];
  if (tasks.length === 0) {
    lines.push("I couldn't turn that into any tasks.");
  } else {
    lines.push(`I planned ${tasks.length} task(s):`);
    tasks.forEach((t, i) => {
      const statusNote = t.status === 'already_installed' ? ' (already installed)' : '';
      lines.push(`${i + 1}. ${t.label}${statusNote}`);
    });
  }
  if (tasks_skipped.length > 0) {
    const shown = tasks_skipped.map((s) => {
      const text = String((s && s.request) || '').trim();
      return text && text !== '{}' ? text : '(unknown request)';
    });
    lines.push(`Skipped ${tasks_skipped.length} request(s): ${shown.join(', ')}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Validate + normalize a model-generated task plan. Enforces the allowed task
// types, a 5-task cap, real winget ids only, and re-checks installed packages.
function normalizePlannerPlan(plan, installed) {
  const tasks = [];
  const tasks_skipped = [];
  const seen = new Set();
  const validWingetIds = new Set(Object.values(WINGET_CATALOG).map((id) => id.toLowerCase()));

  const rawTasks = Array.isArray(plan && plan.tasks) ? plan.tasks : [];
  for (const raw of rawTasks.slice(0, 5)) {
    const type = String(raw.type || '');
    const label = String(raw.label || `${type} ${JSON.stringify(raw.params || {})}`);

    if (!ALLOWED_TYPES.includes(type)) {
      tasks_skipped.push({ request: label, reason: `Unknown task type: ${type}` });
      continue;
    }

    const params = { ...(raw.params || {}) };
    if (type === 'mkdir' || type === 'write_file') {
      params.path = cleanPath(String(params.path || ''));
      if (!params.path) {
        tasks_skipped.push({ request: label, reason: 'Missing path.' });
        continue;
      }
    }
    if (type === 'write_file') {
      params.content = String(params.content ?? '');
    }
    if (type === 'winget_install') {
      params.id = String(params.id || '');
      if (!params.id || !validWingetIds.has(params.id.toLowerCase())) {
        tasks_skipped.push({ request: label, reason: 'Unknown or unverified winget package id — refusing to guess one.' });
        continue;
      }
    }

    const dedupeKey = `${type}:${JSON.stringify(params)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const task = {
      type,
      label,
      params,
      estimated_seconds: ESTIMATES[type] || 3,
      status: 'pending',
    };

    if (type === 'winget_install') {
      const installedPkg = findInstalled(installed, params.id);
      if (installedPkg) {
        task.estimated_seconds = 0;
        task.status = 'already_installed';
        task.note = `Already installed (version ${installedPkg.version})`;
      }
    }
    tasks.push(task);
  }

  const rawSkipped = Array.isArray(plan && plan.tasks_skipped) ? plan.tasks_skipped : [];
  for (const skipped of rawSkipped) {
    if (skipped && skipped.request) {
      tasks_skipped.push({ request: String(skipped.request), reason: String(skipped.reason || 'No reason given') });
    }
  }
  return { tasks, tasks_skipped };
}

// ---------------------------------------------------------------------------
// AI plan → final plan decision.
// ---------------------------------------------------------------------------
// A normalized skipped entry is only worth surfacing when it actually names a
// real request and a real reason. Entries like
// { request: '{}', reason: 'Unknown task type: ' } are model garbage — the AI
// returned an empty/hallucinated plan and we must fall back to the built-in
// planner instead of showing the user "Skipped 1 request(s): {}".
function isJunkSkipped(entry) {
  if (!entry || typeof entry !== 'object') return true;
  const request = String(entry.request == null ? '' : entry.request).trim();
  const reason = String(entry.reason == null ? '' : entry.reason).trim();
  // The request text vanished ("{}") — no way to explain anything.
  if (!request || /^[{}[\]]+$/.test(request)) return true;
  // The type slot was empty ("Unknown task type: ") — an empty hallucinated
  // task entry, not a real explanation.
  if (!reason || /^unknown task type:?\s*$/i.test(reason)) return true;
  return false;
}

/**
 * Decide the final plan for a TASK-intent request.
 *
 * The AI model's plan is used ONLY when it contains real content (≥1 valid
 * task or an informative skipped entry). When the model returns empty or
 * hallucinated JSON — `{}`, `{"tasks":[]}`, `{"tasks":[{}]}`, `{"tasks":[],
 * "tasks_skipped":[]}` — which small local models do routinely, we fall back
 * to the deterministic built-in planner so a perfectly valid request like
 * "chrome install pls" is never lost as "{}".
 *
 * Refusal/cancellation is always decided from the user's own words first, so
 * "I don't want to install chrome" can never produce an install task even if
 * the model hallucinated one.
 */
function resolveAiPlan(result, prompt, installed) {
  if (isNegated(prompt || '')) {
    const refused = planFromRequest(prompt || '', installed);
    return {
      tasks: refused.tasks,
      tasks_skipped: refused.tasks_skipped,
      reply: summarizePlan(refused),
      source: 'planner',
    };
  }

  const normalized = normalizePlannerPlan(result.plan || {}, installed);
  const hasRealContent =
    normalized.tasks.length > 0 ||
    normalized.tasks_skipped.some((s) => !isJunkSkipped(s));

  if (hasRealContent) {
    return {
      tasks: normalized.tasks,
      tasks_skipped: normalized.tasks_skipped,
      reply: summarizePlan(normalized),
      source: 'server',
    };
  }

  // Empty/hallucinated AI plan — fall back to the built-in planner.
  const fallback = planFromRequest(prompt || '', installed);
  if (fallback.tasks.length > 0 || fallback.tasks_skipped.length > 0) {
    return {
      tasks: fallback.tasks,
      tasks_skipped: fallback.tasks_skipped,
      reply: summarizePlan(fallback),
      source: 'planner',
    };
  }
  return {
    tasks: [],
    tasks_skipped: [],
    reply: "I couldn't turn that into any tasks.",
    source: 'planner',
  };
}

// Run "winget list" and return parsed installed packages (best effort).
async function getInstalledPackages() {
  return new Promise((resolve) => {
    const proc = spawn('winget', ['list', '--accept-source-agreements']);
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill();
      resolve([]);
    }, 30000);

    proc.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    proc.on('error', () => {
      clearTimeout(timer);
      resolve([]);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve([]);
        return;
      }
      resolve(parseInstalledWingetOutput(stdout));
    });
  });
}

// ---------------------------------------------------------------------------
// EXECUTION ENGINE — spawn-based; emits task:update / task:log live events.
// ---------------------------------------------------------------------------
function streamWinget(task, wc, args, command, logPrefix) {
  const run = startTaskRun(task, wc, command);
  const proc = spawn('winget', args);
  proc.stdout.on('data', (data) => {
    run.stdout.push(data.toString());
    safeSend(wc, 'task:log', { id: task.id, line: data.toString() });
  });
  proc.stderr.on('data', (data) => {
    run.stderr.push(data.toString());
    safeSend(wc, 'task:log', { id: task.id, line: data.toString() });
  });
  proc.on('error', (err) => {
    run.error = err;
    safeSend(wc, 'task:log', { id: task.id, line: `\n[error] ${err.message}\n` });
    safeSend(wc, 'task:update', { id: task.id, status: 'failed' });
    finishTaskRun(task.id, { status: 'failed', exitCode: null, error: err });
  });
  proc.on('close', (code) => {
    safeSend(wc, 'task:log', { id: task.id, line: logPrefix ? `${logPrefix} exit code ${code}\n` : '' });
    const status = code === 0 ? 'done' : 'failed';
    safeSend(wc, 'task:update', { id: task.id, status, exitCode: code });
    finishTaskRun(task.id, { status, exitCode: code, error: status === 'failed' ? new Error(`Process exited with code ${code}`) : null });
  });
}

const TASK_RUNNERS = {
  'winget_install': (task, wc) => {
    const id = task.params.id;
    streamWinget(task, wc, ['install', '--id', id, '--silent'], `winget install --id ${id} --silent`, '[winget]');
  },
  'winget_list': (task, wc) => {
    streamWinget(task, wc, ['list', '--accept-source-agreements'], 'winget list --accept-source-agreements', '[winget]');
  },
  'mkdir': async (task, wc) => {
    const command = `mkdir ${task.params.path}`;
    const run = startTaskRun(task, wc, command);
    try {
      await fs.promises.mkdir(task.params.path, { recursive: true });
      run.stdout.push(`Created folder: ${task.params.path}\n`);
      safeSend(wc, 'task:log', { id: task.id, line: `Created folder: ${task.params.path}\n` });
      safeSend(wc, 'task:update', { id: task.id, status: 'done' });
      finishTaskRun(task.id, { status: 'done', exitCode: 0, error: null });
    } catch (err) {
      run.error = err;
      safeSend(wc, 'task:log', { id: task.id, line: `[error] ${err.message}\n` });
      safeSend(wc, 'task:update', { id: task.id, status: 'failed' });
      finishTaskRun(task.id, { status: 'failed', exitCode: null, error: err });
    }
  },
  'write_file': async (task, wc) => {
    const command = `write_file ${task.params.path}`;
    const run = startTaskRun(task, wc, command);
    try {
      const dir = path.dirname(task.params.path);
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(task.params.path, task.params.content ?? '', 'utf8');
      run.stdout.push(`Wrote ${task.params.content?.length ?? 0} bytes to ${task.params.path}\n`);
      safeSend(wc, 'task:log', { id: task.id, line: `Wrote ${task.params.content?.length ?? 0} bytes to ${task.params.path}\n` });
      safeSend(wc, 'task:update', { id: task.id, status: 'done' });
      finishTaskRun(task.id, { status: 'done', exitCode: 0, error: null });
    } catch (err) {
      run.error = err;
      safeSend(wc, 'task:log', { id: task.id, line: `[error] ${err.message}\n` });
      safeSend(wc, 'task:update', { id: task.id, status: 'failed' });
      finishTaskRun(task.id, { status: 'failed', exitCode: null, error: err });
    }
  },
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    backgroundColor: '#0a0a0f',
    autoHideMenuBar: true,
    title: 'Compilator',
  });

  // In development, load the vite dev server
  const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';

  if (isDev) {
    const devUrl = 'http://127.0.0.1:5173';
    console.log(`Loading dev URL: ${devUrl}`);
    mainWindow.loadURL(devUrl);
  } else {
    // In production, load the built index.html
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  ensureAIDirs();
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------------------------
// IPC: run a task through the execution engine (human-approved).
// ---------------------------------------------------------------------------
ipcMain.handle('execute-task', async (event, payload) => {
  const { taskId, type, params } = payload || {};
  console.log(`Executing task ${taskId} (${type})`);

  const runner = TASK_RUNNERS[type];
  if (!runner) {
    return { success: false, taskId, error: `Unsupported task type: ${type || '(missing)'}` };
  }
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { success: false, taskId, error: 'No active window to run the task in' };
  }

  runner({ id: taskId, params: params || {} }, mainWindow.webContents);
  return { success: true, taskId };
});

// ---------------------------------------------------------------------------
// IPC: open a generated report file with the OS default application.
// ---------------------------------------------------------------------------
ipcMain.handle('open-report', async (event, reportPath) => {
  if (typeof reportPath !== 'string' || !reportPath) {
    return { success: false, error: 'Invalid report path' };
  }
  const failure = await shell.openPath(reportPath);
  return failure ? { success: false, error: failure } : { success: true };
});

// ---------------------------------------------------------------------------
// IPC: reveal the folder containing a generated report in the OS file manager.
// ---------------------------------------------------------------------------
ipcMain.handle('open-report-folder', async (event, reportPath) => {
  if (typeof reportPath !== 'string' || !reportPath) {
    return { success: false, error: 'Invalid report path' };
  }
  const folder = path.dirname(reportPath);
  const failure = await shell.openPath(folder);
  return failure ? { success: false, error: failure } : { success: true };
});

// ---------------------------------------------------------------------------
// IPC: chat with AI.
//
// Every request flows through the AI Context System (ai/index.cjs):
//
//   User → Intent Detection → AI Context Builder → Prompt Builder
//        → Provider (Ollama / LM Studio / OpenAI / OpenRouter / Custom)
//        → Response (streaming or full) → plan validation
//
// The assistant classifies each user message as CHAT / TASK / UNKNOWN and
// replies with either conversational text (CHAT / UNKNOWN) or planner JSON
// (TASK).
//
//   - CHAT / UNKNOWN → natural-language streaming reply, NO tasks created.
//   - TASK → the JSON plan is re-validated against the allowed task types,
//            real winget ids, the 5-task cap and installed package state,
//            then returned as task cards.
//
// Streaming chunks are forwarded to the renderer as `chat:chunk`; the final
// result (including the fallback-planner path) arrives as `chat:done`. The
// renderer correlates events with the free-form `requestId` we pass along.
//
// If the AI provider is unreachable, the built-in planner handles real
// computer-task requests; conversational input gets a friendly reply.
// ---------------------------------------------------------------------------
ipcMain.handle('chat-with-ai', async (event, { prompt, requestId }) => {
  const installed = await getInstalledPackages();
  const wc = event.sender;
  const reqId = String(requestId || `req_${Date.now()}`);

  // Forward every streamed token to the renderer immediately.
  const sendChunk = (chunk, full) => {
    try {
      if (!wc.isDestroyed()) wc.send('chat:chunk', { requestId: reqId, chunk, full });
    } catch {
      // window may be gone mid-stream — ignore
    }
  };

  try {
    console.log(`Sending prompt to AI provider: ${prompt}`);

    const result = await getAssistant().ask(prompt, {
      installedPackages: installed,
      onChunk: sendChunk,
    });

    if (!result.success) {
      throw new Error(result.error || 'AI provider request failed');
    }

    // TASK — the assistant parsed planner JSON. Re-validate against the
    // allowed types, verified winget ids, the 5-task cap and installed
    // package state, then surface as cards with a readable summary. When the
    // model's plan turns out empty/hallucinated ({} / []), fall back to the
    // built-in planner so the user's real request is never lost.
    let tasks = [];
    let tasks_skipped = [];
    let reply = result.reply;
    let source = 'server';

    if (result.intent === 'TASK') {
      const resolved = resolveAiPlan(result, prompt || '', installed);
      tasks = resolved.tasks;
      tasks_skipped = resolved.tasks_skipped;
      reply = resolved.reply;
      source = resolved.source;
    }

    const done = {
      success: true,
      intent: result.intent,
      reply,
      tasks,
      tasks_skipped,
      source,
    };

    if (!wc.isDestroyed()) wc.send('chat:done', { requestId: reqId, result: done });
    return { success: true, requestId: reqId };
  } catch (error) {
    console.warn('AI provider unreachable, using built-in planner:', error?.message || error);

    // Offline fallback: the built-in planner only handles real computer-task
    // requests; everything else stays conversational.
    const plan = planFromRequest(prompt || '', installed);
    let result;
    // Surface the plan even when it only contains skipped requests, so the user
    // always sees *why* nothing was planned.
    if (plan.tasks.length > 0 || plan.tasks_skipped.length > 0) {
      result = {
        success: true,
        intent: 'TASK',
        reply: summarizePlan(plan),
        tasks: plan.tasks,
        tasks_skipped: plan.tasks_skipped,
        source: 'planner',
      };
    } else {
      result = {
        success: true,
        intent: 'CHAT',
        reply:
          "Hello! I'm Compilator, your desktop assistant. My local AI model isn't connected right now, " +
          "but I can still plan computer tasks like installing Git, creating folders, writing files, " +
          'or listing installed packages. What would you like to do?',
        tasks: [],
        tasks_skipped: [],
        source: 'planner',
      };
    }

    if (!wc.isDestroyed()) wc.send('chat:done', { requestId: reqId, result });
    return { success: true, requestId: reqId };
  }
});

// ---------------------------------------------------------------------------
// Internal API exposed only for smoke tests. The Electron main entry never
// consumes these exports, so this is inert at runtime.
// ---------------------------------------------------------------------------
module.exports._internal = {
  planFromRequest,
  normalizePlannerPlan,
  resolveAiPlan,
  isJunkSkipped,
  summarizePlan,
  cleanPath,
  extractInstallTarget,
  isNegated,
};

