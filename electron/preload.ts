import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  downloadVideo: (url: string, options: any) => ipcRenderer.invoke('download-video', url, options),
  onDownloadProgress: (callback: (data: any) => void) => {
    // Remove previous listeners to avoid memory leaks or duplicate calls
    ipcRenderer.removeAllListeners('download-progress');
    ipcRenderer.on('download-progress', (_event, value) => callback(value));
  }
});
