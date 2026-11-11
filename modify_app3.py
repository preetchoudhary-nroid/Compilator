import sys

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update `send` to accept overrideText
content = content.replace(
    "const send = async () => {\n    const text = input.trim();",
    "const send = async (overrideText?: string | any) => {\n    const text = (typeof overrideText === 'string' ? overrideText : input).trim();"
)

# 2. Update `installSelectedSoftware` to use overrideText
old_install_sel = """    setInput(installCommands);
    setSelectedSoftware([]);
    setShowCatalog(false);
    await send();"""
new_install_sel = """    setInput('');
    setSelectedSoftware([]);
    await send(installCommands);"""
content = content.replace(old_install_sel, new_install_sel)

# 3. Add Approve button to Home tasks
old_home_tasks = """                      {tasks.slice(0, 3).map(t => (
                        <div className="task-row" key={t.id}>
                          <input type="checkbox" checked={t.status === 'done'} onChange={() => {}} />
                          <span className="task-title">{t.label}</span>
                          <span className="tag pending-tag">{t.type}</span>
                          <span className="task-time">{t.status}</span>
                        </div>
                      ))}"""

new_home_tasks = """                      {tasks.slice(0, 3).map(t => (
                        <div className="task-row" key={t.id}>
                          <input type="checkbox" checked={t.status === 'done'} onChange={() => {}} />
                          <span className="task-title">{t.label}</span>
                          <span className="tag pending-tag">{t.type}</span>
                          <span className="task-time">{t.status}</span>
                          {t.status === 'pending' && (
                            <button 
                              className="add-task-btn" 
                              style={{padding: '0.2rem 0.5rem', fontSize: '0.75rem', marginLeft: 'auto'}} 
                              onClick={(e) => { e.stopPropagation(); run(t.id); }}
                            >
                              Approve
                            </button>
                          )}
                        </div>
                      ))}"""
content = content.replace(old_home_tasks, new_home_tasks)

# 4. Add Approve button to Catalog items
old_catalog_items = """                          <div style={{width: '20px', height: '20px', border: '1px solid #8b92a5', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: selectedSoftware.includes(item.id) ? '#818cf8' : 'transparent', color: '#fff', fontSize: '12px'}}>
                            {selectedSoftware.includes(item.id) ? 'Y' : ''}
                          </div>
                          <div>
                            <div style={{fontWeight: 500, fontSize: '0.95rem'}}>{item.name}</div>
                            <div style={{color: '#8b92a5', fontSize: '0.75rem'}}>{item.id}</div>
                          </div>
                        </div>"""

new_catalog_items = """                          <div style={{width: '20px', height: '20px', border: '1px solid #8b92a5', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: selectedSoftware.includes(item.id) ? '#818cf8' : 'transparent', color: '#fff', fontSize: '12px'}}>
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
                        </div>"""
content = content.replace(old_catalog_items, new_catalog_items)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
