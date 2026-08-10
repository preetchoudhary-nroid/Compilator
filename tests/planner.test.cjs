'use strict';

// ---------------------------------------------------------------------------
// Regression tests for install-intent parsing in the Compilator planner.
//
// Runs against the REAL main-process planner (main.cjs -> planFromRequest)
// plus the shared parser core (src/planner-core.js) that both main.cjs and
// the browser-fallback planner (App.tsx) use.
//
// Usage: node tests/planner.test.cjs
// ---------------------------------------------------------------------------

const assert = require('node:assert/strict');
const Module = require('node:module');

// ---- Mock Electron so we can load the real main.cjs planner --------------
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') {
    return {
      app: {
        whenReady: () => new Promise(() => {}), // never resolve -> no window boot
        on: () => {},
        getPath: () => process.cwd(),
      },
      BrowserWindow: class {
        static getAllWindows() { return []; }
        loadFile() {}
        loadURL() {}
        on() {}
      },
      ipcMain: { handle: async () => {}, removeHandler: () => {} },
      shell: { openPath: async () => ({}) },
    };
  }
  return origLoad.call(this, request, parent, isMain);
};

const { _internal } = require('../main.cjs');
const { planFromRequest } = _internal;

const core = require('../src/planner-core.js');
const { extractInstallTarget, isNegated, resolveCatalogTarget } = core;

const CATALOG = {
  'visual studio code': 'Microsoft.VisualStudioCode',
  vscode: 'Microsoft.VisualStudioCode',
  'vs code': 'Microsoft.VisualStudioCode',
  'node lts': 'OpenJS.NodeJS.LTS',
  'node.js lts': 'OpenJS.NodeJS.LTS',
  node: 'OpenJS.NodeJS',
  nodejs: 'OpenJS.NodeJS',
  'node.js': 'OpenJS.NodeJS',
  'python 3.13': 'Python.Python.3.13',
  'python 3.12': 'Python.Python.3.12',
  python: 'Python.Python.3.13',
  git: 'Git.Git',
  'github desktop': 'GitHub.GitHubDesktop',
  'go lang': 'GoLang.Go',
  golang: 'GoLang.Go',
  go: 'GoLang.Go',
  rust: 'Rustlang.Rustup',
  rustup: 'Rustlang.Rustup',
  rustdesk: 'RustDesk.RustDesk',
  'gog galaxy': 'GOG.Galaxy',
  gog: 'GOG.Galaxy',
  chrome: 'Google.Chrome',
  'google chrome': 'Google.Chrome',
  docker: 'Docker.DockerDesktop',
  'docker desktop': 'Docker.DockerDesktop',
  dbeaver: 'DBeaver.DBeaver.Community',
  discord: 'Discord.Discord',
  steam: 'Valve.Steam',
  blender: 'BlenderFoundation.Blender',
  'notepad++': 'Notepad++.Notepad++',
  notepad: 'Notepad++.Notepad++',
};

let passCount = 0;
let failCount = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passCount += 1;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failCount += 1;
    failures.push({ name, err });
    console.log(`  FAIL  ${name}\n        ${String(err.message).split('\n').join('\n        ')}`);
  }
}

function planId(input) {
  const p = planFromRequest(input, []);
  return { p, id: (p.tasks[0] || {}).params && p.tasks[0].params.id };
}

function expectChrome(input) {
  check(`winget_install -> Google.Chrome for ${JSON.stringify(input)}`, () => {
    const { p, id } = planId(input);
    assert.equal(p.tasks.length, 1, `expected 1 task, got tasks=${JSON.stringify(p.tasks)} skipped=${JSON.stringify(p.tasks_skipped)}`);
    assert.equal(p.tasks[0].type, 'winget_install');
    assert.equal(id, 'Google.Chrome', `resolved id was ${JSON.stringify(id)}`);
    assert.equal(p.tasks[0].status, 'pending', 'approval gating must leave task pending (not executed)');
  });
}

function expectNoInstall(input) {
  check(`no install task for ${JSON.stringify(input)}`, () => {
    const p = planFromRequest(input, []);
    assert.equal(p.tasks.length, 0, `unexpected tasks: ${JSON.stringify(p.tasks)}`);
    assert.ok(p.tasks_skipped.length >= 1, 'expected a skipped/reason entry');
    assert.match(String(p.tasks_skipped[0].request || ''), /./);
  });
}
// ---- Acceptance: positive installs -> Google.Chrome -----------------------
console.log('\n[acceptance] chrome installs -> Google.Chrome');
[
  'chrome install pls',
  'yr chrome install krde',
  'chrome install krde bhai',
  'chrome install karo',
  'bhai chrome install karo',
  'install chrome',
  'install chrome pls',
  'chrome pls install',
  'install google chrome',
  'google chrome install',
  'set up chrome',
  'please chrome install',
  'chrome install please',
  'chrome install krde',
  'chrome setup kar do',
  'chrome setup',
  'setup chrome',
  'chrome set up',
].forEach(expectChrome);

// ---- Robustness: punctuation, casing, whitespace --------------------------
console.log('\n[robustness] punctuation / casing / whitespace');
[
  'Chrome INSTALL PLS',
  'chrome, install pls',
  'chrome! install',
  'CHROME INSTALL KARO',
  '  chrome   install   pls  ',
  'chrome... install kardo',
].forEach(expectChrome);

// ---- Generic packages (must NOT be hardcoded to chrome) -------------------
console.log('\n[generic] other verified winget packages');
const genericCases = [
  ['install git', 'Git.Git'],
  ['git install', 'Git.Git'],
  ['install git bhai', 'Git.Git'],
  ['install node', 'OpenJS.NodeJS'],
  ['node install krde', 'OpenJS.NodeJS'],
  ['install node.js', 'OpenJS.NodeJS'],
  ['install python', 'Python.Python.3.13'],
  ['python install kardo', 'Python.Python.3.13'],
  ['install python 3.13', 'Python.Python.3.13'],
  ['install python 3.12', 'Python.Python.3.12'],
  ['install vscode', 'Microsoft.VisualStudioCode'],
  ['set up vscode', 'Microsoft.VisualStudioCode'],
  ['install visual studio code', 'Microsoft.VisualStudioCode'],
  ['install docker desktop', 'Docker.DockerDesktop'],
  ['install github desktop', 'GitHub.GitHubDesktop'],
  ['github desktop install', 'GitHub.GitHubDesktop'],
  ['install visual studio 2022', 'Microsoft.VisualStudio.2022.Community'],
  ['install node lts', 'OpenJS.NodeJS.LTS'],
  ['install java', 'EclipseAdoptium.Temurin.21.JDK'],
  ['install jdk', 'EclipseAdoptium.Temurin.21.JDK'],
  ['install go', 'GoLang.Go'],
  ['install golang', 'GoLang.Go'],
  ['install rust', 'Rustlang.Rustup'],
  ['install rustup', 'Rustlang.Rustup'],
  ['install rustdesk', 'RustDesk.RustDesk'],
  ['install gog galaxy', 'GOG.Galaxy'],
  ['install dbeaver', 'DBeaver.DBeaver.Community'],
  ['install postman', 'Postman.Postman'],
  ['install notepad++', 'Notepad++.Notepad++'],
  ['install 7zip', '7zip.7zip'],
  ['install windows terminal', 'Microsoft.WindowsTerminal'],
  ['install firefox', 'Mozilla.Firefox'],
  ['install edge', 'Microsoft.Edge'],
  ['install brave', 'Brave.Brave'],
  ['install opera', 'Opera.Opera'],
  ['install vlc', 'VideoLAN.VLC'],
  ['install obs studio', 'OBSProject.OBSStudio'],
  ['install blender', 'BlenderFoundation.Blender'],
  ['install wireshark', 'WiresharkFoundation.Wireshark'],
  ['install putty', 'PuTTY.PuTTY'],
  ['install tailscale', 'Tailscale.Tailscale'],
  ['install openvpn', 'OpenVPNTechnologies.OpenVPN'],
  ['install libreoffice', 'TheDocumentFoundation.LibreOffice'],
  ['install obsidian', 'Obsidian.Obsidian'],
  ['install notion', 'Notion.Notion'],
  ['install powertoys', 'Microsoft.PowerToys'],
  ['install steam', 'Valve.Steam'],
  ['install epic games launcher', 'EpicGames.EpicGamesLauncher'],
  ['install ubisoft connect', 'Ubisoft.Connect'],
  ['install discord', 'Discord.Discord'],
];
for (const [input, expected] of genericCases) {
  check(`resolves ${JSON.stringify(input)} -> ${expected}`, () => {
    const { p, id } = planId(input);
    assert.equal(p.tasks.length, 1, `tasks=${JSON.stringify(p.tasks)} skipped=${JSON.stringify(p.tasks_skipped)}`);
    assert.equal(p.tasks[0].type, 'winget_install');
    assert.equal(id, expected, `got ${JSON.stringify(id)}`);
  });
}

// ---- Negation / cancellation: MUST NOT create install tasks ---------------
console.log('\n[negation] no install task');
[
  "I don't want to install chrome",
  "don't install chrome",
  'do not install chrome',
  'not install chrome',
  'never mind, install chrome',
  'never mind install chrome',
  'cancel chrome install',
  'cancel the chrome installation',
  'i dont want chrome',
  'no thanks',
].forEach(expectNoInstall);

// ---- Unknown packages: clear skipped reason, never a guessed id -----------
console.log('\n[unknown] unverified packages');
['install photoshop', 'install photoshop pls', 'photoshop install karo'].forEach((input) => {
  check(`${JSON.stringify(input)} -> clear unknown/unverified skip`, () => {
    const p = planFromRequest(input, []);
    assert.equal(p.tasks.length, 0);
    assert.equal(p.tasks_skipped.length, 1);
    const s = p.tasks_skipped[0];
    assert.match(String(s.request), /photoshop/i, `request should keep the package name, got ${JSON.stringify(s.request)}`);
    assert.match(String(s.reason), /unknown|unverified/i, `reason should explain no verified id: ${s.reason}`);
  });
});

// ---- AI-path regression: garbage model plans must not lose real requests ---
// The REAL bug: the AI provider (e.g. a small local model) returns empty or
// hallucinated planner JSON — `{}`, `{"tasks":[]}`, `{"tasks":[{}]}`,
// `{"tasks":[{"label":"{}"}]}`. main.cjs used to accept that as the final
// plan, producing "Skipped 1 request(s): {}" and never running the built-in
// planner. resolveAiPlan() must fall back to planFromRequest() so
// "chrome install pls" still becomes a real pending Google.Chrome task.
console.log('\n[ai-path] garbage model plans fall back to the local planner');
const { resolveAiPlan, isJunkSkipped, summarizePlan } = _internal;

const GARBAGE_PLANS = [
  {},
  { tasks: [] },
  { tasks: [], tasks_skipped: [] },
  { tasks: [{}] },
  { tasks: [{ label: '{}' }] },
  { tasks: [{ type: '' }] },
  { tasks: [{ type: '', label: '{}' }] },
  { tasks: [{ type: 'NOPE', label: '{}' }] },
  { tasks: [], tasks_skipped: [{}] },
  { tasks: [], tasks_skipped: [{ request: '{}', reason: 'Unknown task type: ' }] },
];

const AI_PATH_INPUTS = [
  'chrome install pls',
  'chrome install',
  'git install',
  'yr chrome install krde',
  'chrome install krde bhai',
];

for (const input of AI_PATH_INPUTS) {
  for (const plan of GARBAGE_PLANS) {
    check(`[ai-path] "${input}" + garbage plan ${JSON.stringify(plan)} -> real pending task, no "{}"`, () => {
      const resolved = resolveAiPlan({ intent: 'TASK', plan }, input, []);
      assert.equal(resolved.tasks.length, 1, `expected 1 task, got ${JSON.stringify(resolved)}`);
      assert.equal(resolved.tasks[0].type, 'winget_install');
      assert.equal(resolved.tasks[0].status, 'pending', 'approval gating must leave task pending (not executed)');
      assert.equal(resolved.tasks_skipped.length, 0, `no junk skip may leak, got ${JSON.stringify(resolved.tasks_skipped)}`);
      assert.ok(
        !/{}|\[object Object\]/.test(JSON.stringify(resolved)),
        `no "{}" / [object Object] may leak, got ${JSON.stringify(resolved)}`
      );
      assert.match(resolved.reply, /I planned 1 task\(s\):/);
    });
  }
}

console.log('\n[ai-path] informative model plans are kept');
check('AI plan with a real winget_install task is kept', () => {
  const resolved = resolveAiPlan(
    { intent: 'TASK', plan: { tasks: [{ type: 'winget_install', label: 'Install chrome (Google.Chrome)', params: { id: 'Google.Chrome' } }] } },
    'install chrome',
    []
  );
  assert.equal(resolved.tasks.length, 1);
  assert.equal(resolved.tasks[0].params.id, 'Google.Chrome');
  assert.equal(resolved.source, 'server');
});

check('AI plan with an informative tasks_skipped entry is kept (photoshop)', () => {
  const resolved = resolveAiPlan(
    { intent: 'TASK', plan: { tasks_skipped: [{ request: 'install photoshop', reason: 'Unknown or unverified winget package id — refusing to guess one.' }] } },
    'install photoshop',
    []
  );
  assert.equal(resolved.tasks.length, 0);
  assert.equal(resolved.tasks_skipped.length, 1);
  assert.equal(resolved.tasks_skipped[0].request, 'install photoshop');
  assert.match(resolved.reply, /install photoshop/);
});

check('AI multi-task plan is preserved', () => {
  const resolved = resolveAiPlan(
    {
      intent: 'TASK',
      plan: {
        tasks: [
          { type: 'winget_install', label: 'Install git (Git.Git)', params: { id: 'Git.Git' } },
          { type: 'winget_install', label: 'Install python (Python.Python.3.12)', params: { id: 'Python.Python.3.12' } },
        ],
      },
    },
    'install git and python',
    []
  );
  assert.equal(resolved.tasks.length, 2);
});

console.log('\n[ai-path] safety: negation always wins over the model plan');
check('negation override even when the model hallucinated a chrome install', () => {
  const resolved = resolveAiPlan(
    { intent: 'TASK', plan: { tasks: [{ type: 'winget_install', label: 'Install chrome (Google.Chrome)', params: { id: 'Google.Chrome' } }] } },
    "I don't want to install chrome",
    []
  );
  assert.equal(resolved.tasks.length, 0, `negated request must not install, got ${JSON.stringify(resolved)}`);
  assert.equal(resolved.tasks_skipped.length, 1);
  assert.match(String(resolved.tasks_skipped[0].reason), /not/i);
});

console.log('\n[ai-path] junk detection / summarize never emits "{}"');
check('isJunkSkipped rejects empty request + empty-type reason', () => {
  assert.equal(isJunkSkipped({ request: '{}', reason: 'Unknown task type: ' }), true);
  assert.equal(isJunkSkipped({ request: '{}', reason: 'Unknown task type:' }), true);
  assert.equal(isJunkSkipped({ request: '', reason: 'something' }), true);
  assert.equal(isJunkSkipped(null), true);
  assert.equal(isJunkSkipped({ request: 'install photoshop', reason: 'Unknown or unverified winget package id.' }), false);
});
check('summarizePlan renders a fallback label instead of "{}"', () => {
  const summary = summarizePlan({ tasks: [], tasks_skipped: [{ request: '{}', reason: 'Unknown task type: ' }] });
  assert.ok(!summary.includes('{}'), `summary must not contain {}, got: ${summary}`);
  assert.ok(summary.includes('(unknown request)'), summary);
});

// ---- Empty / invalid requests ----------------------------------------------
console.log('\n[invalid] empty / null requests');
[null, undefined, '', '   '].forEach((input) => {
  check(`empty request ${JSON.stringify(input)} -> no tasks + skip reason`, () => {
    const p = planFromRequest(input, []);
    assert.equal(p.tasks.length, 0);
    assert.ok(p.tasks_skipped.length >= 1);
  });
});

// ---- Non-install task types still work -------------------------------------
console.log('\n[other] non-install tasks unaffected');
check('list installed packages -> winget_list', () => {
  const p = planFromRequest('list installed packages', []);
  assert.equal(p.tasks.length, 1);
  assert.equal(p.tasks[0].type, 'winget_list');
});
check('create folder C:/AI -> mkdir', () => {
  const p = planFromRequest('create folder C:/AI', []);
  assert.equal(p.tasks.length, 1);
  assert.equal(p.tasks[0].type, 'mkdir');
});
check('write file config.json with hello -> write_file', () => {
  const p = planFromRequest('write file config.json with hello', []);
  assert.equal(p.tasks.length, 1);
  assert.equal(p.tasks[0].type, 'write_file');
});
// ---- Shared parser core (used by BOTH main.cjs and the browser planner) ----
console.log('\n[core] extractInstallTarget word-order + filler');
[
  ['chrome install pls', 'chrome'],
  ['yr chrome install krde', 'chrome'],
  ['chrome install krde bhai', 'chrome'],
  ['bhai chrome install karo', 'chrome'],
  ['install chrome', 'chrome'],
  ['install google chrome', 'google chrome'],
  ['google chrome install', 'google chrome'],
  ['set up chrome', 'chrome'],
  ['chrome setup kar do', 'chrome'],
  ['please chrome install', 'chrome'],
  ['chrome pls install', 'chrome'],
  ['install git bhai', 'git'],
  ['install python kardo', 'python'],
].forEach(([input, target]) => {
  check(`extractInstallTarget(${JSON.stringify(input)}) == ${JSON.stringify(target)}`, () => {
    assert.equal(extractInstallTarget(input), target);
  });
});

console.log('\n[core] negation detection');
[
  "I don't want to install chrome",
  "don't install chrome",
  'do not install chrome',
  'not install chrome',
  'never mind, install chrome',
  'cancel chrome install',
  'cancel the chrome installation',
  'no thanks',
].forEach((input) => {
  check(`isNegated(${JSON.stringify(input)}) === true`, () => {
    assert.equal(isNegated(input), true);
  });
});
['install chrome', 'chrome install krde bhai', 'set up vscode', 'install git'].forEach((input) => {
  check(`isNegated(${JSON.stringify(input)}) === false`, () => {
    assert.equal(isNegated(input), false);
  });
});

console.log('\n[core] resolveCatalogTarget');
check('resolveCatalogTarget(chrome) -> Google.Chrome', () => {
  const hit = resolveCatalogTarget('chrome', CATALOG);
  assert.ok(hit, 'expected a catalog hit');
  assert.equal(hit.id, 'Google.Chrome');
  assert.equal(hit.key, 'chrome');
});
check('resolveCatalogTarget(photoshop) -> null (never guessed)', () => {
  assert.equal(resolveCatalogTarget('photoshop', CATALOG), null);
});

// Token-level matching keeps the large catalog unambiguous: a short alias must
// never hijack a longer package ("go" vs "gog galaxy", "rust" vs "rustdesk",
// "git" vs "github desktop"), and punctuation is normalized on both sides
// ("notepad++" still matches when the target says "notepad").
console.log('\n[core] token-level catalog matching stays unambiguous');
[
  ['go', 'GoLang.Go'],
  ['gog galaxy', 'GOG.Galaxy'],
  ['gog', 'GOG.Galaxy'],
  ['rust', 'Rustlang.Rustup'],
  ['rustup', 'Rustlang.Rustup'],
  ['rustdesk', 'RustDesk.RustDesk'],
  ['git', 'Git.Git'],
  ['github desktop', 'GitHub.GitHubDesktop'],
  ['node', 'OpenJS.NodeJS'],
  ['node lts', 'OpenJS.NodeJS.LTS'],
  ['notepad', 'Notepad++.Notepad++'],
  ['notepad++', 'Notepad++.Notepad++'],
  ['discord', 'Discord.Discord'],
  ['steam', 'Valve.Steam'],
  ['dbeaver', 'DBeaver.DBeaver.Community'],
].forEach(([target, expected]) => {
  check(`resolveCatalogTarget(${JSON.stringify(target)}) -> ${expected}`, () => {
    const hit = resolveCatalogTarget(target, CATALOG);
    assert.ok(hit, `expected a catalog hit for ${JSON.stringify(target)}`);
    assert.equal(hit.id, expected, `resolved ${JSON.stringify(hit && hit.id)}`);
  });
});
check('resolveCatalogTarget(photoshop) still null in the expanded catalog', () => {
  assert.equal(resolveCatalogTarget('photoshop', CATALOG), null);
});

// ---- Summary ----------------------------------------------------------------
console.log('\n==================================================');
console.log(`  RESULT: ${passCount} passed, ${failCount} failed`);
console.log('==================================================');
if (failCount > 0) {
  process.exitCode = 1;
}