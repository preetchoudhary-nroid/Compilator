/**
 * ai/system-info.cjs
 * ------------------
 * Hardware / operating-system detection for the AI context builder.
 *
 * Uses only Node and Electron APIs (os, os.cpus, process.arch, Electron's
 * app.getVersion / app.getPath). Nothing is hardcoded — every value is read
 * from the live system at request time.
 */

const os = require('os');
const { execFile } = require('child_process');

/** Cached async result so we don't re-run slow commands on every request. */
let winDiskCache = null;

/** Parse `wmic logicaldisk ... /format:csv` output into drive records. */
function parseWmicDrives(stdout) {
  const drives = [];
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const cols = line.split(',');
    if (cols.length >= 3 && /^[A-Za-z]:$/.test(cols[1] || '')) {
      const size = Number(cols[2]);
      const free = Number(cols[3]);
      drives.push({
        drive: cols[1],
        totalGB: Number.isFinite(size) ? Math.round(size / 1e9) : null,
        freeGB: Number.isFinite(free) ? Math.round(free / 1e9) : null,
      });
    }
  }
  return drives;
}

/** Parse `Get-CimInstance Win32_LogicalDisk` "Drive|Size|Free" lines. */
function parseCimDrives(stdout) {
  const drives = [];
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const cols = line.split('|');
    const drive = (cols[0] || '').trim();
    if (cols.length >= 3 && /^[A-Za-z]:$/.test(drive)) {
      const size = Number(cols[1]);
      const free = Number(cols[2]);
      drives.push({
        drive,
        totalGB: Number.isFinite(size) && size > 0 ? Math.round(size / 1e9) : null,
        freeGB: Number.isFinite(free) && free > 0 ? Math.round(free / 1e9) : null,
      });
    }
  }
  return drives;
}

/** Resolve a cached list of local drives on Windows (best effort). */
function getWindowsDrives() {
  if (winDiskCache) return Promise.resolve(winDiskCache);
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve([]);
      return;
    }
    // wmic is deprecated/removed on modern Windows (11 24H2+); try it first,
    // then fall back to the PowerShell CIM provider.
    execFile(
      'wmic',
      ['logicaldisk', 'get', 'Caption,Size,FreeSpace', '/format:csv'],
      { timeout: 4000, windowsHide: true },
      (err, stdout) => {
        if (!err) {
          const drives = parseWmicDrives(stdout);
          if (drives.length > 0) {
            winDiskCache = drives;
            resolve(drives);
            return;
          }
        }
        execFile(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-Command',
           "Get-CimInstance Win32_LogicalDisk | ForEach-Object { '{0}|{1}|{2}' -f $_.Caption,$_.Size,$_.FreeSpace }"],
          { timeout: 6000, windowsHide: true },
          (psErr, psOut) => {
            winDiskCache = parseCimDrives(psErr ? '' : psOut || '');
            resolve(winDiskCache);
          }
        );
      }
    );
  });
}

/** Cached windows-version string (empty when not on Windows). */
let winVersionCache = null;

/** Windows version / release / build id using cmd `ver` (best effort). */
function getWindowsVersion() {
  if (winVersionCache) return Promise.resolve(winVersionCache);
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve('');
      return;
    }
    execFile(
      'cmd.exe',
      ['/d', '/c', 'ver'],
      { timeout: 3000, windowsHide: true },
      (err, stdout) => {
        winVersionCache = err ? '' : (stdout || '').trim();
        resolve(winVersionCache);
      }
    );
  });
}

/** GPU vendor/model via wmic when available, PowerShell CIM fallback. */
let gpuCache = null;

function getGpuInfo() {
  if (gpuCache) return Promise.resolve(gpuCache);
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve([]);
      return;
    }
    execFile(
      'wmic',
      ['path', 'win32_VideoController', 'get', 'Name'],
      { timeout: 4000, windowsHide: true },
      (err, stdout) => {
        const fromWmic = [];
        if (!err) {
          for (const line of String(stdout || '').split(/\r?\n/)) {
            const name = line.trim();
            if (name && name !== 'Name') fromWmic.push(name);
          }
        }
        if (fromWmic.length > 0) {
          gpuCache = fromWmic;
          resolve(fromWmic);
          return;
        }
        execFile(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_VideoController).Name'],
          { timeout: 6000, windowsHide: true },
          (psErr, psOut) => {
            const gpus = [];
            for (const line of String(psErr ? '' : psOut || '').split(/\r?\n/)) {
              const name = line.trim();
              if (name) gpus.push(name);
            }
            gpuCache = gpus;
            resolve(gpus);
          }
        );
      }
    );
  });
}

/**
 * Collect everything the AI should know about the machine it runs on.
 *
 * @param {{ app?: import('electron').App }} [opts]
 * @returns {Promise<{
 *   os: { platform: string, release: string, version: string, arch: string, hostname: string },
 *   cpu: { model: string, cores: number, threads: number, speedGHz: number|null },
 *   gpu: string[],
 *   ram: { totalGB: number, freeGB: number },
 *   disk: { drive: string, totalGB: number|null, freeGB: number|null }[],
 *   app: { version: string, userDataPath: string },
 * }>}
 */
async function buildSystemInfo({ app } = {}) {
  const cpus = os.cpus();
  const totalMemGB = Math.round(os.totalmem() / 1024 ** 3);
  const freeMemGB = Math.round(os.freemem() / 1024 ** 3);

  // All detection happens in parallel (and is cached where possible).
  const [gpu, drives, winVersion] = await Promise.all([
    getGpuInfo(),
    getWindowsDrives(),
    getWindowsVersion(),
  ]);

  return {
    os: {
      platform: os.platform(),
      release: os.release(),
      version: winVersion || os.release(),
      arch: process.arch,
      hostname: os.hostname(),
    },
    cpu: {
      model: cpus[0]?.model || 'Unknown CPU',
      cores: os.cpus().length,
      threads: cpus.length,
      speedGHz: Number.isFinite(cpus[0]?.speed) ? Math.round((cpus[0].speed / 1000) * 10) / 10 : null,
    },
    gpu,
    ram: { totalGB: totalMemGB, freeGB: freeMemGB },
    disk: drives,
    app: {
      version: app?.getVersion ? app.getVersion() : '0.0.0',
      userDataPath: app?.getPath ? app.getPath('userData') : '',
    },
  };
}

module.exports = { buildSystemInfo };