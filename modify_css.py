css = """
/* NEW APP LAYOUT STYLES */

.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  background-color: #0b0c10;
  color: #ffffff;
  font-family: 'Inter', system-ui, sans-serif;
  overflow: hidden;
}

.app-sidebar {
  width: 260px;
  background-color: #111217;
  border-right: 1px solid #1f2129;
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
  box-sizing: border-box;
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 2rem;
}

.logo-icon {
  background: linear-gradient(135deg, #4f46e5, #ec4899);
  border-radius: 8px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 14px;
}

.logo-text {
  font-weight: 700;
  font-size: 1.25rem;
  letter-spacing: 0.5px;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
}

.sidebar-nav a {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  color: #8b92a5;
  text-decoration: none;
  border-radius: 8px;
  font-size: 0.95rem;
  transition: all 0.2s;
}

.sidebar-nav a:hover {
  background-color: #1c1e26;
  color: #ffffff;
}

.sidebar-nav a.active {
  background-color: #1e1b4b;
  color: #818cf8;
}

.sidebar-nav a .icon {
  font-size: 1.1rem;
}

.sidebar-bottom {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.stay-focused-widget {
  background-color: #1a1c23;
  border-radius: 12px;
  padding: 1.25rem;
  border: 1px solid #272a35;
}

.stay-focused-widget h4 {
  margin: 0;
  font-size: 0.95rem;
  color: #ffffff;
}

.stay-focused-widget p {
  margin: 0.25rem 0 1rem 0;
  font-size: 0.8rem;
  color: #8b92a5;
}

.progress-bar-container {
  height: 6px;
  background-color: #2a2d39;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 0.5rem;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #4f46e5, #818cf8);
  border-radius: 3px;
}

.progress-text {
  font-size: 0.75rem;
  color: #8b92a5;
  text-align: right;
}

.user-profile {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
  border-radius: 8px;
  cursor: pointer;
}

.user-profile:hover {
  background-color: #1c1e26;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #a855f7);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.user-info {
  display: flex;
  flex-direction: column;
}

.user-name {
  font-size: 0.95rem;
  font-weight: 500;
}

.user-plan {
  font-size: 0.75rem;
  color: #8b92a5;
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: #0b0c10;
  overflow: hidden;
}

.app-topbar {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 1.5rem;
}

.window-controls {
  display: flex;
  gap: 0.75rem;
}

.window-controls button {
  background: none;
  border: none;
  color: #8b92a5;
  cursor: pointer;
  font-size: 1rem;
}

.window-controls button:hover {
  color: #ffffff;
}

.app-content-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0 2rem 2rem 2rem;
}

.greeting-section {
  margin-bottom: 2rem;
}

.greeting-section h1 {
  margin: 0 0 0.5rem 0;
  font-size: 2rem;
  font-weight: 700;
}

.greeting-section p {
  margin: 0;
  color: #8b92a5;
}

.stats-dashboard {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1.25rem;
  margin-bottom: 2rem;
}

.stat-card {
  background-color: #15171e;
  border: 1px solid #1f2129;
  border-radius: 12px;
  padding: 1.25rem;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.stat-icon {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  background-color: #1e1b4b;
}

.purple-icon { background-color: rgba(99, 102, 241, 0.15); color: #818cf8; }
.green-icon { background-color: rgba(74, 222, 128, 0.15); color: #4ade80; }
.blue-icon { background-color: rgba(96, 165, 250, 0.15); color: #60a5fa; }
.red-icon { background-color: rgba(248, 113, 113, 0.15); color: #f87171; }

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-label {
  font-size: 0.8rem;
  color: #8b92a5;
  margin-bottom: 0.25rem;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
}

.split-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.tasks-panel, .ai-panel {
  background-color: #111217;
  border: 1px solid #1f2129;
  border-radius: 16px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.panel-header h2 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 600;
}

.add-task-btn {
  background: rgba(99, 102, 241, 0.1);
  color: #818cf8;
  border: 1px solid rgba(99, 102, 241, 0.2);
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.add-task-btn:hover {
  background: rgba(99, 102, 241, 0.2);
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.task-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem;
  background-color: #15171e;
  border-radius: 8px;
  border: 1px solid transparent;
  transition: border-color 0.2s;
}

.task-row:hover {
  border-color: #2a2d39;
}

.task-row input[type="checkbox"] {
  accent-color: #818cf8;
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.task-title {
  flex: 1;
  font-size: 0.95rem;
}

.tag {
  font-size: 0.75rem;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  font-weight: 500;
}
.tag.dev { background-color: rgba(96, 165, 250, 0.1); color: #60a5fa; }
.tag.learning { background-color: rgba(99, 102, 241, 0.1); color: #818cf8; }
.tag.maintenance { background-color: rgba(248, 113, 113, 0.1); color: #f87171; }
.tag.prod { background-color: rgba(167, 139, 250, 0.1); color: #a78bfa; }
.tag.pending-tag { background-color: rgba(156, 163, 175, 0.1); color: #9ca3af; }

.task-time {
  font-size: 0.8rem;
  color: #8b92a5;
}

/* AI Panel */
.ai-header {
  margin-bottom: 1rem;
}

.model-select {
  background-color: #1a1c23;
  color: #ffffff;
  border: 1px solid #2a2d39;
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  font-size: 0.85rem;
  outline: none;
}

.ai-greeting {
  margin-bottom: 1.5rem;
}

.ai-greeting h3 {
  margin: 0 0 0.25rem 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.ai-greeting p {
  margin: 0;
  color: #8b92a5;
  font-size: 0.95rem;
}

.prompt-chips {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.prompt-chips button {
  background-color: #15171e;
  border: 1px solid #1f2129;
  color: #cdd6f4;
  padding: 0.75rem;
  border-radius: 8px;
  font-size: 0.85rem;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s;
}

.prompt-chips button:hover {
  background-color: #1c1e26;
  border-color: #2a2d39;
}

.ai-chat-history {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1rem;
  min-height: 100px;
}

.ai-msg {
  max-width: 85%;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 0.95rem;
  line-height: 1.4;
}

.ai-msg.ai {
  align-self: flex-start;
  background-color: #15171e;
  border: 1px solid #1f2129;
}

.ai-msg.user {
  align-self: flex-end;
  background-color: #4f46e5;
  color: #ffffff;
}

.ai-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.ai-input-wrapper input {
  width: 100%;
  padding: 0.8rem 3rem 0.8rem 1rem;
  border-radius: 8px;
  border: 1px solid #2a2d39;
  background-color: #15171e;
  color: #ffffff;
  font-size: 0.95rem;
  outline: none;
}

.ai-input-wrapper input:focus {
  border-color: #4f46e5;
}

.send-btn {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  color: #8b92a5;
  cursor: pointer;
  font-size: 1.2rem;
}

.send-btn:hover {
  color: #ffffff;
}

/* Bottom Split Panel */
.bottom-ide-panel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  background-color: #111217;
  border: 1px solid #1f2129;
  border-radius: 16px;
  height: 250px;
  overflow: hidden;
}

.terminal-side, .editor-side {
  display: flex;
  flex-direction: column;
  border-right: 1px solid #1f2129;
}
.editor-side { border-right: none; }

.tabs {
  display: flex;
  border-bottom: 1px solid #1f2129;
  background-color: #0b0c10;
}

.tab {
  padding: 0.6rem 1rem;
  font-size: 0.85rem;
  color: #8b92a5;
  cursor: pointer;
}

.tab.active {
  color: #ffffff;
  background-color: #111217;
  border-top: 2px solid #818cf8;
}

.terminal-content, .editor-content {
  flex: 1;
  padding: 1rem;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.85rem;
  overflow: auto;
  background-color: #111217;
}

.term-line {
  margin-bottom: 0.25rem;
  color: #cdd6f4;
}

.editor-content code {
  color: #a78bfa;
}
"""

with open('src/App.css', 'a', encoding='utf-8') as f:
    f.write(css)
