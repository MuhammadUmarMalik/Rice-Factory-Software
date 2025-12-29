const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronPrintPreview", {
  openPreview: (payload) => ipcRenderer.invoke("print-preview:open", payload),
  renderPdf: (payload) => ipcRenderer.invoke("print-preview:render-pdf", payload),
  printHtml: (payload) => ipcRenderer.invoke("print-preview:print-html", payload),
  getPrinters: () => ipcRenderer.invoke("print-preview:get-printers"),
});
