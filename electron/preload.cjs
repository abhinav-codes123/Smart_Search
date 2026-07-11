const { contextBridge, ipcRenderer } = require("electron");

// console.log("PRELOAD LOADED");

ipcRenderer.on(
  "smart-search-log",
  (_, entry) => {
    const method =
      entry.level === "error"
        ? "error"
        : entry.level === "warn"
          ? "warn"
          : "log";

    console[method](
      `[SmartSearch:${entry.level}] ${entry.event}`,
      entry.details,
      entry.timestamp
    );
  }
);

contextBridge.exposeInMainWorld(
  "electronAPI",
  {
    onSmartSearchLog: (callback) => {
      const listener = (_, entry) =>
        callback(entry);

      ipcRenderer.on(
        "smart-search-log",
        listener
      );

      return () =>
        ipcRenderer.removeListener(
          "smart-search-log",
          listener
        );
    },

    selectFolder: () =>
      ipcRenderer.invoke(
        "select-folder"
      ),

    getImageData:
      (imagePath) =>
        ipcRenderer.invoke(
          "get-image-data",
          imagePath
        ),

    selectFiles: () =>
      ipcRenderer.invoke(
        "select-files"
      ),

    selectImage: () =>
      ipcRenderer.invoke(
        "select-image"
      ),

    runOCR: (imagePath) =>
      ipcRenderer.invoke(
        "extract-document-text",
        imagePath
      ),
    extractPDFText: (pdfPath) =>
      ipcRenderer.invoke(
        "extract-document-text",
        pdfPath
      ),
    extractDocumentText:
      (filePath) =>
        ipcRenderer.invoke(
          "extract-document-text",
          filePath
        ),
    saveDocument: (document) =>
      ipcRenderer.invoke(
        "save-document",
        document
      ),

    getDocuments: () =>
      ipcRenderer.invoke(
        "get-documents"
      ),
    searchDocuments:
      (query) =>
        ipcRenderer.invoke(
          "search-documents",
          query
        ),
    getOcrQueueStatus: () =>
      ipcRenderer.invoke(
        "get-ocr-queue-status"
      ),
    openFile:
      (filePath) =>
        ipcRenderer.invoke(
          "open-file",
          filePath
        ),

    revealFile:
      (filePath) =>
        ipcRenderer.invoke(
          "reveal-file",
          filePath
        ),
  }
);
