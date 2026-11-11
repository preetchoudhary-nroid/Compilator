import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

new_return = """  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="app-sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">&lt;/&gt;</div>
          <span className="logo-text">Compilator</span>
        </div>
        
        <nav className="sidebar-nav">
          <a href="#" className={activeSection === 'home' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setActiveSection('home'); }}>
            <span className="icon">🏠</span> Home
          </a>
          <a href="#" className={activeSection === 'tasks' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setActiveSection('tasks'); }}>
            <span className="icon">☑️</span> Tasks
          </a>
          <a href="#" className={activeSection === 'ai_chat' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setActiveSection('ai_chat'); }}>
            <span className="icon">✨</span> AI Chat
          </a>
          <a href="#" className={activeSection === 'editor' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setActiveSection('editor'); }}>
            <span className="icon">💻</span> Code Editor
          </a>
          <a href="#" className={activeSection === 'terminal' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setActiveSection('terminal'); }}>
            <span className="icon">📟</span> Terminal
          </a>
          <a href="#" className={activeSection === 'settings' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setActiveSection('settings'); }}>
            <span className="icon">⚙️</span> Settings
          </a>
        </nav>

        <div className="sidebar-bottom">
          <div className="stay-focused-widget">
            <h4>Stay focused</h4>
            <p>Build your goals</p>
            <div className="progress-bar-container">
              <div className="progress-bar" style={{ width: '60%' }}></div>
            </div>
            <div className="progress-text">3/5 tasks today</div>
          </div>
          
          <div className="user-profile">
            <div className="avatar">P</div>
            <div className="user-info">
              <span className="user-name">Preet</span>
              <span className="user-plan">Free Plan</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="app-main">
        {/* Header / Window Controls */}
        <header className="app-topbar" style={{ WebkitAppRegion: 'drag' } as any}>
          <div style={{ WebkitAppRegion: 'no-drag' } as any} className="window-controls">
            <button onClick={() => window.electronAPI?.minimize()}>─</button>
            <button onClick={() => window.electronAPI?.maximize()}>□</button>
            <button onClick={() => window.electronAPI?.close()}>✕</button>
          </div>
        </header>

        <div className="app-content-scroll">
          <div className="greeting-section">
            <h1>Good Morning, Preet</h1>
            <p>Here's what's happening with your tasks today.</p>
          </div>

          {/* Stats Dashboard */}
          <div className="stats-dashboard">
            <div className="stat-card">
              <div className="stat-icon purple-icon">📋</div>
              <div className="stat-info">
                <div className="stat-label">Total Tasks</div>
                <div className="stat-value">{tasks.length || 5}</div>
              </div>
            </div>
            <div className="stat-card completed">
              <div className="stat-icon green-icon">✅</div>
              <div className="stat-info">
                <div className="stat-label">Completed</div>
                <div className="stat-value">{tasks.filter(t => t.status === 'done').length || 3}</div>
              </div>
            </div>
            <div className="stat-card in-progress">
              <div className="stat-icon blue-icon">🔄</div>
              <div className="stat-info">
                <div className="stat-label">In Progress</div>
                <div className="stat-value">{tasks.filter(t => t.status === 'running').length || 1}</div>
              </div>
            </div>
            <div className="stat-card pending">
              <div className="stat-icon red-icon">⏳</div>
              <div className="stat-info">
                <div className="stat-label">Pending</div>
                <div className="stat-value">{tasks.filter(t => t.status === 'pending').length || 1}</div>
              </div>
            </div>
          </div>

          <div className="split-layout">
            {/* Today's Tasks */}
            <div className="tasks-panel">
              <div className="panel-header">
                <h2>Today's Tasks</h2>
                <button className="add-task-btn">+ Add Task</button>
              </div>
              <div className="task-list">
                <div className="task-row">
                  <input type="checkbox" defaultChecked />
                  <span className="task-title">Build a weather app</span>
                  <span className="tag dev">Development</span>
                  <span className="task-time">Today • 2h</span>
                </div>
                <div className="task-row">
                  <input type="checkbox" defaultChecked />
                  <span className="task-title">Learn React hooks</span>
                  <span className="tag learning">Learning</span>
                  <span className="task-time">Today • 1h</span>
                </div>
                <div className="task-row">
                  <input type="checkbox" />
                  <span className="task-title">Setup database</span>
                  <span className="tag dev">Development</span>
                  <span className="task-time">Today • 2h</span>
                </div>
                <div className="task-row">
                  <input type="checkbox" />
                  <span className="task-title">Fix UI bugs</span>
                  <span className="tag maintenance">Maintenance</span>
                  <span className="task-time">Today • 1h</span>
                </div>
                <div className="task-row">
                  <input type="checkbox" />
                  <span className="task-title">Write documentation</span>
                  <span className="tag prod">Productivity</span>
                  <span className="task-time">Today • 1h</span>
                </div>
                {/* Dynamically render actual tasks if any exist */}
                {tasks.map(t => (
                  <div className="task-row" key={t.id}>
                    <input type="checkbox" checked={t.status === 'done'} onChange={() => {}} />
                    <span className="task-title">{t.label}</span>
                    <span className="tag pending-tag">{t.type}</span>
                    <span className="task-time">Est {t.estimated_seconds}s</span>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Assistant */}
            <div className="ai-panel">
              <div className="panel-header ai-header">
                <h2>✨ AI Assistant</h2>
                <select value={aiProvider} onChange={e => setAiProvider(e.target.value)} className="model-select">
                  <option value="gemini">Gemini ✨</option>
                  <option value="openai">OpenAI</option>
                  <option value="ollama">Ollama</option>
                </select>
              </div>
              <div className="ai-greeting">
                <h3>Hello Preet,</h3>
                <p>I'm your AI assistant. How can I help you today?</p>
              </div>
              <div className="prompt-chips">
                <button>✨ Write a code snippet</button>
                <button>❓ Explain this code</button>
                <button>📋 Plan my tasks</button>
                <button>🐛 Debug an issue</button>
              </div>
              
              <div className="ai-chat-history" ref={boxRef}>
                {messages.slice(1).map((m, i) => (
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
                <button className="send-btn" onClick={send}>➤</button>
              </div>
            </div>
          </div>

          {/* Bottom Terminal / Editor Split */}
          <div className="bottom-ide-panel">
            <div className="terminal-side">
              <div className="tabs">
                <span className="tab active">Terminal</span>
                <span className="tab">Logs</span>
                <span className="tab">Output</span>
              </div>
              <div className="terminal-content">
                <div className="term-line"><span className="prompt" style={{color: '#4ade80'}}>Preet@Compilator:~$</span> </div>
                <div className="term-line">Ready to code...</div>
                {logs.slice(-5).map((l, i) => <div key={i} className="term-line">{l.line}</div>)}
              </div>
            </div>
            <div className="editor-side">
              <div className="tabs editor-tabs">
                <span className="tab active">main.tsx ✕</span>
              </div>
              <div className="editor-content">
                <pre style={{margin:0}}>
                  <code style={{color: '#a78bfa'}}>
{`  1  import { useState } from 'react'
  2
  3  function App() {
  4    const [count, setCount] = useState(0);
  5    return (
  6      <div className="container">
  7        <h1>Compilator</h1>
  8      </div>
  9    )
 10  }`}
                  </code>
                </pre>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

export default App;"""

content = re.sub(r'return \(\s*<div className="bklit-container">.*?\n}\s*export default App;', new_return, content, flags=re.DOTALL)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
