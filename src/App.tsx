import { useEffect, useRef, useState } from 'react';
import './App.css';
import { extractInstallTarget, isNegated, resolveCatalogTarget } from './planner-core.js';
import { InteractiveChart } from './components/InteractiveChart.js';
import FloatingTerminal from './components/FloatingTerminal.js';
import type { TerminalBounds } from './components/FloatingTerminal.js';
import TaskHistory from './components/TaskHistory.js';
import CodeEditor from './components/CodeEditor.js';
import TerminalPanel from './components/TerminalPanel.js';

declare global {
  interface Window {
    electronAPI?: {
      executeTask: (p: { taskId: string; type: string; params: Record<string, any> }) => Promise<{ success: boolean; taskId: string; error?: string }>;
      cancelTask: (taskId: string) => Promise<{ success: boolean; taskId: string; cancelled: boolean; reason?: string }>;
      chatWithAI: (prompt: string, requestId: string) => Promise<{ success: boolean; requestId: string; error?: string }>;
      wingetList: () => Promise<{ success: boolean; output?: string; error?: string }>;
      openReport: (reportPath: string) => Promise<{ success: boolean; error?: string }>;
      openReportFolder: (reportPath: string) => Promise<{ success: boolean; error?: string }>;
      onTaskUpdate: (cb: (d: { id: string; status: string; command?: string }) => void) => () => void;
      onTaskLog: (cb: (d: { id: string; line: string }) => void) => () => void;
      onReportCreated: (cb: (d: { id: string; reportPath: string }) => void) => () => void;
      onChatChunk: (cb: (d: { requestId: string; chunk: string; full: string }) => void) => () => void;
      onChatDone: (cb: (d: { requestId: string; result: { success: boolean; intent: string; reply: string; tasks?: PlannerTask[]; tasks_skipped?: SkippedRequest[]; source?: string } }) => void) => () => void;
      getConfig: () => Promise<any>;
      saveConfig: (config: any) => Promise<{ success: boolean; error?: string }>;
      getTaskHistory: (filters?: { limit?: number; type?: string; status?: string; search?: string }) => Promise<{ success: boolean; tasks: any[]; error?: string }>;
      getTaskStats: () => Promise<{ success: boolean; stats: any; error?: string }>;
      clearTaskHistory: () => Promise<{ success: boolean; error?: string }>;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      setSidebarMode: () => void;
      setNormalMode: () => void;
    };
  }
}

// Interactive chart component is imported from components/InteractiveChart.js

type TaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'already_installed' | 'cancelled' | 'cancelling';

interface PlannerTask {
  type: 'mkdir' | 'winget_install' | 'winget_list' | 'write_file' | 'list_exe_files' | 'run_python' | 'run_powershell';
  label: string;
  params: { path?: string; id?: string; content?: string; script_path?: string; args?: string[] };
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

// Security: Validate and sanitize file paths to prevent directory traversal attacks
const sanitizePath = (rawPath: string): string => {
  const cleaned = clean(rawPath);
  
  // Prevent directory traversal
  if (cleaned.includes('..') || cleaned.includes('~') || cleaned.startsWith('/')) {
    throw new Error('Invalid path: directory traversal and absolute paths are not allowed');
  }
  
  // Prevent access to sensitive system directories
  const sensitiveDirs = ['windows', 'program files', 'system32', 'boot', 'etc'];
  const lowerPath = cleaned.toLowerCase();
  for (const dir of sensitiveDirs) {
    if (lowerPath.includes(dir)) {
      throw new Error(`Invalid path: access to ${dir} is not allowed`);
    }
  }
  
  return cleaned;
};

// Split a request into multiple sub-requests using common separators
function splitMultiCommandRequest(text: string): string[] {
  const separators = [
    /\s+and\s+/,
    /\s+then\s+/,
    /\s+,/,
    /\s+;\s*/,
    /\s+also\s+/,
    /\s+plus\s+/,
  ];
  
  let parts = [text];
  for (const sep of separators) {
    parts = parts.flatMap(part => part.split(sep).map(p => p.trim()).filter(p => p));
  }
  
  return parts;
}

// Install-intent parsing lives in ./planner-core.js (shared with the Electron
// main-process planner): extractInstallTarget() handles any word order +
// conversational filler, and isNegated() blocks refusal/cancellation.



function browserPlanner(request: string): { tasks: PlannerTask[]; tasks_skipped: SkippedRequest[] } {
  const text = (request || '').toLowerCase().trim();
  const tasks: PlannerTask[] = [];
  const tasks_skipped: SkippedRequest[] = [];
  const skip = (r: string, reason: string) => tasks_skipped.push({ request: r, reason });

  // Check if this is a multi-command request
  const subRequests = splitMultiCommandRequest(text);
  
  if (subRequests.length > 1) {
    // Process each sub-request individually
    for (const subReq of subRequests) {
      const subPlan = planSingleRequestBrowser(subReq, skip);
      tasks.push(...subPlan.tasks);
    }
    return { tasks, tasks_skipped };
  }

  // Process as a single request
  const singlePlan = planSingleRequestBrowser(text, skip);
  tasks.push(...singlePlan.tasks);
  return { tasks, tasks_skipped };
}

function planSingleRequestBrowser(text: string, skip: (r: string, reason: string) => void): { tasks: PlannerTask[] } {
  const tasks: PlannerTask[] = [];

  // Negation — "i dont want to install chrome", "never mind", "cancel …"
  // must never create an install.
  if (isNegated(text)) {
    skip(text, 'You asked not to install it — no action was planned.');
    return { tasks };
  }

  if (/(list installed|list packages|installed packages|\blist\b)/.test(text)) {
    tasks.push({ type: 'winget_list', label: 'List installed packages', params: {}, estimated_seconds: 15, status: 'pending' });
    return { tasks };
  }
  const mk = text.match(/(?:mkdir|create folder|create directory|new folder)\s+(.+)/);
  if (mk) {
    try {
      const p = sanitizePath(mk[1]);
      if (p) tasks.push({ type: 'mkdir', label: `Create folder ${p}`, params: { path: p }, estimated_seconds: 2, status: 'pending' });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      skip(text, `Invalid folder path: ${errorMessage}`);
    }
    return { tasks };
  }
  const wr = text.match(/(?:write|create|save)\s+(?:a |the )?(?:file\s+)?(.+?)\s+(?:with|containing|content|:)\s*([\s\S]*)/);
  if (wr) {
    try {
      const p = sanitizePath(wr[1]);
      if (p) tasks.push({ type: 'write_file', label: `Write file ${p}`, params: { path: p, content: wr[2] }, estimated_seconds: 3, status: 'pending' });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      skip(text, `Invalid file path: ${errorMessage}`);
    }
    return { tasks };
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
    return { tasks };
  }
  if (/\b(?:install|set ?up|setup)\b/i.test(text)) {
    skip(text, 'I could not figure out which package to install. I know 50+ verified winget packages (dev tools, browsers, media, networking, productivity, gaming) — try "install <software name>", e.g. "install github desktop".');
    return { tasks };
  }

  // ---- run_python --------------------------------------------------------
  const pythonMatch = text.match(/(?:run|execute)\s+(?:python\s+)?(?:script\s+)?(.+?)(?:\s+(?:with|using)\s+(.+))?$/);
  if (pythonMatch) {
    try {
      const scriptPath = pythonMatch[1].trim();
      const args = pythonMatch[2] ? pythonMatch[2].trim().split(/\s+/) : [];
      
      if (scriptPath) {
        tasks.push({ 
          type: 'run_python', 
          label: `Run Python script ${scriptPath}`, 
          params: { script_path: scriptPath, args }, 
          estimated_seconds: 30, 
          status: 'pending' 
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      skip(text, `Invalid Python script path: ${errorMessage}`);
    }
    return { tasks };
  }

  // ---- run_powershell ----------------------------------------------------
  const psMatch = text.match(/(?:run|execute)\s+(?:powershell\s+)?(?:script\s+)?(.+?\.ps1)(?:\s+(?:with|using)\s+(.+))?$/);
  if (psMatch) {
    try {
      const scriptPath = psMatch[1].trim();
      const args = psMatch[2] ? psMatch[2].trim().split(/\s+/) : [];
      if (scriptPath) {
        tasks.push({
          type: 'run_powershell',
          label: `Run PowerShell script ${scriptPath}`,
          params: { script_path: scriptPath, args },
          estimated_seconds: 30,
          status: 'pending',
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      skip(text, `Invalid PowerShell script path: ${errorMessage}`);
    }
    return { tasks };
  }

  skip(text || '(empty request)', 'Does not match any allowed task type (mkdir, winget_install, winget_list, write_file, run_python, run_powershell).');
  return { tasks };
}

// unused helper kept for reference or removed
// function badge(status: TaskStatus)... removed since unused

const AI_PROVIDERS = [
  { value: 'groq', label: 'Groq' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'lmstudio', label: 'LM Studio' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'custom', label: 'Custom' },
];

interface TerminalWindowState {
  bounds: TerminalBounds;
  minimized: boolean;
  zIndex: number;
}

function App() {
  const [tasks, setTasks] = useState<UiTask[]>([]);
  const [, setSkipped] = useState<SkippedRequest[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', text: "Hello! I'm the Compilator task planner. Try: 'prepare my AI development pc', 'install git', 'create folder C:/AI', 'write file config.json with hello', 'run python script.py', or 'list installed packages'." },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [reports, setReports] = useState<Record<string, string>>({});
  const boxRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState('tasks');
  const [selectedSoftware, setSelectedSoftware] = useState<string[]>([]);
  const [userName] = useState('Preet');
  
  const [apiKey, setApiKey] = useState('');
  const [aiProvider, setAiProvider] = useState('groq');
  const [aiModel, setAiModel] = useState('');
  const [configSaved, setConfigSaved] = useState(false);

  // Persistent stats from task history store
  const [historyStats, setHistoryStats] = useState<{
    totalTasks: number; completed: number; failed: number; cancelled: number;
    todayTasks: number; todayCompleted: number; avgDuration: number;
    tasksByType: Record<string, number>;
    tasksByDay: Array<{ date: string; count: number }>;
  } | null>(null);

  // FloatingTerminal window state
  const [terminalWindows, setTerminalWindows] = useState<Record<string, TerminalWindowState>>({});
  const terminalZRef = useRef(100);

  useEffect(() => {
    if (window.electronAPI?.getConfig) {
      window.electronAPI.getConfig().then(cfg => {
        if (cfg.apiKey) setApiKey(cfg.apiKey);
        if (cfg.provider) setAiProvider(cfg.provider);
        if (cfg.model) setAiModel(cfg.model);
      });
    }
    // Load persistent stats on mount
    if (window.electronAPI?.getTaskStats) {
      window.electronAPI.getTaskStats().then(res => {
        if (res.success && res.stats) setHistoryStats(res.stats);
      });
    }
  }, []);

  const saveSettings = async () => {
    if (window.electronAPI?.saveConfig) {
      await window.electronAPI.saveConfig({ apiKey, provider: aiProvider, model: aiModel });
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 2000);
    }
  };
  
  // Computed chart data from real tasks
  const taskStatusData = (() => {
    const statuses: { key: TaskStatus; label: string }[] = [
      { key: 'done', label: 'Done' },
      { key: 'running', label: 'Running' },
      { key: 'pending', label: 'Pending' },
      { key: 'failed', label: 'Failed' },
      { key: 'cancelled', label: 'Cancelled' },
      { key: 'already_installed', label: 'Pre-installed' },
    ];
    return {
      values: statuses.map(s => tasks.filter(t => t.status === s.key).length),
      labels: statuses.map(s => s.label),
    };
  })();
  const taskTypeData = (() => {
    const types: { key: PlannerTask['type']; label: string }[] = [
      { key: 'winget_install', label: 'Install' },
      { key: 'mkdir', label: 'Mkdir' },
      { key: 'write_file', label: 'Write File' },
      { key: 'winget_list', label: 'List Pkgs' },
      { key: 'run_python', label: 'Python' },
      { key: 'list_exe_files', label: 'List EXE' },
    ];
    return {
      values: types.map(tp => tasks.filter(t => t.type === tp.key).length),
      labels: types.map(tp => tp.label),
    };
  })();

  useEffect(() => window.electronAPI?.onTaskUpdate(({ id, status, command }) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: status as TaskStatus, ...(command ? { command } : {}) } : t));
    // Refresh persistent stats when a task finishes
    if (['done', 'failed', 'cancelled', 'already_installed'].includes(status)) {
      window.electronAPI?.getTaskStats?.().then(res => {
        if (res?.success && res.stats) setHistoryStats(res.stats);
      });
    }
  }), []);
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

  // Listen for terminal commands and route them through the AI chat
  const sendRef = useRef<(cmd: string) => void>(() => {});
  useEffect(() => {
    const handler = (e: Event) => {
      const cmd = (e as CustomEvent).detail;
      if (cmd) sendRef.current(cmd);
    };
    window.addEventListener('terminal-command', handler);
    return () => window.removeEventListener('terminal-command', handler);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 't': e.preventDefault(); setActiveSection('terminal'); break;
          case 'e': e.preventDefault(); setActiveSection('editor'); break;
          case 'h': e.preventDefault(); setActiveSection('home'); break;
          case 'j': e.preventDefault(); setActiveSection('tasks'); break;
          case 'k': e.preventDefault(); setActiveSection('catalog'); break;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Auto-open a floating terminal when a task transitions to 'running'
  useEffect(() => {
    setTerminalWindows(prev => {
      let updated = false;
      const next = { ...prev };
      tasks.forEach(t => {
        if (t.status === 'running' && !next[t.id]) {
          const count = Object.keys(next).length;
          const offset = count * 30;
          terminalZRef.current += 1;
          next[t.id] = {
            bounds: { x: 120 + offset, y: 80 + offset, width: 620, height: 360 },
            minimized: false,
            zIndex: terminalZRef.current,
          };
          updated = true;
        }
      });
      return updated ? next : prev;
    });
  }, [tasks]);

  const focusTerminal = (id: string) => {
    terminalZRef.current += 1;
    const z = terminalZRef.current;
    setTerminalWindows(prev => prev[id] ? { ...prev, [id]: { ...prev[id], zIndex: z } } : prev);
  };
  const closeTerminal = (id: string) => {
    setTerminalWindows(prev => {
      const { [id]: _, ...rest } = prev;
      return rest;
    });
  };
  const toggleMinimizeTerminal = (id: string) => {
    setTerminalWindows(prev => prev[id] ? { ...prev, [id]: { ...prev[id], minimized: !prev[id].minimized } } : prev);
  };
  const updateTerminalBounds = (id: string, bounds: TerminalBounds) => {
    setTerminalWindows(prev => prev[id] ? { ...prev, [id]: { ...prev[id], bounds } } : prev);
  };

  const integrate = (plan: PlannerTask[]) => {
    setTasks(prev => {
      const map = new Map(prev.map(t => [t.id, t]));
      plan.forEach((t, i) => map.set(`${t.type}-${Date.now()}-${i}`, { ...t, id: `${t.type}-${Date.now()}-${i}`, status: t.status }));
      return [...map.values()];
    });
  };

  const toggleSoftwareSelection = (id: string) => {
    setSelectedSoftware(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const installSelectedSoftware = async () => {
    if (selectedSoftware.length === 0) return;
    
    const installCommands = selectedSoftware.map(id => {
      const software = Object.values(CATALOG).find(s => s.id === id);
      return software ? `install ${software.name}` : '';
    }).filter(cmd => cmd).join(' and ');
    
    setInput('');
    setSelectedSoftware([]);
    await send(installCommands);
  };

  const getCatalogByCategory = () => {
    const categories: Record<string, Array<{key: string, name: string, id: string}>> = {
      'Development': [],
      'Developer Utilities': [],
      'Browsers': [],
      'Design / Media': [],
      'Networking / Remote': [],
      'Productivity': [],
      'Gaming': []
    };

    const usedKeys = new Set<string>();

    for (const [key, value] of Object.entries(CATALOG)) {
      if (usedKeys.has(key)) continue;
      
      if (['vscode', 'visual studio code', 'vs code', 'node lts', 'node.js lts', 'nodejs lts', 'node', 'nodejs', 'node.js', 'python 3.13', 'python 3.12', 'python', 'git', 'github desktop', 'visual studio 2022 community', 'visual studio 2022', 'java', 'java jdk', 'jdk', 'temurin', 'go lang', 'golang', 'go', 'rustup', 'rustlang', 'rust', 'docker', 'docker desktop', 'postman', 'dbeaver', 'mysql', 'postgresql', 'postgres'].includes(key)) {
        categories['Development'].push({ key, name: value.name, id: value.id });
        usedKeys.add(key);
      } else if (['7zip', '7-zip', '7 zip', 'powershell 7', 'powershell', 'windows terminal', 'notepad++', 'notepad', 'everything', 'winmerge', 'jq', 'cmake', 'ninja', 'llvm'].includes(key)) {
        categories['Developer Utilities'].push({ key, name: value.name, id: value.id });
        usedKeys.add(key);
      } else if (['chrome', 'google chrome', 'firefox', 'edge', 'microsoft edge', 'brave', 'opera', 'vivaldi'].includes(key)) {
        categories['Browsers'].push({ key, name: value.name, id: value.id });
        usedKeys.add(key);
      } else if (['vlc', 'obs studio', 'obs', 'gimp', 'inkscape', 'blender', 'audacity', 'handbrake', 'krita'].includes(key)) {
        categories['Design / Media'].push({ key, name: value.name, id: value.id });
        usedKeys.add(key);
      } else if (['wireshark', 'putty', 'winscp', 'tailscale', 'openvpn', 'rustdesk'].includes(key)) {
        categories['Networking / Remote'].push({ key, name: value.name, id: value.id });
        usedKeys.add(key);
      } else if (['libreoffice', 'obsidian', 'notion', 'sharex', 'powertoys', 'power toys'].includes(key)) {
        categories['Productivity'].push({ key, name: value.name, id: value.id });
        usedKeys.add(key);
      } else if (['steam', 'epic games launcher', 'epic games', 'epic', 'gog galaxy', 'gog', 'ubisoft connect', 'ubisoft', 'discord'].includes(key)) {
        categories['Gaming'].push({ key, name: value.name, id: value.id });
        usedKeys.add(key);
      }
    }

    return categories;
  };

  const run = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task || task.status !== 'pending') return;
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'running' } : t));
    if (!window.electronAPI) {
      let command: string = task.type;
      if (task.type === 'winget_install') {
        command = `winget install --id ${task.params.id} --silent`;
      } else if (task.type === 'run_python') {
        command = `python ${task.params.script_path} ${(task.params.args || []).join(' ')}`;
      }
      setTasks(prev => prev.map(t => t.id === id ? { ...t, command } : t));
      setLogs(prev => [...prev, { id, line: `Simulated ${task.type}: ${JSON.stringify(task.params)}\n` }]);
      setTimeout(() => setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'done' } : t)), 800);
      return;
    }
    const r = await window.electronAPI.executeTask({ taskId: id, type: task.type, params: { ...task.params } as Record<string, any> });
    if (!r.success) {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'failed' } : t));
      setLogs(prev => [...prev, { id, line: `[error] ${r.error}\n` }]);
    }
  };

  const cancel = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task || task.status !== 'running') return;
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'cancelling' } : t));
    if (!window.electronAPI) {
      // In browser demo mode, just mark as cancelled after a short delay
      setTimeout(() => setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'cancelled' } : t)), 300);
      return;
    }
    const r = await window.electronAPI.cancelTask(id);
    // The actual status change to 'cancelled' will come via task:update event
    // from main process. If cancel failed (task not running), fall back.
    if (!r.cancelled) {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'running' } : t));
    }
  };

  // Retry a failed task: create a new copy with 'pending' status
  const retry = (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task || (task.status !== 'failed' && task.status !== 'cancelled')) return;
    const newId = `${task.type}-${Date.now()}-retry`;
    setTasks(prev => [
      ...prev.map(t => t.id === id ? { ...t, status: 'done' as TaskStatus } : t), // mark old as acknowledged
      { ...task, id: newId, status: 'pending' as TaskStatus, command: undefined },
    ]);
  };

  // Handle drag-and-drop of script files (.py, .ps1, .bat)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const scriptTasks: PlannerTask[] = [];
    for (const file of files) {
      const filePath = (file as any).path || file.name;
      if (filePath.endsWith('.py')) {
        scriptTasks.push({
          type: 'run_python',
          label: `Run Python script ${filePath}`,
          params: { script_path: filePath, args: [] },
          estimated_seconds: 30,
          status: 'pending',
        });
      } else if (filePath.endsWith('.ps1')) {
        scriptTasks.push({
          type: 'run_powershell',
          label: `Run PowerShell script ${filePath}`,
          params: { script_path: filePath, args: [] },
          estimated_seconds: 30,
          status: 'pending',
        });
      }
    }
    if (scriptTasks.length > 0) {
      integrate(scriptTasks);
      setActiveSection('tasks');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };


  const openReport = async (id: string) => {
    const reportPath = reports[id];
    if (!reportPath || !window.electronAPI?.openReport) return;
    const r = await window.electronAPI.openReport(reportPath);
    if (!r.success) {
      setLogs(prev => [...prev, { id, line: `[error] Could not open report: ${r.error}\n` }]);
    }
  };



  const send = async (overrideText?: string | any) => {
    const text = (typeof overrideText === 'string' ? overrideText : input).trim();
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
  sendRef.current = send;

  return (
    <div className="app-layout" onDrop={handleDrop} onDragOver={handleDragOver}>
      {/* Sidebar */}
      <aside className="app-sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">&lt;/&gt;</div>
          <span className="logo-text">Compilator</span>
        </div>
        
        <nav className="sidebar-nav">
          <a href="#" className={activeSection === 'home' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setActiveSection('home'); }}>
            <span className="icon">[H]</span> Home
          </a>
          <a href="#" className={activeSection === 'tasks' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setActiveSection('tasks'); }}>
            <span className="icon">[T]</span> Tasks
          </a>
          <a href="#" className={activeSection === 'catalog' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setActiveSection('catalog'); }}>
            <span className="icon">[C]</span> Catalog
          </a>
          <a href="#" className={activeSection === 'ai_chat' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setActiveSection('ai_chat'); }}>
            <span className="icon">[A]</span> AI Chat
          </a>
          <a href="#" className={activeSection === 'editor' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setActiveSection('editor'); }}>
            <span className="icon">[E]</span> Code Editor
          </a>
          <a href="#" className={activeSection === 'terminal' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setActiveSection('terminal'); }}>
            <span className="icon">[&gt;]</span> Terminal
          </a>
          <a href="#" className={activeSection === 'settings' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setActiveSection('settings'); }}>
            <span className="icon">[S]</span> Settings
          </a>
          <a href="#" className={activeSection === 'history' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setActiveSection('history'); }}>
            <span className="icon">[⏱]</span> History
          </a>
        </nav>

        <div className="sidebar-bottom">
          <div className="stay-focused-widget">
            <h4>Stay focused</h4>
            <p>Build your goals</p>
            <div className="progress-bar-container">
              <div className="progress-bar" style={{ width: `${tasks.length > 0 ? Math.round((tasks.filter(t => t.status === 'done' || t.status === 'already_installed').length / tasks.length) * 100) : 0}%` }}></div>
            </div>
            <div className="progress-text">{tasks.filter(t => t.status === 'done' || t.status === 'already_installed').length}/{tasks.length} tasks today</div>
          </div>
          
          <div className="user-profile">
            <div className="avatar">{userName.charAt(0)}</div>
            <div className="user-info">
              <span className="user-name">{userName}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="app-main">
        {/* Header / Window Controls */}
        <header className="app-topbar" style={{ WebkitAppRegion: 'drag' } as any}>
          <div style={{ WebkitAppRegion: 'no-drag' } as any} className="window-controls">
            <button onClick={() => window.electronAPI?.minimize()}>-</button>
            <button onClick={() => window.electronAPI?.maximize()}>[]</button>
            <button onClick={() => window.electronAPI?.close()}>X</button>
          </div>
        </header>

        <div className="app-content-scroll">
          
          {activeSection === 'home' && (
            <>
              <div className="greeting-section">
                <h1>Good Morning, {userName}</h1>
                <p>Here's what's happening with your tasks{historyStats ? ` — ${historyStats.totalTasks} total across all sessions.` : ' today.'}</p>
              </div>

              {/* Stats Dashboard */}
              <div className="stats-dashboard">
                <div className="stat-card">
                  <div className="stat-icon purple-icon">[#]</div>
                  <div className="stat-info">
                    <div className="stat-label">Total Tasks</div>
                    <div className="stat-value">{tasks.length}</div>
                  </div>
                </div>
                <div className="stat-card completed">
                  <div className="stat-icon green-icon">[Y]</div>
                  <div className="stat-info">
                    <div className="stat-label">Completed</div>
                    <div className="stat-value">{tasks.filter(t => t.status === 'done').length}</div>
                  </div>
                </div>
                <div className="stat-card in-progress">
                  <div className="stat-icon blue-icon">[O]</div>
                  <div className="stat-info">
                    <div className="stat-label">In Progress</div>
                    <div className="stat-value">{tasks.filter(t => t.status === 'running').length}</div>
                  </div>
                </div>
                <div className="stat-card pending">
                  <div className="stat-icon red-icon">[-]</div>
                  <div className="stat-info">
                    <div className="stat-label">Pending</div>
                    <div className="stat-value">{tasks.filter(t => t.status === 'pending').length}</div>
                  </div>
                </div>
              </div>

              {/* Task Activity Charts */}
              {tasks.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                  <InteractiveChart data={taskStatusData.values} title="Tasks by Status" labels={taskStatusData.labels} />
                  <InteractiveChart data={taskTypeData.values} title="Tasks by Type" labels={taskTypeData.labels} />
                </div>
              )}

              <div className="split-layout">
                {/* Today's Tasks */}
                <div className="tasks-panel">
                  <div className="panel-header">
                    <h2>Today's Tasks</h2>
                    <button className="add-task-btn" onClick={() => setActiveSection('tasks')}>View All Tasks</button>
                  </div>
                  <div className="task-list">
                    {/* Render real tasks */}
                    {tasks.length === 0 && (
                      <div className="task-row" style={{ color: '#8b92a5', fontStyle: 'italic' }}>
                        <span className="task-title">No tasks yet — ask the AI to plan something!</span>
                      </div>
                    )}
                    {tasks.slice(0, 5).map(t => (
                      <div className="task-row" key={t.id}>
                        <input type="checkbox" checked={t.status === 'done'} onChange={() => {}} />
                        <span className="task-title">{t.label}</span>
                        <span className="tag pending-tag">{t.type}</span>
                        <span className="task-time">{t.status}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* AI Assistant */}
                <div className="ai-panel">
                  <div className="panel-header ai-header">
                    <h2>AI Assistant</h2>
                    <select value={aiProvider} onChange={e => setAiProvider(e.target.value)} className="model-select">
                      {AI_PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                  <div className="ai-greeting">
                    <h3>Hello {userName},</h3>
                    <p>I'm your AI assistant. How can I help you today?</p>
                  </div>
                  
                  <div className="ai-chat-history" ref={boxRef} style={{minHeight: '150px'}}>
                    {messages.slice(1, 4).map((m, i) => (
                      <div key={i} className={`ai-msg ${m.role}`}>{m.text}</div>
                    ))}
                  </div>

                  <div className="ai-input-wrapper">
                    <input 
                      type="text" 
                      placeholder="Ask something..." 
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && send()}
                    />
                    <button className="send-btn" onClick={send}>&gt;</button>
                  </div>
                </div>
              </div>

              {/* Bottom Terminal / Editor Split */}
              <div className="bottom-ide-panel">
                <div className="terminal-side">
                  <div className="tabs">
                    <span className="tab active">Terminal</span>
                  </div>
                  <div className="terminal-content">
                    <div className="term-line"><span className="prompt" style={{color: '#4ade80'}}>{userName}@Compilator:~$</span> </div>
                    {logs.slice(-5).map((l, i) => <div key={i} className="term-line">{l.line}</div>)}
                  </div>
                </div>
                <div className="editor-side">
                  <div className="tabs editor-tabs">
                    <span className="tab active">main.tsx X</span>
                  </div>
                  <div className="editor-content">
                    <pre style={{margin:0}}>
                      <code style={{color: '#a78bfa'}}>
{`  1  import { useState } from 'react'
  2
  3  function App() {
  4    return (
  5      <div className="container">
  6        <h1>Compilator IDE</h1>
  7      </div>
  8    )
  9  }`}
                      </code>
                    </pre>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeSection === 'tasks' && (
            <div className="task-details-section">
              <h2>Task Details</h2>
              {tasks.length === 0 && <p className="empty-state" style={{color: '#8b92a5'}}>No tasks planned yet.</p>}
              {tasks.map(t => (
                <div key={t.id} className="task-card" style={{padding: '1rem', background: '#15171e', borderRadius: '8px', marginBottom: '1rem', border: '1px solid #1f2129'}}>
                  <div className="task-info">
                    <h3 style={{margin: '0 0 0.5rem 0'}}>{t.label}</h3>
                    <p style={{margin: '0.2rem 0', color: '#8b92a5'}}><strong>Type:</strong> <code>{t.type}</code></p>
                    <p style={{margin: '0.2rem 0', color: '#8b92a5'}}><strong>Status:</strong> {t.status}</p>
                    {t.command && <div className="command-line" style={{marginTop: '0.5rem', background: '#0b0c10', padding: '0.5rem', borderRadius: '4px', fontSize: '0.8rem'}}>{t.command}</div>}
                  </div>
                  <div className="task-actions" style={{marginTop: '1rem'}}>
                    {t.status === 'pending' && <button className="add-task-btn" onClick={() => run(t.id)}>Approve</button>}
                    {t.status === 'running' && <button className="add-task-btn" onClick={() => cancel(t.id)}>Cancel</button>}
                    {(t.status === 'failed' || t.status === 'cancelled') && <button className="add-task-btn" onClick={() => retry(t.id)} style={{background: '#f59e0b', color: '#000'}}>Retry</button>}
                    {reports[t.id] && <button className="add-task-btn" onClick={() => openReport(t.id)} style={{marginLeft: '0.5rem'}}>View Report</button>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeSection === 'catalog' && (
            <div className="software-catalog-section">
              <div className="catalog-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem'}}>
                <div>
                  <h2 style={{margin: '0 0 0.5rem 0'}}>Software Catalog</h2>
                  <p style={{margin: 0, color: '#8b92a5'}}>Select software to install multiple packages.</p>
                </div>
                {selectedSoftware.length > 0 && (
                  <button className="add-task-btn" onClick={installSelectedSoftware} style={{background: '#4f46e5', color: '#fff'}}>
                    Install Selected ({selectedSoftware.length})
                  </button>
                )}
              </div>
              <div className="catalog-content">
                {Object.entries(getCatalogByCategory()).map(([category, items]) => (
                  <div key={category} className="catalog-category" style={{marginBottom: '2rem'}}>
                    <h3 style={{borderBottom: '1px solid #1f2129', paddingBottom: '0.5rem', margin: '0 0 1rem 0'}}>{category}</h3>
                    <div className="catalog-items" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem'}}>
                      {items.map((item) => (
                        <div 
                          key={`${item.key}-${item.id}`} 
                          onClick={() => toggleSoftwareSelection(item.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', 
                            background: selectedSoftware.includes(item.id) ? '#1c1e26' : '#15171e', 
                            border: `1px solid ${selectedSoftware.includes(item.id) ? '#818cf8' : '#1f2129'}`,
                            borderRadius: '8px', cursor: 'pointer'
                          }}
                        >
                          <div style={{width: '20px', height: '20px', border: '1px solid #8b92a5', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: selectedSoftware.includes(item.id) ? '#818cf8' : 'transparent', color: '#fff', fontSize: '12px'}}>
                            {selectedSoftware.includes(item.id) ? 'Y' : ''}
                          </div>
                          <div style={{flex: 1}}>
                            <div style={{fontWeight: 500, fontSize: '0.95rem'}}>{item.name}</div>
                            <div style={{color: '#8b92a5', fontSize: '0.75rem'}}>{item.id}</div>
                          </div>
                          <button
                            className="add-task-btn"
                            style={{padding: '0.4rem 0.8rem', fontSize: '0.8rem', zIndex: 2}}
                            onClick={(e) => {
                              e.stopPropagation();
                              send(`install ${item.name}`);
                            }}
                          >
                            Approve
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'ai_chat' && (
            <div className="ai-chat-section" style={{height: '100%', display: 'flex', flexDirection: 'column'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
                <h2 style={{margin: 0}}>AI Assistant (Full View)</h2>
                <select value={aiProvider} onChange={e => setAiProvider(e.target.value)} className="model-select">
                  {AI_PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="chat-box" ref={boxRef} style={{flex: 1, overflowY: 'auto', background: '#111217', padding: '1.5rem', borderRadius: '12px', border: '1px solid #1f2129', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                {messages.map((m, i) => (
                  <div key={i} className={`ai-msg ${m.role}`} style={{
                    alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                    background: m.role === 'user' ? '#4f46e5' : '#15171e',
                    padding: '1rem', borderRadius: '8px', border: m.role === 'ai' ? '1px solid #1f2129' : 'none',
                    maxWidth: '80%'
                  }}>
                    {m.text}
                  </div>
                ))}
              </div>
              <div className="ai-input-wrapper">
                <input 
                  type="text" 
                  placeholder="Ask something..." 
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && send()}
                />
                <button className="send-btn" onClick={send}>&gt;</button>
              </div>
            </div>
          )}

          {activeSection === 'settings' && (
            <div className="settings-section" style={{ padding: '2rem', background: '#111217', borderRadius: '12px', border: '1px solid #1f2129' }}>
              <h2>Settings</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1.5rem', maxWidth: '500px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: '#8b92a5' }}>AI Provider</label>
                  <select 
                    value={aiProvider} 
                    onChange={e => setAiProvider(e.target.value)}
                    className="model-select"
                    style={{width: '100%', padding: '0.8rem'}}
                  >
                    {AI_PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: '#8b92a5' }}>Model ID</label>
                  <input 
                    type="text" 
                    value={aiModel} 
                    onChange={e => setAiModel(e.target.value)}
                    placeholder="Leave blank for default" 
                    style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: '#15171e', color: '#fff', border: '1px solid #2a2d39' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: '#8b92a5' }}>API Key</label>
                  <input 
                    type="password" 
                    value={apiKey} 
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="sk-..." 
                    style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: '#15171e', color: '#fff', border: '1px solid #2a2d39' }}
                  />
                </div>
                <button 
                  onClick={saveSettings} 
                  className="add-task-btn"
                  style={{ alignSelf: 'flex-start' }}
                >
                  {configSaved ? 'Saved!' : 'Save Settings'}
                </button>
              </div>
            </div>
          )}

          {activeSection === 'editor' && (
            <CodeEditor
              onRunScript={(code, language) => {
                // Save temp script and create a task to run it
                const ext = language === 'python' ? '.py' : '.ps1';
                const taskType = language === 'python' ? 'run_python' : 'run_powershell';
                const tempPath = `C:/AI/Workspace/temp_script${ext}`;
                // First write the file, then run it
                const writeTasks: PlannerTask[] = [
                  {
                    type: 'write_file',
                    label: `Save script to ${tempPath}`,
                    params: { path: tempPath, content: code },
                    estimated_seconds: 2,
                    status: 'pending',
                  },
                  {
                    type: taskType,
                    label: `Run ${language} script`,
                    params: { script_path: tempPath, args: [] },
                    estimated_seconds: 30,
                    status: 'pending',
                  },
                ];
                integrate(writeTasks);
                setActiveSection('tasks');
              }}
            />
          )}

          {activeSection === 'terminal' && (
            <TerminalPanel logs={logs} />
          )}

          {activeSection === 'history' && (
            <TaskHistory
              onOpenReport={(reportPath) => {
                if (window.electronAPI?.openReport) {
                  window.electronAPI.openReport(reportPath);
                }
              }}
            />
          )}

        </div>
      </main>

      {/* Floating Terminal Windows */}
      {Object.keys(terminalWindows).map(taskId => {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return null;
        const tw = terminalWindows[taskId];
        const taskLogs = logs.filter(l => l.id === taskId).map(l => l.line);
        const maxZ = Math.max(...Object.values(terminalWindows).map(w => w.zIndex), 0);
        return (
          <FloatingTerminal
            key={taskId}
            taskId={taskId}
            title={task.label}
            logs={taskLogs}
            status={task.status}
            reportPath={reports[taskId]}
            bounds={tw.bounds}
            onBoundsChange={(b) => updateTerminalBounds(taskId, b)}
            zIndex={tw.zIndex}
            focused={tw.zIndex === maxZ}
            minimized={tw.minimized}
            onToggleMinimize={() => toggleMinimizeTerminal(taskId)}
            onFocus={() => focusTerminal(taskId)}
            onClose={() => closeTerminal(taskId)}
            onViewReport={() => openReport(taskId)}
            onOpenReportFolder={() => {
              if (reports[taskId] && window.electronAPI?.openReportFolder) {
                window.electronAPI.openReportFolder(reports[taskId]);
              }
            }}
          />
        );
      })}
    </div>
  );
}

export default App;
