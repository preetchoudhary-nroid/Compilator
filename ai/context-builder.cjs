/**
 * ai/context-builder.cjs
 * ----------------------
 * Assembles runtime context for every AI request.
 *
 * Flow:  User → Intent Detection → AI Context Builder → Provider → Response
 *
 * The builder merges:
 *   - application identity / version
 *   - runtime (provider, model, execution mode)
 *   - internet availability probe
 *   - detected hardware / OS (only when relevant to the message)
 *   - installed software (filtered to packages relevant to the conversation)
 *   - Compilator capabilities, supported task types and limitations
 *   - current execution + planner state
 *
 * Context is requested dynamically per message — never one giant prompt, and
 * never sent when the intent is simple CHAT.
 */

const { loadAIConfig } = require('./config.cjs');
const { buildSystemInfo } = require('./system-info.cjs');
const { classifyTopics } = require('./intent-detector.cjs');

const CAPABILITIES = [
  'AI conversation',
  'Task planning',
  'Winget installation',
  'Winget package detection',
  'Folder creation',
  'File creation',
  'Floating terminal windows',
  'Live execution logs',
  'Task reports',
  'Report history',
  'User approval before execution',
];

const LIMITATIONS = [
  'Cannot delete files',
  'Cannot access passwords',
  'Cannot modify registry',
  'Cannot disable antivirus',
  'Cannot execute PowerShell',
  'Cannot browse the internet when offline',
  'Cannot claim actions were completed',
  'Cannot invent task types',
  'Cannot invent Winget IDs',
];

const SUPPORTED_TASK_TYPES = ['mkdir', 'winget_install', 'winget_list', 'write_file'];

/** Probe internet availability with a short, bounded request. Cached 30s. */
let internetCache = null;
let internetCacheAt = 0;

function checkInternetAvailable() {
  const now = Date.now();
  if (internetCache && now - internetCacheAt < 30000) {
    return Promise.resolve(internetCache);
  }
  return new Promise((resolve) => {
    const { execFile } = require('child_process');
    execFile(
      'ping',
      ['-n', '1', '-w', '2000', 'one.one.one.one'],
      { timeout: 2500, windowsHide: true },
      (err) => {
        internetCache = !err;
        internetCacheAt = Date.now();
        resolve(internetCache);
      }
    );
  });
}

/** Map a winget-style id to its human label (best effort). */
function labelForId(id, installedPackages) {
  if (!id) return id;
  const match = installedPackages.find((p) => p.id && p.id.toLowerCase() === id.toLowerCase());
  if (match) return match.name;
  const map = {
    'microsoft.visualstudiocode': 'Visual Studio Code',
    'openjs.nodejs': 'Node.js',
    'python.python.3.12': 'Python 3.12',
    'git.git': 'Git',
    'google.chrome': 'Google Chrome',
    'docker.dockerdesktop': 'Docker Desktop',
  };
  return map[id.toLowerCase()] || id;
}

/** Keep only installed packages whose name/id matches words in the message. */
function filterRelevantPackages(installed, message, limit = 12) {
  const text = (message || '').toLowerCase();
  const words = new Set(
    text
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
  const relevant = (installed || []).filter(
    (p) =>
      p.name &&
      words.size > 0 &&
      [...words].some(
        (w) => p.name.toLowerCase().includes(w) || (p.id || '').toLowerCase().includes(w)
      )
  );
  return relevant.slice(0, limit);
}

const RELEVANT_RE = /(python|git|node|docker|chrome|vscode|visual studio code|winget|installed)/i;

/**
 * Build the full runtime context for one request.
 *
 * @param {{
 *   message: string,
 *   intent: 'CHAT'|'TASK'|'UNKNOWN',
 *   installedPackages?: { name: string, id: string, version: string }[],
 *   activeTasksCount?: number,
 *   reportsCount?: number,
 *   app?: import('electron').App,
 * }} opts
 * @returns {Promise<object>}
 */
async function buildAIContext({
  message,
  intent,
  installedPackages = [],
  activeTasksCount = 0,
  reportsCount = 0,
  app,
} = {}) {
  const config = loadAIConfig({ app });
  const topics = classifyTopics(message);
  const wantHardware = topics.includes('hardware');
  const wantSoftware = topics.includes('software') || intent === 'TASK';

  // System info is only collected when hardware topics are relevant.
  const systemInfo = wantHardware ? await buildSystemInfo({ app }) : null;

  // Installed packages are only collected for task planning / software topics
  // and are filtered to what matters for this message.
  const showPackages = wantSoftware && installedPackages.length > 0;
  const relevantPackages = wantSoftware
    ? filterRelevantPackages(installedPackages, message)
    : [];

  const hasRelevantPackageQuery = RELEVANT_RE.test(message || '');

  const internetAvailable = await checkInternetAvailable();

  return {
    identity: {
      name: 'Compilator',
      role: 'intelligence layer of Compilator',
      version: systemInfo?.app?.version || app?.getVersion?.() || '0.0.0',
      not: ['ChatGPT', 'Claude', 'Gemini'],
      statement:
        'You are Compilator. You are the intelligence layer of Compilator. ' +
        'You are not ChatGPT, not Claude, not Gemini. You are an AI desktop assistant inside Compilator. ' +
        'You answer questions and create structured task plans. You never execute tasks yourself — ' +
        'execution is handled by Compilator after explicit user approval.',
    },
    runtime: {
      provider: config.provider,
      model: config.model,
      executionMode: config.executionMode,
      temperature: config.temperature,
      contextLength: config.contextLength,
      streaming: config.streaming,
      internetAvailable,
    },
    system: wantHardware
      ? {
          os: systemInfo.os,
          cpu: systemInfo.cpu,
          gpu: systemInfo.gpu,
          ram: systemInfo.ram,
          disk: systemInfo.disk,
        }
      : undefined,
    installedSoftware: showPackages
      ? {
          relevant: relevantPackages,
          total: installedPackages.length,
          note: showPackages && relevantPackages.length === 0
            ? 'No installed packages matched this conversation.'
            : undefined,
        }
      : undefined,
    capabilities: {
      list: CAPABILITIES,
      supportedTaskTypes: SUPPORTED_TASK_TYPES,
    },
    limitations: LIMITATIONS,
    planner: {
      allowed: SUPPORTED_TASK_TYPES,
      maxTasks: 5,
      wingetIds: [
        'Microsoft.VisualStudioCode',
        'OpenJS.NodeJS',
        'Python.Python.3.12',
        'Git.Git',
        'Google.Chrome',
        'Docker.DockerDesktop',
      ],
      note: 'Only use these verified winget IDs. Never invent new ones.',
    },
    execution: {
      requiresApproval: true,
      activeTasks: activeTasksCount,
      reportsAvailable: reportsCount,
    },
    hasRelevantPackageQuery,
    topics,
  };
}

module.exports = { buildAIContext, labelForId, filterRelevantPackages };