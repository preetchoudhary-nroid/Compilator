# Compilator — Task Planner

A working desktop prototype (Electron + React + Vite + TypeScript) that converts a
natural-language request into a structured JSON task list, then runs each task only
after the user approves it. The planner never executes anything itself — a separate
human-approved execution step runs the approved tasks.

## 🚀 Recent Updates

Recent development work focused on making Compilator more reliable as a desktop AI
assistant: stronger natural-language planning, safer software installation, better
Windows system detection, a more robust AI runtime, and floating-terminal UI polish.

### 🧠 AI Planner & Intent Detection

The built-in planner now understands casual, natural-language install requests,
including mixed-language (Hinglish) phrasing with filler words in any position:

| Request                      | Planned task                |
| ---------------------------- | --------------------------- |
| `"chrome install pls"`       | Install Google Chrome       |
| `"chrome install krde"`      | Install Google Chrome       |
| `"bhai chrome install karo"` | Install Google Chrome       |
| `"set up vscode"`            | Install Visual Studio Code  |

Implementation notes (all reflected in the current source, `src/planner-core.js`):

- Requests are **normalized and tokenized** (lowercased, punctuation stripped,
  whitespace collapsed) before matching.
- The install verb (`install` / `set up` / `setup`) is located from the **end** of
  the sentence, so **any word order works** — the tokens on either side of the verb
  become the package target.
- Conversational filler words (`pls`, `please`, `bhai`, `yaar`, `karo`, `krde`,
  `now`, `urgently`, …) are filtered out of the candidate target.
- **Negation / cancellation is detected up front** — `"i dont want to install X"`,
  `"don't install chrome"`, `"never mind, install chrome"` and `"cancel the chrome
  installation"` can never produce an install task.
- **Unknown software is never guessed.** Requests that can't be matched to a
  verified catalog entry go into `tasks_skipped` with a plain-language reason.
- The install-intent logic is consolidated into a **shared planner core**
  (`src/planner-core.js`) used by both the Electron main-process planner and the
  browser-fallback planner, so the two parsers cannot drift apart.

### 🛡️ Safer Software Installation

- Planning a request **does not execute it** — the planner only produces a
  structured proposal with `status: "pending"`.
- Every planned task stays behind an explicit **Approve** action in the UI;
  nothing is installed or executed without the user's consent.
- AI-generated plans are re-validated against the allowed task types, a 5-task cap
  and the verified Winget catalog; **unknown or unverified Winget package IDs are
  rejected instead of guessed** in both the AI path and the built-in planner.

This is intentional: Compilator would rather skip a request with a clear explanation
than install something it cannot verify.

### 🪟 Windows / Hardware Detection Improvements

When a message is about hardware, the app gathers live system information for the
AI — collected in parallel, cached where possible, and only when relevant:

- **Windows platform / architecture / version** (`os`, `process.arch`, `cmd ver`)
- **CPU** — model, core count and clock speed (`os.cpus()`)
- **RAM** — total and free memory (`os.totalmem()` / `os.freemem()`)
- **GPU** — graphics adapter names via `wmic win32_VideoController` with a
  PowerShell `Get-CimInstance Win32_VideoController` fallback
- **Disk / drives** — capacity and free space per drive (`wmic logicaldisk`, with
  a PowerShell CIM fallback)

WMIC is deprecated/removed on newer Windows builds (e.g. 11 24H2+), so detection
falls back to the PowerShell CIM provider automatically. Hardware context is never
shipped for plain conversation.

### 🤖 AI Runtime / Provider Improvements

The AI layer is now a modular pipeline
(`User → Intent Detection → Context Builder → Prompt Builder → Provider → Response`):

- **Provider abstraction** — Ollama, LM Studio, OpenAI, OpenRouter and a custom
  endpoint, all over the OpenAI-compatible `/v1/chat/completions` API. Switching
  providers is a configuration change, not a code change.
- **Configuration** — provider, model, temperature and streaming are resolved from
  environment variables, an optional `ai-config.json` in the app's userData
  directory, then per-provider defaults (default: Ollama).
- **Intent detection** — every message is classified `CHAT` / `TASK` / `UNKNOWN`
  before any provider call; questions like *"how do I install X"* stay
  conversational and never trigger a task plan.
- **Dynamic context building** — each request gets a trimmed context (identity,
  runtime, capabilities, relevant installed software, hardware when relevant)
  instead of one oversized prompt.
- **Prompt construction** — per-intent instructions: planner JSON contract with
  verified Winget IDs for TASK, a single clarifying question for UNKNOWN, natural
  conversation for CHAT.
- **Response extraction / normalisation** — model replies are parsed leniently
  (markdown fences, surrounding text, streamed or full JSON); empty or
  hallucinated plan JSON falls back to the deterministic built-in planner.
- **Timeout & graceful failure** — provider requests time out (60 s default) so an
  unreachable server can't hang the UI; failures degrade to the built-in planner
  (real tasks) or a friendly offline reply (conversation).
- **Streaming** — SSE chunks are forwarded to the UI live as the model answers.

### 🖥️ Floating UI & Application Runtime

- **Floating terminal windows** — approved tasks open movable, resizable,
  minimizable terminal windows rendered inside the app (`FloatingTerminal.tsx`).
  Closing hides the window while logs keep streaming; reopening restores the saved
  bounds, logs and z-order. Focus is managed with a monotonic z-index.
- **Electron window lifecycle** — the `mainWindow` reference is cleared on
  `closed`; the app quits when all windows close (macOS re-creates the window on
  `activate`).
- **Preload / IPC** — a `contextBridge` API (`contextIsolation: true`,
  `nodeIntegration: false`) exposing `executeTask`, `chatWithAI` (streaming,
  requestId-correlated), `wingetList`, report helpers and typed event
  subscriptions (`task:update`, `task:log`, `task:reportCreated`, `chat:chunk`,
  `chat:done`).
- **Safe handling of closed/destroyed windows** — every renderer send is guarded;
  long-running installs keep running and still write their report when the window
  is gone, and task execution is refused if no active window exists.
- **Startup / loading** — development loads the Vite dev server, production loads
  the built bundle; the `C:\AI` folder structure (Reports / Logs / Config /
  Workspace) is ensured at startup.

### 📦 Software Catalog

Compilator installs software only through a **verified Winget catalog** — package
IDs are checked against the Winget source and never guessed (see "Catalog
Reliability Cleanup"). Representative sample; the full list is under "Supported
winget catalog".

**Development**

| Software | Winget ID | Useful for |
| --- | --- | --- |
| Git | `Git.Git` | Version control |
| GitHub Desktop | `GitHub.GitHubDesktop` | Git GUI |
| Visual Studio Code | `Microsoft.VisualStudioCode` | Code editor |
| Node.js | `OpenJS.NodeJS` | JavaScript runtime |
| Python 3.13 | `Python.Python.3.13` | Programming language |
| Docker Desktop | `Docker.DockerDesktop` | Containers |

**Apps & tools**

| Software | Winget ID | Useful for |
| --- | --- | --- |
| Google Chrome | `Google.Chrome` | Web browser |
| Mozilla Firefox | `Mozilla.Firefox` | Web browser |
| 7-Zip | `7zip.7zip` | File archiver |
| Windows Terminal | `Microsoft.WindowsTerminal` | Terminal emulator |
| Notepad++ | `Notepad++.Notepad++` | Text editor |
| Steam | `Valve.Steam` | Gaming platform |
| Discord | `Discord.Discord` | Voice & text chat |
| Tailscale | `Tailscale.Tailscale` | Secure networking |
| Microsoft PowerToys | `Microsoft.PowerToys` | Windows utilities |

### 🧹 Catalog Reliability Cleanup

- The FileZilla entry (`TimKosse.FileZilla.Client`) was **removed** after
  verification showed that package ID is no longer present in the current Winget
  source.
- Instead of substituting an unverified replacement ID, the entry was dropped from
  the catalog — consistent with the project's "never guess package IDs" rule.
- **RustDesk** (`RustDesk.RustDesk`) is still listed in the current catalog;
  availability is periodically re-verified against the current Winget source, and
  entries are only kept when they verify.

### 🧪 Testing & Verification

The repository ships an executable regression suite (`tests/planner.test.cjs`) that
runs against the **real** main-process planner (with a mocked Electron) plus the
shared planner core. It covers:

- natural-language install parsing (`"chrome install pls"`, `"bhai chrome install
  karo"`, `"set up vscode"`, `"install python 3.12"`, …)
- punctuation / casing / whitespace robustness
- negation and cancellation handling
- already-installed detection and approval gating (`pending`, never auto-executed)
- rejection of unknown/unverified package IDs (e.g. `"install photoshop"`)
- fallback from empty/hallucinated AI plans to the built-in planner
- token-level catalog matching (short aliases never hijack longer package names)

Verification was run on the current tree:

- `npm test` → **193 passed, 0 failed**
- `npm run build` → OK (`tsc -b && vite build`)
- `npm run lint` → **0 warnings, 0 errors**

### 📚 Development Notes / Changelog

- Improved natural-language software installation planning (any word order, filler
  words, mixed-language requests)
- Added shared planner logic (`src/planner-core.js`) with regression coverage
- Improved negation / cancellation handling
- Added safer handling of unknown software — no guessed Winget IDs
- Improved AI provider/runtime handling (context system, intent detection,
  streaming, timeouts, graceful fallbacks)
- Improved Windows system-information detection (CPU, RAM, GPU, disk, WMIC → CIM)
- Improved Electron IPC / window-lifecycle handling
- Added task reports and floating terminal windows
- Cleaned obsolete/unverified software catalog entries
- Updated documentation

### 🔗 LinkedIn-friendly Project Summary

Recent work on Compilator focused on making the desktop AI assistant more reliable
in real-world usage: improving natural-language task planning, strengthening
software-installation safety, improving Windows system detection, refining the
Electron runtime, and expanding automated regression coverage.

## Allowed task types

| Type              | Params                           | Meaning                              |
| ----------------- | -------------------------------- | ------------------------------------ |
| `mkdir`           | `{ path }`                       | Create a folder                      |
| `winget_install`  | `{ id }`                         | Install a package via winget         |
| `winget_list`     | `{}`                             | List installed packages              |
| `write_file`      | `{ path, content }`              | Create a small text file             |

## Planner behavior

- **Structured JSON output** — each planned task carries `type`, `label`, `params`,
  `estimated_seconds`, and a `status` (`pending` or `already_installed`).
- **Already-installed detection** — before adding a `winget_install` task, the planner
  runs `winget list` and matches by winget id (case-insensitive). On a match it sets
  `status: "already_installed"`, `estimated_seconds: 0`, and a note with the installed
  version, while still showing the task in the UI.
- **Never guesses winget ids** — requests for unknown packages go into a
  `tasks_skipped` array with a plain-language reason instead of a fabricated id.
- **Max 5 planned tasks** per response.

## Features

- **AI chat interface** — examples: `prepare my AI development pc`,
  `install git`, `mkdir C:/AI`, `write file config.json with hello`,
  `list installed packages`.
- **Configurable AI provider with built-in fallback** — chat requests go through the
  AI context system (provider via `AI_PROVIDER` / `AI_SERVER_URL` / `AI_MODEL` or
  `ai-config.json`; supported: Ollama, LM Studio, OpenAI, OpenRouter, Custom); when
  the provider is unreachable, the built-in planner still produces the structured
  task list (with already-installed detection) or a friendly offline reply.
- **Spawn-based execution engine** — approved tasks run via `spawn` (winget for
  installs/list; `fs` for mkdir/write_file), with no shell string concatenation.
- **Live status + log streaming** — the main process emits `task:update` and `task:log`
  events to the renderer.
- **Status-driven UI** — task cards render via `data-status` attributes: `running`
  (amber pulse), `done` / `already_installed` (green glow), `failed` (red glow).
- **Terminal-style log panel** — monospace feed with a `$`-prefixed command line.
- **Violet accent theme** — `--accent: #7c5cff` on dark `#0a0a0f` / `#14141c` surfaces.
- **Browser fallback** — running in a plain browser simulates planning + execution.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run the Electron app (dev mode — Vite + Electron)
npm run dev

# 3. Or run just the UI in a browser (simulated installs)
npm run dev:web   # starts only the Vite dev server on http://127.0.0.1:5173
```

To point the AI at a real local model server:

```bash
set AI_SERVER_URL=http://127.0.0.1:11434/v1/chat/completions
set AI_MODEL=gemma-3-4b
npm run dev
```

## Tasks & Permissions

Each task carries a label, type, params, estimated time, and status. Users explicitly
**Approve** each pending task before it runs — nothing is installed without consent.
`already_installed` tasks stay visible in the list but are marked complete and cannot
be re-run.

Supported winget catalog (real, verified package ids only — never guessed):

**Development**

| Software                   | Winget ID                           |
| -------------------------- | ----------------------------------- |
| Visual Studio Code         | `Microsoft.VisualStudioCode`        |
| Node.js                    | `OpenJS.NodeJS`                     |
| Node.js LTS                | `OpenJS.NodeJS.LTS`                 |
| Python 3.13                | `Python.Python.3.13`                |
| Python 3.12                | `Python.Python.3.12`                |
| Git                        | `Git.Git`                           |
| GitHub Desktop             | `GitHub.GitHubDesktop`              |
| Visual Studio 2022         | `Microsoft.VisualStudio.2022.Community` |
| Java JDK 21                | `EclipseAdoptium.Temurin.21.JDK`    |
| Go                         | `GoLang.Go`                         |
| Rust (rustup)              | `Rustlang.Rustup`                   |
| Docker Desktop             | `Docker.DockerDesktop`              |
| Postman                    | `Postman.Postman`                   |
| DBeaver Community          | `DBeaver.DBeaver.Community`         |
| MySQL                      | `Oracle.MySQL`                      |
| PostgreSQL                 | `PostgreSQL.PostgreSQL`             |

**Developer utilities**

| Software           | Winget ID                         |
| ------------------ | --------------------------------- |
| 7-Zip              | `7zip.7zip`                       |
| PowerShell 7       | `Microsoft.PowerShell`            |
| Windows Terminal   | `Microsoft.WindowsTerminal`       |
| Notepad++          | `Notepad++.Notepad++`             |
| Everything         | `voidtools.Everything`            |
| WinMerge           | `WinMerge.WinMerge`               |
| jq                  | `jqlang.jq`                       |
| CMake              | `Kitware.CMake`                   |
| Ninja              | `Ninja-build.Ninja`               |
| LLVM               | `LLVM.LLVM`                       |

**Browsers**

| Software       | Winget ID              |
| -------------- | ---------------------- |
| Google Chrome  | `Google.Chrome`        |
| Mozilla Firefox| `Mozilla.Firefox`      |
| Microsoft Edge | `Microsoft.Edge`       |
| Brave          | `Brave.Brave`          |
| Opera          | `Opera.Opera`          |
| Vivaldi        | `Vivaldi.Vivaldi`      |

**Design / media**

| Software | Winget ID                     |
| -------- | ----------------------------- |
| VLC      | `VideoLAN.VLC`                |
| OBS Studio | `OBSProject.OBSStudio`      |
| GIMP     | `GIMP.GIMP`                   |
| Inkscape | `Inkscape.Inkscape`           |
| Blender  | `BlenderFoundation.Blender`   |
| Audacity | `Audacity.Audacity`           |
| HandBrake| `HandBrake.HandBrake`         |
| Krita    | `KDE.Krita`                   |

**Networking / remote administration**

| Software  | Winget ID                         |
| --------- | --------------------------------- |
| Wireshark | `WiresharkFoundation.Wireshark`   |
| PuTTY     | `PuTTY.PuTTY`                     |
| WinSCP    | `WinSCP.WinSCP`                   |
| Tailscale | `Tailscale.Tailscale`             |
| OpenVPN   | `OpenVPNTechnologies.OpenVPN`     |
| RustDesk  | `RustDesk.RustDesk`               |

**Productivity**

| Software          | Winget ID                     |
| ----------------- | ----------------------------- |
| LibreOffice       | `TheDocumentFoundation.LibreOffice` |
| Obsidian          | `Obsidian.Obsidian`           |
| Notion            | `Notion.Notion`               |
| Everything        | `voidtools.Everything`        |
| ShareX            | `ShareX.ShareX`               |
| Microsoft PowerToys | `Microsoft.PowerToys`        |

**Gaming**

| Software            | Winget ID                    |
| ------------------- | ---------------------------- |
| Steam               | `Valve.Steam`                |
| Epic Games Launcher | `EpicGames.EpicGamesLauncher` |
| GOG Galaxy          | `GOG.Galaxy`                 |
| Ubisoft Connect     | `Ubisoft.Connect`            |
| Discord             | `Discord.Discord`            |

## Architecture

```
main.cjs          Electron main process — task planner (structured JSON, already-installed
                  detection, tasks_skipped), execution engine (spawn + fs, no shell
                  string concatenation), AI context-system wiring, task reporting
                  (C:\AI\Reports), task:update / task:log / task:reportCreated streaming
ai/               AI context system — config, intent detector (CHAT/TASK/UNKNOWN), context
                  builder, prompt builder, provider (Ollama / LM Studio / OpenAI /
                  OpenRouter / Custom), hardware detection, streaming chat protocol
src/planner-core.js  shared install-intent parser (normalization, tokenization, filler
                  words, negation, verified-catalog matching) used by main.cjs and the
                  browser-fallback planner
src/App.tsx       React UI — chat with streaming replies, planner task cards, skipped
                  panel, floating terminal windows, live log feeds, report buttons
src/components/FloatingTerminal.tsx  renderer-side floating terminal window (drag /
                  resize / minimize / close-restore)
preload.cjs       contextBridge — executeTask / chatWithAI (streaming) / wingetList /
                  openReport / openReportFolder / typed event subscriptions
src/App.css       UI styles — violet theme, data-status card states, pulse animation,
                  terminal-style log panel, floating-terminal windows, skipped panel
src/index.css     Global styles + CSS variables (--accent, --card, --done, --running…)
tests/planner.test.cjs  regression tests for the main-process planner and shared core
vite.config.ts    Vite config (React plugin)
```

### Task lifecycle events

| Event                | Payload                              | Meaning                                      |
| -------------------- | ------------------------------------ | -------------------------------------------- |
| `task:update`        | `{ id, status, command? }`           | `running` (with the winget command) → `done` / `failed` |
| `task:log`           | `{ id, line }`                       | Live stdout/stderr chunk from the winget process |
| `task:reportCreated` | `{ id, reportPath }`                 | A task report was written to `C:\AI\Reports` |

The renderer subscribes through `window.electronAPI.onTaskUpdate` / `onTaskLog`
(`onReportCreated` for reports) and appends incoming lines to the per-task log feed.
AI replies stream in via `chat:chunk` / `chat:done` (correlated by `requestId`).

### Planner output shape

```json
{
  "tasks": [
    {
      "type": "winget_install",
      "label": "Install Node.js",
      "params": { "id": "OpenJS.NodeJS" },
      "estimated_seconds": 180,
      "status": "pending"
    }
  ],
  "tasks_skipped": [
    { "request": "install photoshop", "reason": "Unknown or unverified winget package id" }
  ]
}
```

When a package is found in `winget list`, the task is kept with
`status: "already_installed"`, `estimated_seconds: 0`, and
`note: "Already installed (version X)"`.

## Scripts

| Script      | Description                                        |
| ----------- | -------------------------------------------------- |
| `npm run dev`       | Runs Vite dev server + Electron app              |
| `npm run dev:web`   | Runs only the Vite dev server (browser demo)     |
| `npm run build`     | Type-checks and builds a production bundle       |
| `npm run preview`   | Previews the production build                    |
| `npm run test`      | Runs the planner regression tests                |
| `npm run lint`      | Runs oxlint                                      |