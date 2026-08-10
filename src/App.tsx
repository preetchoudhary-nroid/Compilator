import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import FloatingTerminal, { type TerminalBounds } from './components/FloatingTerminal';
import { extractInstallTarget, isNegated, resolveCatalogTarget } from './planner-core.js';

declare global {
  interface Window {
    electronAPI?: {
      executeTask: (p: { taskId: string; type: string; params: Record<string, string> }) => Promise<{ success: boolean; taskId: string; error?: string }>;
      chatWithAI: (prompt: string, requestId: string) => Promise<{ success: boolean; requestId: string; error?: string }>;
      wingetList: () => Promise<{ success: boolean; output?: string; error?: string }>;
      openReport: (reportPath: string) => Promise<{ success: boolean; error?: string }>;
      openReportFolder: (reportPath: string) => Promise<{ success: boolean; error?: string }>;
      onTaskUpdate: (cb: (d: { id: string; status: string; command?: string }) => void) => () => void;
      onTaskLog: (cb: (d: { id: string; line: string }) => void) => () => void;
      onReportCreated: (cb: (d: { id: string; reportPath: string }) => void) => () => void;
      onChatChunk: (cb: (d: { requestId: string; chunk: string; full: string }) => void) => () => void;
      onChatDone: (cb: (d: { requestId: string; result: { success: boolean; intent: string; reply: string; tasks?: PlannerTask[]; tasks_skipped?: SkippedRequest[]; source?: string } }) => void) => () => void;
    };
  }
}

type TaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'already_installed';

interface PlannerTask {
  type: 'mkdir' | 'winget_install' | 'winget_list' | 'write_file';
  label: string;
  params: { path?: string; id?: string; content?: string };
  estimated_seconds: number;
  status: 'pending' | 'already_installed';
  note?: string;
}

interface SkippedRequest { request: string; reason: string }
interface UiTask extends Omit<PlannerTask, 'status'> { id: string; status: TaskStatus; command?: string }
interface LogEntry { id: string; line: string }
interface Message { role: 'user' | 'ai'; text: string; requestId?: string }

const CATALOG: Record<string, { name: string; id: string }> = {
  // ---- Development ---------------------------------------------
  vscode: { name: 'Visual Studio Code', id: 'Microsoft.VisualStudioCode' },
  'visual studio code': { name: 'Visual Studio Code', id: 'Microsoft.VisualStudioCode' },
  'vs code': { name: 'Visual Studio Code', id: 'Microsoft.VisualStudioCode' },
  'node lts': { name: 'Node.js LTS', id: 'OpenJS.NodeJS.LTS' },
  'node.js lts': { name: 'Node.js LTS', id: 'OpenJS.NodeJS.LTS' },
  'nodejs lts': { name: 'Node.js LTS', id: 'OpenJS.NodeJS.LTS' },
  node: { name: 'Node.js', id: 'OpenJS.NodeJS' },
  nodejs: { name: 'Node.js', id: 'OpenJS.NodeJS' },
  'node.js': { name: 'Node.js', id: 'OpenJS.NodeJS' },
  'python 3.13': { name: 'Python 3.13', id: 'Python.Python.3.13' },
  'python 3.12': { name: 'Python 3.12', id: 'Python.Python.3.12' },
  python: { name: 'Python 3.13', id: 'Python.Python.3.13' },
  git: { name: 'Git', id: 'Git.Git' },
  'github desktop': { name: 'GitHub Desktop', id: 'GitHub.GitHubDesktop' },
  'visual studio 2022 community': { name: 'Visual Studio 2022 Community', id: 'Microsoft.VisualStudio.2022.Community' },
  'visual studio 2022': { name: 'Visual Studio 2022 Community', id: 'Microsoft.VisualStudio.2022.Community' },
  java: { name: 'Java JDK 21 (Temurin)', id: 'EclipseAdoptium.Temurin.21.JDK' },
  'java jdk': { name: 'Java JDK 21 (Temurin)', id: 'EclipseAdoptium.Temurin.21.JDK' },
  jdk: { name: 'Java JDK 21 (Temurin)', id: 'EclipseAdoptium.Temurin.21.JDK' },
  temurin: { name: 'Java JDK 21 (Temurin)', id: 'EclipseAdoptium.Temurin.21.JDK' },
  'go lang': { name: 'Go', id: 'GoLang.Go' },
  golang: { name: 'Go', id: 'GoLang.Go' },
  go: { name: 'Go', id: 'GoLang.Go' },
  rustup: { name: 'Rust (rustup)', id: 'Rustlang.Rustup' },
  rustlang: { name: 'Rust (rustup)', id: 'Rustlang.Rustup' },
  rust: { name: 'Rust (rustup)', id: 'Rustlang.Rustup' },
  docker: { name: 'Docker Desktop', id: 'Docker.DockerDesktop' },
  'docker desktop': { name: 'Docker Desktop', id: 'Docker.DockerDesktop' },
  postman: { name: 'Postman', id: 'Postman.Postman' },
  dbeaver: { name: 'DBeaver Community', id: 'DBeaver.DBeaver.Community' },
  mysql: { name: 'MySQL', id: 'Oracle.MySQL' },
  postgresql: { name: 'PostgreSQL', id: 'PostgreSQL.PostgreSQL' },
  postgres: { name: 'PostgreSQL', id: 'PostgreSQL.PostgreSQL' },

  // ---- Developer utilities --------------------------------------
  '7zip': { name: '7-Zip', id: '7zip.7zip' },
  '7-zip': { name: '7-Zip', id: '7zip.7zip' },
  '7 zip': { name: '7-Zip', id: '7zip.7zip' },
  'powershell 7': { name: 'PowerShell 7', id: 'Microsoft.PowerShell' },
  powershell: { name: 'PowerShell 7', id: 'Microsoft.PowerShell' },
  'windows terminal': { name: 'Windows Terminal', id: 'Microsoft.WindowsTerminal' },
  'notepad++': { name: 'Notepad++', id: 'Notepad++.Notepad++' },
  notepad: { name: 'Notepad++', id: 'Notepad++.Notepad++' },
  everything: { name: 'Everything', id: 'voidtools.Everything' },
  winmerge: { name: 'WinMerge', id: 'WinMerge.WinMerge' },
  jq: { name: 'jq', id: 'jqlang.jq' },
  cmake: { name: 'CMake', id: 'Kitware.CMake' },
  ninja: { name: 'Ninja', id: 'Ninja-build.Ninja' },
  llvm: { name: 'LLVM', id: 'LLVM.LLVM' },

  // ---- Browsers --------------------------------------------------
  chrome: { name: 'Google Chrome', id: 'Google.Chrome' },
  'google chrome': { name: 'Google Chrome', id: 'Google.Chrome' },
  firefox: { name: 'Mozilla Firefox', id: 'Mozilla.Firefox' },
  edge: { name: 'Microsoft Edge', id: 'Microsoft.Edge' },
  'microsoft edge': { name: 'Microsoft Edge', id: 'Microsoft.Edge' },
  brave: { name: 'Brave', id: 'Brave.Brave' },
  opera: { name: 'Opera', id: 'Opera.Opera' },
  vivaldi: { name: 'Vivaldi', id: 'Vivaldi.Vivaldi' },

  // ---- Design / media --------------------------------------------
  vlc: { name: 'VLC', id: 'VideoLAN.VLC' },
  'obs studio': { name: 'OBS Studio', id: 'OBSProject.OBSStudio' },
  obs: { name: 'OBS Studio', id: 'OBSProject.OBSStudio' },
  gimp: { name: 'GIMP', id: 'GIMP.GIMP' },
  inkscape: { name: 'Inkscape', id: 'Inkscape.Inkscape' },
  blender: { name: 'Blender', id: 'BlenderFoundation.Blender' },
  audacity: { name: 'Audacity', id: 'Audacity.Audacity' },
  handbrake: { name: 'HandBrake', id: 'HandBrake.HandBrake' },
  krita: { name: 'Krita', id: 'KDE.Krita' },

  // ---- Networking / remote administration -------------------------
  wireshark: { name: 'Wireshark', id: 'WiresharkFoundation.Wireshark' },
  putty: { name: 'PuTTY', id: 'PuTTY.PuTTY' },
  winscp: { name: 'WinSCP', id: 'WinSCP.WinSCP' },
  tailscale: { name: 'Tailscale', id: 'Tailscale.Tailscale' },
  openvpn: { name: 'OpenVPN', id: 'OpenVPNTechnologies.OpenVPN' },
  rustdesk: { name: 'RustDesk', id: 'RustDesk.RustDesk' },

  // ---- Productivity ----------------------------------------------
  libreoffice: { name: 'LibreOffice', id: 'TheDocumentFoundation.LibreOffice' },
  obsidian: { name: 'Obsidian', id: 'Obsidian.Obsidian' },
  notion: { name: 'Notion', id: 'Notion.Notion' },
  sharex: { name: 'ShareX', id: 'ShareX.ShareX' },
  powertoys: { name: 'Microsoft PowerToys', id: 'Microsoft.PowerToys' },
  'power toys': { name: 'Microsoft PowerToys', id: 'Microsoft.PowerToys' },

  // ---- Gaming ------------------------------------------------------
  steam: { name: 'Steam', id: 'Valve.Steam' },
  'epic games launcher': { name: 'Epic Games Launcher', id: 'EpicGames.EpicGamesLauncher' },
  'epic games': { name: 'Epic Games Launcher', id: 'EpicGames.EpicGamesLauncher' },
  epic: { name: 'Epic Games Launcher', id: 'EpicGames.EpicGamesLauncher' },
  'gog galaxy': { name: 'GOG Galaxy', id: 'GOG.Galaxy' },
  gog: { name: 'GOG Galaxy', id: 'GOG.Galaxy' },
  'ubisoft connect': { name: 'Ubisoft Connect', id: 'Ubisoft.Connect' },
  ubisoft: { name: 'Ubisoft Connect', id: 'Ubisoft.Connect' },
  discord: { name: 'Discord', id: 'Discord.Discord' },
};

const clean = (s: string) => s.replace(/["']/g, '').replace(/\b(?:named|called)\s+/i, '').trim();

// Install-intent parsing lives in ./planner-core.js (shared with the Electron
// main-process planner): extractInstallTarget() handles any word order +
// conversational filler, and isNegated() blocks refusal/cancellation.

const DEFAULT_TERMINAL_BOUNDS = { width: 600, height: 420 };

interface TerminalWindowState {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  closed: boolean;
  zIndex: number;
}

function browserPlanner(request: string): { tasks: PlannerTask[]; tasks_skipped: SkippedRequest[] } {
  const text = (request || '').toLowerCase().trim();
  const tasks: PlannerTask[] = [];
  const tasks_skipped: SkippedRequest[] = [];
  const skip = (r: string, reason: string) => tasks_skipped.push({ request: r, reason });

  // Negation — "i dont want to install chrome", "never mind", "cancel …"
  // must never create an install.
  if (isNegated(text)) {
    skip(text, 'You asked not to install it — no action was planned.');
    return { tasks, tasks_skipped };
  }

  if (/(list installed|list packages|installed packages|\blist\b)/.test(text)) {
    tasks.push({ type: 'winget_list', label: 'List installed packages', params: {}, estimated_seconds: 15, status: 'pending' });
    return { tasks, tasks_skipped };
  }
  const mk = text.match(/(?:mkdir|create folder|create directory|new folder)\s+(.+)/);
  if (mk) {
    const p = clean(mk[1]);
    if (p) tasks.push({ type: 'mkdir', label: `Create folder ${p}`, params: { path: p }, estimated_seconds: 2, status: 'pending' });
    return { tasks, tasks_skipped };
  }
  const wr = text.match(/(?:write|create|save)\s+(?:a |the )?(?:file\s+)?(.+?)\s+(?:with|containing|content|:)\s*([\s\S]*)/);
  if (wr) {
    const p = clean(wr[1]);
    if (p) tasks.push({ type: 'write_file', label: `Write file ${p}`, params: { path: p, content: wr[2] }, estimated_seconds: 3, status: 'pending' });
    return { tasks, tasks_skipped };
  }
  const insRequested = extractInstallTarget(text);
  if (insRequested) {
    const hit = resolveCatalogTarget(insRequested, CATALOG);
    if (hit) {
      const meta = CATALOG[hit.key];
      tasks.push({ type: 'winget_install', label: `Install ${meta.name} (${meta.id})`, params: { id: meta.id }, estimated_seconds: 180, status: 'pending' });
    } else {
      skip(`install ${insRequested}`, 'Unknown or unverified winget package id — refusing to guess one.');
    }
    return { tasks, tasks_skipped };
  }
  if (/\b(?:install|set ?up|setup)\b/i.test(text)) {
    skip(text, 'I could not figure out which package to install. I know 50+ verified winget packages (dev tools, browsers, media, networking, productivity, gaming) — try "install <software name>", e.g. "install github desktop".');
    return { tasks, tasks_skipped };
  }
  skip(text || '(empty request)', 'Does not match any allowed task type (mkdir, winget_install, winget_list, write_file).');
  return { tasks, tasks_skipped };
}

function badge(status: TaskStatus): string {
  return { running: 'Running...', done: 'Completed', failed: 'Failed', pending: 'Pending', already_installed: 'Already Installed' }[status];
}

function App() {
  const [tasks, setTasks] = useState<UiTask[]>([]);
  const [skipped, setSkipped] = useState<SkippedRequest[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', text: "Hello! I'm the Compilator task planner. Try: 'prepare my AI development pc', 'install git', 'create folder C:/AI', 'write file config.json with hello', or 'list installed packages'." },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [reports, setReports] = useState<Record<string, string>>({});
  const boxRef = useRef<HTMLDivElement>(null);

  // ---- Floating terminal window management --------------------------------
  // Every task that has ever opened a terminal window keeps its state here
  // for the whole application session. Closing a window only toggles
  // `closed` — the window object (with logs, bounds, z-index) is preserved so
  // reopening restores everything and no duplicate windows are ever created.
  const [terminalWindows, setTerminalWindows] = useState<Record<string, TerminalWindowState>>({});
  // Monotonic z-index counter so newly focused windows always render on top.
  const [zCounter, setZCounter] = useState(1000);

  const openTerminal = useCallback((id: string) => {
    setTerminalWindows(prev => {
      const existing = prev[id];
      if (existing) {
        // Reopening an existing window: restore it (no duplicate) and bring
        // it to the front with a fresh z-index.
        return {
          ...prev,
          [id]: {
            ...existing,
            closed: false,
            zIndex: zCounter + 1,
          },
        };
      }
      const count = Object.keys(prev).length;
      return {
        ...prev,
        [id]: {
          id,
          ...DEFAULT_TERMINAL_BOUNDS,
          x: 80 + (count % 6) * 40,
          y: 80 + (count % 6) * 36,
          minimized: false,
          closed: false,
          zIndex: zCounter + 1,
        },
      };
    });
    setZCounter(z => z + 1);
  }, [zCounter]);

  // Close only hides the window. Logs keep streaming and the task keeps
  // running; reopening restores the accumulated logs, bounds and z-index.
  const closeTerminal = (id: string) => {
    setTerminalWindows(prev => {
      const win = prev[id];
      if (!win) return prev;
      return { ...prev, [id]: { ...win, closed: true } };
    });
  };

  const focusTerminal = (id: string) => {
    setTerminalWindows(prev => {
      const win = prev[id];
      if (!win || win.closed) return prev;
      // Keep every other window's z-index; raise only this one above all.
      const maxZ = Math.max(1000, ...Object.values(prev).map(w => w.zIndex));
      if (win.zIndex === maxZ) return prev;
      const nextZ = maxZ + 1;
      return { ...prev, [id]: { ...win, zIndex: nextZ } };
    });
  };

  const toggleMinimizeTerminal = (id: string) => {
    setTerminalWindows(prev => {
      const win = prev[id];
      if (!win || win.closed) return prev;
      return { ...prev, [id]: { ...win, minimized: !win.minimized } };
    });
  };

  const updateTerminalBounds = (id: string, bounds: TerminalBounds) => {
    setTerminalWindows(prev => {
      const win = prev[id];
      if (!win) return prev;
      return { ...prev, [id]: { ...win, ...bounds } };
    });
  };

  useEffect(() => window.electronAPI?.onTaskUpdate(({ id, status, command }) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: status as TaskStatus, ...(command ? { command } : {}) } : t));
    if (status === 'running') openTerminal(id);
  }), [openTerminal]);
  useEffect(() => window.electronAPI?.onTaskLog(({ id, line }) => {
    setLogs(prev => [...prev, { id, line }]);
  }), []);
  useEffect(() => window.electronAPI?.onReportCreated(({ id, reportPath }) => {
    setReports(prev => ({ ...prev, [id]: reportPath }));
  }), []);

  // ---- AI chat streaming -------------------------------------------------
  // The AI provider streams tokens while answering. Chunks update the
  // placeholder message live; the final `chat:done` event replaces it with
  // the full reply (or the fallback planner's reply) and integrates any
  // planned tasks. Events are correlated by requestId so parallel requests
  // never cross-talk.
  useEffect(() => {
    const unsubChunk = window.electronAPI?.onChatChunk(({ requestId, full }) => {
      setMessages(m => m.map(msg => msg.requestId === requestId ? { ...msg, text: full } : msg));
    });
    const unsubDone = window.electronAPI?.onChatDone(({ requestId, result }) => {
      setSending(false);
      setMessages(m => m.map(msg => msg.requestId === requestId ? { role: 'ai', text: result.reply, requestId: undefined } : msg));
      if (result.tasks?.length) {
        const planned = result.tasks;
        setTasks(prev => {
          const map = new Map(prev.map(t => [t.id, t]));
          planned.forEach((t, i) => map.set(`${t.type}-${Date.now()}-${i}`, { ...t, id: `${t.type}-${Date.now()}-${i}`, status: t.status }));
          return [...map.values()];
        });
      }
      if (result.tasks_skipped?.length) setSkipped(result.tasks_skipped);
    });
    return () => { unsubChunk?.(); unsubDone?.(); };
  }, []);

  useEffect(() => { if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight; }, [messages, logs]);

  const integrate = (plan: PlannerTask[]) => {
    setTasks(prev => {
      const map = new Map(prev.map(t => [t.id, t]));
      plan.forEach((t, i) => map.set(`${t.type}-${Date.now()}-${i}`, { ...t, id: `${t.type}-${Date.now()}-${i}`, status: t.status }));
      return [...map.values()];
    });
  };

  const run = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task || task.status !== 'pending') return;
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'running' } : t));
    openTerminal(id);
    if (!window.electronAPI) {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, command: task.type === 'winget_install' ? `winget install --id ${task.params.id} --silent` : task.type } : t));
      setLogs(prev => [...prev, { id, line: `Simulated ${task.type}: ${JSON.stringify(task.params)}\n` }]);
      setTimeout(() => setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'done' } : t)), 800);
      return;
    }
    const r = await window.electronAPI.executeTask({ taskId: id, type: task.type, params: { ...task.params } });
    if (!r.success) {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'failed' } : t));
      setLogs(prev => [...prev, { id, line: `[error] ${r.error}\n` }]);
    }
  };

  const openReport = async (id: string) => {
    const reportPath = reports[id];
    if (!reportPath || !window.electronAPI?.openReport) return;
    const r = await window.electronAPI.openReport(reportPath);
    if (!r.success) {
      setLogs(prev => [...prev, { id, line: `[error] Could not open report: ${r.error}\n` }]);
    }
  };

  const openReportFolder = async (id: string) => {
    const reportPath = reports[id];
    if (!reportPath || !window.electronAPI?.openReportFolder) return;
    const r = await window.electronAPI.openReportFolder(reportPath);
    if (!r.success) {
      setLogs(prev => [...prev, { id, line: `[error] Could not open report folder: ${r.error}\n` }]);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setMessages(m => [...m, { role: 'user', text }, { role: 'ai', text: '', requestId }]);
    setInput('');
    setSending(true);
    try {
      if (window.electronAPI?.chatWithAI) {
        // Streaming: the invoke returns immediately; the provider result —
        // including the final reply and any planned tasks — arrives via the
        // chat:chunk / chat:done events handled in the effect above.
        const r = await window.electronAPI.chatWithAI(text, requestId);
        if (!r.success) {
          setMessages(m => m.map(msg => msg.requestId === requestId ? { role: 'ai', text: `Error: ${r.error}` } : msg));
          setSending(false);
        }
      } else {
        // Browser demo fallback (no Electron bridge): plan locally.
        const p = browserPlanner(text);
        const summary = p.tasks.length
          ? `I planned ${p.tasks.length} task(s) (browser demo):\n${p.tasks.map((t, i) => `${i + 1}. ${t.label}`).join('\n')}`
          : p.tasks_skipped.length
            ? p.tasks_skipped.map(s => `Couldn't plan "${s.request}" — ${s.reason}`).join('\n')
            : "I couldn't turn that into any tasks.";
        setMessages(m => m.map(msg => msg.requestId === requestId ? { role: 'ai', text: summary } : msg));
        if (p.tasks.length) integrate(p.tasks);
        if (p.tasks_skipped.length) setSkipped(p.tasks_skipped);
        setSending(false);
      }
    } catch (e) {
      console.error(e);
      setMessages(m => m.map(msg => msg.requestId === requestId ? { role: 'ai', text: 'Failed to plan that request.' } : msg));
      setSending(false);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-left">
          <h1>Compilator</h1>
          <p>Task planner — mkdir / winget_install / winget_list / write_file</p>
        </div>
      </header>
      <main className="dashboard">
        <section className="chat-section">
          <h2>AI Interface</h2>
          <div className="chat-box" ref={boxRef}>
            {messages.map((m, i) => <div key={i} className={`message ${m.role}`}>{m.text}</div>)}
          </div>
          <div className="chat-input-area">
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder='e.g. "install git" or "create folder C:/AI"' disabled={sending} />
            <button onClick={send} disabled={sending || !input.trim()}>{sending ? 'Planning...' : 'Plan'}</button>
          </div>
        </section>
        <section className="tasks-section">
          <h2>Planned Tasks</h2>
          {skipped.length > 0 && (
            <div className="skipped-panel">
              <h3>Skipped requests</h3>
              {skipped.map((s, i) => {
            const requestText = String(s?.request ?? '').trim();
            const reasonText = String(s?.reason ?? '').trim();
            return (
              <div key={i} className="skipped-item">
                <strong>"{requestText && requestText !== '{}' ? requestText : '(unknown request)'}"</strong>
                {' — '}
                {reasonText || 'Unable to create a task from this request.'}
              </div>
            );
          })}
            </div>
          )}
          <div className="task-list">
            {tasks.length === 0 && <p className="empty-state">No tasks yet. Ask the planner to prepare your AI development PC.</p>}
            {tasks.map(t => (
              <div key={t.id} className="task-card" data-status={t.status}>
                <div className="task-info">
                  <h3>{t.label}</h3>
                  <p><strong>Type:</strong> <code>{t.type}</code></p>
                  <p><strong>Est. Time:</strong> {t.estimated_seconds === 0 ? '0s' : `~${t.estimated_seconds}s`}</p>
                  {t.params.path && <p><strong>Path:</strong> <code>{t.params.path}</code></p>}
                  {t.params.id && <p><strong>Winget ID:</strong> <code>{t.params.id}</code></p>}
                  {t.note && <p><strong>Note:</strong> {t.note}</p>}
                  {t.command && <div className="command-line">{t.command}</div>}
                </div>
                <div className="task-actions">
                  {t.status === 'pending' && <button className="approve-btn" onClick={() => run(t.id)}>Approve</button>}
                  {t.status !== 'pending' && <span className={`badge ${t.status}`}>{badge(t.status)}</span>}
                  {terminalWindows[t.id] && (
                    <button className="report-btn" onClick={() => openTerminal(t.id)}>Open Terminal</button>
                  )}
                  {reports[t.id] && <button className="report-btn" onClick={() => openReport(t.id)}>View Report</button>}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Floating terminal windows — only windows with closed === false are
          rendered. Closed windows keep their full state (logs, bounds,
          z-index) in terminalWindows and are restored on reopen. The focused
          window is the one with the highest z-index. */}
      {Object.entries(terminalWindows)
        .filter(([, w]) => !w.closed)
        .map(([id, win]) => {
          const task = tasks.find(t => t.id === id);
          if (!task) return null;
          const maxZ = Math.max(...Object.values(terminalWindows).map(w => w.zIndex));
          return (
            <FloatingTerminal
              key={id}
              taskId={id}
              title={`Terminal - ${task.label}`}
              logs={logs.filter(l => l.id === id).map(l => l.line)}
              status={task.status}
              reportPath={reports[id]}
              bounds={{ x: win.x, y: win.y, width: win.width, height: win.height }}
              onBoundsChange={b => updateTerminalBounds(id, b)}
              zIndex={win.zIndex}
              focused={win.zIndex === maxZ}
              minimized={win.minimized}
              onToggleMinimize={() => toggleMinimizeTerminal(id)}
              onFocus={() => focusTerminal(id)}
              onClose={() => closeTerminal(id)}
              onViewReport={() => openReport(id)}
              onOpenReportFolder={() => openReportFolder(id)}
            />
          );
        })}
    </div>
  );
}

export default App;