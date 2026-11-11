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
                <h1>Good Morning, Preet</h1>
                <p>Here's what's happening with your tasks today.</p>
              </div>

              {/* Stats Dashboard */}
              <div className="stats-dashboard">
                <div className="stat-card">
                  <div className="stat-icon purple-icon">[#]</div>
                  <div className="stat-info">
                    <div className="stat-label">Total Tasks</div>
                    <div className="stat-value">{tasks.length || 5}</div>
                  </div>
                </div>
                <div className="stat-card completed">
                  <div className="stat-icon green-icon">[Y]</div>
                  <div className="stat-info">
                    <div className="stat-label">Completed</div>
                    <div className="stat-value">{tasks.filter(t => t.status === 'done').length || 3}</div>
                  </div>
                </div>
                <div className="stat-card in-progress">
                  <div className="stat-icon blue-icon">[O]</div>
                  <div className="stat-info">
                    <div className="stat-label">In Progress</div>
                    <div className="stat-value">{tasks.filter(t => t.status === 'running').length || 1}</div>
                  </div>
                </div>
                <div className="stat-card pending">
                  <div className="stat-icon red-icon">[-]</div>
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
                    <button className="add-task-btn" onClick={() => setActiveSection('tasks')}>View All Tasks</button>
                  </div>
                  <div className="task-list">
                    <div className="task-row">
                      <input type="checkbox" defaultChecked />
                      <span className="task-title">Build a weather app</span>
                      <span className="tag dev">Development</span>
                      <span className="task-time">Today . 2h</span>
                    </div>
                    <div className="task-row">
                      <input type="checkbox" defaultChecked />
                      <span className="task-title">Learn React hooks</span>
                      <span className="tag learning">Learning</span>
                      <span className="task-time">Today . 1h</span>
                    </div>
                    {/* Render up to 3 real tasks */}
                    {tasks.slice(0, 3).map(t => (
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
                      <option value="openai">OpenAI (GPT)</option>
                      <option value="gemini">Gemini</option>
                      <option value="ollama">Ollama</option>
                      <option value="openrouter">OpenRouter</option>
                    </select>
                  </div>
                  <div className="ai-greeting">
                    <h3>Hello Preet,</h3>
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
                    <div className="term-line"><span className="prompt" style={{color: '#4ade80'}}>Preet@Compilator:~$</span> </div>
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
                          <div>
                            <div style={{fontWeight: 500, fontSize: '0.95rem'}}>{item.name}</div>
                            <div style={{color: '#8b92a5', fontSize: '0.75rem'}}>{item.id}</div>
                          </div>
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
                  <option value="openai">OpenAI (GPT)</option>
                  <option value="gemini">Gemini</option>
                  <option value="ollama">Ollama</option>
                  <option value="openrouter">OpenRouter</option>
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
                    <option value="openai">OpenAI (GPT)</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="gemini">Gemini</option>
                    <option value="ollama">Ollama (Local)</option>
                    <option value="lmstudio">LM Studio (Local)</option>
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

          {(activeSection === 'editor' || activeSection === 'terminal') && (
            <div style={{color: '#8b92a5'}}>
              <h2>{activeSection === 'editor' ? 'Code Editor' : 'Terminal'} Full View</h2>
              <p>This view can be expanded later to house the full IDE capabilities.</p>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

export default App;
"""

content = re.sub(r'return \(\s*<div className="app-layout">.*?\n}\s*export default App;', new_return, content, flags=re.DOTALL)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
