import { contextBridge, ipcRenderer } from 'electron'

const bridge = {
  call: (method: string, ...args: unknown[]) => ipcRenderer.invoke('engine', method, args),
  openDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:open'),
  saveDialog: (kind: 'sr' | 'vcd'): Promise<string | null> => ipcRenderer.invoke('dialog:save', kind),
  openFirmwareFolder: () => ipcRenderer.invoke('firmware:open'),
  onMenu: (cb: (cmd: string) => void) => {
    const h = (_: unknown, cmd: string) => cb(cmd)
    ipcRenderer.on('menu', h)
    return () => ipcRenderer.removeListener('menu', h)
  },
  platform: process.platform
}

export type Bridge = typeof bridge
contextBridge.exposeInMainWorld('edgewise', bridge)
