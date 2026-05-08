import { contextBridge, ipcRenderer } from "electron";

const desktopApi = {
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:get-version"),
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke("app:open-external", url),
  platform: process.platform
} as const;

contextBridge.exposeInMainWorld("desktop", desktopApi);

export type DesktopApi = typeof desktopApi;
