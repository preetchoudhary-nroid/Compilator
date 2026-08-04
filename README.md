# Compilator — Task Planner

A working desktop prototype (Electron + React + Vite + TypeScript) that converts a
natural-language request into a structured JSON task list, then runs each task only
after the user approves it. The planner never executes anything itself — a separate
human-approved execution step runs the approved tasks.

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
- **AI server first, planner reply fallback** — tries `AI_SERVER_URL` for the chat text
  (default `http://127.0.0.1:8080/v1/chat/completions`, e.g. Ollama / LM Studio); the
  built-in planner always produces the structured task list (with already-installed
  detection) either way.
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

| Software              | Winget ID                          |
| --------------------- | ---------------------------------- |
| Visual Studio Code    | `Microsoft.VisualStudioCode`       |
| Node.js               | `OpenJS.NodeJS`                    |
| Python 3.12           | `Python.Python.3.12`               |
| Git                   | `Git.Git`                          |
| Google Chrome         | `Google.Chrome`                    |
| Docker Desktop        | `Docker.DockerDesktop`             |

## Architecture

```
main.cjs          Electron main process — task planner (structured JSON, already-installed
                  detection, tasks_skipped), execution engine (spawn + fs), AI server
                  integration, task:update / task:log streaming
preload.cjs       contextBridge — exposes executeTask / chatWithAI / onTaskUpdate / onTaskLog
src/App.tsx       React UI — chat, planner task cards, skipped panel, live log feed
src/App.css       UI styles — violet theme, data-status card states, pulse animation,
                  terminal-style log panel, skipped-request panel
src/index.css     Global styles + CSS variables (--accent, --card, --done, --running…)
vite.config.ts    Vite config (React plugin)
```

### Task lifecycle events

| Event           | Payload                                   | Meaning                                      |
| --------------- | ----------------------------------------- | -------------------------------------------- |
| `task:update`   | `{ id, status, command? }`                | `running` (with the winget command) → `done` / `failed` |
| `task:log`      | `{ id, line }`                            | Live stdout/stderr chunk from the winget process |

The renderer subscribes through `window.electronAPI.onTaskUpdate` / `onTaskLog` and
appends incoming lines to the per-task log feed.

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
| `npm run lint`      | Runs oxlint                                      |