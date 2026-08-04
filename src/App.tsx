import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import FloatingTerminal, { type TerminalBounds } from './components/FloatingTerminal';

declare global {
  interface Window {
    electronAPI?: {
      executeTask: (p: { taskId: string; type: string; params: Record<string, string> }) => Promise<{ success: boolean; taskId: string; error?: string }>;
      chatWithAI: (prompt: string) => Promise<{ success: boolean; reply?: string; error?: string; tasks?: PlannerTask[]; tasks_skipped?: SkippedRequest[] }>;
      wingetList: () => Promise<{ success: boolean; output?: string; error?: string }>;
      openReport: (reportPath: string) => Promise<{ success: boolean; error?: string }>;
      openReportFolder: (reportPath: string) => Promise<{ success: boolean; error?: string }>;
      onTaskUpdate: (cb: (d: { id: string; status: string; command?: string }) => void) => () => void;
      onTaskLog: (cb: (d: { id: string; line: string }) => void) => () => void;
      onReportCreated: (cb: (d: { id: string; reportPath: string }) => void) => () => void;
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
interface Message { role: 'user' | 'ai'; text: string }

const CATALOG: Record<string, { name: string; id: string }> = {
  vscode: { name: 'Visual Studio Code', id: 'Microsoft.VisualStudioCode' },
  'visual studio code': { name: 'Visual Studio Code', id: 'Microsoft.VisualStudioCode' },
  node: { name: 'Node.js', id: 'OpenJS.NodeJS' },
  nodejs: { name: 'Node.js', id: 'OpenJS.NodeJS' },
  python: { name: 'Python 3.12', id: 'Python.Python.3.12' },
  git: { name: 'Git', id: 'Git.Git' },
  chrome: { name: 'Google Chrome', id: 'Google.Chrome' },
  docker: { name: 'Docker Desktop', id: 'Docker.DockerDesktop' },
};

const clean = (s: string) => s.replace(/["']/g, '').replace(/\b(?:named|called)\s+/i, '').trim();

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
  const ins = text.match(/install\s+(.+)/);
  if (ins) {
    const requested = ins[1].trim();
    const entry = Object.entries(CATALOG).find(([k]) => requested.includes(k) || k.includes(requested));
    if (entry) tasks.push({ type: 'winget_install', label: `Install ${entry[1].name} (${entry[1].id})`, params: { id: entry[1].id }, estimated_seconds: 180, status: 'pending' });
    else skip(`install ${requested}`, 'Unknown or unverified winget package id — refusing to guess one.');
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
    setMessages(m => [...m, { role: 'user', text }]);
    setInput('');
    setSending(true);
    try {
      if (window.electronAPI?.chatWithAI) {
        const r = await window.electronAPI.chatWithAI(text);
        setMessages(m => [...m, { role: 'ai', text: r.success ? (r.reply ?? 'No tasks planned.') : `Error: ${r.error}` }]);
        if (r.tasks?.length) integrate(r.tasks);
        if (r.tasks_skipped?.length) setSkipped(r.tasks_skipped);
      } else {
        const p = browserPlanner(text);
        const nums = p.tasks.map((t, i) => `${i + 1}. ${t.label}`).join('\n');
        setMessages(m => [...m, { role: 'ai', text: p.tasks.length ? `I planned ${p.tasks.length} task(s) (browser demo):\n${nums}` : "I couldn't turn that into any tasks." }]);
        if (p.tasks.length) integrate(p.tasks);
        if (p.tasks_skipped.length) setSkipped(p.tasks_skipped);
      }
    } catch (e) {
      console.error(e);
      setMessages(m => [...m, { role: 'ai', text: 'Failed to plan that request.' }]);
    } finally {
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
              {skipped.map((s, i) => <div key={i} className="skipped-item"><strong>"{s.request}"</strong> — {s.reason}</div>)}
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