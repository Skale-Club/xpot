// The renderer's only bridge: a handful of named actions and a state feed.
// No ipcRenderer, no Node, no arbitrary channels.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

contextBridge.exposeInMainWorld("provisioner", {
  getState: () => ipcRenderer.invoke("provisioner:get-state"),
  pair: (serverUrl: string, code: string) => ipcRenderer.invoke("provisioner:pair", String(serverUrl), String(code)),
  unpair: () => ipcRenderer.invoke("provisioner:unpair"),
  program: () => ipcRenderer.invoke("provisioner:program"),
  giveUp: () => ipcRenderer.invoke("provisioner:give-up"),
  refresh: () => ipcRenderer.invoke("provisioner:refresh"),
  openWebsite: () => ipcRenderer.invoke("provisioner:open-website"),
  onState: (listener: (state: unknown) => void) => {
    const handler = (_e: IpcRendererEvent, state: unknown) => listener(state);
    ipcRenderer.on("provisioner:state", handler);
    return () => ipcRenderer.removeListener("provisioner:state", handler);
  },
});
