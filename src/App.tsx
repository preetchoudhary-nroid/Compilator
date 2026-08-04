import { useEffect, useRef, useState } from 'react';
import './App.css';

declare global {
  interface Window {
    electronAPI?: {
      executeTask: (p: { taskId: string; type: string; params: Record<string, string> }) => Promise<{ success: boolean; taskId: string; error?: string }>;
      chatWithAI: (prompt: string) => Promise<{ success: boolean; reply?: string; error?: string; tasks?: PlannerTask[]; tasks_skipped?: SkippedRequest[] }>;
      wingetList: () => Promise<{ success: boolean; output?: string; error?: string }>;
      onTaskUpdate: (cb: (d: { id: string; status: string; command?: string }) => void) => () => void;
      onTaskLog: (cb: (d: { id: string; line: string }) => void) => () => void;
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
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => window.electronAPI?.onTaskUpdate(({ id, status, command }) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: status as TaskStatus, ...(command ? { command } : {}) } : t));
  }), []);
  useEffect(() => window.electronAPI?.onTaskLog(({ id, line }) => {
    setLogs(prev => [...prev, { id, line }]);
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
                  {logs.filter(l => l.id === t.id).length > 0 && (
                    <div className="log-panel">{logs.filter(l => l.id === t.id).map((l, i) => <div key={i} className="log-line">{l.line}</div>)}</div>
                  )}
                </div>
                <div className="task-actions">
                  {t.status === 'pending' && <button className="approve-btn" onClick={() => run(t.id)}>Approve</button>}
                  {t.status !== 'pending' && <span className={`badge ${t.status}`}>{badge(t.status)}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;