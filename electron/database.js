import electron from "electron";
import fs from "fs";
import path from "path";
import {
  DatabaseSync
} from "node:sqlite";
import {
  searchDocumentsInDocs,
  tokenize
} from "./searchEngine.js";
import {
  createDocumentId,
  createJobId,
  createPageId
} from "./fileIdentity.js";
import {
  log
} from "./logger.js";
import {
  buildTextQuality
} from "./textQuality.js";
import {
  generateKeywordTags,
  generateTitleTags
} from "../src/utils/tagGenerator.js";
import {
  config
} from "./config.js";

const {
  app
} = electron;

const DATA_DIR =
  app?.isPackaged
    ? path.join(
        app.getPath(
          "userData"
        ),
        "data"
      )
    : path.join(
        process.cwd(),
        "electron",
        "data"
      );

const JSON_DB_PATH =
  config.data.jsonDbPath ||
  (
    config.data.dbPath &&
      path.extname(
        config.data.dbPath
      ) === ".json"
      ? config.data.dbPath
      : path.join(
          DATA_DIR,
          "documents.json"
        )
  );

const SQLITE_DB_PATH =
  config.data.sqliteDbPath ||
  (
    config.data.dbPath &&
      [
        ".sqlite",
        ".sqlite3",
        ".db"
      ].includes(
        path.extname(
          config.data.dbPath
        )
      )
      ? config.data.dbPath
      : JSON_DB_PATH.replace(
          /\.json$/i,
          ".sqlite"
        )
  );

const EMPTY_JSON_DB = {
  version: 2,
  documents: [],
  pages: [],
  jobs: []
};
const CLEAN_TEXT_VERSION = 8;

let db;

function now() {

  return new Date()
    .toISOString();
}

function normalizeStoredPath(filePath) {

  if (
    !filePath
  ) {
    return "";
  }

  return path.normalize(
    path.isAbsolute(filePath)
      ? filePath
      : path.resolve(filePath)
  );
}

function toJson(value, fallback) {

  return JSON.stringify(
    value ?? fallback
  );
}

function fromJson(value, fallback) {

  if (
    value == null ||
    value === ""
  ) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function ensureDir(filePath) {

  fs.mkdirSync(
    path.dirname(filePath),
    {
      recursive: true
    }
  );
}

function getDb() {

  if (db) {
    return db;
  }

  ensureDir(
    SQLITE_DB_PATH
  );

  db =
    new DatabaseSync(
      SQLITE_DB_PATH
    );

  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA synchronous = NORMAL");

  createSchema(db);
  migrateJsonIfNeeded(db);
  backfillMissingCleanText(db);
  writeJsonSnapshotSafely(db);

  return db;
}

function createSchema(database) {

  database.exec(`
    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      document_id TEXT PRIMARY KEY,
      file_hash TEXT UNIQUE,
      file_name TEXT NOT NULL,
      primary_path TEXT NOT NULL,
      title_tags_json TEXT NOT NULL DEFAULT '[]',
      keyword_tags_json TEXT NOT NULL DEFAULT '[]',
      category TEXT NOT NULL DEFAULT 'Unknown',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      text TEXT,
      clean_text TEXT,
      text_quality INTEGER,
      raw_word_count INTEGER,
      clean_word_count INTEGER,
      noise_ratio REAL,
      total_pages INTEGER,
      indexed_pages INTEGER,
      status TEXT NOT NULL DEFAULT 'done',
      scanned_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_paths (
      document_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      PRIMARY KEY (document_id, file_path),
      FOREIGN KEY (document_id)
        REFERENCES documents(document_id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pages (
      page_id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      file_hash TEXT,
      file_path TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      clean_text TEXT NOT NULL DEFAULT '',
      text_quality INTEGER,
      raw_word_count INTEGER,
      clean_word_count INTEGER,
      noise_ratio REAL,
      has_image INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'done',
      processed_at TEXT NOT NULL,
      UNIQUE (document_id, page_number),
      FOREIGN KEY (document_id)
        REFERENCES documents(document_id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ocr_jobs (
      job_id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      file_hash TEXT,
      file_path TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (document_id, page_number),
      FOREIGN KEY (document_id)
        REFERENCES documents(document_id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tags (
      document_id TEXT NOT NULL,
      tag_type TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (document_id, tag_type, tag),
      FOREIGN KEY (document_id)
        REFERENCES documents(document_id)
        ON DELETE CASCADE
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS document_fts
      USING fts5(
        document_id UNINDEXED,
        file_name,
        title_tags,
        keyword_tags,
        metadata,
        category,
        text
      );

    CREATE INDEX IF NOT EXISTS idx_pages_document
      ON pages(document_id, page_number);

    CREATE INDEX IF NOT EXISTS idx_ocr_jobs_status
      ON ocr_jobs(status, attempts, created_at);
  `);

  ensureColumn(
    database,
    "documents",
    "clean_text",
    "TEXT"
  );
  ensureColumn(
    database,
    "documents",
    "text_quality",
    "INTEGER"
  );
  ensureColumn(
    database,
    "documents",
    "raw_word_count",
    "INTEGER"
  );
  ensureColumn(
    database,
    "documents",
    "clean_word_count",
    "INTEGER"
  );
  ensureColumn(
    database,
    "documents",
    "noise_ratio",
    "REAL"
  );
  ensureColumn(
    database,
    "pages",
    "clean_text",
    "TEXT NOT NULL DEFAULT ''"
  );
  ensureColumn(
    database,
    "pages",
    "text_quality",
    "INTEGER"
  );
  ensureColumn(
    database,
    "pages",
    "raw_word_count",
    "INTEGER"
  );
  ensureColumn(
    database,
    "pages",
    "clean_word_count",
    "INTEGER"
  );
  ensureColumn(
    database,
    "pages",
    "noise_ratio",
    "REAL"
  );
}

function ensureColumn(
  database,
  table,
  column,
  definition
) {

  const exists =
    database
      .prepare(
        `PRAGMA table_info(${table})`
      )
      .all()
      .some(row =>
        row.name === column
      );

  if (exists) {
    return;
  }

  database.exec(
    `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
  );
}

function backfillMissingCleanText(database) {

  const versionRow =
    database
      .prepare(
        "SELECT value FROM app_metadata WHERE key = 'clean_text_version'"
      )
      .get();
  const shouldRebuild =
    Number(versionRow?.value || 0) !==
    CLEAN_TEXT_VERSION;

  const pages =
    database
      .prepare(
        shouldRebuild
          ? "SELECT page_id, text FROM pages"
          : "SELECT page_id, text FROM pages WHERE clean_text IS NULL OR clean_text = ''"
      )
      .all();

  for (
    const page
    of pages
  ) {
    const quality =
      buildTextQuality(
        page.text || ""
      );

    database
      .prepare(`
        UPDATE pages
        SET clean_text = ?,
            text_quality = ?,
            raw_word_count = ?,
            clean_word_count = ?,
            noise_ratio = ?
        WHERE page_id = ?
      `)
      .run(
        quality.cleanText,
        quality.quality,
        quality.rawWordCount,
        quality.cleanWordCount,
        quality.noiseRatio,
        page.page_id
      );
  }

  const documents =
    database
      .prepare(
        shouldRebuild
          ? "SELECT document_id, text FROM documents WHERE text IS NOT NULL AND text != ''"
          : "SELECT document_id, text FROM documents WHERE text IS NOT NULL AND text != '' AND (clean_text IS NULL OR clean_text = '')"
      )
      .all();

  for (
    const document
    of documents
  ) {
    const quality =
      buildTextQuality(
        document.text || ""
      );

    database
      .prepare(`
        UPDATE documents
        SET clean_text = ?,
            text_quality = ?,
            raw_word_count = ?,
            clean_word_count = ?,
            noise_ratio = ?
        WHERE document_id = ?
      `)
      .run(
        quality.cleanText,
        quality.quality,
        quality.rawWordCount,
        quality.cleanWordCount,
        quality.noiseRatio,
        document.document_id
      );
  }

  const rows =
    database
      .prepare(
        "SELECT document_id FROM documents"
      )
      .all();

  for (
    const row
    of rows
  ) {
    syncDocumentStatus(
      database,
      row.document_id
    );
    refreshSearchIndex(
      database,
      row.document_id
    );
  }

  if (
    pages.length > 0 ||
    documents.length > 0 ||
    shouldRebuild
  ) {
    database
      .prepare(`
        INSERT INTO app_metadata (key, value)
        VALUES ('clean_text_version', ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value
      `)
      .run(
        String(CLEAN_TEXT_VERSION)
      );

    log.info(
      "database.clean-text.backfilled",
      {
        pages:
          pages.length,
        documents:
          documents.length,
        cleanTextVersion:
          CLEAN_TEXT_VERSION
      }
    );
  }
}

function withTransaction(callback) {

  const database =
    getDb();

  database.exec("BEGIN IMMEDIATE");

  try {
    const result =
      callback(database);

    database.exec("COMMIT");

    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function legacyDocumentToRecord(document) {

  const record = {
    ...document
  };

  delete record.pages;
  delete record.jobs;

  const fileHash =
    record.fileHash ||
    `legacy_${Buffer.from(
      record.filePath ||
        record.fileName ||
        Math.random().toString()
    )
      .toString("hex")
      .slice(0, 48)}`;

  const documentId =
    record.documentId ||
    createDocumentId(
      fileHash
    );

  const primaryPath =
    normalizeStoredPath(
      record.primaryPath ||
        record.filePath
    );

  const filePath =
    normalizeStoredPath(
      record.filePath ||
        record.primaryPath
    );
  const text =
    record.text ||
    record.ocrText ||
    "";
  const quality =
    buildTextQuality(
      text
    );

  return {
    ...record,
    documentId,
    fileHash,
    primaryPath,
    filePath,
    cleanText:
      record.cleanText ||
      record.clean_text ||
      quality.cleanText,
    textQuality:
      record.textQuality ??
      record.text_quality ??
      quality.quality,
    rawWordCount:
      record.rawWordCount ??
      record.raw_word_count ??
      quality.rawWordCount,
    cleanWordCount:
      record.cleanWordCount ??
      record.clean_word_count ??
      quality.cleanWordCount,
    noiseRatio:
      record.noiseRatio ??
      record.noise_ratio ??
      quality.noiseRatio,
    paths:
      [
        ...new Set(
          [
            ...(record.paths || []),
            primaryPath,
            filePath
          ]
            .filter(Boolean)
            .map(
              normalizeStoredPath
            )
        )
      ],
    totalPages:
      record.totalPages ?? null,
    indexedPages:
      record.indexedPages ?? null,
    status:
      record.status || "done",
    updatedAt:
      record.updatedAt ||
      record.scannedAt ||
      now()
  };
}

function normalizePageRecord(page) {

  const text =
    page.text ||
    [
      page.embeddedText,
      page.ocrText
    ]
      .filter(Boolean)
      .join("\n\n");
  const quality =
    buildTextQuality(
      text
    );

  return {
    ...page,
    text,
    cleanText:
      page.cleanText ||
      page.clean_text ||
      quality.cleanText,
    textQuality:
      page.textQuality ??
      page.text_quality ??
      quality.quality,
    rawWordCount:
      page.rawWordCount ??
      page.raw_word_count ??
      quality.rawWordCount,
    cleanWordCount:
      page.cleanWordCount ??
      page.clean_word_count ??
      quality.cleanWordCount,
    noiseRatio:
      page.noiseRatio ??
      page.noise_ratio ??
      quality.noiseRatio,
    filePath:
      normalizeStoredPath(
        page.filePath
      )
  };
}

function normalizeJsonDB(raw) {

  let jsonDb;

  if (
    Array.isArray(raw)
  ) {
    jsonDb = {
      ...EMPTY_JSON_DB,
      documents:
        raw.map(
          legacyDocumentToRecord
        )
    };
  } else if (
    raw &&
    typeof raw === "object"
  ) {
    jsonDb = {
      ...EMPTY_JSON_DB,
      ...raw,
      version: 2,
      documents:
        (raw.documents || [])
          .map(
            legacyDocumentToRecord
          ),
      pages:
        (raw.pages || [])
          .map(
            normalizePageRecord
          ),
      jobs:
        (raw.jobs || [])
          .filter(job =>
            job.status !== "done"
          )
    };
  } else {
    jsonDb = {
      ...EMPTY_JSON_DB
    };
  }

  for (
    const document
    of jsonDb.documents
  ) {
    delete document.pages;
    delete document.jobs;

    if (
      jsonDb.pages.some(page =>
        page.documentId === document.documentId
      )
    ) {
      delete document.text;
      delete document.ocrText;
    }
  }

  return jsonDb;
}

function readJsonDB(filePath) {

  try {
    if (
      !fs.existsSync(filePath)
    ) {
      return {
        ...EMPTY_JSON_DB
      };
    }

    const data =
      fs.readFileSync(
        filePath,
        "utf8"
      );

    if (
      !data.trim()
    ) {
      return {
        ...EMPTY_JSON_DB
      };
    }

    return normalizeJsonDB(
      JSON.parse(data)
    );
  } catch (error) {
    log.error(
      "database.json.read.failed",
      {
        filePath,
        error:
          error.message
      }
    );

    return {
      ...EMPTY_JSON_DB
    };
  }
}

function migrateJsonIfNeeded(database) {

  const row =
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM documents"
      )
      .get();

  if (
    Number(row.count) > 0 ||
    !fs.existsSync(
      JSON_DB_PATH
    )
  ) {
    return;
  }

  const jsonDb =
    readJsonDB(
      JSON_DB_PATH
    );

  if (
    jsonDb.documents.length === 0 &&
    jsonDb.pages.length === 0 &&
    jsonDb.jobs.length === 0
  ) {
    return;
  }

  log.info(
    "database.sqlite.migration.start",
    {
      jsonPath:
        JSON_DB_PATH,
      sqlitePath:
        SQLITE_DB_PATH,
      documents:
        jsonDb.documents.length,
      pages:
        jsonDb.pages.length,
      jobs:
        jsonDb.jobs.length
    }
  );

  database.exec("BEGIN IMMEDIATE");

  try {
    for (
      const document
      of jsonDb.documents
    ) {
      upsertDocumentRecord(
        database,
        document
      );
    }

    for (
      const page
      of jsonDb.pages
    ) {
      upsertPageRecord(
        database,
        page
      );
    }

    for (
      const job
      of jsonDb.jobs
    ) {
      upsertJobRecord(
        database,
        job
      );
    }

    for (
      const document
      of jsonDb.documents
    ) {
      syncDocumentStatus(
        database,
        document.documentId
      );
      refreshSearchIndex(
        database,
        document.documentId
      );
    }

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  log.info(
    "database.sqlite.migration.completed",
    {
      sqlitePath:
        SQLITE_DB_PATH
    }
  );
}

function rowToDocument(row) {

  if (!row) {
    return null;
  }

  return {
    documentId:
      row.document_id,
    fileHash:
      row.file_hash,
    filePath:
      row.primary_path,
    fileName:
      row.file_name,
    titleTags:
      fromJson(
        row.title_tags_json,
        []
      ),
    keywordTags:
      fromJson(
        row.keyword_tags_json,
        []
      ),
    category:
      row.category || "Unknown",
    metadata:
      fromJson(
        row.metadata_json,
        {}
      ),
    text:
      row.text || "",
    cleanText:
      row.clean_text || "",
    textQuality:
      row.text_quality,
    rawWordCount:
      row.raw_word_count,
    cleanWordCount:
      row.clean_word_count,
    noiseRatio:
      row.noise_ratio,
    totalPages:
      row.total_pages,
    indexedPages:
      row.indexed_pages,
    status:
      row.status || "done",
    scannedAt:
      row.scanned_at,
    primaryPath:
      row.primary_path,
    updatedAt:
      row.updated_at
  };
}

function rowToPage(row) {

  return {
    pageId:
      row.page_id,
    documentId:
      row.document_id,
    fileHash:
      row.file_hash,
    filePath:
      row.file_path,
    pageNumber:
      row.page_number,
    text:
      row.text || "",
    cleanText:
      row.clean_text || "",
    textQuality:
      row.text_quality,
    rawWordCount:
      row.raw_word_count,
    cleanWordCount:
      row.clean_word_count,
    noiseRatio:
      row.noise_ratio,
    hasImage:
      Boolean(row.has_image),
    status:
      row.status || "done",
    processedAt:
      row.processed_at
  };
}

function rowToJob(row) {

  if (!row) {
    return null;
  }

  return {
    jobId:
      row.job_id,
    documentId:
      row.document_id,
    fileHash:
      row.file_hash,
    filePath:
      row.file_path,
    pageNumber:
      row.page_number,
    status:
      row.status,
    attempts:
      row.attempts,
    error:
      row.error,
    createdAt:
      row.created_at,
    updatedAt:
      row.updated_at
  };
}

function getDocumentRow(database, documentId) {

  return database
    .prepare(
      "SELECT * FROM documents WHERE document_id = ?"
    )
    .get(
      documentId
    );
}

function getPathsForDocument(database, documentId) {

  return database
    .prepare(
      "SELECT file_path FROM document_paths WHERE document_id = ? ORDER BY file_path"
    )
    .all(
      documentId
    )
    .map(row =>
      row.file_path
    );
}

function getPagesForDocument(database, documentId) {

  return database
    .prepare(
      "SELECT * FROM pages WHERE document_id = ? AND status != 'failed' ORDER BY page_number"
    )
    .all(
      documentId
    )
    .map(
      rowToPage
    );
}

function getJobsForSnapshot(database) {

  return database
    .prepare(
      "SELECT * FROM ocr_jobs ORDER BY created_at ASC, page_number ASC"
    )
    .all()
    .map(
      rowToJob
    );
}

function getPathsForSnapshot(database) {

  return database
    .prepare(
      "SELECT document_id, file_path FROM document_paths ORDER BY document_id, file_path"
    )
    .all()
    .map(row => ({
      documentId:
        row.document_id,
      filePath:
        row.file_path
    }));
}

function getAppMetadataForSnapshot(database) {

  return database
    .prepare(
      "SELECT key, value FROM app_metadata ORDER BY key"
    )
    .all();
}

function getTagsForSnapshot(database) {

  return database
    .prepare(
      "SELECT document_id, tag_type, tag FROM tags ORDER BY document_id, tag_type, tag"
    )
    .all()
    .map(row => ({
      documentId:
        row.document_id,
      tagType:
        row.tag_type,
      tag:
        row.tag
    }));
}

function aggregateDocumentText(document, pages) {

  const pageText =
    pages
      .map(page =>
        page.text
      )
      .filter(Boolean)
      .join("\n\n");

  return pageText ||
    document.text ||
    document.ocrText ||
    "";
}

function aggregateDocumentCleanText(document, pages) {

  const pageText =
    pages
      .map(page =>
        page.cleanText ||
        page.text
      )
      .filter(Boolean)
      .join("\n\n");

  if (pageText) {
    return pageText;
  }

  return document.cleanText ||
    buildTextQuality(
      document.text ||
      document.ocrText ||
      ""
    ).cleanText;
}

function flattenDocument(
  database,
  row
) {

  const document =
    rowToDocument(
      row
    );

  if (!document) {
    return null;
  }

  const pages =
    getPagesForDocument(
      database,
      document.documentId
    );

  const paths =
    getPathsForDocument(
      database,
      document.documentId
    );

  const text =
    aggregateDocumentText(
      document,
      pages
    );
  const cleanText =
    aggregateDocumentCleanText(
      document,
      pages
    );
  const quality =
    buildTextQuality(
      text
    );

  return {
    ...document,
    filePath:
      document.primaryPath ||
      document.filePath,
    paths,
    indexedPages:
      pages.length ||
      document.indexedPages ||
      null,
    text,
    cleanText,
    textQuality:
      document.textQuality ??
      quality.quality,
    rawWordCount:
      document.rawWordCount ??
      quality.rawWordCount,
    cleanWordCount:
      document.cleanWordCount ??
      quality.cleanWordCount,
    noiseRatio:
      document.noiseRatio ??
      quality.noiseRatio,
    pages:
      pages.map(page => ({
        pageNumber:
          page.pageNumber,
        text:
          page.text,
        cleanText:
          page.cleanText,
        textQuality:
          page.textQuality,
        noiseRatio:
          page.noiseRatio,
        status:
          page.status
      }))
  };
}

function createJsonSnapshot(database) {

  const rows =
    database
      .prepare(
        "SELECT * FROM documents ORDER BY updated_at DESC, file_name ASC"
      )
      .all();

  const documents = [];
  const pages = [];

  for (
    const row
    of rows
  ) {
    const document =
      rowToDocument(
        row
      );

    if (!document) {
      continue;
    }

    const documentPages =
      getPagesForDocument(
        database,
        document.documentId
      );
    const aggregateText =
      aggregateDocumentText(
        document,
        documentPages
      );
    const aggregateCleanText =
      aggregateDocumentCleanText(
        document,
        documentPages
      );
    const aggregateQuality =
      buildTextQuality(
        aggregateText
      );

    const snapshotDocument = {
      documentId:
        document.documentId,
      fileHash:
        document.fileHash,
      filePath:
        document.primaryPath ||
        document.filePath,
      fileName:
        document.fileName,
      primaryPath:
        document.primaryPath ||
        document.filePath,
      titleTags:
        document.titleTags || [],
      keywordTags:
        document.keywordTags || [],
      category:
        document.category || "Unknown",
      metadata:
        document.metadata || {},
      cleanText:
        documentPages.length === 0
          ? aggregateCleanText
          : undefined,
      textQuality:
        document.textQuality ??
        aggregateQuality.quality,
      rawWordCount:
        document.rawWordCount ??
        aggregateQuality.rawWordCount,
      cleanWordCount:
        document.cleanWordCount ??
        aggregateQuality.cleanWordCount,
      noiseRatio:
        document.noiseRatio ??
        aggregateQuality.noiseRatio,
      totalPages:
        document.totalPages,
      indexedPages:
        documentPages.length ||
        document.indexedPages ||
        null,
      status:
        document.status || "done",
      scannedAt:
        document.scannedAt,
      updatedAt:
        document.updatedAt
    };

    if (
      documentPages.length === 0
    ) {
      snapshotDocument.text =
        aggregateText;
    }

    documents.push(
      snapshotDocument
    );

    for (
      const page
      of documentPages
    ) {
      pages.push({
        pageId:
          page.pageId ||
          createPageId(
            document.documentId,
            page.pageNumber
          ),
        documentId:
          document.documentId,
        fileHash:
          page.fileHash ||
          document.fileHash,
        filePath:
          page.filePath ||
          snapshotDocument.filePath,
        pageNumber:
          page.pageNumber,
        text:
          page.text || "",
        cleanText:
          page.cleanText || "",
        textQuality:
          page.textQuality,
        rawWordCount:
          page.rawWordCount,
        cleanWordCount:
          page.cleanWordCount,
        noiseRatio:
          page.noiseRatio,
        hasImage:
          page.hasImage,
        status:
          page.status || "done",
        processedAt:
          page.processedAt
      });
    }
  }

  const ocrJobs =
    getJobsForSnapshot(
      database
    );

  return {
    version: 2,
    source:
      "sqlite-snapshot",
    generatedAt:
      now(),
    app_metadata:
      getAppMetadataForSnapshot(
        database
      ),
    documents,
    document_paths:
      getPathsForSnapshot(
        database
      ),
    pages,
    ocr_jobs:
      ocrJobs,
    tags:
      getTagsForSnapshot(
        database
      ),
    jobs:
      ocrJobs
  };
}

function writeJsonSnapshot(database) {

  ensureDir(
    JSON_DB_PATH
  );

  const snapshot =
    createJsonSnapshot(
      database
    );

  fs.writeFileSync(
    JSON_DB_PATH,
    `${JSON.stringify(
      snapshot,
      null,
      2
    )}\n`
  );

  log.info(
    "database.json.snapshot.updated",
    {
      jsonPath:
        JSON_DB_PATH,
      documents:
        snapshot.documents.length,
      pages:
        snapshot.pages.length,
      jobs:
        snapshot.jobs.length
    }
  );
}

function writeJsonSnapshotSafely(database) {

  try {
    writeJsonSnapshot(
      database
    );
  } catch (error) {
    log.error(
      "database.json.snapshot.failed",
      {
        jsonPath:
          JSON_DB_PATH,
        error:
          error.message
      }
    );
  }
}

function upsertDocumentRecord(
  database,
  document
) {

  const normalized =
    legacyDocumentToRecord(
      document
    );

  const hasPages =
    (document.pages || []).length > 0 ||
    database
      .prepare(
        "SELECT 1 FROM pages WHERE document_id = ? LIMIT 1"
      )
      .get(
        normalized.documentId
      );

  const storedText =
    hasPages
      ? null
      : normalized.text ||
          normalized.ocrText ||
          "";
  const quality =
    buildTextQuality(
      storedText
    );
  const storedCleanText =
    hasPages
      ? null
      : normalized.cleanText ||
          quality.cleanText;

  database
    .prepare(`
      INSERT INTO documents (
        document_id,
        file_hash,
        file_name,
        primary_path,
        title_tags_json,
        keyword_tags_json,
        category,
        metadata_json,
        text,
        clean_text,
        text_quality,
        raw_word_count,
        clean_word_count,
        noise_ratio,
        total_pages,
        indexed_pages,
        status,
        scanned_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(document_id) DO UPDATE SET
        file_hash = excluded.file_hash,
        file_name = excluded.file_name,
        primary_path = excluded.primary_path,
        title_tags_json = excluded.title_tags_json,
        keyword_tags_json = excluded.keyword_tags_json,
        category = excluded.category,
        metadata_json = excluded.metadata_json,
        text = excluded.text,
        clean_text = excluded.clean_text,
        text_quality = excluded.text_quality,
        raw_word_count = excluded.raw_word_count,
        clean_word_count = excluded.clean_word_count,
        noise_ratio = excluded.noise_ratio,
        total_pages = excluded.total_pages,
        indexed_pages = excluded.indexed_pages,
        status = excluded.status,
        scanned_at = excluded.scanned_at,
        updated_at = excluded.updated_at
    `)
    .run(
      normalized.documentId,
      normalized.fileHash,
      normalized.fileName ||
        path.basename(
          normalized.primaryPath
        ),
      normalized.primaryPath,
      toJson(
        normalized.titleTags,
        []
      ),
      toJson(
        normalized.keywordTags,
        []
      ),
      normalized.category || "Unknown",
      toJson(
        normalized.metadata,
        {}
      ),
      storedText,
      storedCleanText,
      normalized.textQuality ??
        quality.quality,
      normalized.rawWordCount ??
        quality.rawWordCount,
      normalized.cleanWordCount ??
        quality.cleanWordCount,
      normalized.noiseRatio ??
        quality.noiseRatio,
      normalized.totalPages,
      normalized.indexedPages,
      normalized.status || "done",
      normalized.scannedAt || null,
      normalized.updatedAt || now()
    );

  for (
    const filePath
    of normalized.paths
  ) {
    database
      .prepare(
        "INSERT OR IGNORE INTO document_paths (document_id, file_path) VALUES (?, ?)"
      )
      .run(
        normalized.documentId,
        filePath
      );
  }

  return normalized;
}

function upsertPageRecord(
  database,
  page
) {

  const normalized =
    normalizePageRecord(
      page
    );

  const pageNumber =
    Number(
      normalized.pageNumber
    );

  const pageId =
    normalized.pageId ||
    createPageId(
      normalized.documentId,
      pageNumber
    );

  database
    .prepare(`
      INSERT INTO pages (
        page_id,
        document_id,
        file_hash,
        file_path,
        page_number,
        text,
        clean_text,
        text_quality,
        raw_word_count,
        clean_word_count,
        noise_ratio,
        has_image,
        status,
        processed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(document_id, page_number) DO UPDATE SET
        page_id = excluded.page_id,
        file_hash = excluded.file_hash,
        file_path = excluded.file_path,
        text = excluded.text,
        clean_text = excluded.clean_text,
        text_quality = excluded.text_quality,
        raw_word_count = excluded.raw_word_count,
        clean_word_count = excluded.clean_word_count,
        noise_ratio = excluded.noise_ratio,
        has_image = excluded.has_image,
        status = excluded.status,
        processed_at = excluded.processed_at
    `)
    .run(
      pageId,
      normalized.documentId,
      normalized.fileHash || null,
      normalizeStoredPath(
        normalized.filePath
      ),
      pageNumber,
      normalized.text || "",
      normalized.cleanText || "",
      normalized.textQuality ?? null,
      normalized.rawWordCount ?? null,
      normalized.cleanWordCount ?? null,
      normalized.noiseRatio ?? null,
      normalized.hasImage
        ? 1
        : 0,
      normalized.status || "done",
      normalized.processedAt || now()
    );
}

function upsertJobRecord(
  database,
  job
) {

  if (
    job.status === "done"
  ) {
    return;
  }

  const pageNumber =
    Number(
      job.pageNumber
    );

  const jobId =
    job.jobId ||
    createJobId(
      job.documentId,
      pageNumber
    );

  database
    .prepare(`
      INSERT INTO ocr_jobs (
        job_id,
        document_id,
        file_hash,
        file_path,
        page_number,
        status,
        attempts,
        error,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(document_id, page_number) DO UPDATE SET
        job_id = excluded.job_id,
        file_hash = excluded.file_hash,
        file_path = excluded.file_path,
        status = CASE
          WHEN ocr_jobs.status = 'done' THEN ocr_jobs.status
          ELSE excluded.status
        END,
        attempts = excluded.attempts,
        error = excluded.error,
        updated_at = excluded.updated_at
    `)
    .run(
      jobId,
      job.documentId,
      job.fileHash || null,
      normalizeStoredPath(
        job.filePath
      ),
      pageNumber,
      job.status || "pending",
      job.attempts ?? 0,
      job.error || null,
      job.createdAt || now(),
      job.updatedAt || now()
    );
}

function syncDocumentStatus(
  database,
  documentId
) {

  const indexedPages =
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM pages WHERE document_id = ? AND status != 'failed'"
      )
      .get(
        documentId
      )
      .count;

  const pendingJobs =
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM ocr_jobs WHERE document_id = ? AND status IN ('pending', 'processing')"
      )
      .get(
        documentId
      )
      .count;
  const row =
    getDocumentRow(
      database,
      documentId
    );
  const pages =
    getPagesForDocument(
      database,
      documentId
    );
  const document =
    rowToDocument(
      row
    );
  const aggregateText =
    document
      ? aggregateDocumentText(
          document,
          pages
        )
      : "";
  const aggregateCleanText =
    document
      ? aggregateDocumentCleanText(
          document,
          pages
        )
      : "";
  const quality =
    buildTextQuality(
      aggregateText
    );
  const nextTitleTags =
    generateTitleTags(
      aggregateCleanText
    );
  const nextKeywordTags =
    generateKeywordTags(
      aggregateCleanText
    );

  database
    .prepare(`
      UPDATE documents
      SET indexed_pages = ?,
          title_tags_json = ?,
          keyword_tags_json = ?,
          clean_text = COALESCE(NULLIF(clean_text, ''), ?),
          text_quality = ?,
          raw_word_count = ?,
          clean_word_count = ?,
          noise_ratio = ?,
          status = ?,
          updated_at = ?
      WHERE document_id = ?
    `)
    .run(
      Number(indexedPages),
      toJson(
        nextTitleTags,
        []
      ),
      toJson(
        nextKeywordTags,
        []
      ),
      aggregateCleanText,
      quality.quality,
      quality.rawWordCount,
      quality.cleanWordCount,
      quality.noiseRatio,
      Number(pendingJobs) > 0
        ? "indexing"
        : "done",
      now(),
      documentId
    );
}

function refreshSearchIndex(
  database,
  documentId
) {

  const row =
    getDocumentRow(
      database,
      documentId
    );

  if (!row) {
    return;
  }

  const document =
    flattenDocument(
      database,
      row
    );

  database
    .prepare(
      "DELETE FROM document_fts WHERE document_id = ?"
    )
    .run(
      documentId
    );

  database
    .prepare(
      "DELETE FROM tags WHERE document_id = ?"
    )
    .run(
      documentId
    );

  database
    .prepare(`
      INSERT INTO document_fts (
        document_id,
        file_name,
        title_tags,
        keyword_tags,
        metadata,
        category,
        text
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      document.documentId,
      document.fileName || "",
      document.titleTags?.join(" ") || "",
      document.keywordTags?.join(" ") || "",
      JSON.stringify(
        document.metadata || {}
      ),
      document.category || "",
      document.cleanText ||
        buildTextQuality(
          document.text || ""
        ).cleanText
    );

  for (
    const tag
    of document.titleTags || []
  ) {
    database
      .prepare(
        "INSERT OR IGNORE INTO tags (document_id, tag_type, tag) VALUES (?, 'title', ?)"
      )
      .run(
        documentId,
        tag
      );
  }

  for (
    const tag
    of document.keywordTags || []
  ) {
    database
      .prepare(
        "INSERT OR IGNORE INTO tags (document_id, tag_type, tag) VALUES (?, 'keyword', ?)"
      )
      .run(
        documentId,
        tag
      );
  }
}

function findExistingDocument(
  database,
  document
) {

  if (
    document.fileHash
  ) {
    const byHash =
      database
        .prepare(
          "SELECT * FROM documents WHERE file_hash = ?"
        )
        .get(
          document.fileHash
        );

    if (byHash) {
      return byHash;
    }
  }

  const filePath =
    normalizeStoredPath(
      document.filePath ||
        document.primaryPath
    );

  if (!filePath) {
    return null;
  }

  return database
    .prepare(`
      SELECT documents.*
      FROM documents
      JOIN document_paths
        ON document_paths.document_id = documents.document_id
      WHERE document_paths.file_path = ?
      LIMIT 1
    `)
    .get(
      filePath
    ) || null;
}

export function insertDocument(document) {

  const savedDocument =
    withTransaction(database => {
    const existing =
      findExistingDocument(
        database,
        document
      );

    if (
      existing &&
      document.fileHash
    ) {
      log.info(
        "database.document.duplicate-hit",
        {
          documentId:
            existing.document_id,
          fileHash:
            document.fileHash,
          existingPath:
            existing.primary_path,
          incomingPath:
            document.filePath
        }
      );
    }

    const documentId =
      existing?.document_id ||
      document.documentId ||
      (
        document.fileHash
          ? createDocumentId(
              document.fileHash
            )
          : null
      );

    const primaryPath =
      normalizeStoredPath(
        document.filePath ||
          document.primaryPath ||
          existing?.primary_path
      );

    const nextDocument =
      upsertDocumentRecord(
        database,
        {
          ...rowToDocument(
            existing
          ),
          ...document,
          documentId,
          primaryPath,
          filePath:
            primaryPath,
          paths:
            [
              ...new Set(
                [
                  ...(
                    existing
                      ? getPathsForDocument(
                          database,
                          existing.document_id
                        )
                      : []
                  ),
                  ...(document.paths || []),
                  existing?.primary_path,
                  document.filePath,
                  document.primaryPath,
                  primaryPath
                ]
                  .filter(Boolean)
                  .map(
                    normalizeStoredPath
                  )
              )
            ],
          updatedAt:
            now()
        }
      );

    for (
      const page
      of document.pages || []
    ) {
      upsertPageRecord(
        database,
        {
          ...page,
          documentId:
            nextDocument.documentId,
          fileHash:
            nextDocument.fileHash,
          filePath:
            primaryPath
        }
      );
    }

    for (
      const job
      of document.jobs || []
    ) {
      upsertJobRecord(
        database,
        {
          ...job,
          documentId:
            nextDocument.documentId,
          fileHash:
            nextDocument.fileHash,
          filePath:
            primaryPath
        }
      );

      log.info(
        "database.job.queued",
        {
          jobId:
            job.jobId ||
            createJobId(
              nextDocument.documentId,
              job.pageNumber
            ),
          documentId:
            nextDocument.documentId,
          pageNumber:
            job.pageNumber,
          filePath:
            primaryPath
        }
      );
    }

    syncDocumentStatus(
      database,
      nextDocument.documentId
    );
    refreshSearchIndex(
      database,
      nextDocument.documentId
    );

    const savedRow =
      getDocumentRow(
        database,
        nextDocument.documentId
      );

    log.info(
      existing
        ? "database.document.updated"
        : "database.document.created",
      {
        documentId:
          nextDocument.documentId,
        fileHash:
          nextDocument.fileHash,
        pathCount:
          getPathsForDocument(
            database,
            nextDocument.documentId
          ).length,
        filePath:
          primaryPath
      }
    );

    return flattenDocument(
      database,
      savedRow
    );
  });

  writeJsonSnapshotSafely(
    getDb()
  );

  return savedDocument;
}

export function getAllDocuments() {

  const database =
    getDb();

  return database
    .prepare(
      "SELECT * FROM documents ORDER BY updated_at DESC, file_name ASC"
    )
    .all()
    .map(row =>
      flattenDocument(
        database,
        row
      )
    )
    .filter(Boolean);
}

export function getDocumentByFileHash(fileHash) {

  if (!fileHash) {
    return null;
  }

  const database =
    getDb();
  const row =
    database
      .prepare(
        "SELECT * FROM documents WHERE file_hash = ?"
      )
      .get(
        fileHash
      );

  return flattenDocument(
    database,
    row
  );
}

export function searchDocuments(query) {

  const ftsDocs =
    searchDocumentsWithFts(
      query
    );

  if (ftsDocs.length > 0) {
    return searchDocumentsInDocs(
      ftsDocs,
      query
    );
  }

  // Fallback keeps OCR-tolerant fuzzy behavior for misspellings/noisy text
  // that SQLite FTS cannot match directly.
  return searchDocumentsInDocs(
    getAllDocuments(),
    query
  );
}

function buildFtsQuery(query) {

  const tokens =
    tokenize(query)
      .filter(token =>
        /^[a-z0-9]+$/.test(token)
      )
      .slice(0, 8);

  if (tokens.length === 0) {
    return "";
  }

  return tokens
    .map(token =>
      `"${token.replace(/"/g, "\"\"")}"`
    )
    .join(" AND ");
}

function searchDocumentsWithFts(query) {

  const ftsQuery =
    buildFtsQuery(
      query
    );

  if (!ftsQuery) {
    return [];
  }

  const database =
    getDb();

  try {
    const rows =
      database
        .prepare(`
          SELECT documents.*
          FROM document_fts
          JOIN documents
            ON documents.document_id = document_fts.document_id
          WHERE document_fts MATCH ?
          ORDER BY bm25(document_fts)
          LIMIT 100
        `)
        .all(
          ftsQuery
        );

    return rows
      .map(row =>
        flattenDocument(
          database,
          row
        )
      )
      .filter(Boolean);
  } catch (error) {
    log.warn(
      "database.search.fts.failed",
      {
        query,
        ftsQuery,
        error:
          error.message
      }
    );

    return [];
  }
}

export function claimNextOcrJob() {

  const claimedJob =
    withTransaction(database => {
    const row =
      database
        .prepare(`
          SELECT *
          FROM ocr_jobs
          WHERE status = 'pending'
            AND attempts < 3
          ORDER BY created_at ASC, page_number ASC
          LIMIT 1
        `)
        .get();

    if (!row) {
      log.info(
        "database.job.none-pending"
      );
      return null;
    }

    const attempts =
      Number(row.attempts || 0) + 1;

    database
      .prepare(`
        UPDATE ocr_jobs
        SET status = 'processing',
            attempts = ?,
            updated_at = ?
        WHERE job_id = ?
      `)
      .run(
        attempts,
        now(),
        row.job_id
      );

    const updated =
      rowToJob({
        ...row,
        status:
          "processing",
        attempts
      });

    log.info(
      "database.job.claimed",
      {
        jobId:
          updated.jobId,
        documentId:
          updated.documentId,
        pageNumber:
          updated.pageNumber,
        attempts:
          updated.attempts
      }
    );

    return updated;
  });

  if (claimedJob) {
    writeJsonSnapshotSafely(
      getDb()
    );
  }

  return claimedJob;
}

export function completeOcrJob(job, pageResult) {

  withTransaction(database => {
    upsertPageRecord(
      database,
      {
        documentId:
          job.documentId,
        fileHash:
          job.fileHash,
        filePath:
          job.filePath,
        pageNumber:
          job.pageNumber,
        text:
          pageResult.text,
        embeddedText:
          pageResult.embeddedText,
        ocrText:
          pageResult.ocrText,
        hasImage:
          pageResult.hasImage,
        status:
          "done"
      }
    );

    database
      .prepare(
        "DELETE FROM ocr_jobs WHERE job_id = ?"
      )
      .run(
        job.jobId
      );

    syncDocumentStatus(
      database,
      job.documentId
    );
    refreshSearchIndex(
      database,
      job.documentId
    );
  });

  writeJsonSnapshotSafely(
    getDb()
  );

  log.info(
    "database.job.completed",
    {
      jobId:
        job.jobId,
      documentId:
        job.documentId,
      pageNumber:
        job.pageNumber,
      chars:
        pageResult.text?.length ?? 0
    }
  );
}

export function failOcrJob(job, error) {

  withTransaction(database => {
    const savedJob =
      database
        .prepare(
          "SELECT * FROM ocr_jobs WHERE job_id = ?"
        )
        .get(
          job.jobId
        );

    if (savedJob) {
      const nextStatus =
        Number(savedJob.attempts) >= 3
          ? "failed"
          : "pending";

      database
        .prepare(`
          UPDATE ocr_jobs
          SET status = ?,
              error = ?,
              updated_at = ?
          WHERE job_id = ?
        `)
        .run(
          nextStatus,
          error?.message ||
            String(error),
          now(),
          job.jobId
        );
    }

    syncDocumentStatus(
      database,
      job.documentId
    );
  });

  writeJsonSnapshotSafely(
    getDb()
  );

  log.warn(
    "database.job.failed",
    {
      jobId:
        job.jobId,
      documentId:
        job.documentId,
      pageNumber:
        job.pageNumber,
      attempts:
        job.attempts,
      error:
        error?.message ||
        String(error)
    }
  );
}

export function getOcrQueueStatus() {

  const database =
    getDb();

  const rows =
    database
      .prepare(
        "SELECT status, COUNT(*) AS count FROM ocr_jobs GROUP BY status"
      )
      .all();

  return rows.reduce(
    (status, row) => {
      status[row.status] =
        Number(row.count);

      return status;
    },
    {}
  );
}

export function getDatabaseInfo() {

  const database =
    getDb();

  return {
    engine:
      "sqlite",
    sqlitePath:
      SQLITE_DB_PATH,
    jsonPath:
      JSON_DB_PATH,
    documents:
      Number(
        database
          .prepare(
            "SELECT COUNT(*) AS count FROM documents"
          )
          .get()
          .count
      ),
    pages:
      Number(
        database
          .prepare(
            "SELECT COUNT(*) AS count FROM pages"
          )
          .get()
          .count
      ),
    jobs:
      Number(
        database
          .prepare(
            "SELECT COUNT(*) AS count FROM ocr_jobs"
          )
          .get()
          .count
      )
  };
}

getDb();
