/**
 * store.cjs
 * ---------
 * Persistent task & settings store for Compilator.
 *
 * Data is stored in Electron's userData directory:
 *   <userData>/compilator-store.json
 *
 * Schema:
 *   {
 *     tasks: TaskRecord[],       // historical task records
 *     settings: { ... }          // user preferences (provider, name, etc.)
 *   }
 *
 * Task records are appended on completion and survive across sessions.
 * The store auto-saves on every write, and reads are cached in memory.
 */

const fs = require('fs');
const path = require('path');

const STORE_FILENAME = 'compilator-store.json';
const MAX_TASKS = 1000; // Keep last 1000 tasks to prevent unbounded growth

/** @type {{ tasks: TaskRecord[], settings: Record<string, any> } | null} */
let cache = null;
let storePath = null;

/**
 * @typedef {{
 *   id: string,
 *   type: string,
 *   label: string,
 *   params: Record<string, any>,
 *   status: string,
 *   startedAt: string,
 *   finishedAt: string,
 *   durationSeconds: number,
 *   command?: string,
 *   exitCode?: number | null,
 *   reportPath?: string,
 *   sessionDate: string,
 * }} TaskRecord
 */

/**
 * Initialize the store with the Electron app instance.
 * Must be called once after app.whenReady().
 * @param {import('electron').App} app
 */
function initStore(app) {
  storePath = path.join(app.getPath('userData'), STORE_FILENAME);
  cache = loadFromDisk();
}

/** Read from disk or return empty defaults. */
function loadFromDisk() {
  try {
    if (storePath && fs.existsSync(storePath)) {
      const raw = fs.readFileSync(storePath, 'utf8');
      const data = JSON.parse(raw);
      return {
        tasks: Array.isArray(data.tasks) ? data.tasks : [],
        settings: data.settings || {},
      };
    }
  } catch (err) {
    console.error('[store] Failed to read store file:', err.message);
  }
  return { tasks: [], settings: {} };
}

/** Persist the in-memory cache to disk. */
function saveToDisk() {
  if (!storePath || !cache) return;
  try {
    fs.writeFileSync(storePath, JSON.stringify(cache, null, 2), 'utf8');
  } catch (err) {
    console.error('[store] Failed to write store file:', err.message);
  }
}

// ---- Task History -----------------------------------------------------------

/**
 * Save a completed task record to the store.
 * Called from finishTaskRun() in main.cjs.
 * @param {TaskRecord} record
 */
function saveTask(record) {
  if (!cache) cache = loadFromDisk();
  cache.tasks.push(record);
  // Trim to MAX_TASKS (keep most recent)
  if (cache.tasks.length > MAX_TASKS) {
    cache.tasks = cache.tasks.slice(-MAX_TASKS);
  }
  saveToDisk();
}

/**
 * Get all task records, newest first.
 * @param {{ limit?: number, type?: string, status?: string, search?: string }} [filters]
 * @returns {TaskRecord[]}
 */
function getTasks(filters = {}) {
  if (!cache) cache = loadFromDisk();
  let tasks = [...cache.tasks].reverse(); // newest first

  if (filters.type) {
    tasks = tasks.filter(t => t.type === filters.type);
  }
  if (filters.status) {
    tasks = tasks.filter(t => t.status === filters.status);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    tasks = tasks.filter(t => t.label.toLowerCase().includes(q) || t.type.toLowerCase().includes(q));
  }
  if (filters.limit && filters.limit > 0) {
    tasks = tasks.slice(0, filters.limit);
  }

  return tasks;
}

/**
 * Get summary statistics for the dashboard.
 * @returns {{ totalTasks: number, completed: number, failed: number, cancelled: number, todayTasks: number, todayCompleted: number, avgDuration: number, tasksByType: Record<string, number>, tasksByDay: Array<{date: string, count: number}> }}
 */
function getStats() {
  if (!cache) cache = loadFromDisk();
  const tasks = cache.tasks;

  const today = new Date().toISOString().slice(0, 10);
  const todayTasks = tasks.filter(t => t.sessionDate === today);

  const completed = tasks.filter(t => t.status === 'done' || t.status === 'already_installed').length;
  const failed = tasks.filter(t => t.status === 'failed').length;
  const cancelled = tasks.filter(t => t.status === 'cancelled').length;

  const durations = tasks
    .filter(t => typeof t.durationSeconds === 'number' && t.durationSeconds > 0)
    .map(t => t.durationSeconds);
  const avgDuration = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  // Tasks by type
  const tasksByType = {};
  for (const t of tasks) {
    tasksByType[t.type] = (tasksByType[t.type] || 0) + 1;
  }

  // Tasks per day (last 7 days)
  const tasksByDay = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const count = tasks.filter(t => t.sessionDate === dateStr).length;
    tasksByDay.push({ date: dateStr, count });
  }

  return {
    totalTasks: tasks.length,
    completed,
    failed,
    cancelled,
    todayTasks: todayTasks.length,
    todayCompleted: todayTasks.filter(t => t.status === 'done' || t.status === 'already_installed').length,
    avgDuration,
    tasksByType,
    tasksByDay,
  };
}

/** Clear all task history. */
function clearTasks() {
  if (!cache) cache = loadFromDisk();
  cache.tasks = [];
  saveToDisk();
}

// ---- Settings ---------------------------------------------------------------

/**
 * Get a setting value.
 * @param {string} key
 * @param {any} [defaultValue]
 * @returns {any}
 */
function getSetting(key, defaultValue) {
  if (!cache) cache = loadFromDisk();
  return cache.settings[key] !== undefined ? cache.settings[key] : defaultValue;
}

/**
 * Set a setting value.
 * @param {string} key
 * @param {any} value
 */
function setSetting(key, value) {
  if (!cache) cache = loadFromDisk();
  cache.settings[key] = value;
  saveToDisk();
}

/**
 * Get all settings.
 * @returns {Record<string, any>}
 */
function getAllSettings() {
  if (!cache) cache = loadFromDisk();
  return { ...cache.settings };
}

/**
 * Merge settings (partial update).
 * @param {Record<string, any>} partial
 */
function mergeSettings(partial) {
  if (!cache) cache = loadFromDisk();
  Object.assign(cache.settings, partial);
  saveToDisk();
}

module.exports = {
  initStore,
  saveTask,
  getTasks,
  getStats,
  clearTasks,
  getSetting,
  setSetting,
  getAllSettings,
  mergeSettings,
};

