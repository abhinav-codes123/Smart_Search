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
    getFilePreviewData:
      (filePath, options) =>
        ipcRenderer.invoke(
          "get-file-preview-data",
          filePath,
          options
        ),
    getFilePreviewUrl:
      (filePath) =>
        `smart-preview://file?path=${encodeURIComponent(filePath)}`,

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
    getDatabaseInfo: () =>
      ipcRenderer.invoke(
        "get-database-info"
      ),
    getDocumentDetail:
      (documentId) =>
        ipcRenderer.invoke(
          "get-document-detail",
          documentId
        ),
    getVirtualFolders:
      () =>
        ipcRenderer.invoke(
          "get-virtual-folders"
        ),
    saveVirtualFolder:
      (payload) =>
        ipcRenderer.invoke(
          "save-virtual-folder",
          payload
        ),
    deleteVirtualFolder:
      (folderId) =>
        ipcRenderer.invoke(
          "delete-virtual-folder",
          folderId
        ),
    getFolderKeywords:
      (folderId) =>
        ipcRenderer.invoke(
          "get-folder-keywords",
          folderId
        ),
    saveFolderKeyword:
      (payload) =>
        ipcRenderer.invoke(
          "save-folder-keyword",
          payload
        ),
    deleteFolderKeyword:
      (folderId, keyword) =>
        ipcRenderer.invoke(
          "delete-folder-keyword",
          folderId,
          keyword
        ),
    saveDocumentFolderOverride:
      (payload) =>
        ipcRenderer.invoke(
          "save-document-folder-override",
          payload
        ),
    deleteDocumentFolderOverride:
      (documentId, folderId) =>
        ipcRenderer.invoke(
          "delete-document-folder-override",
          documentId,
          folderId
        ),
    addDocumentKeywordTag:
      (documentId, tag) =>
        ipcRenderer.invoke(
          "add-document-keyword-tag",
          documentId,
          tag
        ),
    deleteDocumentKeywordTag:
      (documentId, tag) =>
        ipcRenderer.invoke(
          "delete-document-keyword-tag",
          documentId,
          tag
        ),
    searchDocuments:
      (query) =>
        ipcRenderer.invoke(
          "search-documents",
          query
        ),
    searchDocumentsPlanB:
      (query) =>
        ipcRenderer.invoke(
          "search-documents-plan-b",
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
