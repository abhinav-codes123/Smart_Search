import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell
} from "electron";
import path from "path";
import { fileURLToPath } from "url";
import {
  insertDocument,
  getDocumentByFileHash,
  getAllDocuments,
  searchDocuments,
  claimNextOcrJob,
  completeOcrJob,
  failOcrJob,
  getOcrQueueStatus
} from "./database.js";
import {
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
import {
  config
} from "./config.js";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let ocrQueueRunning = false;

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

    const buffer =
      fs.readFileSync(
        imagePath
      );

    const ext =
      path
        .extname(imagePath)
        .replace(".", "");

    return `data:image/${ext};base64,${buffer.toString("base64")}`;
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

    if (
      config.ocr.skipDuplicateExtraction
    ) {
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

      log.info(
        "document.saved",
        {
          documentId:
            savedDocument.documentId,
          fileHash:
            savedDocument.fileHash,
          filePath:
            savedDocument.filePath,
          paths:
            savedDocument.paths,
          indexedPages:
            savedDocument.indexedPages,
          totalPages:
            savedDocument.totalPages,
          status:
            savedDocument.status
        }
      );

      if (
        config.ocr.startQueueWhenNoJobs ||
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
        success: true
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

    return getAllDocuments();

  }
);

ipcMain.handle(
  "search-documents",
  async (_, query) => {

    return searchDocuments(
      query
    );

  }
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
  createWindow();
});
