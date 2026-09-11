const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('quDesktop', {
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  startMetaAuth: (service) => ipcRenderer.invoke('start-meta-auth', service),
  pollMetaAuth: (service, sessionId, sessionKey) => ipcRenderer.invoke('poll-meta-auth', service, sessionId, sessionKey),
  getMetaDestinations: (token) => ipcRenderer.invoke('get-meta-destinations', token),
  checkMetaAccess: (token) => ipcRenderer.invoke('check-meta-access', token),
  publishMetaPost: (payload) => ipcRenderer.invoke('publish-meta-post', payload),
  cacheMedia: (item) => ipcRenderer.invoke('cache-media', item),
  transcodeStoryVideo: (item) => ipcRenderer.invoke('transcode-story-video', item),
  searchGiphy: (apiKey, query) => ipcRenderer.invoke('search-giphy', apiKey, query),
  importGiphy: (item) => ipcRenderer.invoke('import-giphy', item),
  protectToken: (token) => ipcRenderer.invoke('protect-token', token),
  unprotectToken: (token) => ipcRenderer.invoke('unprotect-token', token)
  ,aiSidebarState: () => ipcRenderer.invoke('ai-sidebar-state')
  ,setAiSidebarOpen: (open) => ipcRenderer.invoke('ai-sidebar-open', open)
  ,selectAiProvider: (provider) => ipcRenderer.invoke('ai-sidebar-provider', provider)
  ,setAiSidebarBounds: (bounds) => ipcRenderer.invoke('ai-sidebar-bounds', bounds)
  ,setAiSidebarObscured: (obscured) => ipcRenderer.invoke('ai-sidebar-obscured', obscured)
  ,reloadAiSidebar: () => ipcRenderer.invoke('ai-sidebar-reload')
  ,openAiProviderExternal: () => ipcRenderer.invoke('ai-sidebar-open-external')
});
