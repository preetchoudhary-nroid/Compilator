const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

let mainWindow;

function fetchJson(requestUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(requestUrl);
    const lib = url.protocol === 'https:' ? https : http;
    const body = options.body ? JSON.stringify(options.body) : undefined;
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const json = data ? JSON.parse(data) : {};
            resolve(json);
          } catch (err) {
            reject(err);
          }
        });
      }
    );

    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

const aiServerUrl = process.env.AI_SERVER_URL || 'http://127.0.0.1:8080/v1/chat/completions';
const aiModel = process.env.AI_MODEL || 'gemma-3-4b';

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
  wc.send('task:update', { id: task.id, status: 'running', command });
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
  try {
    if (run.wc && !run.wc.isDestroyed() && reportPath) {
      run.wc.send('task:reportCreated', { id, reportPath });
    }
  } catch (err) {
    console.error('Failed to emit task:reportCreated:', err);
  }
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

function planFromRequest(request, installed) {
  const text = (request || '').toLowerCase().trim();
  const tasks = [];
  const tasks_skipped = [];

  const pushSkip = (reqText, reason) => {
    tasks_skipped.push({ request: reqText, reason });
  };

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
  const installMatch = text.match(/install\s+(.+)/);
  if (installMatch) {
    const requested = installMatch[1].trim();
    const entry = Object.entries(WINGET_CATALOG).find(
      ([key]) => requested.includes(key) || key.includes(requested)
    );
    if (entry) {
      const [, id] = entry;
      const installedPkg = findInstalled(installed, id);
      tasks.push({
        type: 'winget_install',
        label: `Install ${entry[0]} (${id})`,
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
    lines.push(`Skipped ${tasks_skipped.length} request(s): ${tasks_skipped.map((s) => s.request).join(', ')}`);
  }
  return lines.join('\n');
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
    wc.send('task:log', { id: task.id, line: data.toString() });
  });
  proc.stderr.on('data', (data) => {
    run.stderr.push(data.toString());
    wc.send('task:log', { id: task.id, line: data.toString() });
  });
  proc.on('error', (err) => {
    run.error = err;
    wc.send('task:log', { id: task.id, line: `\n[error] ${err.message}\n` });
    wc.send('task:update', { id: task.id, status: 'failed' });
    finishTaskRun(task.id, { status: 'failed', exitCode: null, error: err });
  });
  proc.on('close', (code) => {
    wc.send('task:log', { id: task.id, line: logPrefix ? `${logPrefix} exit code ${code}\n` : '' });
    const status = code === 0 ? 'done' : 'failed';
    wc.send('task:update', { id: task.id, status, exitCode: code });
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
      wc.send('task:log', { id: task.id, line: `Created folder: ${task.params.path}\n` });
      wc.send('task:update', { id: task.id, status: 'done' });
      finishTaskRun(task.id, { status: 'done', exitCode: 0, error: null });
    } catch (err) {
      run.error = err;
      wc.send('task:log', { id: task.id, line: `[error] ${err.message}\n` });
      wc.send('task:update', { id: task.id, status: 'failed' });
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
      wc.send('task:log', { id: task.id, line: `Wrote ${task.params.content?.length ?? 0} bytes to ${task.params.path}\n` });
      wc.send('task:update', { id: task.id, status: 'done' });
      finishTaskRun(task.id, { status: 'done', exitCode: 0, error: null });
    } catch (err) {
      run.error = err;
      wc.send('task:log', { id: task.id, line: `[error] ${err.message}\n` });
      wc.send('task:update', { id: task.id, status: 'failed' });
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
// IPC: chat with AI. The built-in planner always runs to convert the prompt
// into tasks (with already-installed detection). If an external local AI
// server is reachable, its reply is used for the chat text; otherwise the
// planner's summary reply is used.
// ---------------------------------------------------------------------------
ipcMain.handle('chat-with-ai', async (event, prompt) => {
  const installed = await getInstalledPackages();
  const plan = planFromRequest(prompt, installed);
  const fallbackReply = summarizePlan(plan);

  try {
    console.log(`Sending prompt to local AI server: ${prompt}`);
    const response = await fetchJson(aiServerUrl, {
      method: 'POST',
      body: {
        model: aiModel,
        messages: [{ role: 'user', content: prompt }],
      },
    });

    const reply =
      response?.choices?.[0]?.message?.content || response?.choices?.[0]?.text || '';
    return {
      success: true,
      reply: reply || fallbackReply,
      tasks: plan.tasks,
      tasks_skipped: plan.tasks_skipped,
      source: reply ? 'server' : 'planner',
    };
  } catch (error) {
    console.warn('AI server unreachable, using planner reply:', error?.message || error);
    return {
      success: true,
      reply: fallbackReply,
      tasks: plan.tasks,
      tasks_skipped: plan.tasks_skipped,
      source: 'planner',
    };
  }
});