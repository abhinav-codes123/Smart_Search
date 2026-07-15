import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  protocol,
  shell
} from "electron";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import {
  insertDocument,
  applyPlanBEnrichment,
  getAllDocuments,
  getDocumentByFileHash,
  getDocumentDetail,
  getDocumentSummaries,
  getVirtualFolders,
  saveVirtualFolder,
  deleteVirtualFolder,
  getFolderKeywordOverrides,
  saveFolderKeywordOverride,
  deleteFolderKeywordOverride,
  saveDocumentFolderOverride,
  deleteDocumentFolderOverride,
  addDocumentKeywordTag,
  deleteDocumentKeywordTag,
  searchDocumentSummaries,
  claimNextOcrJob,
  completeOcrJob,
  failOcrJob,
  getOcrQueueStatus,
  getDatabaseInfo
} from "./database.js";
import {
  enrichDocumentWithPlanB,
  getPlanBText,
  getPlanBTextFingerprint,
  isPlanBEnabled,
  runPlanBSemanticSearch,
  startPlanBWorker,
  stopPlanBWorker
} from "./planBService.js";
import {
  createFilePreview,
  createFilePreviewDataUrl,
  extractFileForIndex,
  extractPdfPageText,
  SUPPORTED_EXTENSIONS
} from "./textExtractor.js";
import {
  createDocumentId,
  generateFileHash
} from "./fileIdentity.js";
import {
  log,
  setLogTarget
} from "./logger.js";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let ocrQueueRunning = false;
const unavailableThumbnailPaths =
  new Set();
const PDF_PREVIEW_CACHE_VERSION = 1;
const PDF_PREVIEW_CONCURRENCY = 1;
let activePdfPreviewJobs = 0;
const pdfPreviewQueue = [];
const pendingPdfPreviewJobs =
  new Map();

protocol.registerSchemesAsPrivileged([
  {
    scheme:
      "smart-preview",
    privileges: {
      standard:
        true,
      secure:
        true,
      supportFetchAPI:
        true
    }
  }
]);

function isPdfPath(filePath) {
  return path
    .extname(filePath)
    .toLowerCase() === ".pdf";
}

function getPreviewCacheDir() {
  return app.isPackaged
    ? path.join(
        app.getPath(
          "userData"
        ),
        "data",
        "previews"
      )
    : path.join(
        process.cwd(),
        "electron",
        "data",
        "previews"
      );
}

function getPdfPreviewCachePath(filePath) {
  const stat =
    fs.statSync(filePath);
  const cacheKey =
    crypto
      .createHash("sha1")
      .update(
        JSON.stringify({
          version:
            PDF_PREVIEW_CACHE_VERSION,
          path:
            path.normalize(
              filePath
            ),
          size:
            stat.size,
          mtimeMs:
            Math.floor(
              stat.mtimeMs
            )
        })
      )
      .digest("hex");

  return {
    cacheKey,
    cachePath:
      path.join(
        getPreviewCacheDir(),
        `${cacheKey}.png`
      )
  };
}

function runNextPdfPreviewJobs() {
  while (
    activePdfPreviewJobs < PDF_PREVIEW_CONCURRENCY &&
    pdfPreviewQueue.length > 0
  ) {
    const job =
      pdfPreviewQueue.shift();

    activePdfPreviewJobs += 1;

    (async () => {
      try {
        const preview =
          await createFilePreview(
            job.filePath
          );

        if (!preview) {
          job.resolve(null);
          return;
        }

        fs.mkdirSync(
          path.dirname(
            job.cachePath
          ),
          {
            recursive:
              true
          }
        );
        fs.writeFileSync(
          job.cachePath,
          preview.buffer
        );

        job.resolve(preview);
      } catch (error) {
        job.reject(error);
      } finally {
        pendingPdfPreviewJobs.delete(
          job.cacheKey
        );
        activePdfPreviewJobs -= 1;
        runNextPdfPreviewJobs();
      }
    })();
  }
}

function enqueuePdfPreviewRender(filePath, cacheKey, cachePath) {
  const pending =
    pendingPdfPreviewJobs.get(
      cacheKey
    );

  if (pending) {
    return pending;
  }

  const promise =
    new Promise((resolve, reject) => {
      pdfPreviewQueue.push({
        filePath,
        cacheKey,
        cachePath,
        resolve,
        reject
      });

      runNextPdfPreviewJobs();
    });

  pendingPdfPreviewJobs.set(
    cacheKey,
    promise
  );

  return promise;
}

function getCachedPdfPreviewIfReady(filePath) {
  const {
    cacheKey,
    cachePath
  } =
    getPdfPreviewCachePath(
      filePath
    );

  if (
    fs.existsSync(
      cachePath
    )
  ) {
    return {
      ready:
        true,
      preview: {
        buffer:
          fs.readFileSync(
            cachePath
          ),
        mimeType:
          "image/png"
      }
    };
  }

  return {
    ready:
      false,
    promise:
      enqueuePdfPreviewRender(
        filePath,
        cacheKey,
        cachePath
      )
  };
}

function schedulePdfPreviewCache(filePath, details = {}) {
  if (
    !filePath ||
    !isPdfPath(filePath)
  ) {
    return {
      scheduled:
        false,
      reason:
        "not-pdf"
    };
  }

  let state;

  try {
    state =
      getCachedPdfPreviewIfReady(
        filePath
      );
  } catch (error) {
    log.warn(
      "preview.thumbnail.schedule-failed",
      {
        ...details,
        filePath,
        error:
          error.message
      }
    );

    return {
      scheduled:
        false,
      reason:
        error.message
    };
  }

  if (state.ready) {
    log.info(
      "preview.thumbnail.cache-hit",
      {
        ...details,
        filePath
      }
    );

    return {
      scheduled:
        false,
      reason:
        "cached"
    };
  }

  log.info(
    "preview.thumbnail.queued",
    {
      ...details,
      filePath,
      queueLength:
        pdfPreviewQueue.length,
      active:
        activePdfPreviewJobs
    }
  );

  state
    .promise
    .then(preview => {
      log.info(
        preview
          ? "preview.thumbnail.completed"
          : "preview.thumbnail.unavailable",
        {
          ...details,
          filePath,
          bytes:
            preview?.buffer?.length || 0
        }
      );
    })
    .catch(error => {
      recordUnavailableThumbnail(
        filePath,
        error
      );
      log.warn(
        "preview.thumbnail.failed",
        {
          ...details,
          filePath,
          error:
            error.message
        }
      );
    });

  return {
    scheduled:
      true
  };
}

function shouldEnrichWithPlanB(document) {

  if (
    !isPlanBEnabled() ||
    !getPlanBText(document)
  ) {
    return false;
  }

  const existingFingerprint =
    document.metadata?.planB?.textFingerprint;
  const existingEmbeddingFingerprint =
    document.semanticEmbedding?.textFingerprint ||
    document.metadata?.planB?.embedding?.textFingerprint;
  const nextFingerprint =
    getPlanBTextFingerprint(
      document
    );

  return existingFingerprint !== nextFingerprint ||
    existingEmbeddingFingerprint !== nextFingerprint ||
    (
      !document.semanticEmbedding?.hasVector &&
      !Array.isArray(
        document.semanticEmbedding?.vector
      )
    );
}

async function enrichSavedDocumentWithPlanB(savedDocument) {

  if (
    !shouldEnrichWithPlanB(
      savedDocument
    )
  ) {
    log.info(
      "planb.enrich.skipped",
      {
        documentId:
          savedDocument?.documentId,
        reason:
          !isPlanBEnabled()
            ? "disabled"
            : "already-enriched-or-empty"
      }
    );

    return {
      document:
        savedDocument,
      planB: {
        status:
          "skipped"
      }
    };
  }

  try {
    const enrichment =
      await enrichDocumentWithPlanB(
        savedDocument
      );

    const enrichedDocument =
      applyPlanBEnrichment(
        savedDocument.documentId,
        enrichment
      ) ||
      savedDocument;

    log.info(
      "planb.enrich.completed",
      {
        documentId:
          savedDocument.documentId,
        wallMs:
          enrichment.wallMs,
        yakeKeywords:
          enrichment.yakeKeywords?.slice(0, 8)
      }
    );

    return {
      document:
        enrichedDocument,
      planB: {
        status:
          "done",
        wallMs:
          enrichment.wallMs,
        timingMs:
          enrichment.timingMs,
        keywords:
          enrichment.yakeKeywords?.slice(0, 10) || []
      }
    };
  } catch (error) {
    log.warn(
      "planb.enrich.failed",
      {
        documentId:
          savedDocument.documentId,
        filePath:
          savedDocument.filePath,
        error:
          error.message,
        stack:
          error.stack
      }
    );

    return {
      document:
        savedDocument,
      planB: {
        status:
          "failed",
        error:
          error.message
      }
    };
  }
}

function summarizePlanBDocument(
  document,
  semantic
) {

  return {
    documentId:
      document.documentId,
    fileHash:
      document.fileHash,
    filePath:
      document.filePath ||
      document.primaryPath,
    fileName:
      document.fileName,
    titleTags:
      document.titleTags || [],
    keywordTags:
      document.keywordTags || [],
    category:
      document.category || "Unknown",
    metadata:
      document.metadata || {},
    textQuality:
      document.textQuality,
    rawWordCount:
      document.rawWordCount,
    cleanWordCount:
      document.cleanWordCount,
    noiseRatio:
      document.noiseRatio,
    totalPages:
      document.totalPages,
    indexedPages:
      document.indexedPages,
    status:
      document.status || "done",
    scannedAt:
      document.scannedAt,
    updatedAt:
      document.updatedAt,
    organization:
      document.organization || null,
    preview:
      document.cleanText?.slice(0, 320) ||
      document.text?.slice(0, 320) ||
      document.titleTags?.join(" | ") ||
      "",
    score:
      Math.round(
        Number(semantic.planBScore || 0) * 10000
      ) / 100,
    planBScore:
      semantic.planBScore,
    planBBackend:
      semantic.planBBackend,
    hasFullText:
      Boolean(
        document.text ||
        document.cleanText
      )
  };
}

async function searchDocumentSummariesWithPlanB(query) {

  const lexicalResults =
    searchDocumentSummaries(
      query
    );
  const lexicalById =
    new Map(
      lexicalResults.map(document => [
        document.documentId,
        document
      ])
    );

  try {
    const semanticResults =
      await runPlanBSemanticSearch(
        query,
        getAllDocuments()
      );

    for (
      const semantic
      of semanticResults
    ) {
      const existing =
        lexicalById.get(
          semantic.document.documentId
        );

      if (existing) {
        existing.planBScore =
          semantic.planBScore;
        existing.planBBackend =
          semantic.planBBackend;
        existing.score =
          Math.round(
            (
              Number(existing.score || 0) +
              Number(semantic.planBScore || 0) * 100
            ) * 100
          ) / 100;
        continue;
      }

      lexicalById.set(
        semantic.document.documentId,
        summarizePlanBDocument(
          semantic.document,
          semantic
        )
      );
    }

    return [
      ...lexicalById.values()
    ].sort(
      (a, b) =>
        Number(b.score || 0) -
        Number(a.score || 0)
    );
  } catch (error) {
    log.warn(
      "planb.search.failed",
      {
        query,
        error:
          error.message,
        stack:
          error.stack
      }
    );

    return lexicalResults;
  }
}

function recordUnavailableThumbnail(
  imagePath,
  error
) {

  if (
    unavailableThumbnailPaths.has(
      imagePath
    )
  ) {
    return;
  }

  unavailableThumbnailPaths.add(
    imagePath
  );

  const count =
    unavailableThumbnailPaths.size;

  if (
    count <= 3
  ) {
    log.warn(
      "image.thumbnail.unavailable",
      {
        imagePath,
        error:
          error.message
      }
    );

    return;
  }

  if (
    count === 4 ||
    count % 25 === 0
  ) {
    log.warn(
      "image.thumbnail.unavailable.summary",
      {
        count,
        reason:
          "macOS denied thumbnail file access; showing placeholders"
      }
    );
  }
}

async function processOcrQueue() {

  if (
    ocrQueueRunning
  ) {
    log.info(
      "ocr.queue.already-running"
    );
    return;
  }

  ocrQueueRunning =
    true;

  log.info(
    "ocr.queue.start",
    getOcrQueueStatus()
  );

  try {
    let job =
      claimNextOcrJob();

    while (job) {
      log.info(
        "ocr.job.claimed",
        {
          jobId:
            job.jobId,
          documentId:
            job.documentId,
          pageNumber:
            job.pageNumber,
          filePath:
            job.filePath,
          attempt:
            job.attempts
        }
      );

      try {
        const pageResult =
          await extractPdfPageText(
            job.filePath,
            job.pageNumber
          );

        completeOcrJob(
          job,
          pageResult
        );

        log.info(
          "ocr.job.completed",
          {
            jobId:
              job.jobId,
            pageNumber:
              job.pageNumber,
            chars:
              pageResult.text.length,
            hasImage:
              pageResult.hasImage,
            status:
              getOcrQueueStatus()
          }
        );
      } catch (error) {
        log.error(
          "ocr.job.failed",
          {
            jobId:
              job.jobId,
            pageNumber:
              job.pageNumber,
            filePath:
              job.filePath,
            error:
              error.message,
            stack:
              error.stack
          }
        );

        failOcrJob(
          job,
          error
        );
      }

      await new Promise(resolve =>
        setTimeout(
          resolve,
          350
        )
      );

      job =
        claimNextOcrJob();
    }

    log.info(
      "ocr.queue.idle",
      getOcrQueueStatus()
    );
  } finally {
    ocrQueueRunning =
      false;
  }
}

function startOcrQueue() {

  setTimeout(
    () => {
      processOcrQueue()
        .catch(error =>
          log.error(
            "ocr.queue.crashed",
            error
          )
        );
    },
    0
  );
}

function collectSupportedFiles(folderPath) {

  const files = [];
  const entries =
    fs.readdirSync(
      folderPath,
      {
        withFileTypes: true
      }
    );

  for (
    const entry
    of entries
  ) {

    const fullPath =
      path.join(
        folderPath,
        entry.name
      );

    if (
      entry.isDirectory()
    ) {
      files.push(
        ...collectSupportedFiles(
          fullPath
        )
      );

      continue;
    }

    if (
      !entry.isFile()
    ) {
      continue;
    }

    const extension =
      path
        .extname(entry.name)
        .toLowerCase();

    if (
      !SUPPORTED_EXTENSIONS.has(
        extension
      )
    ) {
      continue;
    }

    const stats =
      fs.statSync(
        fullPath
      );

    files.push({
      name:
        entry.name,
      path:
        fullPath,
      size:
        stats.size,
      createdAt:
        stats.birthtime,
      extension
    });
  }

  return files;
}

function createWindow() {

  const win = new BrowserWindow({
    width: 1200,
    height: 800,

    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  setLogTarget(
    win.webContents
  );

  win.webContents.once(
    "did-finish-load",
    () => {
      log.info(
        "app.window.loaded"
      );
    }
  );

  if (!app.isPackaged) {

    win.loadURL(
      "http://localhost:5173"
    );

    win.webContents.openDevTools({
      mode:
        "detach"
    });

  } else {

    const indexPath =
      path.join(
        __dirname,
        "../dist/index.html"
      );

    win.webContents.openDevTools({
      mode:
        "detach"
    });

    win.loadFile(
      indexPath
    );
  }
}

function registerPreviewProtocol() {
  protocol.handle(
    "smart-preview",
    async request => {
      const url =
        new URL(
          request.url
        );
      const filePath =
        url
          .searchParams
          .get("path");

      if (!filePath) {
        return new Response(
          "Missing preview path",
          {
            status:
              400
          }
        );
      }

      try {
        let preview;

        if (isPdfPath(filePath)) {
          const state =
            getCachedPdfPreviewIfReady(
              filePath
            );

          if (!state.ready) {
            schedulePdfPreviewCache(
              filePath,
              {
                source:
                  "list-view"
              }
            );

            return new Response(
              "Preview queued",
              {
                status:
                  202
              }
            );
          }

          preview =
            state.preview;
        } else {
          preview =
            await createFilePreview(
              filePath
            );
        }

        if (!preview) {
          return new Response(
            "Preview unavailable",
            {
              status:
                404
            }
          );
        }

        return new Response(
          preview.buffer,
          {
            headers: {
              "content-type":
                preview.mimeType,
              "cache-control":
                "no-store"
            }
          }
        );
      } catch (error) {
        recordUnavailableThumbnail(
          filePath,
          error
        );

        return new Response(
          "Preview failed",
          {
            status:
              500
          }
        );
      }
    }
  );
}

ipcMain.handle("select-folder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"]
  });

  if (result.canceled) return null;

  const folderPath = result.filePaths[0];

  log.info(
    "folder.selected",
    {
      folderPath
    }
  );

  let files;

  try {
    files =
      collectSupportedFiles(
        folderPath
      );
  } catch (error) {
    log.error(
      "folder.scan.failed",
      {
        folderPath,
        error:
          error.message
      }
    );

    return {
      folderPath,
      files: [],
      error:
        error.message
    };
  }

  return {
    folderPath,
    files
  };
});

ipcMain.handle(
  "get-image-data",
  async (_, imagePath) => {

    let buffer;

    try {
      buffer =
        fs.readFileSync(
          imagePath
        );
    } catch (error) {
      recordUnavailableThumbnail(
        imagePath,
        error
      );

      return null;
    }

    const ext =
      path
        .extname(imagePath)
        .replace(".", "");

    return `data:image/${ext};base64,${buffer.toString("base64")}`;
  }
);

ipcMain.handle(
  "get-file-preview-data",
  async (_, filePath, options = {}) => {
    try {
      return await createFilePreviewDataUrl(
        filePath,
        options
      );
    } catch (error) {
      recordUnavailableThumbnail(
        filePath,
        error
      );

      return null;
    }
  }
);

ipcMain.handle("select-image", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],

    filters: [
      {
        name: "Images",
        extensions: [
          "png",
          "jpg",
          "jpeg",
          "webp",
          "bmp",
          "gif",
          "tif",
          "tiff"
        ]
      }
    ]
  });

  if (result.canceled)
    return null;

  return result.filePaths[0];
});

ipcMain.handle("extract-document-text", async (_, filePath) => {
  try {
    log.info(
      "document.extract.start",
      {
        filePath
      }
    );

    const fileHash =
      await generateFileHash(
        filePath
      );

    log.info(
      "document.hash.generated",
      {
        filePath,
        fileHash
      }
    );

    const existingDocument =
      getDocumentByFileHash(
        fileHash
      );

    if (
      existingDocument &&
      existingDocument.status !== "failed" &&
      (
        existingDocument.cleanText ||
        existingDocument.text ||
        existingDocument.pages?.length > 0
      )
    ) {
      log.info(
        "document.extract.skipped-duplicate",
        {
          filePath,
          fileHash,
          documentId:
            existingDocument.documentId,
          status:
            existingDocument.status,
          chars:
            existingDocument.text?.length ?? 0,
          cleanChars:
            existingDocument.cleanText?.length ?? 0
        }
      );

      return {
        success: true,
        duplicate: true,
        documentId:
          existingDocument.documentId,
        fileHash,
        text:
          existingDocument.text || "",
        cleanText:
          existingDocument.cleanText || "",
        textQuality:
          existingDocument.textQuality,
        rawWordCount:
          existingDocument.rawWordCount,
        cleanWordCount:
          existingDocument.cleanWordCount,
        noiseRatio:
          existingDocument.noiseRatio,
        pages:
          existingDocument.pages || [],
        jobs: [],
        totalPages:
          existingDocument.totalPages,
        status:
          existingDocument.status || "done"
      };
    }

    const indexed =
      await extractFileForIndex(
        filePath
      );

    log.info(
      "document.extract.completed",
      {
        filePath,
        fileHash,
        chars:
          indexed.text.length,
        cleanChars:
          indexed.cleanText?.length ?? 0,
        textQuality:
          indexed.textQuality,
        pages:
          indexed.pages.length,
        queuedJobs:
          indexed.jobs.length,
        totalPages:
          indexed.totalPages,
        status:
          indexed.status
      }
    );

    return {
      success: true,
      documentId:
        createDocumentId(
          fileHash
        ),
      fileHash,
      text:
        indexed.text,
      cleanText:
        indexed.cleanText,
      textQuality:
        indexed.textQuality,
      rawWordCount:
        indexed.rawWordCount,
      cleanWordCount:
        indexed.cleanWordCount,
      noiseRatio:
        indexed.noiseRatio,
      pages:
        indexed.pages,
      jobs:
        indexed.jobs,
      totalPages:
        indexed.totalPages,
      status:
        indexed.status
    };
  } catch (error) {
    log.error(
      "document.extract.failed",
      {
        filePath,
        error:
          error.message,
        stack:
          error.stack
      }
    );

    return {
      success: false,
      error: error.message,
    };
  }
});

ipcMain.handle(
  "save-document",
  async (_, document) => {

    try {

	      const savedDocument =
	        insertDocument(
	          document
	        );

	      schedulePdfPreviewCache(
	        savedDocument.filePath,
	        {
	          source:
	            "upload",
	          documentId:
	            savedDocument.documentId
	        }
	      );

	      const {
	        document:
	          enrichedDocument,
        planB
      } =
        await enrichSavedDocumentWithPlanB(
          savedDocument
        );

      log.info(
        "document.saved",
        {
          documentId:
            enrichedDocument.documentId,
          fileHash:
            enrichedDocument.fileHash,
          filePath:
            enrichedDocument.filePath,
          paths:
            enrichedDocument.paths,
          indexedPages:
            enrichedDocument.indexedPages,
          totalPages:
            enrichedDocument.totalPages,
          status:
            enrichedDocument.status,
          planB:
            planB.status
        }
      );

	      if (
	        (document.jobs || []).length > 0
	      ) {
	        startOcrQueue();
	      } else {
        log.info(
          "ocr.queue.skipped-no-new-jobs",
          {
            documentId:
              savedDocument.documentId,
            filePath:
              savedDocument.filePath
          }
	        );
	      }

	      return {
        success: true,
        document:
          enrichedDocument,
        planB
      };

    } catch (error) {

      log.error(
        "document.save.failed",
        {
          filePath:
            document?.filePath,
          fileHash:
            document?.fileHash,
          error:
            error.message,
          stack:
            error.stack
        }
      );

      return {
        success: false,
        error:
          error.message
      };
    }
  }
);

ipcMain.handle(
  "get-documents",
  async () => {

    return getDocumentSummaries();

  }
);

ipcMain.handle(
  "get-database-info",
  async () =>
    getDatabaseInfo()
);

ipcMain.handle(
  "get-document-detail",
  async (_, documentId) =>
    getDocumentDetail(
      documentId
    )
);

ipcMain.handle(
  "get-virtual-folders",
  async () =>
    getVirtualFolders()
);

ipcMain.handle(
  "save-virtual-folder",
  async (_, payload) => {
    try {
      return {
        success: true,
        ...saveVirtualFolder(
          payload
        )
      };
    } catch (error) {
      log.error(
        "organizer.virtual-folder.save-failed",
        {
          folderId:
            payload?.folderId,
          name:
            payload?.name,
          parentId:
            payload?.parentId,
          error:
            error.message
        }
      );

      return {
        success: false,
        error:
          error.message
      };
    }
  }
);

ipcMain.handle(
  "delete-virtual-folder",
  async (_, folderId) => {
    try {
      return {
        success: true,
        ...deleteVirtualFolder(
          folderId
        )
      };
    } catch (error) {
      log.error(
        "organizer.virtual-folder.delete-failed",
        {
          folderId,
          error:
            error.message
        }
      );

      return {
        success: false,
        error:
          error.message
      };
    }
  }
);

ipcMain.handle(
  "get-folder-keywords",
  async (_, folderId) =>
    getFolderKeywordOverrides(
      folderId
    )
);

ipcMain.handle(
  "save-folder-keyword",
  async (_, payload) => {
    try {
      return {
        success: true,
        ...saveFolderKeywordOverride(
          payload
        )
      };
    } catch (error) {
      log.error(
        "organizer.folder-keyword.save-failed",
        {
          folderId:
            payload?.folderId,
          keyword:
            payload?.keyword,
          error:
            error.message
        }
      );

      return {
        success: false,
        error:
          error.message
      };
    }
  }
);

ipcMain.handle(
  "delete-folder-keyword",
  async (_, folderId, keyword) => {
    try {
      return {
        success: true,
        ...deleteFolderKeywordOverride(
          folderId,
          keyword
        )
      };
    } catch (error) {
      log.error(
        "organizer.folder-keyword.delete-failed",
        {
          folderId,
          keyword,
          error:
            error.message
        }
      );

      return {
        success: false,
        error:
          error.message
      };
    }
  }
);

ipcMain.handle(
  "save-document-folder-override",
  async (_, payload) => {
    try {
      return {
        success: true,
        ...saveDocumentFolderOverride(
          payload
        )
      };
    } catch (error) {
      log.error(
        "organizer.document-folder.save-failed",
        {
          documentId:
            payload?.documentId,
          folderId:
            payload?.folderId,
          action:
            payload?.action,
          error:
            error.message
        }
      );

      return {
        success: false,
        error:
          error.message
      };
    }
  }
);

ipcMain.handle(
  "delete-document-folder-override",
  async (_, documentId, folderId) => {
    try {
      return {
        success: true,
        ...deleteDocumentFolderOverride(
          documentId,
          folderId
        )
      };
    } catch (error) {
      log.error(
        "organizer.document-folder.delete-failed",
        {
          documentId,
          folderId,
          error:
            error.message
        }
      );

      return {
        success: false,
        error:
          error.message
      };
    }
  }
);

ipcMain.handle(
  "add-document-keyword-tag",
  async (_, documentId, tag) => {
    try {
      return {
        success: true,
        ...addDocumentKeywordTag(
          documentId,
          tag
        )
      };
    } catch (error) {
      log.error(
        "document.keyword-tag.add-failed",
        {
          documentId,
          tag,
          error:
            error.message
        }
      );

      return {
        success: false,
        error:
          error.message
      };
    }
  }
);

ipcMain.handle(
  "delete-document-keyword-tag",
  async (_, documentId, tag) => {
    try {
      return {
        success: true,
        ...deleteDocumentKeywordTag(
          documentId,
          tag
        )
      };
    } catch (error) {
      log.error(
        "document.keyword-tag.delete-failed",
        {
          documentId,
          tag,
          error:
            error.message
        }
      );

      return {
        success: false,
        error:
          error.message
      };
    }
  }
);

ipcMain.handle(
  "search-documents",
  async (_, query) => {

    return searchDocumentSummaries(
      query
    );

  }
);

ipcMain.handle(
  "search-documents-plan-b",
  async (_, query) =>
    searchDocumentSummariesWithPlanB(
      query
    )
);

ipcMain.handle(
  "get-ocr-queue-status",
  async () =>
    getOcrQueueStatus()
);

ipcMain.handle(
  "open-file",
  async (_, filePath) => {

    await shell.openPath(
      filePath
    );

    return true;
  }
);

ipcMain.handle(
  "reveal-file",
  async (_, filePath) => {

    shell.showItemInFolder(
      filePath
    );

    return true;
  }
);

ipcMain.handle(
  "select-files",
  async () => {

    const result =
      await dialog.showOpenDialog({
        properties: [
          "openFile",
          "multiSelections"
        ],
      });

    if (result.canceled)
      return [];

    const selectedFiles =
      result.filePaths
        .filter(
          filePath =>
            SUPPORTED_EXTENSIONS.has(
              path
                .extname(filePath)
                .toLowerCase()
            )
        )
        .map(
          filePath => ({

            path:
              filePath,

            name:
              path.basename(
                filePath
              ),

            extension:
              path
                .extname(
                  filePath
                )
                .toLowerCase()

          })
        );

    log.info(
      "files.selected",
      {
        count:
          selectedFiles.length,
        files:
          selectedFiles.map(file =>
            file.path
          )
      }
    );

    return selectedFiles;
  }
);



// this is for debugging
app.on("web-contents-created", (_, contents) => {
  contents.on("preload-error", (_, preloadPath, error) => {
    console.error("PRELOAD ERROR:");
    console.error(preloadPath);
    console.error(error);
  });
});

app.whenReady().then(() => {
  log.info(
    "app.ready"
  );
  registerPreviewProtocol();
  createWindow();
  startPlanBWorker()
    .catch(error => {
      log.warn(
        "planb.worker.start.failed",
        {
          error:
            error.message,
          stack:
            error.stack
        }
      );
    });
});

app.on(
  "before-quit",
  () => {
    stopPlanBWorker();
  }
);
