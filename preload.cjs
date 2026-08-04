const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  executeTask: (payload) => ipcRenderer.invoke('execute-task', payload),
  chatWithAI: (prompt) => ipcRenderer.invoke('chat-with-ai', prompt),
  wingetList: () => ipcRenderer.invoke('winget-list'),
  onTaskUpdate: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('task:update', listener);
    return () => ipcRenderer.removeListener('task:update', listener);
  },
  onTaskLog: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('task:log', listener);
    return () => ipcRenderer.removeListener('task:log', listener);
  },
});