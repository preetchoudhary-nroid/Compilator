const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  executeTask: (payload) => ipcRenderer.invoke('execute-task', payload),

  /**
   * Ask the AI assistant. Returns immediately with a requestId; streaming
   * chunks arrive via onChatChunk and the final result via onChatDone.
   */
  chatWithAI: (prompt, requestId) => ipcRenderer.invoke('chat-with-ai', { prompt, requestId }),

  wingetList: () => ipcRenderer.invoke('winget-list'),
  openReport: (reportPath) => ipcRenderer.invoke('open-report', reportPath),
  openReportFolder: (reportPath) => ipcRenderer.invoke('open-report-folder', reportPath),

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
  onReportCreated: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('task:reportCreated', listener);
    return () => ipcRenderer.removeListener('task:reportCreated', listener);
  },

  // AI chat streaming events
  onChatChunk: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('chat:chunk', listener);
    return () => ipcRenderer.removeListener('chat:chunk', listener);
  },
  onChatDone: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('chat:done', listener);
    return () => ipcRenderer.removeListener('chat:done', listener);
  },
});